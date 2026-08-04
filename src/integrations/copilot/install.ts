import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { p } from "../../storage/paths.js";
import { mcpJsonServerEntry, mcpSnippetNotes } from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

function writeCopilotInstructions(
	overwrite: boolean,
	installed: string[],
): void {
	const dest = p(".github", "copilot-instructions.md");
	if (existsSync(dest) && !overwrite) return;
	mkdirSync(dirname(dest), { recursive: true });
	const body = `${readAgentsBody().trimEnd()}\n`;
	if (existsSync(dest) && readFileSync(dest, "utf8") === body) return;
	writeFileSync(dest, body, "utf8");
	installed.push(".github/copilot-instructions.md");
}

/**
 * GitHub Copilot (IDE + coding agent): repo instructions + AGENTS.md + optional
 * VS Code workspace MCP (Copilot Chat consumes .vscode/mcp.json).
 */
export function installCopilot(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });
	writeCopilotInstructions(opts.overwrite, installed);

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	if (opts.withMcp) {
		const mcpPath = p(".vscode", "mcp.json");
		if (
			mergeJsonKeyAbsent(
				mcpPath,
				{
					servers: {
						"inference-chain": {
							command: mcpJsonServerEntry().command,
							args: mcpJsonServerEntry().args,
						},
					},
				},
				{ overwrite: opts.overwrite, warnLabel: mcpPath },
			)
		) {
			installed.push(".vscode/mcp.json");
		}
		notes.push(...mcpSnippetNotes("vscode"));
	}

	return { target: "copilot", installed, notes };
}

export const copilotAdapter: AgentAdapter = {
	id: "copilot",
	install: installCopilot,
};
