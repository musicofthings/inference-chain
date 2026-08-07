import { p } from "../../storage/paths.js";
import { mcpSnippetNotes, mcpVscodeServerEntry } from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

/**
 * GitHub Copilot (IDE + coding agent): repo instructions + AGENTS.md + optional
 * VS Code workspace MCP (Copilot Chat consumes .vscode/mcp.json).
 */
export function installCopilot(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	// Marker block, not a whole-file write: copilot-instructions.md is usually
	// hand-authored and must survive --overwrite.
	if (
		upsertAgentsMdBlock(
			p(".github", "copilot-instructions.md"),
			readAgentsBody(),
		)
	) {
		installed.push(".github/copilot-instructions.md");
	}

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
						"inference-chain": mcpVscodeServerEntry({ pin: opts.pinLaunch }),
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
