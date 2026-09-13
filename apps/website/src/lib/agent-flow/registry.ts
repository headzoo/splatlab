import { createHash } from "node:crypto";

import starterFlow from "../../../../game/agent-flows/build_agentflow_v1.json";

import { compileFlow, FLOW_ID, FlowContractError, type CompiledFlow } from "./contract";

export type RegisteredFlow = Readonly<{
  id: typeof FLOW_ID;
  flowHash: string;
  flow: CompiledFlow;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function executionCanonicalJson(flow: CompiledFlow): string {
  return JSON.stringify(canonicalize({
    startNodeId: flow.startNodeId,
    nodes: flow.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      inputs: node.inputs,
      outputHandles: node.outputHandles,
      branches: node.branches,
      loopTargetId: node.loopTargetId,
    })),
    nextByNodeId: [...flow.nextByNodeId.entries()],
  }));
}

export function flowHashFor(flow: CompiledFlow): string {
  return createHash("sha256").update(executionCanonicalJson(flow)).digest("hex");
}

const buildAgentflow = compileFlow(starterFlow);
const buildAgentflowRegistration: RegisteredFlow = Object.freeze({
  id: FLOW_ID,
  flowHash: flowHashFor(buildAgentflow),
  flow: buildAgentflow,
});

const registry = new Map<typeof FLOW_ID, RegisteredFlow>([
  [FLOW_ID, buildAgentflowRegistration],
]);

export const AGENTFLOW_REGISTRY: ReadonlyMap<typeof FLOW_ID, RegisteredFlow> = registry;

export function getRegisteredFlow(id: string): RegisteredFlow {
  const flow = registry.get(id as typeof FLOW_ID);
  if (!flow) throw new FlowContractError(`Unknown flow id "${id}"`);
  return flow;
}
