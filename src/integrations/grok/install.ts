import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { templatesRoot } from "../../storage/packageAssets.js";
import { p } from "../../storage/paths.js";
import { copyTree } from "../shared/fs.js";
import { mcpSnippetNotes, mcpTomlSectionBody } from "../shared/mcp.js";
import {
	mergeJsonKeyAbsent,
	mergeTomlSectionAbsent,
	upsertAgentsMdBlock,
} from "../shared/merge.js";
import { writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

function agentsBody(): string {
	const path = join(templatesRoot(), "common", "AGENTS.inference-chain.md");
	return existsSync(path)
		? readFileSync(path, "utf8")
		: "## Inference Chain\n\nSee docs/agents.md\n";
}

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

	if (upsertAgentsMdBlock(p("AGENTS.md"), agentsBody())) {
		installed.push("AGENTS.md");
	}

	const skillsSrc = join(templatesRoot(), "grok", "skills");
	if (existsSync(skillsSrc)) {
		for (const name of readdirSync(skillsSrc, { withFileTypes: true })) {
			if (!name.isDirectory()) continue;
			copyTree(
				join(skillsSrc, name.name),
				p(".grok", "skills", name.name),
				opts.overwrite,
				installed,
				process.cwd(),
			);
		}
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
				mcpTomlSectionBody(),
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
