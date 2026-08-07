import { p } from "../../storage/paths.js";
import { COMMON_COMMANDS, writeGrokSkillCommand } from "../shared/commands.js";
import { mcpSnippetNotes, mcpTomlSectionBody } from "../shared/mcp.js";
import {
	mergeJsonKeyAbsent,
	mergeTomlSectionAbsent,
	upsertAgentsMdBlock,
} from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

function desiredGrokHooks(): Record<string, unknown> {
	return {
		hooks: {
			SessionStart: [
				{
					hooks: [
						{
							type: "command",
							command:
								"test -f .inference-chain/resumes/resume_latest.md && cat .inference-chain/resumes/resume_latest.md || true",
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
								'echo "[inference-chain] Consider /ic-checkpoint (skill) before compaction."',
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
								'echo "[inference-chain] Consider /ic-stop (skill), then: ic ingest .inference-chain/inbox/latest-brief.yml && ic evolve && ic resume"',
						},
					],
				},
			],
		},
	};
}

export function installGrok(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	if (upsertAgentsMdBlock(p("AGENTS.md"), readAgentsBody())) {
		installed.push("AGENTS.md");
	}

	for (const name of COMMON_COMMANDS) {
		writeGrokSkillCommand(p(".grok", "skills", name), name, {
			overwrite: opts.overwrite,
			installed,
		});
	}

	const hooksPath = p(".grok", "hooks", "inference-chain.json");
	if (
		mergeJsonKeyAbsent(hooksPath, desiredGrokHooks(), {
			overwrite: opts.overwrite,
			warnLabel: hooksPath,
		})
	) {
		installed.push(".grok/hooks/inference-chain.json");
		notes.push(
			"Grok project hooks require trust: run /hooks-trust (or grok --trust) once in this repo.",
		);
	}

	if (opts.withMcp) {
		const configPath = p(".grok", "config.toml");
		if (
			mergeTomlSectionAbsent(
				configPath,
				"mcp_servers.inference-chain",
				mcpTomlSectionBody({ pin: opts.pinLaunch }),
				{ overwrite: opts.overwrite },
			)
		) {
			installed.push(".grok/config.toml");
		}
		notes.push(...mcpSnippetNotes("grok"));
	}

	return { target: "grok", installed, notes };
}

export const grokAdapter: AgentAdapter = {
	id: "grok",
	install: installGrok,
};
