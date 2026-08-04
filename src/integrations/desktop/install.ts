import { writeFileSync } from "node:fs";
import { p } from "../../storage/paths.js";
import { mcpDesktopConfigSnippet, mcpSnippetNotes } from "../shared/mcp.js";
import { writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

/**
 * Claude Desktop (and similar apps with a global mcpServers JSON file).
 * Writes a project-local snippet file; does not edit ~/Library/... configs.
 */
export function installDesktop(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	const snippetPath = p(".inference-chain", "mcp-desktop.json");
	const snippet = mcpDesktopConfigSnippet();
	writeFileSync(snippetPath, `${snippet}\n`, "utf8");
	installed.push(".inference-chain/mcp-desktop.json");

	if (opts.withMcp) {
		notes.push(
			"Claude Desktop MCP snippet written to .inference-chain/mcp-desktop.json:",
		);
		notes.push(snippet);
		notes.push(...mcpSnippetNotes("desktop"));
	}

	return { target: "desktop", installed, notes };
}

export const desktopAdapter: AgentAdapter = {
	id: "desktop",
	install: installDesktop,
};
