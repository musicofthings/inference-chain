import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { templatesRoot } from "../../storage/packageAssets.js";
import { p } from "../../storage/paths.js";
import { mcpJsonServerEntry, mcpSnippetNotes } from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

function agentsBody(): string {
	const path = join(templatesRoot(), "common", "AGENTS.inference-chain.md");
	return existsSync(path)
		? readFileSync(path, "utf8")
		: "## Inference Chain\n\nSee docs/agents.md\n";
}

export function installOpenHands(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	if (upsertAgentsMdBlock(p("AGENTS.md"), agentsBody())) {
		installed.push("AGENTS.md");
	}

	if (opts.withMcp) {
		const mcpPath = p(".openhands", "mcp.json");
		const entry = mcpJsonServerEntry();
		// OpenHands uses mcpServers-style JSON locally; also document openclaw.json.
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
	} else {
		notes.push(...mcpSnippetNotes("openhands"));
	}

	return { target: "openhands", installed, notes };
}

export const openhandsAdapter: AgentAdapter = {
	id: "openhands",
	install: installOpenHands,
};
