# Agent flows

This directory contains portable
[Flowise Agentflow V2](https://docs.flowiseai.com/using-flowise/agentflowv2)
graph JSON. The files use Flowise's native flowData shape directly:

- nodes are Flowise Agentflow V2 nodes.
- edges are Flowise React Flow connections.
- viewport is the saved canvas position and zoom.
- description and usecases are optional Flowise marketplace metadata.

Open the Game Editor's **Agent Flows** screen to author these files. Project
save is atomic and writes only to this directory. The browser does not keep a
second local draft as the source of truth.

These files intentionally do not contain provider credentials. The website
supplies the model, so `agentModel` and `llmModel` stay blank.

The Chickensplat website executes these graphs with its own interpreter in
`apps/website/src/lib/agent-flow`, not with a Flowise server. It supports only
the Start, Agent, LLM, Condition, ConditionAgent, HumanInput, Loop, and
DirectReply nodes, and it fails closed on anything else.

## Tools

An Agent node's `agentTools` may only reference these server-owned tool ids:

- `read_game_physics` — reports the game's current movement and jump settings,
  the fields the agent may change with their bounds, and the jump reach the
  levels require.
- `patch_game_physics` — replaces those fields. The first accepted patch forks
  the catalog physics document into the saved game, and the change takes effect
  the next time the game restarts.

Each entry is `{"agentSelectedTool": "<id>"}`. Any other id, a duplicate id,
`agentSelectedToolRequiresHumanInput`, and tools on an LLM node are all
rejected when the flow is compiled.

build_agentflow_v1.json is the coordination graph for the /build experience. It
demonstrates a tool-using agent, a semantic guard, a human checkpoint, and a
bounded loop.
