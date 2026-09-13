import assert from "node:assert/strict";
import test from "node:test";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { anonymous } from "better-auth/plugins";

import { labKeyPlugin } from "./lab-key-plugin";

const origin = "http://localhost:3000";

function createTestAuth() {
  return betterAuth({
    baseURL: origin,
    secret: "test-only-better-auth-secret-with-32-characters",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      rateLimit: [],
      labWorkspace: [],
    }),
    rateLimit: { enabled: false },
    plugins: [
      anonymous({ generateName: () => "Lab Creator" }),
      labKeyPlugin({ pepper: "test-only-lab-key-pepper" }),
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
  assert.match(firstIssue.labKey, /^[A-Z]+-[A-Z]+-[A-Z]+-\d{2}$/);
  assert.equal(firstIssue.replaced, false);
  assert.equal(firstIssue.keyVersion, 1);

  const replacementResponse = await callAuth(auth, "/lab-key/issue", {
    body: {},
    cookie: firstSessionCookie,
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

  const oldKeyResponse = await callAuth(auth, "/sign-in/lab-key", {
    body: { labKey: firstIssue.labKey },
  });
  assert.equal(oldKeyResponse.status, 401);

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
