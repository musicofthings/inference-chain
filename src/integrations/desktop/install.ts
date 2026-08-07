import { p } from "../../storage/paths.js";
import { writeManagedFile } from "../shared/fs.js";
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

	if (opts.withMcp) {
		const snippet = mcpDesktopConfigSnippet();
		writeManagedFile(
			p(".inference-chain", "mcp-desktop.json"),
			`${snippet}\n`,
			opts.overwrite,
			installed,
		);
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
