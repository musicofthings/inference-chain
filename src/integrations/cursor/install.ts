import { existsSync } from "node:fs";
import { join } from "node:path";
import { templatesRoot } from "../../storage/packageAssets.js";
import { p } from "../../storage/paths.js";
import {
	COMMON_COMMANDS,
	writeCursorMarkdownCommand,
} from "../shared/commands.js";
import { copyOne } from "../shared/fs.js";
import { mcpJsonServerEntry } from "../shared/mcp.js";
import { mergeJsonKeyAbsent } from "../shared/merge.js";
import { writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

export function installCursor(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	for (const name of COMMON_COMMANDS) {
		writeCursorMarkdownCommand(p(".cursor", "commands", `${name}.md`), name, {
			overwrite: opts.overwrite,
			installed,
		});
	}

	const ruleSrc = join(
		templatesRoot(),
		"cursor",
		"rules",
		"inference-chain.mdc",
	);
	if (existsSync(ruleSrc)) {
		copyOne(
			ruleSrc,
			p(".cursor", "rules", "inference-chain.mdc"),
			opts.overwrite,
			installed,
			process.cwd(),
		);
	}

	if (opts.withMcp) {
		const mcpPath = p(".cursor", "mcp.json");
		if (
			mergeJsonKeyAbsent(
				mcpPath,
				{
					mcpServers: {
						"inference-chain": mcpJsonServerEntry(),
					},
				},
				{ overwrite: opts.overwrite, warnLabel: mcpPath },
			)
		) {
			installed.push(".cursor/mcp.json");
		}
	}

	return { target: "cursor", installed, notes };
}

export const cursorAdapter: AgentAdapter = {
	id: "cursor",
	install: installCursor,
};
