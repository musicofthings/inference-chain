import { p } from "../../storage/paths.js";
import {
	mcpDesktopConfigSnippet,
	mcpJsonServerEntry,
	mcpSnippetNotes,
} from "../shared/mcp.js";
import { mergeJsonKeyAbsent, upsertAgentsMdBlock } from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

/** Windsurf Cascade: .windsurfrules + AGENTS.md + optional mcpServers JSON. */
export function installWindsurf(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	// Marker block, not a whole-file write: .windsurfrules is usually
	// hand-authored and must survive --overwrite.
	if (upsertAgentsMdBlock(p(".windsurfrules"), readAgentsBody())) {
		installed.push(".windsurfrules");
	}

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
						"inference-chain": mcpJsonServerEntry({ pin: opts.pinLaunch }),
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
