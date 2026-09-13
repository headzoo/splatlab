import assert from "node:assert/strict";
import test from "node:test";

import starterFlow from "../../../../game/agent-flows/build_agentflow_v1.json";

import {
  branchTarget,
  compileFlow,
  deterministicCondition,
  evaluateCondition,
  FlowContractError,
  nextNode,
} from "./contract";
import { interpolate } from "./interpolate";
import { flowHashFor, getRegisteredFlow } from "./registry";
import { AGENT_TOOL_IDS } from "./tools/allowlist";

function cloneStarter(): any {
  return structuredClone(starterFlow);
}

test("the checked-in starter flow compiles with explicit branches and loop target", () => {
  const registered = getRegisteredFlow("build_agentflow_v1");
  const { flow } = registered;

  assert.equal(flow.startNodeId, "startAgentflow_0");
  assert.equal(nextNode(flow, flow.startNodeId)?.id, "agentAgentflow_0");
  assert.equal(branchTarget(flow, "conditionAgentAgentflow_0", "Ready").id, "directReplyAgentflow_0");
  assert.equal(branchTarget(flow, "conditionAgentAgentflow_0", "Needs work").id, "humanInputAgentflow_0");
  assert.equal(flow.nodesById.get("loopAgentflow_0")?.loopTargetId, "agentAgentflow_0");
  assert.match(registered.flowHash, /^[a-f0-9]{64}$/);
});

test("registry hash is stable and reflects execution-relevant edits", () => {
  const first = compileFlow(cloneStarter());
  const reordered = cloneStarter();
  reordered.nodes[1].data.inputs = {
    agentTools: reordered.nodes[1].data.inputs.agentTools,
    agentUserMessage: "{{ question }}",
    agentMessages: reordered.nodes[1].data.inputs.agentMessages,
    agentModel: "",
    agentEnableMemory: true,
    agentMemoryType: "allMessages",
    agentReturnResponseAs: "assistantMessage",
    agentUpdateState: reordered.nodes[1].data.inputs.agentUpdateState,
  };
  assert.equal(flowHashFor(first), flowHashFor(compileFlow(reordered)));

  const changed = cloneStarter();
  changed.nodes[1].data.inputs.agentUserMessage = "Changed {{ question }}";
  assert.notEqual(flowHashFor(first), flowHashFor(compileFlow(changed)));
});

test("unknown executable nodes and mismatched pairs fail closed", () => {
  for (const [name, type] of [
    ["retrieverAgentflow", "Retriever"],
    ["customFunctionAgentflow", "CustomFunction"],
    ["executeFlowAgentflow", "ExecuteFlow"],
    ["agentAgentflow", "LLM"],
  ]) {
    const flow = cloneStarter();
    flow.nodes[1].data.name = name;
    flow.nodes[1].data.type = type;
    assert.throws(() => compileFlow(flow), FlowContractError);
  }
});

test("Agent tools compile only from the closed allowlist", () => {
  const allowed = cloneStarter();
  allowed.nodes[1].data.inputs.agentTools = [{ agentSelectedTool: "read_game_physics" }];
  assert.deepEqual(
    compileFlow(allowed).nodesById.get("agentAgentflow_0")?.inputs.agentTools,
    [{ agentSelectedTool: "read_game_physics" }],
  );

  const rejected: [unknown, RegExp][] = [
    [[{ agentSelectedTool: "httpRequest" }], /is not allowed/],
    [[{ agentSelectedTool: "read_game_physics" }, { agentSelectedTool: "read_game_physics" }], /must be unique/],
    [[{ agentSelectedTool: "read_game_physics", agentSelectedToolRequiresHumanInput: true }], /cannot require human input/],
    [[{ agentSelectedTool: "read_game_physics", agentSelectedToolConfig: {} }], /is not supported/],
    // The cap is the allowlist size, so it moves as tools are added.
    [
      Array.from({ length: AGENT_TOOL_IDS.length + 1 }, () => ({ agentSelectedTool: "read_game_physics" })),
      new RegExp(`at most ${AGENT_TOOL_IDS.length} entries`),
    ],
    ["read_game_physics", new RegExp(`at most ${AGENT_TOOL_IDS.length} entries`)],
  ];
  for (const [agentTools, message] of rejected) {
    const flow = cloneStarter();
    flow.nodes[1].data.inputs.agentTools = agentTools;
    assert.throws(() => compileFlow(flow), message);
  }
});

test("LLM nodes still reject every tool input", () => {
  const flow = cloneStarter();
  flow.nodes[1].data.name = "llmAgentflow";
  flow.nodes[1].data.type = "LLM";
  flow.nodes[1].data.inputs = {
    llmModel: "",
    llmMessages: flow.nodes[1].data.inputs.agentMessages,
    llmUserMessage: "{{ question }}",
    llmTools: [{ agentSelectedTool: "read_game_physics" }],
  };
  assert.throws(() => compileFlow(flow), /cannot configure tools/);
});

test("Flowise deterministic conditions compile from their conditions array", () => {
  const flow = cloneStarter();
  const condition = flow.nodes.find((node: any) => node.id === "conditionAgentAgentflow_0")!;
  condition.data.name = "conditionAgentflow";
  condition.data.type = "Condition";
  condition.data.inputs = {
    conditions: [{
      type: "string",
      value1: "{{ $flow.output }}",
      operation: "contains",
      value2: "verified",
    }],
  };
  condition.data.outputAnchors[0].branchLabel = "True";
  condition.data.outputAnchors[1].branchLabel = "False";
  flow.edges.find((edge: any) => edge.sourceHandle === condition.data.outputAnchors[0].id)!.data.edgeLabel = "True";
  flow.edges.find((edge: any) => edge.sourceHandle === condition.data.outputAnchors[1].id)!.data.edgeLabel = "False";

  const compiled = compileFlow(flow);
  const compiledCondition = compiled.nodesById.get(condition.id)!;
  assert.deepEqual(deterministicCondition(compiledCondition.inputs), {
    operation: "contains",
    left: "{{ $flow.output }}",
    right: "verified",
  });

  condition.data.inputs.conditions[0].operation = "regex";
  assert.throws(() => compileFlow(flow), /Unsupported deterministic condition operation/);
});

test("supported nodes reject malformed messages, scenarios, branches, terminals, and loop limits", () => {
  const unsupportedStartInput = cloneStarter();
  unsupportedStartInput.nodes.find((node: any) => node.id === "startAgentflow_0")!.data.inputs.startInputType = "formInput";
  assert.throws(() => compileFlow(unsupportedStartInput), /Start input type must be chatInput/);

  const invalidAgent = cloneStarter();
  invalidAgent.nodes.find((node: any) => node.id === "agentAgentflow_0")!.data.inputs.agentMessages = [{ role: "assistant", content: "no" }];
  assert.throws(() => compileFlow(invalidAgent), /invalid role/);

  const unsupportedMemory = cloneStarter();
  unsupportedMemory.nodes.find((node: any) => node.id === "agentAgentflow_0")!.data.inputs.agentMemoryType = "bufferWindow";
  assert.throws(() => compileFlow(unsupportedMemory), /MemoryType must be allMessages/);

  const incompleteMemory = cloneStarter();
  delete incompleteMemory.nodes.find((node: any) => node.id === "agentAgentflow_0")!.data.inputs.agentMemoryType;
  assert.throws(() => compileFlow(incompleteMemory), /EnableMemory requires allMessages memory/);

  const invalidLlm = cloneStarter();
  const agent = invalidLlm.nodes.find((node: any) => node.id === "agentAgentflow_0")!;
  agent.data.name = "llmAgentflow";
  agent.data.type = "LLM";
  agent.data.inputs = {
    llmMessages: [{ role: "assistant", content: "no" }],
    llmUserMessage: "{{ question }}",
  };
  assert.throws(() => compileFlow(invalidLlm), /invalid role/);

  const invalidScenario = cloneStarter();
  invalidScenario.nodes.find((node: any) => node.id === "conditionAgentAgentflow_0")!.data.inputs.conditionAgentScenarios = [{ scenario: "Ready" }];
  assert.throws(() => compileFlow(invalidScenario), /scenarios must contain 2/);

  const invalidHumanBranches = cloneStarter();
  const human = invalidHumanBranches.nodes.find((node: any) => node.id === "humanInputAgentflow_0")!;
  human.data.outputAnchors[1].branchLabel = "Cancel";
  invalidHumanBranches.edges.find((edge: any) => edge.sourceHandle === human.data.outputAnchors[1].id)!.data.edgeLabel = "Cancel";
  assert.throws(() => compileFlow(invalidHumanBranches), /requires Proceed and Reject/);

  const invalidTerminal = cloneStarter();
  invalidTerminal.nodes.find((node: any) => node.id === "directReplyAgentflow_0")!.data.outputAnchors.push({ id: "reply-output", name: "directReplyAgentflow" });
  assert.throws(() => compileFlow(invalidTerminal), /Direct Reply must be terminal/);

  const invalidReply = cloneStarter();
  invalidReply.nodes.find((node: any) => node.id === "directReplyAgentflow_0")!.data.inputs.directReplyMessage = 42;
  assert.throws(() => compileFlow(invalidReply), /Direct Reply message/);

  const invalidLoop = cloneStarter();
  invalidLoop.nodes.find((node: any) => node.id === "loopAgentflow_0")!.data.inputs.maxLoopCount = 21;
  assert.throws(() => compileFlow(invalidLoop), /integer from 1 to 20/);
});

test("LLM memory defaults disabled and enabled memory requires allMessages", () => {
  const llm = cloneStarter();
  const node = llm.nodes.find((candidate: any) => candidate.id === "agentAgentflow_0")!;
  node.data.name = "llmAgentflow";
  node.data.type = "LLM";
  node.data.inputs = {
    llmMessages: [{ role: "developer", content: "Reply concisely." }],
    llmUserMessage: "{{ question }}",
    llmEnableMemory: false,
  };
  assert.doesNotThrow(() => compileFlow(llm));

  node.data.inputs.llmEnableMemory = true;
  assert.throws(() => compileFlow(llm), /llmEnableMemory requires allMessages memory/);

  node.data.inputs.llmMemoryType = "allMessages";
  assert.doesNotThrow(() => compileFlow(llm));
});

test("sticky notes are ignored but malformed executable graphs fail closed", () => {
  const withSticky = cloneStarter();
  withSticky.nodes.push({
    id: "stickyNoteAgentflow_0",
    type: "agentFlow",
    position: { x: 0, y: 0 },
    data: {
      id: "stickyNoteAgentflow_0",
      name: "stickyNoteAgentflow",
      type: "StickyNote",
      inputs: {},
      outputAnchors: [],
    },
  });
  assert.equal(compileFlow(withSticky).nodes.length, starterFlow.nodes.length);

  const badLoop = cloneStarter();
  badLoop.nodes.find((node: any) => node.id === "loopAgentflow_0")!.data.inputs.loopBackToNode = "unknown-Agent";
  assert.throws(() => compileFlow(badLoop), /no valid target/);

  const duplicateBranch = cloneStarter();
  duplicateBranch.nodes.find((node: any) => node.id === "humanInputAgentflow_0")!.data.outputAnchors[1].branchLabel = "Proceed";
  assert.throws(() => compileFlow(duplicateBranch), /duplicate branch/);
});

test("interpolation is literal and conditions do not replace flow output", () => {
  const context = {
    question: "Build a maze",
    flowOutput: "Coordinator handoff",
    flowState: { buildStatus: "planning" },
  };
  assert.equal(
    interpolate("{{ question }}: {{ $flow.output }} / {{ $flow.state.buildStatus }}", context),
    "Build a maze: Coordinator handoff / planning",
  );
  assert.throws(() => interpolate("{{ question.toUpperCase() }}", context), FlowContractError);
  assert.throws(() => interpolate("{{ $flow.state.__proto__ }}", context), FlowContractError);
  assert.throws(() => interpolate("{{ $flow.state.missing }}", context), FlowContractError);

  assert.equal(evaluateCondition("equals", "Ready", "Ready"), true);
  assert.equal(evaluateCondition("notEquals", "Ready", "Needs work"), true);
  assert.equal(evaluateCondition("contains", "Coordinator handoff", "handoff"), true);
  assert.equal(evaluateCondition("notContains", "Coordinator handoff", "blocked"), true);
  assert.throws(() => evaluateCondition("regex" as never, "a", "a"), FlowContractError);
  assert.equal(context.flowOutput, "Coordinator handoff");
});
