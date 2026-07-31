import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { templatesRoot } from "../../storage/packageAssets.js";
import { p } from "../../storage/paths.js";
import { copyOne } from "../shared/fs.js";
import { mcpJsonServerEntry, mcpSnippetNotes } from "../shared/mcp.js";
import { mergeJsonKeyAbsent } from "../shared/merge.js";
import { writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

export function installGemini(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	const cmdsSrc = join(templatesRoot(), "gemini", "commands");
	if (existsSync(cmdsSrc)) {
		for (const file of readdirSync(cmdsSrc)) {
			if (!file.endsWith(".toml")) continue;
			copyOne(
				join(cmdsSrc, file),
				p(".gemini", "commands", file),
				opts.overwrite,
				installed,
				process.cwd(),
			);
		}
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
