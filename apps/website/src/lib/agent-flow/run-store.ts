import { randomUUID } from "node:crypto";

import { builderChatTurnSchema, gameDocumentSchema, type BuilderChatTurn } from "../game-contract";
import { memoryGames, type StoredGame } from "../games";
import { Prisma } from "@/generated/prisma/client";

import { getPrisma, hasDatabase } from "../prisma";

export type AgentFlowRunStatus = "running" | "paused" | "done" | "failed";

export type AgentFlowRun = Readonly<{
  id: string;
  ownerId: string;
  gameId: string;
  flowId: string;
  flowHash: string;
  status: AgentFlowRunStatus;
  currentNodeId: string;
  question: string;
  flowState: Record<string, string>;
  flowOutput: unknown;
  loopCounts: Record<string, number>;
  pendingHumanInput: unknown | null;
  revision: number;
  activeKey: string | null;
  leaseExpiresAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

type RunMutation = {
  currentNodeId: string;
  flowState: Record<string, string>;
  flowOutput: unknown;
  loopCounts: Record<string, number>;
};

type MemoryRun = { -readonly [Key in keyof AgentFlowRun]: AgentFlowRun[Key] };
type PrismaExecutor = Pick<ReturnType<typeof getPrisma>, "game" | "agentFlowRun">;
const TRANSCRIPT_CONFLICT = Symbol("transcript_conflict");
const TRANSCRIPT_RETRY_LIMIT = 3;

declare global {
  var splatLabAgentFlowRunsMemory: MemoryRun[] | undefined;
}

function memoryRuns() {
  globalThis.splatLabAgentFlowRunsMemory ??= [];
  return globalThis.splatLabAgentFlowRunsMemory;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function toRun(record: AgentFlowRun): AgentFlowRun {
  return clone(record);
}

function activeKey(ownerId: string, gameId: string) {
  return `${ownerId}:${gameId}`;
}

function appendTurn(game: StoredGame, turn: BuilderChatTurn) {
  const spec = gameDocumentSchema.parse(game.spec);
  const builderChatHistory = [...spec.builderChatHistory, builderChatTurnSchema.parse(turn)].slice(-50);
  game.spec = gameDocumentSchema.parse({ ...spec, builderChatHistory });
  game.revision += 1;
  game.updatedAt = new Date();
  return game.revision;
}

function failureCode(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || "unknown_failure";
}

export type StartRunInput = RunMutation & {
  ownerId: string;
  gameId: string;
  flowId: string;
  flowHash: string;
  question: string;
  userMessage: string;
};

export type ClaimPausedInput = {
  ownerId: string;
  gameId: string;
  runId: string;
  expectedRevision: number;
  feedback?: string;
};

export type CheckpointRunInput = RunMutation & {
  ownerId: string;
  gameId: string;
  runId: string;
  expectedRevision: number;
  cooperPrompt: string;
  pendingHumanInput: unknown;
};

export type CompleteRunInput = RunMutation & {
  ownerId: string;
  gameId: string;
  runId: string;
  expectedRevision: number;
  cooperMessage: string;
};

export type FailRunInput = {
  ownerId: string;
  gameId: string;
  runId: string;
  expectedRevision: number;
  code: string;
};

export type StartRunResult =
  | { status: "started"; run: AgentFlowRun; gameRevision: number; builderChatHistory: readonly BuilderChatTurn[] }
  | { status: "not_found" }
  | { status: "active_conflict"; run: AgentFlowRun }
  | { status: "stale_running"; run: AgentFlowRun };

export type RunTransitionResult =
  | { status: "updated"; run: AgentFlowRun; gameRevision?: number; builderChatHistory?: readonly BuilderChatTurn[] }
  | { status: "not_found" }
  | { status: "conflict" };

export class AgentFlowRunStore {
  readonly leaseMs: number;
  private readonly forceMemory: boolean;

  constructor(options: { leaseMs?: number; forceMemory?: boolean } = {}) {
    this.leaseMs = Math.max(1_000, Math.min(options.leaseMs ?? 60_000, 10 * 60_000));
    this.forceMemory = options.forceMemory ?? false;
  }

  private get useMemory() {
    return this.forceMemory || !hasDatabase();
  }

  async startMessage(input: StartRunInput): Promise<StartRunResult> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs);
    if (this.useMemory) {
      const game = memoryGames().find((candidate) => candidate.id === input.gameId && candidate.ownerId === input.ownerId);
      if (!game) return { status: "not_found" };
      const existing = memoryRuns().find((run) => run.activeKey === activeKey(input.ownerId, input.gameId));
      if (existing) {
        if (existing.status === "running" && existing.leaseExpiresAt && existing.leaseExpiresAt <= now) {
          existing.status = "failed";
          existing.activeKey = null;
          existing.failureCode = "stale_running";
          existing.completedAt = now;
          existing.leaseExpiresAt = null;
          existing.revision += 1;
          existing.updatedAt = now;
          return { status: "stale_running", run: toRun(existing) };
        }
        return { status: "active_conflict", run: toRun(existing) };
      }
      const run: MemoryRun = {
        id: randomUUID(), ownerId: input.ownerId, gameId: input.gameId, flowId: input.flowId, flowHash: input.flowHash,
        status: "running", currentNodeId: input.currentNodeId, question: input.question, flowState: clone(input.flowState),
        flowOutput: clone(input.flowOutput), loopCounts: clone(input.loopCounts), pendingHumanInput: null,
        revision: 1, activeKey: activeKey(input.ownerId, input.gameId), leaseExpiresAt, startedAt: now,
        completedAt: null, failureCode: null, createdAt: now, updatedAt: now,
      };
      memoryRuns().push(run);
      const builderChatHistory = clone(game.spec.builderChatHistory);
      return {
        status: "started",
        run: toRun(run),
        gameRevision: appendTurn(game, { role: "user", message: input.userMessage }),
        builderChatHistory,
      };
    }

    const prisma = getPrisma();
    try {
      return await this.transactionWithTranscriptRetry(() => prisma.$transaction(async (tx) => {
        const game = await tx.game.findFirst({ where: { id: input.gameId, ownerId: input.ownerId } });
        if (!game) return { status: "not_found" } as StartRunResult;
        const existing = await tx.agentFlowRun.findUnique({ where: { activeKey: activeKey(input.ownerId, input.gameId) } });
        if (existing) {
          if (existing.status === "running" && existing.leaseExpiresAt && existing.leaseExpiresAt <= now) {
            const staleResult = await tx.agentFlowRun.updateMany({
              where: { id: existing.id, revision: existing.revision, status: "running" },
              data: { status: "failed", activeKey: null, failureCode: "stale_running", completedAt: now, leaseExpiresAt: null, revision: { increment: 1 } },
            });
            if (staleResult.count) {
              const stale = await tx.agentFlowRun.findUniqueOrThrow({ where: { id: existing.id } });
              return { status: "stale_running", run: toRun(stale as AgentFlowRun) };
            }
            const current = await tx.agentFlowRun.findUniqueOrThrow({ where: { id: existing.id } });
            return { status: "active_conflict", run: toRun(current as AgentFlowRun) };
          }
          return { status: "active_conflict", run: toRun(existing as AgentFlowRun) };
        }
        const [run, updatedGame] = await Promise.all([
          tx.agentFlowRun.create({ data: {
            ownerId: input.ownerId, gameId: input.gameId, flowId: input.flowId, flowHash: input.flowHash,
            currentNodeId: input.currentNodeId, question: input.question, flowState: input.flowState,
            flowOutput: jsonInput(input.flowOutput), loopCounts: input.loopCounts, status: "running",
            activeKey: activeKey(input.ownerId, input.gameId), leaseExpiresAt, pendingHumanInput: Prisma.JsonNull,
          } }),
          updateGameTranscript(tx, game, { role: "user", message: input.userMessage }),
        ]);
        return {
          status: "started",
          run: toRun(run as AgentFlowRun),
          gameRevision: updatedGame.revision,
          builderChatHistory: gameDocumentSchema.parse(game.spec).builderChatHistory,
        };
      }));
    } catch (error) {
      if (isActiveKeyConflict(error)) {
        const existing = await prisma.agentFlowRun.findUnique({ where: { activeKey: activeKey(input.ownerId, input.gameId) } });
        if (existing) return { status: "active_conflict", run: toRun(existing as AgentFlowRun) };
      }
      throw error;
    }
  }

  async claimPausedAction(input: ClaimPausedInput): Promise<RunTransitionResult> {
    return this.transitionRunning(input, input.feedback ? { role: "user", message: input.feedback } : undefined);
  }

  async checkpointHumanInput(input: CheckpointRunInput): Promise<RunTransitionResult> {
    return this.transitionWithTranscript(input, "paused", { role: "cooper", message: input.cooperPrompt }, {
      ...runMutation(input), pendingHumanInput: input.pendingHumanInput, leaseExpiresAt: null,
    });
  }

  async completeDirectReply(input: CompleteRunInput): Promise<RunTransitionResult> {
    return this.transitionWithTranscript(input, "done", { role: "cooper", message: input.cooperMessage }, {
      ...runMutation(input), activeKey: null, pendingHumanInput: null, leaseExpiresAt: null, completedAt: new Date(),
    });
  }

  async fail(input: FailRunInput): Promise<RunTransitionResult> {
    const now = new Date();
    if (this.useMemory) {
      const run = memoryRuns().find((item) => item.id === input.runId && item.ownerId === input.ownerId && item.gameId === input.gameId);
      if (!run) return { status: "not_found" };
      if (run.revision !== input.expectedRevision || !["running", "paused"].includes(run.status)) return { status: "conflict" };
      Object.assign(run, { status: "failed", activeKey: null, leaseExpiresAt: null, completedAt: now, failureCode: failureCode(input.code), revision: run.revision + 1, updatedAt: now });
      return { status: "updated", run: toRun(run) };
    }
    const prisma = getPrisma();
    const result = await prisma.agentFlowRun.updateMany({
      where: { id: input.runId, ownerId: input.ownerId, gameId: input.gameId, revision: input.expectedRevision, status: { in: ["running", "paused"] } },
      data: { status: "failed", activeKey: null, leaseExpiresAt: null, completedAt: now, failureCode: failureCode(input.code), revision: { increment: 1 } },
    });
    if (result.count) {
      const run = await prisma.agentFlowRun.findUniqueOrThrow({ where: { id: input.runId } });
      return { status: "updated", run: toRun(run as AgentFlowRun) };
    }
    return this.missingOrConflict(input);
  }

  async loadActive(ownerId: string, gameId: string): Promise<AgentFlowRun | null> {
    if (this.useMemory) return toRunOrNull(memoryRuns().find((run) => run.ownerId === ownerId && run.gameId === gameId && run.activeKey !== null));
    const run = await getPrisma().agentFlowRun.findUnique({ where: { activeKey: activeKey(ownerId, gameId) } });
    return toRunOrNull(run as AgentFlowRun | null);
  }

  private async transitionRunning(input: ClaimPausedInput, turn?: BuilderChatTurn): Promise<RunTransitionResult> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs);
    if (this.useMemory) {
      const run = memoryRuns().find((item) => item.id === input.runId && item.ownerId === input.ownerId && item.gameId === input.gameId);
      if (!run) return { status: "not_found" };
      if (run.status !== "paused" || run.revision !== input.expectedRevision) return { status: "conflict" };
      const game = memoryGames().find((item) => item.id === input.gameId && item.ownerId === input.ownerId);
      if (!game) return { status: "not_found" };
      run.status = "running"; run.pendingHumanInput = null; run.leaseExpiresAt = leaseExpiresAt; run.revision += 1; run.updatedAt = now;
      if (input.feedback) run.flowState = { ...run.flowState, humanFeedback: input.feedback };
      const gameRevision = turn ? appendTurn(game, turn) : undefined;
      return {
        status: "updated",
        run: toRun(run),
        gameRevision,
        builderChatHistory: clone(game.spec.builderChatHistory),
      };
    }
    const transaction = (): Promise<RunTransitionResult> => getPrisma().$transaction<RunTransitionResult>(async (tx) => {
      const existing = await tx.agentFlowRun.findFirst({
        where: { id: input.runId, ownerId: input.ownerId, gameId: input.gameId, revision: input.expectedRevision, status: "paused" },
      });
      if (!existing) return this.missingOrConflict(input, tx);
      const result = await tx.agentFlowRun.updateMany({
        where: { id: input.runId, ownerId: input.ownerId, gameId: input.gameId, revision: input.expectedRevision, status: "paused" },
        data: {
          status: "running", pendingHumanInput: Prisma.JsonNull, leaseExpiresAt, revision: { increment: 1 },
          ...(input.feedback ? { flowState: { ...(existing.flowState as Record<string, string>), humanFeedback: input.feedback } } : {}),
        },
      });
      if (!result.count) return this.missingOrConflict(input, tx);
      const game = await tx.game.findFirst({ where: { id: input.gameId, ownerId: input.ownerId } });
      if (!game) return { status: "not_found" };
      const updatedGame = input.feedback ? await updateGameTranscript(tx, game, { role: "user", message: input.feedback }) : undefined;
      const run = await tx.agentFlowRun.findUniqueOrThrow({ where: { id: input.runId } });
      const previousHistory = gameDocumentSchema.parse(game.spec).builderChatHistory;
      return {
        status: "updated",
        run: toRun(run as AgentFlowRun),
        gameRevision: updatedGame?.revision,
        builderChatHistory: input.feedback
          ? [...previousHistory, { role: "user" as const, message: input.feedback }].slice(-50)
          : previousHistory,
      };
    });
    return input.feedback
      ? this.transactionWithTranscriptRetry(transaction)
      : transaction();
  }

  private async transitionWithTranscript(input: CheckpointRunInput | CompleteRunInput, status: "paused" | "done", turn: BuilderChatTurn, data: Record<string, unknown>): Promise<RunTransitionResult> {
    const now = new Date();
    if (this.useMemory) {
      const run = memoryRuns().find((item) => item.id === input.runId && item.ownerId === input.ownerId && item.gameId === input.gameId);
      const game = memoryGames().find((item) => item.id === input.gameId && item.ownerId === input.ownerId);
      if (!run || !game) return { status: "not_found" };
      if (run.status !== "running" || run.revision !== input.expectedRevision) return { status: "conflict" };
      Object.assign(run, data, { status, revision: run.revision + 1, updatedAt: now });
      return { status: "updated", run: toRun(run), gameRevision: appendTurn(game, turn) };
    }
    return this.transactionWithTranscriptRetry(() => getPrisma().$transaction(async (tx) => {
      const result = await tx.agentFlowRun.updateMany({
        where: { id: input.runId, ownerId: input.ownerId, gameId: input.gameId, revision: input.expectedRevision, status: "running" },
        data: {
          ...data,
          flowOutput: jsonInput(data.flowOutput),
          pendingHumanInput: data.pendingHumanInput === null ? Prisma.JsonNull : jsonInput(data.pendingHumanInput),
          status,
          revision: { increment: 1 },
        },
      });
      if (!result.count) return this.missingOrConflict(input, tx);
      const game = await tx.game.findFirst({ where: { id: input.gameId, ownerId: input.ownerId } });
      if (!game) return { status: "not_found" };
      const updatedGame = await updateGameTranscript(tx, game, turn);
      const run = await tx.agentFlowRun.findUniqueOrThrow({ where: { id: input.runId } });
      return { status: "updated", run: toRun(run as AgentFlowRun), gameRevision: updatedGame.revision };
    }));
  }

  private async transactionWithTranscriptRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < TRANSCRIPT_RETRY_LIMIT; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (error !== TRANSCRIPT_CONFLICT || attempt === TRANSCRIPT_RETRY_LIMIT - 1) {
          throw error;
        }
      }
    }
    throw new Error("Transcript retry limit exhausted");
  }

  private async missingOrConflict(input: { ownerId: string; gameId: string; runId: string }, prisma: PrismaExecutor = getPrisma()): Promise<RunTransitionResult> {
    const run = await prisma.agentFlowRun.findFirst({ where: { id: input.runId, ownerId: input.ownerId, gameId: input.gameId } });
    return run ? { status: "conflict" } : { status: "not_found" };
  }
}

async function updateGameTranscript(prisma: PrismaExecutor, game: { id: string; spec: unknown; revision: number }, turn: BuilderChatTurn) {
  const spec = gameDocumentSchema.parse(game.spec);
  const builderChatHistory = [...spec.builderChatHistory, builderChatTurnSchema.parse(turn)].slice(-50);
  const result = await prisma.game.updateMany({
    where: { id: game.id, revision: game.revision },
    data: { spec: { ...spec, builderChatHistory }, revision: { increment: 1 } },
  });
  if (!result.count) throw TRANSCRIPT_CONFLICT;
  return { revision: game.revision + 1 };
}

function toRunOrNull(run: AgentFlowRun | null | undefined) {
  return run ? toRun(run) : null;
}

function isActiveKeyConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function runMutation(input: RunMutation) {
  return {
    currentNodeId: input.currentNodeId,
    flowState: input.flowState,
    flowOutput: input.flowOutput,
    loopCounts: input.loopCounts,
  };
}

function jsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Run state must be JSON-serializable");
  const parsed: unknown = JSON.parse(serialized);
  return parsed === null ? Prisma.JsonNull : parsed as Prisma.InputJsonValue;
}
