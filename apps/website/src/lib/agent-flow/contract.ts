import { z } from "zod";

export const FLOW_ID = "build_agentflow_v1" as const;

const MAX_NODE_COUNT = 64;
const MAX_EDGE_COUNT = 128;
const MAX_TEXT_LENGTH = 10_000;
const MAX_STATE_ENTRIES = 30;
const MAX_MESSAGES = 30;
const MAX_SCENARIOS = 16;
const MAX_LOOP_COUNT = 20;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const NODE_TYPES = {
  startAgentflow: "Start",
  agentAgentflow: "Agent",
  llmAgentflow: "LLM",
  conditionAgentflow: "Condition",
  conditionAgentAgentflow: "ConditionAgent",
  humanInputAgentflow: "HumanInput",
  loopAgentflow: "Loop",
  directReplyAgentflow: "DirectReply",
} as const;

export type FlowNodeKind = keyof typeof NODE_TYPES;
export type ConditionOperation = "equals" | "notEquals" | "contains" | "notContains";
export type DeterministicCondition = Readonly<{
  operation: ConditionOperation;
  left: string;
  right: string;
}>;

export class FlowContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowContractError";
  }
}

const nodeSchema = z.object({
  id: z.string().min(1).max(160),
  data: z.object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(80),
    type: z.string().min(1).max(80),
    inputs: z.record(z.string(), z.unknown()).default({}),
    outputAnchors: z.array(z.object({
      id: z.string().min(1).max(200),
      name: z.string().min(1).max(80),
      branchLabel: z.string().min(1).max(200).optional(),
    }).passthrough()).max(16).default([]),
  }).passthrough(),
}).passthrough();

const edgeSchema = z.object({
  id: z.string().min(1).max(400),
  source: z.string().min(1).max(160),
  sourceHandle: z.string().min(1).max(200),
  target: z.string().min(1).max(160),
  targetHandle: z.string().min(1).max(200).optional(),
  data: z.object({ edgeLabel: z.string().min(1).max(200).optional() }).passthrough().optional(),
}).passthrough();

const flowSchema = z.object({
  nodes: z.array(nodeSchema).min(1).max(MAX_NODE_COUNT),
  edges: z.array(edgeSchema).max(MAX_EDGE_COUNT),
}).passthrough();

type ParsedNode = z.infer<typeof nodeSchema>;
type ParsedEdge = z.infer<typeof edgeSchema>;

export type CompiledNode = Readonly<{
  id: string;
  kind: FlowNodeKind;
  inputs: Readonly<Record<string, unknown>>;
  outputHandles: readonly string[];
  branches: Readonly<Record<string, string>>;
  loopTargetId?: string;
}>;

export type CompiledFlow = Readonly<{
  nodes: readonly CompiledNode[];
  nodesById: ReadonlyMap<string, CompiledNode>;
  nextByNodeId: ReadonlyMap<string, string>;
  startNodeId: string;
}>;

function rejectUnsafeKeys(value: unknown, path = "flow"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUnsafeKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) throw new FlowContractError(`${path} contains unsafe key "${key}"`);
    rejectUnsafeKeys(item, `${path}.${key}`);
  }
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) {
    throw new FlowContractError(`${label} must be a string up to ${MAX_TEXT_LENGTH} characters`);
  }
  return value;
}

function validateStateEntries(value: unknown, label: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > MAX_STATE_ENTRIES) {
    throw new FlowContractError(`${label} must contain at most ${MAX_STATE_ENTRIES} entries`);
  }
  for (const entry of value) {
    if (!entry || typeof entry !== "object") throw new FlowContractError(`${label} entry is invalid`);
    const { key, value: stateValue } = entry as Record<string, unknown>;
    if (typeof key !== "string" || !key || key.length > 100 || UNSAFE_KEYS.has(key)) {
      throw new FlowContractError(`${label} has an unsafe state key`);
    }
    requireText(stateValue ?? "", `${label}.${key}`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FlowContractError(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function validateMessages(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length > MAX_MESSAGES) {
    throw new FlowContractError(`${label} must contain at most ${MAX_MESSAGES} messages`);
  }
  for (const item of value) {
    const message = record(item, `${label} message`);
    if (!["system", "developer", "user"].includes(message.role as string)) {
      throw new FlowContractError(`${label} message has an invalid role`);
    }
    requireText(message.content, `${label} message content`);
  }
}

function validateMemory(inputs: Record<string, unknown>, prefix: "agent" | "llm"): void {
  const enabled = inputs[`${prefix}EnableMemory`];
  const type = inputs[`${prefix}MemoryType`];
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new FlowContractError(`${prefix}EnableMemory must be a boolean`);
  }
  if (type !== undefined && type !== "allMessages") {
    throw new FlowContractError(`${prefix}MemoryType must be allMessages`);
  }
  if (enabled === true && type !== "allMessages") {
    throw new FlowContractError(`${prefix}EnableMemory requires allMessages memory`);
  }
}

function validateConditionAgentScenarios(value: unknown): void {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_SCENARIOS) {
    throw new FlowContractError(`Condition Agent scenarios must contain 2 to ${MAX_SCENARIOS} entries`);
  }
  const scenarios = value.map((item) => requireText(record(item, "Condition Agent scenario").scenario, "Condition Agent scenario"));
  if (scenarios.some((scenario) => !scenario.trim()) || new Set(scenarios.map((scenario) => scenario.toLowerCase())).size !== scenarios.length) {
    throw new FlowContractError("Condition Agent scenarios must be unique non-empty text");
  }
}

export function deterministicCondition(inputs: Record<string, unknown>): DeterministicCondition {
  const conditions = inputs.conditions;
  if (!Array.isArray(conditions) || conditions.length !== 1) {
    throw new FlowContractError("Condition requires exactly one Flowise condition");
  }
  const condition = record(conditions[0], "Condition rule");
  if (condition.type !== "string") throw new FlowContractError("Condition rule must compare strings");
  assertConditionOperation(condition.operation);
  return Object.freeze({
    operation: condition.operation,
    left: requireText(condition.value1, "Condition left value"),
    right: requireText(condition.value2, "Condition right value"),
  });
}

function validateInputs(kind: FlowNodeKind, inputs: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(inputs)) {
    if (UNSAFE_KEYS.has(key)) throw new FlowContractError(`Node input uses unsafe key "${key}"`);
    if (typeof value === "string") requireText(value, `Input "${key}"`);
  }
  validateStateEntries(inputs.startState, "startState");
  validateStateEntries(inputs.agentUpdateState, "agentUpdateState");
  validateStateEntries(inputs.llmUpdateState, "llmUpdateState");
  if (kind === "startAgentflow" && inputs.startInputType !== "chatInput") {
    throw new FlowContractError("Start input type must be chatInput");
  }
  if (kind === "agentAgentflow" && inputs.agentTools !== undefined
    && (!Array.isArray(inputs.agentTools) || inputs.agentTools.length !== 0)) {
    throw new FlowContractError("Agent nodes must have an empty agentTools list");
  }
  if (kind === "llmAgentflow" && Object.entries(inputs).some(([key, value]) => /tool/i.test(key) && value !== undefined)) {
    throw new FlowContractError("LLM nodes cannot configure tools");
  }
  if (kind === "agentAgentflow" || kind === "llmAgentflow") {
    const prefix = kind === "agentAgentflow" ? "agent" : "llm";
    validateMessages(inputs[`${prefix}Messages`], `${prefix} messages`);
    requireText(inputs[`${prefix}UserMessage`], `${prefix} user message`);
    validateMemory(inputs, prefix);
  }
  if (kind === "conditionAgentflow") {
    deterministicCondition(inputs);
  }
  if (kind === "conditionAgentAgentflow") {
    requireText(inputs.conditionAgentInstructions, "Condition Agent instructions");
    requireText(inputs.conditionAgentInput, "Condition Agent input");
    validateConditionAgentScenarios(inputs.conditionAgentScenarios);
  }
  if (kind === "humanInputAgentflow") {
    requireText(inputs.humanInputDescription, "Human Input description");
  }
  if (kind === "directReplyAgentflow") {
    requireText(inputs.directReplyMessage, "Direct Reply message");
  }
  if (kind === "loopAgentflow") {
    const maximum = inputs.maxLoopCount;
    if (!Number.isInteger(maximum) || (maximum as number) < 1 || (maximum as number) > MAX_LOOP_COUNT) {
      throw new FlowContractError(`Loop maximum must be an integer from 1 to ${MAX_LOOP_COUNT}`);
    }
  }
}

function kindFor(node: ParsedNode): FlowNodeKind | undefined {
  if (node.data.name === "stickyNoteAgentflow" && node.data.type === "StickyNote") return undefined;
  const type = NODE_TYPES[node.data.name as FlowNodeKind];
  if (!type || type !== node.data.type) {
    throw new FlowContractError(`Unsupported or mismatched node "${node.data.name}/${node.data.type}"`);
  }
  return node.data.name as FlowNodeKind;
}

function loopTarget(value: unknown, nodeId: string, nodeIds: Set<string>): string {
  const encoded = requireText(value, `Loop "${nodeId}" target`);
  const match = /^(.*)-[A-Za-z]+$/.exec(encoded);
  if (!match || !nodeIds.has(match[1])) {
    throw new FlowContractError(`Loop "${nodeId}" has no valid target`);
  }
  return match[1];
}

export function compileFlow(source: unknown): CompiledFlow {
  rejectUnsafeKeys(source);
  const parsed = flowSchema.safeParse(source);
  if (!parsed.success) throw new FlowContractError(`Malformed flow: ${parsed.error.issues[0]?.message}`);

  const executable = parsed.data.nodes.filter((node) => kindFor(node) !== undefined);
  const nodeIds = new Set<string>();
  for (const node of executable) {
    if (node.id !== node.data.id) throw new FlowContractError(`Node "${node.id}" has mismatched data.id`);
    if (nodeIds.has(node.id)) throw new FlowContractError(`Duplicate node id "${node.id}"`);
    nodeIds.add(node.id);
  }

  const kinds = new Map(executable.map((node) => [node.id, kindFor(node)!]));
  const starts = executable.filter((node) => kinds.get(node.id) === "startAgentflow");
  if (starts.length !== 1) throw new FlowContractError("Flow must contain exactly one Start node");

  const edgeByHandle = new Map<string, ParsedEdge>();
  for (const edge of parsed.data.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new FlowContractError(`Edge "${edge.id}" references a missing or ignored node`);
    }
    const source = executable.find((node) => node.id === edge.source)!;
    if (!source.data.outputAnchors.some((anchor) => anchor.id === edge.sourceHandle)) {
      throw new FlowContractError(`Edge "${edge.id}" references an unknown source handle`);
    }
    if (edge.targetHandle !== undefined && edge.targetHandle !== edge.target) {
      throw new FlowContractError(`Edge "${edge.id}" has an invalid target handle`);
    }
    if (edgeByHandle.has(edge.sourceHandle)) throw new FlowContractError(`Duplicate outgoing handle "${edge.sourceHandle}"`);
    edgeByHandle.set(edge.sourceHandle, edge);
  }

  const compiled: CompiledNode[] = executable.map((node) => {
    const kind = kinds.get(node.id)!;
    const handles = node.data.outputAnchors.map((anchor) => anchor.id);
    if (new Set(handles).size !== handles.length) throw new FlowContractError(`Node "${node.id}" has duplicate handles`);
    validateInputs(kind, node.data.inputs);

    if (kind === "loopAgentflow") {
      if (handles.length || [...edgeByHandle.values()].some((edge) => edge.source === node.id)) {
        throw new FlowContractError(`Loop "${node.id}" must be terminal`);
      }
      return Object.freeze({ id: node.id, kind, inputs: Object.freeze({ ...node.data.inputs }), outputHandles: [], branches: Object.freeze({}), loopTargetId: loopTarget(node.data.inputs.loopBackToNode, node.id, nodeIds) });
    }
    if (kind === "directReplyAgentflow" && handles.length) throw new FlowContractError("Direct Reply must be terminal");
    if (kind === "directReplyAgentflow") return Object.freeze({ id: node.id, kind, inputs: Object.freeze({ ...node.data.inputs }), outputHandles: [], branches: Object.freeze({}) });
    if (!handles.length) throw new FlowContractError(`Node "${node.id}" has no output handle`);

    const branches: Record<string, string> = Object.create(null);
    for (const anchor of node.data.outputAnchors) {
      const edge = edgeByHandle.get(anchor.id);
      if (!edge || edge.source !== node.id) throw new FlowContractError(`Node "${node.id}" has an unconnected output handle`);
      const branch = anchor.branchLabel;
      if (branch) {
        if (branches[branch]) throw new FlowContractError(`Node "${node.id}" has duplicate branch "${branch}"`);
        if (edge.data?.edgeLabel && edge.data.edgeLabel !== branch) throw new FlowContractError(`Branch label mismatch for "${branch}"`);
        branches[branch] = edge.target;
      }
    }
    if ((kind === "conditionAgentflow" || kind === "conditionAgentAgentflow" || kind === "humanInputAgentflow") && Object.keys(branches).length !== handles.length) {
      throw new FlowContractError(`Branch node "${node.id}" requires one labeled edge per output`);
    }
    if (kind === "conditionAgentflow") {
      const labels = Object.keys(branches).map((label) => label.toLowerCase()).sort();
      if (labels.length !== 2 || labels[0] !== "false" || labels[1] !== "true") {
        throw new FlowContractError(`Condition "${node.id}" requires True and False branches`);
      }
    }
    if (kind === "conditionAgentAgentflow") {
      const scenarios = (node.data.inputs.conditionAgentScenarios as Array<Record<string, unknown>>).map((scenario) => scenario.scenario as string);
      const labels = Object.keys(branches);
      if (labels.length !== scenarios.length || scenarios.some((scenario) => !labels.includes(scenario))) {
        throw new FlowContractError(`Condition Agent "${node.id}" branches must match its scenarios`);
      }
    }
    if (kind === "humanInputAgentflow") {
      const labels = Object.keys(branches).sort();
      if (labels.length !== 2 || labels[0] !== "Proceed" || labels[1] !== "Reject") {
        throw new FlowContractError(`Human Input "${node.id}" requires Proceed and Reject branches`);
      }
    }
    if (Object.keys(branches).length) return Object.freeze({ id: node.id, kind, inputs: Object.freeze({ ...node.data.inputs }), outputHandles: Object.freeze(handles), branches: Object.freeze(branches) });
    return Object.freeze({ id: node.id, kind, inputs: Object.freeze({ ...node.data.inputs }), outputHandles: Object.freeze(handles), branches: Object.freeze({}) });
  });

  const nodesById = new Map(compiled.map((node) => [node.id, node]));
  const nextByNodeId = new Map<string, string>();
  for (const node of compiled) {
    if (node.outputHandles.length === 1 && !Object.keys(node.branches).length) {
      nextByNodeId.set(node.id, edgeByHandle.get(node.outputHandles[0])!.target);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visiting.has(id)) throw new FlowContractError("Ordinary flow edges must be acyclic");
    if (visited.has(id)) return;
    visiting.add(id);
    const node = nodesById.get(id)!;
    const targets = node.kind === "loopAgentflow" ? [] : Object.keys(node.branches).length ? Object.values(node.branches) : nextByNodeId.get(id) ? [nextByNodeId.get(id)!] : [];
    targets.forEach(walk);
    visiting.delete(id);
    visited.add(id);
  };
  walk(starts[0].id);
  if (visited.size !== compiled.length) throw new FlowContractError("Flow contains unreachable executable nodes");

  return Object.freeze({ nodes: Object.freeze(compiled), nodesById, nextByNodeId, startNodeId: starts[0].id });
}

export function assertConditionOperation(value: unknown): asserts value is ConditionOperation {
  if (!["equals", "notEquals", "contains", "notContains"].includes(value as string)) {
    throw new FlowContractError(`Unsupported deterministic condition operation "${String(value)}"`);
  }
}

export function evaluateCondition(operation: ConditionOperation, left: string, right: string): boolean {
  assertConditionOperation(operation);
  if (left.length > MAX_TEXT_LENGTH || right.length > MAX_TEXT_LENGTH) {
    throw new FlowContractError("Condition values exceed the maximum length");
  }
  return operation === "equals" ? left === right
    : operation === "notEquals" ? left !== right
    : operation === "contains" ? left.includes(right)
    : !left.includes(right);
}

export function nextNode(flow: CompiledFlow, nodeId: string): CompiledNode | undefined {
  const target = flow.nextByNodeId.get(nodeId);
  return target ? flow.nodesById.get(target) : undefined;
}

export function branchTarget(flow: CompiledFlow, nodeId: string, branch: string): CompiledNode {
  const node = flow.nodesById.get(nodeId);
  const target = node?.branches[branch];
  if (!target) throw new FlowContractError(`Node "${nodeId}" has no branch "${branch}"`);
  return flow.nodesById.get(target)!;
}
