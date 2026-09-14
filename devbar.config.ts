import { defineConfig } from "devbar.sh/config";

export default defineConfig({
	// Pages on these origins are matched to this project automatically,
	// so <Devbar /> needs no server/token/project props.
	origins: ["http://localhost:3000"],

	agent: {
		command: "claude", // "claude" | "codex" | "opencode" | any binary on PATH
		model: "opus",
		// plan = read-only, auto = may edit the workspace, full = no sandbox
		permission: "auto",
		// Every saved report runs the agent. Set false to dispatch by hand.
		autoDispatch: true,
	},

	live: {
		// Lets an agent inspect and screenshot the page you have open.
		enabled: true,
		allowMutating: false,
	},
});
