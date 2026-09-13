CREATE TYPE "AgentFlowRunStatus" AS ENUM ('running', 'paused', 'done', 'failed');

CREATE TABLE "agent_flow_run" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "game_id" text NOT NULL,
  "flow_id" text NOT NULL,
  "flow_hash" text NOT NULL,
  "status" "AgentFlowRunStatus" NOT NULL,
  "current_node_id" text NOT NULL,
  "question" text NOT NULL,
  "flow_state" jsonb NOT NULL,
  "flow_output" jsonb NOT NULL,
  "loop_counts" jsonb NOT NULL,
  "pending_human_input" jsonb,
  "revision" integer DEFAULT 1 NOT NULL,
  "active_key" text,
  "lease_expires_at" timestamp,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "failure_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agent_flow_run_active_key_unique" UNIQUE("active_key"),
  CONSTRAINT "agent_flow_run_failure_code_length" CHECK ("failure_code" IS NULL OR char_length("failure_code") <= 80)
);

ALTER TABLE "agent_flow_run" ADD CONSTRAINT "agent_flow_run_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_flow_run" ADD CONSTRAINT "agent_flow_run_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "agent_flow_run_owner_game_updated_at_idx" ON "agent_flow_run"("owner_id", "game_id", "updated_at" DESC);
CREATE INDEX "agent_flow_run_status_updated_at_idx" ON "agent_flow_run"("status", "updated_at" DESC);
