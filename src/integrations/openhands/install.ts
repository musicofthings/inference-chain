import { p } from "../../storage/paths.js";
import { mcpJsonServerEntry, mcpSnippetNotes } from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

export function installOpenHands(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	if (opts.withMcp) {
		const mcpPath = p(".openhands", "mcp.json");
		const entry = mcpJsonServerEntry({ pin: opts.pinLaunch });
		if (
			mergeJsonKeyAbsent(
				mcpPath,
				{
					mcpServers: {
						"inference-chain": entry,
					},
				},
				{ overwrite: opts.overwrite, warnLabel: mcpPath },
			)
		) {
			installed.push(".openhands/mcp.json");
		}
		notes.push(...mcpSnippetNotes("openhands"));
		notes.push(
			"If your OpenHands build only reads ~/.openhands/mcp.json, merge the same mcpServers.inference-chain entry there.",
		);
	}

	return { target: "openhands", installed, notes };
}

export const openhandsAdapter: AgentAdapter = {
	id: "openhands",
	install: installOpenHands,
};
