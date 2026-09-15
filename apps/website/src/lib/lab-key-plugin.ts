import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  formCsrfMiddleware,
  sensitiveSessionMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import {
  hasChosenDisplayName,
  isValidDisplayNameAvatarId,
  isValidGeneratedDisplayName,
} from "./display-name";
import {
  createLabKeyLookup,
  generateLabKey,
  hasValidLabKeyChecksum,
  hashLabKey,
  isChecksummedLabKey,
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

type LabSessionRecord = {
  token: string;
  userId: string;
  labKeyVersion?: unknown;
};

type LabKeyPluginOptions = {
  checksumSecret: string;
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

export const labKeyPlugin = ({ checksumSecret, pepper }: LabKeyPluginOptions) => {
  const dummyHash = hashLabKey("000000-000000-000000-000000-000000");
  const labSessionSecurityMiddleware = createAuthMiddleware(async (ctx) => {
    const active = ctx.context.session;
    if (!active?.session || !active.user) {
      throw new APIError("UNAUTHORIZED", {
        message: "Please open your Lab Workspace again.",
      });
    }

    let workspace: LabWorkspaceRecord | null;
    try {
      workspace = await ctx.context.adapter.findOne<LabWorkspaceRecord>({
        model: "labWorkspace",
        where: [{ field: "userId", value: active.user.id }],
      });
    } catch (error) {
      ctx.context.logger.error(
        "Failed to validate the Lab session security stamp",
        error,
      );
      throw new APIError("INTERNAL_SERVER_ERROR", {
        message: "We couldn't securely check this session. Please try again.",
      });
    }

    if (!workspace) return;

    const session = active.session as typeof active.session & LabSessionRecord;
    if (session.labKeyVersion === workspace.keyVersion) return;

    try {
      await ctx.context.internalAdapter.deleteSession(session.token);
    } catch (error) {
      ctx.context.logger.error("Failed to delete a stale Lab session", error);
    }
    deleteSessionCookie(ctx);
    ctx.context.session = null;
    throw new APIError("UNAUTHORIZED", {
      message: "This device was signed out. Use your Lab Key to open it again.",
    });
  });

  return {
    id: "lab-key",
    endpoints: {
      ensureLabWorkspace: createAuthEndpoint(
        "/lab-workspace/ensure",
        {
          method: "POST",
          requireHeaders: true,
          use: [
            formCsrfMiddleware,
            sessionMiddleware,
            labSessionSecurityMiddleware,
          ],
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
          use: [sessionMiddleware, labSessionSecurityMiddleware],
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
          use: [
            formCsrfMiddleware,
            sessionMiddleware,
            labSessionSecurityMiddleware,
          ],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const workspace = await ensureWorkspace(ctx.context.adapter, userId);
          const sessionsToRevoke = await ctx.context.internalAdapter.listSessions(
            userId,
          );

          for (let attempt = 0; attempt < 5; attempt += 1) {
            const labKey = generateLabKey(checksumSecret);
            const keyLookup = createLabKeyLookup(labKey, pepper);
            const collision = await ctx.context.adapter.findOne<LabWorkspaceRecord>({
              model: "labWorkspace",
              where: [{ field: "keyLookup", value: keyLookup }],
            });

            if (collision) {
              continue;
            }

            const keyHash = await hashLabKey(labKey);
            const nextVersion = workspace.keyVersion + 1;
            const replacementSession =
              await ctx.context.internalAdapter.createSession(
                userId,
                false,
                { labKeyVersion: nextVersion },
                true,
              );

            if (!replacementSession) {
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "We couldn't secure this browser with the new Lab Key.",
              });
            }

            let updated: LabWorkspaceRecord | null;
            try {
              updated = await ctx.context.adapter.incrementOne<LabWorkspaceRecord>({
                model: "labWorkspace",
                where: [
                  { field: "userId", value: userId },
                  { field: "keyVersion", value: workspace.keyVersion },
                ],
                increment: { keyVersion: 1 },
                set: {
                  keyLookup,
                  keyHash,
                  updatedAt: new Date(),
                },
              });
            } catch (error) {
              const racedCollision =
                await ctx.context.adapter.findOne<LabWorkspaceRecord>({
                  model: "labWorkspace",
                  where: [{ field: "keyLookup", value: keyLookup }],
                });

              if (
                racedCollision?.id === workspace.id &&
                racedCollision.keyVersion === nextVersion
              ) {
                updated = racedCollision;
              } else {
                await ctx.context.internalAdapter.deleteSession(
                  replacementSession.token,
                );

                if (!racedCollision) {
                  throw error;
                }

                continue;
              }
            }

            if (!updated || updated.keyVersion !== nextVersion) {
              await ctx.context.internalAdapter.deleteSession(
                replacementSession.token,
              );
              throw new APIError("CONFLICT", {
                message: "Your Lab Key changed in another browser. Please try again.",
              });
            }

            const staleTokens = sessionsToRevoke
              .map((session) => session.token)
              .filter((token) => token !== replacementSession.token);

            if (staleTokens.length > 0) {
              try {
                await ctx.context.internalAdapter.deleteSessions(staleTokens);
              } catch (error) {
                // The version check still rejects every stale token. Keep the
                // fresh session/key usable and leave an operational signal for
                // cleaning up any rows the adapter could not delete.
                ctx.context.logger.error(
                  "Failed to delete sessions invalidated by Lab Key rotation",
                  error,
                );
              }
            }

            await setSessionCookie(ctx, {
              session: replacementSession,
              user: ctx.context.session.user,
            });
            ctx.setHeader("Cache-Control", "no-store");
            return ctx.json({
              labKey,
              replaced: workspace.keyVersion > 0,
              keyVersion: updated.keyVersion,
            });
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
            throw genericKeyError();
          }

          if (
            isChecksummedLabKey(normalized) &&
            !hasValidLabKeyChecksum(normalized, checksumSecret)
          ) {
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
            false,
            { labKeyVersion: workspace.keyVersion },
            true,
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
      signOutEverywhere: createAuthEndpoint(
        "/lab-sessions/sign-out-everywhere",
        {
          method: "POST",
          requireHeaders: true,
          use: [
            formCsrfMiddleware,
            sensitiveSessionMiddleware,
            labSessionSecurityMiddleware,
          ],
        },
        async (ctx) => {
          const workspace = await ensureWorkspace(
            ctx.context.adapter,
            ctx.context.session.user.id,
          );
          const nextVersion = workspace.keyVersion + 1;
          let invalidated: LabWorkspaceRecord | null;

          try {
            invalidated =
              await ctx.context.adapter.incrementOne<LabWorkspaceRecord>({
                model: "labWorkspace",
                where: [
                  { field: "userId", value: ctx.context.session.user.id },
                  { field: "keyVersion", value: workspace.keyVersion },
                ],
                increment: { keyVersion: 1 },
                set: { updatedAt: new Date() },
              });
          } catch (error) {
            ctx.context.logger.error(
              "Failed to invalidate every Lab session",
              error,
            );
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "We couldn't sign every device out yet. Please try again.",
            });
          }

          if (!invalidated || invalidated.keyVersion !== nextVersion) {
            throw new APIError("CONFLICT", {
              message:
                "Your Lab security changed in another browser. Please try again.",
            });
          }

          try {
            await ctx.context.internalAdapter.deleteUserSessions(
              ctx.context.session.user.id,
            );
          } catch (error) {
            // The security-stamp change above has already revoked every old
            // session. Physical deletion is best-effort cleanup at this point.
            ctx.context.logger.error(
              "Failed to delete sessions after global Lab sign-out",
              error,
            );
          }

          deleteSessionCookie(ctx);
          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json({ success: true });
        },
      ),
      setDisplayName: createAuthEndpoint(
        "/display-name",
        {
          method: "POST",
          body: displayNameBody,
          requireHeaders: true,
          use: [
            formCsrfMiddleware,
            sessionMiddleware,
            labSessionSecurityMiddleware,
          ],
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
        pathMatcher: (path) => path.startsWith("/lab-sessions/sign-out-everywhere"),
        window: 60,
        max: 3,
      },
      {
        pathMatcher: (path) => path.startsWith("/display-name"),
        window: 60,
        max: 8,
      },
    ],
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            const active = ctx.context.session;
            if (!active?.session || !active.user) return;

            let workspace: LabWorkspaceRecord | null;
            try {
              workspace = await ctx.context.adapter.findOne<LabWorkspaceRecord>({
                model: "labWorkspace",
                where: [{ field: "userId", value: active.user.id }],
              });
            } catch (error) {
              ctx.context.logger.error(
                "Failed to validate the Lab session security stamp",
                error,
              );
              return ctx.json(null);
            }

            if (!workspace) return;

            const session = active.session as typeof active.session & LabSessionRecord;
            if (session.labKeyVersion === workspace.keyVersion) return;

            try {
              await ctx.context.internalAdapter.deleteSession(session.token);
            } catch (error) {
              ctx.context.logger.error(
                "Failed to delete a stale Lab session",
                error,
              );
            }
            deleteSessionCookie(ctx);
            ctx.context.session = null;
            return ctx.json(null);
          }),
        },
      ],
    },
    schema: {
      session: {
        fields: {
          labKeyVersion: {
            type: "number",
            required: true,
            defaultValue: 0,
            input: false,
          },
        },
      },
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
