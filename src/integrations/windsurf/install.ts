import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { p } from "../../storage/paths.js";
import {
	mcpDesktopConfigSnippet,
	mcpJsonServerEntry,
	mcpSnippetNotes,
} from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

function writeWindsurfRules(overwrite: boolean, installed: string[]): void {
	const dest = p(".windsurfrules");
	if (existsSync(dest) && !overwrite) return;
	mkdirSync(dirname(dest), { recursive: true });
	const body = `${readAgentsBody().trimEnd()}\n`;
	if (existsSync(dest) && readFileSync(dest, "utf8") === body) return;
	writeFileSync(dest, body, "utf8");
	installed.push(".windsurfrules");
}

/** Windsurf Cascade: .windsurfrules + AGENTS.md + optional mcpServers JSON. */
export function installWindsurf(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });
	writeWindsurfRules(opts.overwrite, installed);

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	if (opts.withMcp) {
		const mcpPath = p(".windsurf", "mcp.json");
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
			installed.push(".windsurf/mcp.json");
		}
		notes.push(
			"If your Windsurf build ignores .windsurf/mcp.json, merge this into the Cascade MCP UI:",
		);
		notes.push(mcpDesktopConfigSnippet());
		notes.push(...mcpSnippetNotes("desktop"));
	}

	return { target: "windsurf", installed, notes };
}

export const windsurfAdapter: AgentAdapter = {
	id: "windsurf",
	install: installWindsurf,
};
