-- Preserve currently signed-in Lab browsers during deployment. Every future
-- key issue/rotation creates a freshly stamped session and invalidates these
-- backfilled sessions by incrementing lab_workspace.key_version.
ALTER TABLE "session"
ADD COLUMN "lab_key_version" INTEGER NOT NULL DEFAULT 0;

UPDATE "session" AS session_row
SET "lab_key_version" = workspace."key_version"
FROM "lab_workspace" AS workspace
WHERE workspace."user_id" = session_row."user_id";
