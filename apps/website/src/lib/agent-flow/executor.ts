import { FLOW_ID, FlowContractError, branchTarget, deterministicCondition, evaluateCondition, nextNode, type CompiledFlow, type CompiledNode } from "./contract";
import { interpolate } from "./interpolate";
import { type ModelClient, type ModelMessage, type ModelToolDefinition, type ModelToolOutput, type ModelTurnItem, ModelOutputError } from "./model-client";
import { screenCooperMessage, type ContentModerator } from "./moderation";
import { getRegisteredFlow, type RegisteredFlow } from "./registry";
import { AgentFlowRunStore, type AgentFlowRun } from "./run-store";
import { getAgentTool, type ToolExecutionContext } from "./tools/registry";
import type { BuilderChatTurn } from "../game-contract";
import type { CooperSpecChange } from "../game-objects";
import type { GamePhysicsDocument } from "../game-physics";

const VISIBLE_MESSAGE_LIMIT = 500;
/**
 * Tool rounds Cooper may spend before it has to talk to the kid. A single ask
 * can be a read and a write in two domains (physics and the level, or the
 * game and a new level), so three was not enough: the fourth call threw and
 * the kid saw a failed turn even after a write had already landed.
 */
const MAX_TOOL_ROUNDS = 6;
const CLOSE_INSTRUCTION = {
  role: "developer" as const,
  content: "Reply to the kid now in two or three short sentences. You cannot use tools on this turn.",
};
/** Set AGENT_FLOW_DEBUG=1 to trace each tool call and its result. */
const DEBUG = process.env.AGENT_FLOW_DEBUG === "1";
/**
 * Scenario taken without asking the Condition Agent once a tool has committed
 * a change. The guard grades only Cooper's drafted sentence, so a turn that
 * really did write but had to say the value was already at its bound reads as
 * "could not do what was asked" and was routed to Human Input. The kid then
 * got a stock "decide before I keep going" prompt in place of the explanation,
 * and Proceed only ran the same turn into the same bound again.
 */
const APPLIED_WRITE_SCENARIO = "Ready";
type Action = "proceed" | "reject";
type Budget = { text: number; conditionAgent: number };

export type ExecuteBuildMessageInput = Readonly<{ ownerId: string; gameId: string; message: string; signal?: AbortSignal }>;
export type ResumeBuildTurnInput = Readonly<{ ownerId: string; gameId: string; action: Action; feedback?: string; signal?: AbortSignal }>;
export type BuildMessageResult = Readonly<{ status: "replied" | "paused"; cooperMessage: string; runId: string; gameRevision: number; physicsDocument?: GamePhysicsDocument; specChange?: CooperSpecChange; gameTitle?: string }>;

export class BuildExecutionError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "BuildExecutionError";
  }
}
export type BuildExecutorDependencies = Readonly<{
  modelClient: ModelClient;
  runStore?: AgentFlowRunStore;
  moderator: ContentModerator;
  /**
   * Defaults to the checked-in build flow. The product flow replies on every
   * turn, so tests supply a graph that still reaches Condition Agent, Human
   * Input, and Loop to keep those interpreter paths honest.
   */
  flow?: RegisteredFlow;
}>;

export async function executeBuildMessage(input: ExecuteBuildMessageInput, dependencies: BuildExecutorDependencies): Promise<BuildMessageResult> {
  if (!dependencies.moderator) {
    throw new BuildExecutionError("Content moderation is unavailable", "moderation_unavailable");
  }
  const registered = dependencies.flow ?? getRegisteredFlow(FLOW_ID);
  const store = dependencies.runStore ?? new AgentFlowRunStore();
  const active = await store.loadActive(input.ownerId, input.gameId);
  if (active?.flowHash !== undefined && active.flowHash !== registered.flowHash) {
    await store.fail({ ownerId: input.ownerId, gameId: input.gameId, runId: active.id, expectedRevision: active.revision, code: "flow_hash_mismatch" });
  }
  const start = registered.flow.nodesById.get(registered.flow.startNodeId);
  if (!start || start.kind !== "startAgentflow") throw new FlowContractError("Flow Start node is invalid");
  const message = normalizeVisible(input.message, "Message");
  const started = await store.startMessage({
    ownerId: input.ownerId, gameId: input.gameId, flowId: registered.id, flowHash: registered.flowHash, currentNodeId: start.id,
    question: message, userMessage: message, flowState: stateEntries(start, "startState", message, ""), flowOutput: "", loopCounts: {},
  });
  if (started.status === "not_found") throw new BuildExecutionError("Game was not found", "game_not_found");
  if (started.status === "active_conflict") throw new BuildExecutionError("A build turn is already active", "active_run");
  if (started.status === "stale_running") throw new BuildExecutionError("Previous build turn expired", "stale_running");
  try {
    return await walk(registered.flow, nextRequired(registered.flow, start), started.run, started.run.revision, input.ownerId, input.gameId, store, dependencies.modelClient, dependencies.moderator, started.builderChatHistory, input.signal);
  } catch (error) {
    await failBestEffort(store, input, started.run, error);
    throw error;
  }
}

export async function resumeBuildTurn(input: ResumeBuildTurnInput, dependencies: BuildExecutorDependencies): Promise<BuildMessageResult> {
  if (!dependencies.moderator) {
    throw new BuildExecutionError("Content moderation is unavailable", "moderation_unavailable");
  }
  const registered = dependencies.flow ?? getRegisteredFlow(FLOW_ID);
  const store = dependencies.runStore ?? new AgentFlowRunStore();
  const active = await store.loadActive(input.ownerId, input.gameId);
  if (!active || active.status !== "paused") throw new BuildExecutionError("There is no paused build turn", "no_paused_run");
  if (active.flowId !== registered.id || active.flowHash !== registered.flowHash) {
    await store.fail({ ownerId: input.ownerId, gameId: input.gameId, runId: active.id, expectedRevision: active.revision, code: "flow_hash_mismatch" });
    throw new BuildExecutionError("This build helper was updated", "flow_hash_mismatch");
  }
  const pause = readPause(active.pendingHumanInput);
  const pausedNode = registered.flow.nodesById.get(active.currentNodeId);
  if (!pausedNode || pausedNode.kind !== "humanInputAgentflow" || pause.nodeId !== pausedNode.id) throw new BuildExecutionError("Paused build turn is invalid", "invalid_pause");
  const label = input.action === "proceed" ? "Proceed" : "Reject";
  const targetId = pause.branches[label];
  if (!targetId || pausedNode.branches[label] !== targetId) throw new BuildExecutionError("Paused build action is invalid", "invalid_pause");
  const claimed = await store.claimPausedAction({
    ownerId: input.ownerId, gameId: input.gameId, runId: active.id, expectedRevision: active.revision,
    feedback: input.feedback ? normalizeVisible(input.feedback, "Feedback") : undefined,
  });
  if (claimed.status !== "updated") throw transitionError(claimed.status);
  try {
    const target = registered.flow.nodesById.get(targetId);
    if (!target) throw new FlowContractError("Human Input target is missing");
    return await walk(registered.flow, target, claimed.run, claimed.run.revision, input.ownerId, input.gameId, store, dependencies.modelClient, dependencies.moderator, claimed.builderChatHistory ?? [], input.signal);
  } catch (error) {
    await failBestEffort(store, input, claimed.run, error);
    throw error;
  }
}

async function walk(flow: CompiledFlow, node: CompiledNode, run: AgentFlowRun, revision: number, ownerId: string, gameId: string, store: AgentFlowRunStore, client: ModelClient, moderator: ContentModerator, builderChatHistory: readonly BuilderChatTurn[], signal?: AbortSignal): Promise<BuildMessageResult> {
  let current: CompiledNode | undefined = node;
  let flowState = { ...run.flowState };
  let flowOutput = String(run.flowOutput ?? "");
  const loopCounts = { ...run.loopCounts };
  const budget: Budget = { text: 0, conditionAgent: 0 };
  // Tool writes commit on their own, so an applied patch survives a later
  // Reject or failure. The document rides back so the preview can re-render.
  let physicsDocument: GamePhysicsDocument | undefined;
  let specChange: CooperSpecChange | undefined;
  let gameTitle: string | undefined;
  let appliedWrite = false;
  const toolContext: ToolExecutionContext = { ownerId, gameId, prompt: run.question, store, moderator, signal };
  while (current) {
    if (current.kind === "agentAgentflow" || current.kind === "llmAgentflow") {
      if (++budget.text > 1) throw new BuildExecutionError("Build turn exceeded its model budget", "execution_budget");
      const text = await executeText(current, run.question, flowState, flowOutput, client, builderChatHistory, toolContext);
      flowOutput = text.flowOutput;
      flowState = text.flowState;
      physicsDocument = text.physicsDocument ?? physicsDocument;
      specChange = text.specChange ?? specChange;
      gameTitle = text.gameTitle ?? gameTitle;
      appliedWrite = appliedWrite || text.appliedWrite;
      current = nextRequired(flow, current);
    } else if (current.kind === "conditionAgentAgentflow") {
      if (appliedWrite && hasBranch(current, APPLIED_WRITE_SCENARIO)) {
        current = branchFor(flow, current, APPLIED_WRITE_SCENARIO);
        continue;
      }
      if (++budget.conditionAgent > 1) throw new BuildExecutionError("Build turn exceeded its condition budget", "execution_budget");
      current = branchFor(flow, current, await executeConditionAgent(current, run.question, flowState, flowOutput, client, signal));
    } else if (current.kind === "conditionAgentflow") {
      const condition = deterministicCondition(current.inputs);
      const values = context(run.question, flowOutput, flowState);
      current = branchFor(flow, current, evaluateCondition(
        condition.operation,
        interpolate(condition.left, values),
        interpolate(condition.right, values),
      ) ? "true" : "false");
    } else if (current.kind === "loopAgentflow") {
      const maximum = current.inputs.maxLoopCount;
      if (typeof maximum !== "number" || !Number.isInteger(maximum) || maximum < 1 || maximum > 20 || !current.loopTargetId) throw new FlowContractError(`Loop "${current.id}" is invalid`);
      const count = loopCounts[current.id] ?? 0;
      if (count >= maximum) throw new BuildExecutionError("Build revision loop is exhausted", "loop_exhausted");
      loopCounts[current.id] = count + 1;
      current = nodeById(flow, current.loopTargetId);
    } else if (current.kind === "directReplyAgentflow") {
      const template = requiredInput(current, "directReplyMessage");
      const cooperMessage = await screenTerminalMessage(template, interpolate(template, context(run.question, flowOutput, flowState)), "Direct Reply", moderator, signal);
      const complete = await store.completeDirectReply({ ownerId, gameId, runId: run.id, expectedRevision: revision, currentNodeId: current.id, flowState, flowOutput, loopCounts, cooperMessage });
      if (complete.status !== "updated" || complete.gameRevision === undefined) throw transitionError(complete.status);
      return { status: "replied", cooperMessage, runId: complete.run.id, gameRevision: complete.gameRevision, physicsDocument, specChange, gameTitle };
    } else if (current.kind === "humanInputAgentflow") {
      const template = requiredInput(current, "humanInputDescription");
      const cooperMessage = await screenTerminalMessage(template, interpolate(template, context(run.question, flowOutput, flowState)), "Human Input", moderator, signal);
      const checkpoint = await store.checkpointHumanInput({
        ownerId, gameId, runId: run.id, expectedRevision: revision, currentNodeId: current.id, flowState, flowOutput, loopCounts, cooperPrompt: cooperMessage,
        pendingHumanInput: { nodeId: current.id, branches: current.branches, enableFeedback: current.inputs.humanInputEnableFeedback === true },
      });
      if (checkpoint.status !== "updated" || checkpoint.gameRevision === undefined) throw transitionError(checkpoint.status);
      return { status: "paused", cooperMessage, runId: checkpoint.run.id, gameRevision: checkpoint.gameRevision, physicsDocument, specChange, gameTitle };
    } else {
      throw new FlowContractError(`Unsupported executable node "${current.kind}"`);
    }
  }
  throw new FlowContractError("Flow ended without a terminal node");
}

async function executeText(node: CompiledNode, question: string, state: Record<string, string>, priorOutput: string, client: ModelClient, builderChatHistory: readonly BuilderChatTurn[], toolContext: ToolExecutionContext) {
  const prefix = node.kind === "agentAgentflow" ? "agent" : "llm";
  const messages = modelMessagesForTextNode(node, question, state, priorOutput, builderChatHistory);
  const tools = toolDefinitionsForNode(node);
  let history: readonly ModelTurnItem[] = [];
  let toolOutputs: ModelToolOutput[] | undefined;
  let physicsDocument: GamePhysicsDocument | undefined;
  let specChange: CooperSpecChange | undefined;
  let gameTitle: string | undefined;
  let appliedWrite = false;

  for (let round = 0; ; round += 1) {
    const allowTools = round < MAX_TOOL_ROUNDS;
    const turn = await client.completeTurn({
      messages: allowTools ? messages : [...messages, CLOSE_INSTRUCTION],
      tools: allowTools ? tools : undefined,
      history,
      toolOutputs,
      signal: toolContext.signal,
    });
    if (!turn.toolCalls.length) {
      const flowOutput = normalizeVisible(turn.text, "Model response");
      return {
        flowOutput,
        flowState: stateEntries(node, `${prefix}UpdateState` as "agentUpdateState" | "llmUpdateState", question, flowOutput, state),
        physicsDocument,
        specChange,
        gameTitle,
        appliedWrite,
      };
    }
    if (!allowTools) {
      console.error(
        "[agent-flow] tool budget exhausted after",
        MAX_TOOL_ROUNDS,
        "rounds; last calls:",
        turn.toolCalls.map((call) => call.name),
      );
      throw new BuildExecutionError("Build turn exceeded its tool budget", "execution_budget");
    }
    // Tool results are provider history only; they never become kid-visible chat.
    history = turn.items;
    toolOutputs = [];
    for (const call of turn.toolCalls) {
      if (!tools.some((tool) => tool.name === call.name)) {
        throw new BuildExecutionError(`Model called unavailable tool "${call.name}"`, "unexpected_tool_call");
      }
      const result = await getAgentTool(call.name).execute(parseToolArguments(call.argumentsJson), toolContext);
      // `gameRevision` is set by every tool that committed, and by no tool that
      // only read or was refused.
      appliedWrite = appliedWrite || result.gameRevision !== undefined;
      physicsDocument = result.physicsDocument ?? physicsDocument;
      specChange = result.specChange ?? specChange;
      gameTitle = result.gameTitle ?? gameTitle;
      const output = JSON.stringify(result.output);
      // A refused tool call is not an error: the model is told why and is
      // expected to recover. It still needs to be visible when a turn goes
      // wrong, because a silent refusal loop looks like a hang from outside.
      const refusal = (result.output as { ok?: unknown; reason?: unknown } | null);
      if (refusal && refusal.ok === false) {
        console.warn("[agent-flow] tool refused", call.name, refusal.reason);
      } else if (DEBUG) {
        console.log("[agent-flow] tool ok", call.name, `${output.length} bytes`);
      }
      if (DEBUG) console.log("[agent-flow] tool args", call.name, call.argumentsJson.slice(0, 500));
      toolOutputs.push({ callId: call.callId, output });
    }
  }
}

function toolDefinitionsForNode(node: CompiledNode): readonly ModelToolDefinition[] {
  if (node.kind !== "agentAgentflow" || !Array.isArray(node.inputs.agentTools)) return [];
  return node.inputs.agentTools.map((entry) =>
    getAgentTool(String((entry as Record<string, unknown>).agentSelectedTool)).definition);
}

/** Malformed arguments reach the tool as undefined, which it reports as an error. */
function parseToolArguments(argumentsJson: string): unknown {
  try {
    return JSON.parse(argumentsJson || "{}");
  } catch {
    return undefined;
  }
}

export function modelMessagesForTextNode(node: CompiledNode, question: string, state: Record<string, string>, priorOutput: string, builderChatHistory: readonly BuilderChatTurn[]) {
  if (node.kind !== "agentAgentflow" && node.kind !== "llmAgentflow") {
    throw new FlowContractError(`Node "${node.id}" does not produce text`);
  }
  const prefix = node.kind === "agentAgentflow" ? "agent" : "llm";
  if (node.kind === "llmAgentflow" && Object.entries(node.inputs).some(([key, value]) => /tool/i.test(key) && value !== undefined)) throw new FlowContractError("LLM nodes cannot configure tools");
  const configured = node.inputs[`${prefix}Messages`];
  if (!Array.isArray(configured)) throw new FlowContractError(`${prefix} messages are invalid`);
  const initial = context(question, priorOutput, state);
  const userMessage = interpolate(requiredInput(node, `${prefix}UserMessage`), initial);
  const messages: ModelMessage[] = configured.map((item) => {
    if (!item || typeof item !== "object") throw new FlowContractError(`${prefix} message is invalid`);
    const message = item as Record<string, unknown>;
    if (!["system", "developer", "user"].includes(message.role as string) || typeof message.content !== "string") throw new FlowContractError(`${prefix} message is invalid`);
    return { role: message.role as "system" | "developer" | "user", content: interpolate(message.content, initial) };
  });
  if (node.inputs[`${prefix}EnableMemory`] === true) {
    messages.push(...builderChatHistory
      // Compared against the raw question, not the rendered user message, so a
      // template that wraps or labels the question still drops its own echo.
      .filter((turn) => turn.role !== "user" || turn.message !== question)
      .map((turn) => ({
      role: turn.role === "cooper" ? "assistant" as const : "user" as const,
      content: turn.message,
      })));
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}

async function executeConditionAgent(node: CompiledNode, question: string, state: Record<string, string>, output: string, client: ModelClient, signal?: AbortSignal) {
  const raw = node.inputs.conditionAgentScenarios;
  if (!Array.isArray(raw)) throw new FlowContractError("Condition Agent scenarios are invalid");
  const scenarios = raw.map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).scenario : undefined);
  if (!scenarios.every((scenario): scenario is string => typeof scenario === "string" && Boolean(scenario))) throw new FlowContractError("Condition Agent scenario is invalid");
  const selected = await client.selectScenario({ instructions: interpolate(requiredInput(node, "conditionAgentInstructions"), context(question, output, state)), input: interpolate(requiredInput(node, "conditionAgentInput"), context(question, output, state)), scenarios, signal });
  if (!scenarios.includes(selected)) throw new ModelOutputError("Condition Agent selected an unknown scenario");
  return selected;
}

function nextRequired(flow: CompiledFlow, node: CompiledNode) {
  const next = nextNode(flow, node.id);
  if (!next) throw new FlowContractError(`Node "${node.id}" has no successor`);
  return next;
}
function nodeById(flow: CompiledFlow, id: string) {
  const node = flow.nodesById.get(id);
  if (!node) throw new FlowContractError(`Node "${id}" is missing`);
  return node;
}
/** Matches `branchFor`, so a flow that omits the branch keeps its own routing. */
function hasBranch(node: CompiledNode, branch: string) {
  if (node.branches[branch]) return true;
  return Object.keys(node.branches).filter((candidate) => candidate.toLowerCase() === branch.toLowerCase()).length === 1;
}
function branchFor(flow: CompiledFlow, node: CompiledNode, branch: string) {
  if (node.branches[branch]) return branchTarget(flow, node.id, branch);
  const match = Object.keys(node.branches).filter((candidate) => candidate.toLowerCase() === branch.toLowerCase());
  if (match.length !== 1) throw new FlowContractError(`Node "${node.id}" has no unambiguous branch "${branch}"`);
  return branchTarget(flow, node.id, match[0]);
}
function stateEntries(node: CompiledNode, key: "startState" | "agentUpdateState" | "llmUpdateState", question: string, output: string, initial: Record<string, string> = {}) {
  const entries = node.inputs[key];
  if (entries === undefined) return { ...initial };
  if (!Array.isArray(entries)) throw new FlowContractError(`${key} is invalid`);
  const state = { ...initial };
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") throw new FlowContractError(`${key} entry is invalid`);
    const item = entry as Record<string, unknown>;
    if (typeof item.key !== "string" || typeof item.value !== "string") throw new FlowContractError(`${key} entry is invalid`);
    state[item.key] = interpolate(item.value, context(question, output, state));
  }
  return state;
}
function readPause(value: unknown): { nodeId: string; branches: Record<string, string> } {
  if (!value || typeof value !== "object") throw new BuildExecutionError("Paused build turn is invalid", "invalid_pause");
  const pause = value as Record<string, unknown>;
  if (typeof pause.nodeId !== "string" || !pause.branches || typeof pause.branches !== "object" || Array.isArray(pause.branches)) throw new BuildExecutionError("Paused build turn is invalid", "invalid_pause");
  const branches: Record<string, string> = {};
  for (const [label, target] of Object.entries(pause.branches)) {
    if (typeof target !== "string") throw new BuildExecutionError("Paused build turn is invalid", "invalid_pause");
    branches[label] = target;
  }
  return { nodeId: pause.nodeId, branches };
}
function requiredInput(node: CompiledNode, key: string) {
  const value = node.inputs[key];
  if (typeof value !== "string") throw new FlowContractError(`Node "${node.id}" is missing ${key}`);
  return value;
}
function context(question: string, flowOutput: string, flowState: Record<string, string>) { return { question, flowOutput, flowState }; }
function normalizeVisible(value: unknown, label: string) {
  if (typeof value !== "string") throw new ModelOutputError(`${label} must be text`);
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new ModelOutputError(`${label} is empty`);
  return normalized.slice(0, VISIBLE_MESSAGE_LIMIT);
}
/**
 * Screens a terminal message before it reaches the transcript, so flagged text
 * is never persisted and never replays into a later turn's context. A template
 * that interpolated to itself carries no model or kid text, so it is already
 * covered by flow review and skips the provider call.
 */
async function screenTerminalMessage(template: string, rendered: string, label: string, moderator: ContentModerator, signal?: AbortSignal) {
  const drafted = normalizeVisible(rendered, label);
  return rendered === template ? drafted : screenCooperMessage(drafted, moderator, signal);
}
function transitionError(status: "updated" | "not_found" | "conflict") { return new BuildExecutionError("Build run could not be updated", status); }
async function failBestEffort(store: AgentFlowRunStore, input: { ownerId: string; gameId: string }, run: AgentFlowRun, error: unknown) {
  const code = error instanceof BuildExecutionError ? error.code : error instanceof FlowContractError ? "flow_contract" : error instanceof ModelOutputError ? "model_output" : "execution_failure";
  try { await store.fail({ ownerId: input.ownerId, gameId: input.gameId, runId: run.id, expectedRevision: run.revision, code }); } catch { /* preserve original error */ }
}
