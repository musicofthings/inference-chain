import { p } from "../../storage/paths.js";
import { mcpJsonServerEntry, mcpSnippetNotes } from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

/**
 * Continue.dev: AGENTS.md + .continue/config.json mcpServers entry.
 * Continue also discovers AGENTS.md / rules in many setups.
 */
export function installContinue(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	if (opts.withMcp) {
		const configPath = p(".continue", "config.json");
		const entry = mcpJsonServerEntry();
		if (
			mergeJsonKeyAbsent(
				configPath,
				{
					mcpServers: {
						"inference-chain": {
							command: entry.command,
							args: entry.args,
						},
					},
				},
				{ overwrite: opts.overwrite, warnLabel: configPath },
			)
		) {
			installed.push(".continue/config.json");
		}
		notes.push(
			"Continue MCP: if your Continue version uses YAML, mirror command/args under mcpServers.inference-chain (or an equivalent list entry).",
		);
		notes.push(...mcpSnippetNotes("desktop"));
	}

	return { target: "continue", installed, notes };
}

export const continueAdapter: AgentAdapter = {
	id: "continue",
	install: installContinue,
};
