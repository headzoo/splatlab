-- Baseline for databases already provisioned by drizzle/0000_brown_sabra.sql.
-- Mark this migration as applied before deploying to an existing database.
CREATE TABLE "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "lab_workspace" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "key_lookup" text,
  "key_hash" text,
  "key_version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "lab_workspace_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "lab_workspace_key_lookup_unique" UNIQUE("key_lookup")
);

CREATE TABLE "rate_limit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "count" integer NOT NULL,
  "last_request" bigint NOT NULL,
  CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);

CREATE TABLE "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL,
  CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "is_anonymous" boolean DEFAULT false,
  CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lab_workspace" ADD CONSTRAINT "lab_workspace_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "account_userId_idx" ON "account"("user_id");
CREATE INDEX "session_userId_idx" ON "session"("user_id");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
