import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import {
  hasChosenDisplayName,
  isValidDisplayNameAvatarId,
  isValidGeneratedDisplayName,
} from "./display-name";
import {
  createLabKeyLookup,
  generateLabKey,
  hashLabKey,
  normalizeLabKey,
  verifyLabKey,
} from "./lab-key";

type LabWorkspaceRecord = {
  id: string;
  userId: string;
  keyLookup?: string | null;
  keyHash?: string | null;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

type LabKeyPluginOptions = {
  pepper: string;
};

const labKeyBody = z.object({
  labKey: z.string().min(1).max(96),
});

const displayNameBody = z.object({
  name: z.string().min(1).max(64),
  image: z.string().min(1).max(32),
});

const genericKeyError = () =>
  new APIError("UNAUTHORIZED", {
    message: "That Lab Key didn't work. Check it and try again.",
  });

async function ensureWorkspace(
  adapter: {
    create: <T extends Record<string, unknown>, R = T>(data: {
      model: string;
      data: Omit<T, "id">;
    }) => Promise<R>;
    findOne: <T>(data: {
      model: string;
      where: Array<{ field: string; value: string }>;
    }) => Promise<T | null>;
  },
  userId: string,
): Promise<LabWorkspaceRecord> {
  const existing = await adapter.findOne<LabWorkspaceRecord>({
    model: "labWorkspace",
    where: [{ field: "userId", value: userId }],
  });

  if (existing) {
    return existing;
  }

  const now = new Date();

  try {
    return await adapter.create<LabWorkspaceRecord>({
      model: "labWorkspace",
      data: {
        userId,
        keyLookup: null,
        keyHash: null,
        keyVersion: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    const racedWorkspace = await adapter.findOne<LabWorkspaceRecord>({
      model: "labWorkspace",
      where: [{ field: "userId", value: userId }],
    });

    if (racedWorkspace) {
      return racedWorkspace;
    }

    throw error;
  }
}

export const labKeyPlugin = ({ pepper }: LabKeyPluginOptions) => {
  const dummyHash = hashLabKey("TACO-MOON-FROG-00");

  return {
    id: "lab-key",
    endpoints: {
      ensureLabWorkspace: createAuthEndpoint(
        "/lab-workspace/ensure",
        {
          method: "POST",
          requireHeaders: true,
          use: [formCsrfMiddleware, sessionMiddleware],
        },
        async (ctx) => {
          const workspace = await ensureWorkspace(
            ctx.context.adapter,
            ctx.context.session.user.id,
          );

          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json({
            workspaceId: workspace.id,
            hasLabKey: Boolean(workspace.keyHash),
            keyVersion: workspace.keyVersion,
          });
        },
      ),
      getLabWorkspace: createAuthEndpoint(
        "/lab-workspace",
        {
          method: "GET",
          requireHeaders: true,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const workspace = await ensureWorkspace(
            ctx.context.adapter,
            ctx.context.session.user.id,
          );

          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json({
            workspaceId: workspace.id,
            hasLabKey: Boolean(workspace.keyHash),
            keyVersion: workspace.keyVersion,
          });
        },
      ),
      issueLabKey: createAuthEndpoint(
        "/lab-key/issue",
        {
          method: "POST",
          requireHeaders: true,
          use: [formCsrfMiddleware, sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const workspace = await ensureWorkspace(ctx.context.adapter, userId);

          for (let attempt = 0; attempt < 5; attempt += 1) {
            const labKey = generateLabKey();
            const keyLookup = createLabKeyLookup(labKey, pepper);
            const collision = await ctx.context.adapter.findOne<LabWorkspaceRecord>({
              model: "labWorkspace",
              where: [{ field: "keyLookup", value: keyLookup }],
            });

            if (collision) {
              continue;
            }

            const keyHash = await hashLabKey(labKey);

            try {
              const updated =
                await ctx.context.adapter.incrementOne<LabWorkspaceRecord>({
                  model: "labWorkspace",
                  where: [{ field: "userId", value: userId }],
                  increment: { keyVersion: 1 },
                  set: {
                    keyLookup,
                    keyHash,
                    updatedAt: new Date(),
                  },
                });

              if (!updated) {
                throw new APIError("INTERNAL_SERVER_ERROR", {
                  message: "We couldn't protect this Lab Workspace yet.",
                });
              }

              ctx.setHeader("Cache-Control", "no-store");
              return ctx.json({
                labKey,
                replaced: workspace.keyVersion > 0,
                keyVersion: updated.keyVersion,
              });
            } catch (error) {
              const racedCollision =
                await ctx.context.adapter.findOne<LabWorkspaceRecord>({
                  model: "labWorkspace",
                  where: [{ field: "keyLookup", value: keyLookup }],
                });

              if (!racedCollision) {
                throw error;
              }
            }
          }

          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "We couldn't make a unique Lab Key. Please try again.",
          });
        },
      ),
      signInLabKey: createAuthEndpoint(
        "/sign-in/lab-key",
        {
          method: "POST",
          body: labKeyBody,
          requireHeaders: true,
          use: [formCsrfMiddleware],
        },
        async (ctx) => {
          const normalized = normalizeLabKey(ctx.body.labKey);

          if (!normalized) {
            await verifyLabKey(ctx.body.labKey, await dummyHash);
            throw genericKeyError();
          }

          const keyLookup = createLabKeyLookup(normalized, pepper);
          const workspace =
            await ctx.context.adapter.findOne<LabWorkspaceRecord>({
              model: "labWorkspace",
              where: [{ field: "keyLookup", value: keyLookup }],
            });
          const valid = workspace?.keyHash
            ? await verifyLabKey(normalized, workspace.keyHash)
            : await verifyLabKey(normalized, await dummyHash);

          if (!workspace || !valid) {
            throw genericKeyError();
          }

          const latestWorkspace =
            await ctx.context.adapter.findOne<LabWorkspaceRecord>({
              model: "labWorkspace",
              where: [{ field: "id", value: workspace.id }],
            });

          if (
            !latestWorkspace ||
            latestWorkspace.keyLookup !== workspace.keyLookup ||
            latestWorkspace.keyVersion !== workspace.keyVersion
          ) {
            throw genericKeyError();
          }

          const user = await ctx.context.internalAdapter.findUserById(
            workspace.userId,
          );
          const anonymousUser = user as
            | (typeof user & { isAnonymous?: boolean | null })
            | null;

          if (!anonymousUser || !anonymousUser.isAnonymous) {
            throw genericKeyError();
          }

          const session = await ctx.context.internalAdapter.createSession(
            anonymousUser.id,
          );

          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "We couldn't open that Lab Workspace.",
            });
          }

          await setSessionCookie(ctx, { session, user: anonymousUser });
          ctx.setHeader("Cache-Control", "no-store");

          return ctx.json({
            token: session.token,
            user: {
              id: anonymousUser.id,
              name: anonymousUser.name,
              image: anonymousUser.image ?? null,
            },
            workspaceId: workspace.id,
          });
        },
      ),
      setDisplayName: createAuthEndpoint(
        "/display-name",
        {
          method: "POST",
          body: displayNameBody,
          requireHeaders: true,
          use: [formCsrfMiddleware, sessionMiddleware],
        },
        async (ctx) => {
          const currentUser = ctx.context.session.user;

          if (hasChosenDisplayName(currentUser.name)) {
            throw new APIError("BAD_REQUEST", {
              message: "Your Lab name is already set.",
            });
          }

          if (
            !isValidGeneratedDisplayName(ctx.body.name) ||
            !isValidDisplayNameAvatarId(ctx.body.image)
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "Pick one of the names on the cards.",
            });
          }

          const updatedUser = await ctx.context.internalAdapter.updateUser(
            currentUser.id,
            {
              name: ctx.body.name,
              image: ctx.body.image,
            },
          );

          if (!updatedUser) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "We couldn't save that Lab name yet.",
            });
          }

          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json({
            name: updatedUser.name,
            image: updatedUser.image ?? ctx.body.image,
          });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path) => path.startsWith("/sign-in/lab-key"),
        window: 60,
        max: 5,
      },
      {
        pathMatcher: (path) => path.startsWith("/lab-key/issue"),
        window: 60,
        max: 3,
      },
      {
        pathMatcher: (path) => path.startsWith("/display-name"),
        window: 60,
        max: 8,
      },
    ],
    schema: {
      labWorkspace: {
        fields: {
          userId: {
            type: "string",
            required: true,
            unique: true,
            index: true,
            references: {
              model: "user",
              field: "id",
              onDelete: "cascade",
            },
          },
          keyLookup: {
            type: "string",
            required: false,
            unique: true,
            index: true,
            input: false,
            returned: false,
          },
          keyHash: {
            type: "string",
            required: false,
            input: false,
            returned: false,
          },
          keyVersion: {
            type: "number",
            required: true,
            defaultValue: 0,
            input: false,
          },
          createdAt: {
            type: "date",
            required: true,
            defaultValue: () => new Date(),
          },
          updatedAt: {
            type: "date",
            required: true,
            defaultValue: () => new Date(),
            onUpdate: () => new Date(),
          },
        },
      },
    },
  } satisfies BetterAuthPlugin;
};
