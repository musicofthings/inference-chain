import { p } from "../../storage/paths.js";
import { installDescriptionOnlyCommands } from "../shared/commands.js";
import { mcpSnippetNotes, mcpVscodeServerEntry } from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

/** VS Code Copilot Chat / Agent mode: .vscode/mcp.json + AGENTS.md. */
export function installVscode(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	// Same workspace prompt-file surface the copilot adapter writes; installing
	// both targets is idempotent because the content is identical.
	installDescriptionOnlyCommands(p(".github", "prompts"), {
		overwrite: opts.overwrite,
		installed,
		extension: ".prompt.md",
	});

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

	return { target: "vscode", installed, notes };
}

export const vscodeAdapter: AgentAdapter = {
	id: "vscode",
	install: installVscode,
};
