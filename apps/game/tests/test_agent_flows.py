import os
import sys
import tempfile
import unittest
from pathlib import Path


GAME_ROOT = Path(__file__).resolve().parents[1]
EDITOR_ROOT = GAME_ROOT.parents[2] / "game_editor"
if "SPLAT_LAB_GAME_ROOT" not in os.environ:
    os.environ["SPLAT_LAB_GAME_ROOT"] = str(GAME_ROOT)
if str(EDITOR_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(EDITOR_ROOT.parent))

from game_editor.server import (  # noqa: E402
    AgentFlowFileError,
    list_agent_flow_files,
    load_agent_flow_file,
    save_agent_flow_file,
)


def flow_data() -> dict:
    return {
        "description": "Portable Flowise graph",
        "usecases": ["Test"],
        "nodes": [
            {
                "id": "startAgentflow_0",
                "type": "agentFlow",
                "position": {"x": 10, "y": 20},
                "data": {
                    "id": "startAgentflow_0",
                    "label": "Start",
                    "name": "startAgentflow",
                    "type": "Start",
                    "inputParams": [],
                    "inputAnchors": [],
                    "inputs": {"startInputType": "chatInput"},
                    "outputAnchors": [
                        {
                            "id": "startAgentflow_0-output-startAgentflow",
                            "label": "Start",
                            "name": "startAgentflow",
                        }
                    ],
                    "outputs": {},
                },
            },
            {
                "id": "directReplyAgentflow_0",
                "type": "agentFlow",
                "position": {"x": 280, "y": 20},
                "data": {
                    "id": "directReplyAgentflow_0",
                    "label": "Reply",
                    "name": "directReplyAgentflow",
                    "type": "DirectReply",
                    "inputParams": [],
                    "inputAnchors": [],
                    "inputs": {"directReplyMessage": "{{ question }}"},
                    "outputAnchors": [],
                    "outputs": {},
                },
            },
        ],
        "edges": [
            {
                "id": "start-to-reply",
                "source": "startAgentflow_0",
                "sourceHandle": "startAgentflow_0-output-startAgentflow",
                "target": "directReplyAgentflow_0",
                "targetHandle": "directReplyAgentflow_0",
                "type": "agentFlow",
                "data": {"isHumanInput": False},
            }
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "futureFlowiseMetadata": {"preserve": True},
    }


class AgentFlowStorageTests(unittest.TestCase):
    def test_saves_native_flowdata_atomically_and_preserves_unknown_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            expected = flow_data()

            result = save_agent_flow_file("test-flow.json", expected, root)

            self.assertEqual(result["filename"], "test-flow.json")
            self.assertEqual(load_agent_flow_file("test-flow.json", root), expected)
            self.assertTrue(
                load_agent_flow_file("test-flow.json", root)["futureFlowiseMetadata"][
                    "preserve"
                ]
            )
            self.assertEqual(list((root / "agent-flows").glob(".agent-flow-*.tmp")), [])

    def test_catalog_reports_flowise_graph_counts_and_start_node(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save_agent_flow_file("test-flow.json", flow_data(), root)

            flows, errors = list_agent_flow_files(root)

            self.assertEqual(errors, [])
            self.assertEqual(
                flows,
                [
                    {
                        "filename": "test-flow.json",
                        "id": "test-flow",
                        "description": "Portable Flowise graph",
                        "nodeCount": 2,
                        "edgeCount": 1,
                        "hasStart": True,
                    }
                ],
            )

    def test_rejects_paths_outside_agent_flows_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(AgentFlowFileError, "agent flow filename"):
                save_agent_flow_file("../outside.json", flow_data(), Path(directory))

    def test_rejects_edges_that_reference_missing_nodes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            value = flow_data()
            value["edges"][0]["target"] = "missingAgentflow_0"

            with self.assertRaisesRegex(AgentFlowFileError, "missing target node"):
                save_agent_flow_file("test-flow.json", value, Path(directory))

    def test_rejects_mismatched_flowise_node_data_id(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            value = flow_data()
            value["nodes"][0]["data"]["id"] = "differentAgentflow_0"

            with self.assertRaisesRegex(AgentFlowFileError, "data.id must match"):
                save_agent_flow_file("test-flow.json", value, Path(directory))

    def test_checked_in_build_flow_has_guard_human_checkpoint_and_bounded_loop(self) -> None:
        flow = load_agent_flow_file("build_agentflow_v1.json")
        nodes = {node["data"]["name"]: node for node in flow["nodes"]}

        self.assertIn("conditionAgentAgentflow", nodes)
        self.assertIn("humanInputAgentflow", nodes)
        self.assertEqual(nodes["loopAgentflow"]["data"]["inputs"]["maxLoopCount"], 3)
        self.assertEqual(
            nodes["loopAgentflow"]["data"]["inputs"]["loopBackToNode"],
            "agentAgentflow_0-Agent",
        )

    def test_checked_in_build_flow_grants_only_the_allowlisted_physics_tools(self) -> None:
        flow = load_agent_flow_file("build_agentflow_v1.json")
        nodes = {node["data"]["name"]: node for node in flow["nodes"]}
        tools = nodes["agentAgentflow"]["data"]["inputs"]["agentTools"]

        self.assertEqual(
            [tool["agentSelectedTool"] for tool in tools],
            ["read_game_physics", "patch_game_physics"],
        )
        for tool in tools:
            self.assertEqual(set(tool), {"agentSelectedTool"})
        self.assertIn(
            "patch_game_physics",
            nodes["agentAgentflow"]["data"]["inputs"]["agentMessages"][0]["content"],
        )

    def test_game_editor_exposes_agent_flow_screen_and_project_api(self) -> None:
        markup = (EDITOR_ROOT / "agent-flows.html").read_text(encoding="utf-8")
        source = (EDITOR_ROOT / "agent-flow-editor.js").read_text(encoding="utf-8")
        server = (EDITOR_ROOT / "server.py").read_text(encoding="utf-8")

        self.assertIn('aria-current="page">Agent Flows</a>', markup)
        self.assertIn('id="agent-flow-node-library"', markup)
        self.assertIn('fetch("/api/agent-flows"', source)
        self.assertIn('"loopAgentflow"', source)
        self.assertIn('"conditionAgentAgentflow"', source)
        self.assertIn('"/api/agent-flows"', server)

    def test_game_editor_validates_agent_tools_against_the_website_allowlist(self) -> None:
        source = (EDITOR_ROOT / "agent-flow-editor.js").read_text(encoding="utf-8")

        self.assertIn(
            'const AGENT_TOOL_IDS = ["read_game_physics", "patch_game_physics"];',
            source,
        )
        self.assertIn("function validateAgentTools(", source)
        self.assertNotIn("agentTools must stay empty", source)


if __name__ == "__main__":
    unittest.main()
