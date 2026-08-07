import { p } from "../../storage/paths.js";
import { mcpSnippetNotes, mcpTomlSectionBody } from "../shared/mcp.js";
import {
	mergeJsonKeyAbsent,
	mergeTomlSectionAbsent,
	upsertAgentsMdBlock,
} from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

function desiredCodexHooks(): Record<string, unknown> {
	return {
		description: "Inference Chain lifecycle hooks",
		hooks: {
			SessionStart: [
				{
					matcher: "startup|resume",
					hooks: [
						{
							type: "command",
							command:
								"test -f .inference-chain/resumes/resume_latest.md && cat .inference-chain/resumes/resume_latest.md || true",
							statusMessage: "Loading Inference Chain resume brief",
						},
					],
				},
			],
			PreCompact: [
				{
					hooks: [
						{
							type: "command",
							command:
								'echo "[inference-chain] Consider writing .inference-chain/inbox/latest-update.yml before compaction, then: ic ingest .inference-chain/inbox/latest-update.yml && ic evolve"',
						},
					],
				},
			],
			Stop: [
				{
					hooks: [
						{
							type: "command",
							command:
								'echo "[inference-chain] Consider writing a Session Brief to .inference-chain/inbox/latest-brief.yml, then: ic ingest .inference-chain/inbox/latest-brief.yml && ic evolve && ic resume"',
						},
					],
				},
			],
		},
	};
}

export function installCodex(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	const hooksPath = p(".codex", "hooks.json");
	if (
		mergeJsonKeyAbsent(hooksPath, desiredCodexHooks(), {
			overwrite: opts.overwrite,
			warnLabel: hooksPath,
		})
	) {
		installed.push(".codex/hooks.json");
	}

	if (opts.withMcp) {
		const configPath = p(".codex", "config.toml");
		if (
			mergeTomlSectionAbsent(
				configPath,
				"mcp_servers.inference-chain",
				mcpTomlSectionBody({ pin: opts.pinLaunch }),
				{ overwrite: opts.overwrite },
			)
		) {
			installed.push(".codex/config.toml");
		}
		notes.push(...mcpSnippetNotes("codex"));
	}

	return { target: "codex", installed, notes };
}

export const codexAdapter: AgentAdapter = {
	id: "codex",
	install: installCodex,
};
