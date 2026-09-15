import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { betterAuth } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { anonymous } from "better-auth/plugins";

import { labKeyPlugin } from "./lab-key-plugin";
import {
  UNSET_DISPLAY_NAME,
  buildDisplayNameOptions,
} from "./display-name";

const origin = "http://localhost:3000";

function createTestDatabase(): MemoryDB {
  return {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
    labWorkspace: [],
  };
}

function createTestAuth(database = createTestDatabase()) {
  return betterAuth({
    baseURL: origin,
    secret: "test-only-better-auth-secret-with-32-characters",
    database: memoryAdapter(database),
    rateLimit: { enabled: false },
    plugins: [
      anonymous({ generateName: () => UNSET_DISPLAY_NAME }),
      labKeyPlugin({
        checksumSecret: "test-only-lab-key-checksum-secret",
        pepper: "test-only-lab-key-pepper",
      }),
    ],
  });
}

async function callAuth(
  auth: ReturnType<typeof createTestAuth>,
  path: string,
  options: { body?: unknown; cookie?: string; method?: "GET" | "POST" } = {},
) {
  const method = options.method ?? "POST";
  const headers = new Headers({ Origin: origin });

  if (options.cookie) {
    headers.set("Cookie", options.cookie);
  }

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

function responseCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

test("an anonymous workspace can issue, replace, and restore a Lab Key", async () => {
  const auth = createTestAuth();
  const anonymousResponse = await callAuth(auth, "/sign-in/anonymous");

  assert.equal(anonymousResponse.status, 200);
  const firstSessionCookie = responseCookies(anonymousResponse);
  assert.match(firstSessionCookie, /better-auth\.session_token=/);

  const ensureResponse = await callAuth(auth, "/lab-workspace/ensure", {
    body: {},
    cookie: firstSessionCookie,
  });
  assert.equal(ensureResponse.status, 200);
  const initialWorkspace = (await ensureResponse.json()) as {
    workspaceId: string;
    hasLabKey: boolean;
    keyVersion: number;
  };
  assert.equal(initialWorkspace.hasLabKey, false);
  assert.equal(initialWorkspace.keyVersion, 0);

  const firstIssueResponse = await callAuth(auth, "/lab-key/issue", {
    body: {},
    cookie: firstSessionCookie,
  });
  assert.equal(firstIssueResponse.status, 200);
  const firstIssue = (await firstIssueResponse.json()) as {
    labKey: string;
    replaced: boolean;
    keyVersion: number;
  };
  assert.match(firstIssue.labKey, /^(?:\d{6}-){4}\d{6}$/);
  assert.equal(firstIssue.replaced, false);
  assert.equal(firstIssue.keyVersion, 1);
  const firstIssuedSessionCookie = responseCookies(firstIssueResponse);
  assert.match(firstIssuedSessionCookie, /better-auth\.session_token=/);

  const originalSession = await callAuth(auth, "/get-session", {
    method: "GET",
    cookie: firstSessionCookie,
  });
  assert.equal(originalSession.status, 200);
  assert.equal(await originalSession.json(), null);

  const otherDeviceResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: firstIssue.labKey },
  });
  assert.equal(otherDeviceResponse.status, 200);
  const otherDeviceCookie = responseCookies(otherDeviceResponse);

  const replacementResponse = await callAuth(auth, "/lab-key/issue", {
    body: {},
    cookie: firstIssuedSessionCookie,
  });
  assert.equal(replacementResponse.status, 200);
  const replacement = (await replacementResponse.json()) as {
    labKey: string;
    replaced: boolean;
    keyVersion: number;
  };
  assert.notEqual(replacement.labKey, firstIssue.labKey);
  assert.equal(replacement.replaced, true);
  assert.equal(replacement.keyVersion, 2);
  const replacementSessionCookie = responseCookies(replacementResponse);

  for (const revokedCookie of [firstIssuedSessionCookie, otherDeviceCookie]) {
    const revokedSession = await callAuth(auth, "/get-session", {
      method: "GET",
      cookie: revokedCookie,
    });
    assert.equal(revokedSession.status, 200);
    assert.equal(await revokedSession.json(), null);
  }

  const replacementSession = await callAuth(auth, "/get-session", {
    method: "GET",
    cookie: replacementSessionCookie,
  });
  assert.equal(replacementSession.status, 200);
  const replacementSessionPayload = (await replacementSession.json()) as {
    session: { labKeyVersion: number };
  };
  assert.equal(replacementSessionPayload.session.labKeyVersion, 2);

  const oldKeyResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: firstIssue.labKey },
  });
  assert.equal(oldKeyResponse.status, 401);

  const replacementChecksum = Number(replacement.labKey.slice(-6));
  const wrongChecksum = String((replacementChecksum + 1) % 1_000_000).padStart(
    6,
    "0",
  );
  const badChecksumResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: `${replacement.labKey.slice(0, -6)}${wrongChecksum}` },
  });
  assert.equal(badChecksumResponse.status, 401);

  const otherAnonymousResponse = await callAuth(auth, "/sign-in/anonymous");
  assert.equal(otherAnonymousResponse.status, 200);
  const otherSessionCookie = responseCookies(otherAnonymousResponse);
  const otherWorkspaceResponse = await callAuth(auth, "/lab-workspace/ensure", {
    body: {},
    cookie: otherSessionCookie,
  });
  assert.equal(otherWorkspaceResponse.status, 200);
  const otherWorkspace = (await otherWorkspaceResponse.json()) as {
    workspaceId: string;
  };
  assert.notEqual(otherWorkspace.workspaceId, initialWorkspace.workspaceId);

  const restoredResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: replacement.labKey.toLowerCase() },
    cookie: otherSessionCookie,
  });
  assert.equal(restoredResponse.status, 200);
  const restoredSessionCookie = responseCookies(restoredResponse);
  assert.match(restoredSessionCookie, /better-auth\.session_token=/);

  const workspaceResponse = await callAuth(auth, "/lab-workspace", {
    method: "GET",
    cookie: restoredSessionCookie,
  });
  assert.equal(workspaceResponse.status, 200);
  const restoredWorkspace = (await workspaceResponse.json()) as {
    workspaceId: string;
    hasLabKey: boolean;
    keyVersion: number;
  };
  assert.equal(restoredWorkspace.workspaceId, initialWorkspace.workspaceId);
  assert.equal(restoredWorkspace.hasLabKey, true);
  assert.equal(restoredWorkspace.keyVersion, 2);
});

test("a stale Lab session is rejected even if its row survives rotation", async () => {
  const database = createTestDatabase();
  const auth = createTestAuth(database);
  const anonymousResponse = await callAuth(auth, "/sign-in/anonymous");
  assert.equal(anonymousResponse.status, 200);
  const staleCookie = responseCookies(anonymousResponse);
  const staleSessionRow = structuredClone(database.session[0]);

  const ensureResponse = await callAuth(auth, "/lab-workspace/ensure", {
    body: {},
    cookie: staleCookie,
  });
  assert.equal(ensureResponse.status, 200);

  const issueResponse = await callAuth(auth, "/lab-key/issue", {
    body: {},
    cookie: staleCookie,
  });
  assert.equal(issueResponse.status, 200);
  assert.equal(database.session.length, 1);

  database.session.push(staleSessionRow);
  assert.equal(database.session.length, 2);

  const protectedRequest = await callAuth(auth, "/lab-workspace", {
    method: "GET",
    cookie: staleCookie,
  });
  assert.equal(protectedRequest.status, 401);
  assert.deepEqual(await protectedRequest.json(), {
    message: "This device was signed out. Use your Lab Key to open it again.",
  });
  assert.equal(database.session.length, 1);

  database.session.push(staleSessionRow);

  const staleSession = await callAuth(auth, "/get-session", {
    method: "GET",
    cookie: staleCookie,
  });
  assert.equal(staleSession.status, 200);
  assert.equal(await staleSession.json(), null);
  assert.equal(database.session.length, 1);
});

test("concurrent Lab Key rotations deliver only the winning key and session", async () => {
  const database = createTestDatabase();
  const auth = createTestAuth(database);
  const anonymousResponse = await callAuth(auth, "/sign-in/anonymous");
  const originalCookie = responseCookies(anonymousResponse);
  await callAuth(auth, "/lab-workspace/ensure", {
    body: {},
    cookie: originalCookie,
  });
  const firstIssueResponse = await callAuth(auth, "/lab-key/issue", {
    body: {},
    cookie: originalCookie,
  });
  assert.equal(firstIssueResponse.status, 200);
  const currentCookie = responseCookies(firstIssueResponse);

  const rotations = await Promise.all([
    callAuth(auth, "/lab-key/issue", { body: {}, cookie: currentCookie }),
    callAuth(auth, "/lab-key/issue", { body: {}, cookie: currentCookie }),
  ]);
  const winners = rotations.filter((response) => response.status === 200);
  const losers = rotations.filter((response) => response.status !== 200);

  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.ok([401, 409].includes(losers[0].status));
  assert.equal(database.session.length, 1);

  const winningKey = (await winners[0].json()) as {
    labKey: string;
    keyVersion: number;
  };
  assert.equal(winningKey.keyVersion, 2);
  const recoveredResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: winningKey.labKey },
  });
  assert.equal(recoveredResponse.status, 200);
});

test("sign out everywhere revokes every session but preserves the Lab Key", async () => {
  const auth = createTestAuth();
  const anonymousResponse = await callAuth(auth, "/sign-in/anonymous");
  assert.equal(anonymousResponse.status, 200);
  const originalCookie = responseCookies(anonymousResponse);

  const ensureResponse = await callAuth(auth, "/lab-workspace/ensure", {
    body: {},
    cookie: originalCookie,
  });
  assert.equal(ensureResponse.status, 200);

  const issueResponse = await callAuth(auth, "/lab-key/issue", {
    body: {},
    cookie: originalCookie,
  });
  assert.equal(issueResponse.status, 200);
  const issued = (await issueResponse.json()) as { labKey: string };
  const firstDeviceCookie = responseCookies(issueResponse);

  const secondDeviceResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: issued.labKey },
  });
  assert.equal(secondDeviceResponse.status, 200);
  const secondDeviceCookie = responseCookies(secondDeviceResponse);

  const signOutResponse = await callAuth(
    auth,
    "/lab-sessions/sign-out-everywhere",
    { body: {}, cookie: firstDeviceCookie },
  );
  assert.equal(signOutResponse.status, 200);
  assert.ok(
    signOutResponse.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("better-auth.session_token=;")),
  );

  for (const revokedCookie of [firstDeviceCookie, secondDeviceCookie]) {
    const revokedSession = await callAuth(auth, "/get-session", {
      method: "GET",
      cookie: revokedCookie,
    });
    assert.equal(revokedSession.status, 200);
    assert.equal(await revokedSession.json(), null);
  }

  const recoveredResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: issued.labKey },
  });
  assert.equal(recoveredResponse.status, 200);
  const recoveredCookie = responseCookies(recoveredResponse);
  const recoveredSession = await callAuth(auth, "/get-session", {
    method: "GET",
    cookie: recoveredCookie,
  });
  assert.equal(recoveredSession.status, 200);
  const recoveredPayload = (await recoveredSession.json()) as {
    session: { labKeyVersion: number };
  };
  assert.equal(recoveredPayload.session.labKeyVersion, 2);
});

test("the Lab session migration backfills existing security stamps", () => {
  const migration = readFileSync(
    new URL(
      "../../prisma/migrations/20260915150000_bind_sessions_to_lab_key_version/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /ADD COLUMN "lab_key_version" INTEGER NOT NULL DEFAULT 0/,
  );
  assert.match(migration, /SET "lab_key_version" = workspace\."key_version"/);
  assert.match(
    migration,
    /WHERE workspace\."user_id" = session_row\."user_id"/,
  );
});

test("a chosen Lab name and portrait stay attached after Lab Key restore", async () => {
  const auth = createTestAuth();
  const anonymousResponse = await callAuth(auth, "/sign-in/anonymous");
  assert.equal(anonymousResponse.status, 200);
  const sessionCookie = responseCookies(anonymousResponse);

  const invalidName = await callAuth(auth, "/display-name", {
    body: { name: "Not A Name", image: "lab-name-01" },
    cookie: sessionCookie,
  });
  assert.equal(invalidName.status, 400);

  const [name] = buildDisplayNameOptions(1);
  const firstSave = await callAuth(auth, "/display-name", {
    body: { name, image: "lab-name-04" },
    cookie: sessionCookie,
  });
  assert.equal(firstSave.status, 200);
  const saved = (await firstSave.json()) as { name: string; image: string };
  assert.equal(saved.name, name);
  assert.equal(saved.image, "lab-name-04");

  const secondSave = await callAuth(auth, "/display-name", {
    body: { name: buildDisplayNameOptions(1)[0], image: "lab-name-01" },
    cookie: sessionCookie,
  });
  assert.equal(secondSave.status, 400);

  const invalidSave = await callAuth(auth, "/display-name", {
    body: { name: "Not A Name", image: "lab-name-01" },
  });
  assert.equal(invalidSave.status, 401);

  const issueResponse = await callAuth(auth, "/lab-key/issue", {
    body: {},
    cookie: sessionCookie,
  });
  assert.equal(issueResponse.status, 200);
  const issued = (await issueResponse.json()) as { labKey: string };

  const otherAnonymousResponse = await callAuth(auth, "/sign-in/anonymous");
  assert.equal(otherAnonymousResponse.status, 200);
  const otherCookie = responseCookies(otherAnonymousResponse);

  const restoredResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: issued.labKey },
    cookie: otherCookie,
  });
  assert.equal(restoredResponse.status, 200);
  const restored = (await restoredResponse.json()) as {
    user: { name: string; image: string | null };
  };
  assert.equal(restored.user.name, name);
  assert.equal(restored.user.image, "lab-name-04");

  const restoredSession = await callAuth(auth, "/get-session", {
    method: "GET",
    cookie: responseCookies(restoredResponse),
  });
  assert.equal(restoredSession.status, 200);
  const session = (await restoredSession.json()) as {
    user: { name: string; image: string | null };
  };
  assert.equal(session.user.name, name);
  assert.equal(session.user.image, "lab-name-04");
});
