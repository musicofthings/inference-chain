import { p } from "../../storage/paths.js";
import { mcpOpencodeServerEntry, mcpSnippetNotes } from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

/** OpenCode: AGENTS.md + opencode.json local MCP entry. */
export function installOpencode(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	if (opts.withMcp) {
		const configPath = p("opencode.json");
		if (
			mergeJsonKeyAbsent(
				configPath,
				{
					$schema: "https://opencode.ai/config.json",
					mcp: {
						"inference-chain": mcpOpencodeServerEntry(),
					},
				},
				{ overwrite: opts.overwrite, warnLabel: configPath },
			)
		) {
			installed.push("opencode.json");
		}
		notes.push(...mcpSnippetNotes("opencode"));
	}

	return { target: "opencode", installed, notes };
}

export const opencodeAdapter: AgentAdapter = {
	id: "opencode",
	install: installOpencode,
};
