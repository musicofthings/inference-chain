import { p } from "../../storage/paths.js";
import { COMMON_COMMANDS, writeGeminiTomlCommand } from "../shared/commands.js";
import { mcpJsonServerEntry, mcpSnippetNotes } from "../shared/mcp.js";
import { mergeJsonKeyAbsent } from "../shared/merge.js";
import { writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

export function installGemini(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	for (const name of COMMON_COMMANDS) {
		writeGeminiTomlCommand(p(".gemini", "commands", `${name}.toml`), name, {
			overwrite: opts.overwrite,
			installed,
		});
	}

	if (opts.withMcp) {
		const settingsPath = p(".gemini", "settings.json");
		const entry = mcpJsonServerEntry();
		if (
			mergeJsonKeyAbsent(
				settingsPath,
				{
					mcpServers: {
						"inference-chain": entry,
					},
				},
				{ overwrite: opts.overwrite, warnLabel: settingsPath },
			)
		) {
			installed.push(".gemini/settings.json");
		}
		notes.push(...mcpSnippetNotes("gemini"));
	}

	return { target: "gemini", installed, notes };
}

export const geminiAdapter: AgentAdapter = {
	id: "gemini",
	install: installGemini,
};
