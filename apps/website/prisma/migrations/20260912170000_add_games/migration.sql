CREATE TABLE "game" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "title" text NOT NULL,
  "game_type" text NOT NULL,
  "map_source" text NOT NULL,
  "spec" jsonb NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "game" ADD CONSTRAINT "game_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "game_owner_id_updated_at_idx" ON "game"("owner_id", "updated_at" DESC);
