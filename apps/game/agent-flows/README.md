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

These files intentionally do not contain provider credentials. Select model,
tool, document-store, and sub-flow connectors for the target Flowise
environment before execution. Flowise currently requires its server runtime to
execute Agentflow V2 files; the portable JSON is the versioned authoring and
handoff artifact.

build_agentflow_v1.json is a starter coordination graph for the /build
experience. It demonstrates an agent, a semantic guard, a human checkpoint,
and a bounded loop without claiming a deployed Flowise runtime.
