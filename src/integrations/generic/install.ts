import { p } from "../../storage/paths.js";
import {
	mcpDesktopConfigSnippet,
	mcpJsonServerEntry,
	mcpSnippetNotes,
} from "../shared/mcp.js";
import { upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

/**
 * Host-agnostic adapter: AGENTS.md + printed MCP JSON. Use when no first-class
 * host pack exists, or as a baseline in multi-agent repos.
 */
export function installGeneric(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	if (opts.withMcp) {
		const portable = mcpJsonServerEntry();
		notes.push(
			"Portable MCP stdio config (merge into your host's MCP settings):",
		);
		notes.push(mcpDesktopConfigSnippet());
		notes.push(
			`If the host launches the server with this project as cwd, the paths above can be shortened to: ${portable.command} ${portable.args.join(" ")}`,
		);
		notes.push(...mcpSnippetNotes("desktop"));
	}

	return { target: "generic", installed, notes };
}

export const genericAdapter: AgentAdapter = {
	id: "generic",
	install: installGeneric,
};
