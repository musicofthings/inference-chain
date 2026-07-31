import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE, templatesRoot } from "../../storage/packageAssets.js";
import { p } from "../../storage/paths.js";
import { copyOne, copyTree } from "../shared/fs.js";
import { mergeJsonKeyAbsent } from "../shared/merge.js";
import { writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

function desiredClaudeHooks(): Record<string, unknown> {
	return {
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
							'echo "[inference-chain] Consider /ic-checkpoint before compaction to preserve operating context."',
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
							'echo "[inference-chain] Consider /ic-stop to write a Session Brief, then: ic ingest .inference-chain/inbox/latest-brief.yml && ic evolve && ic resume"',
					},
				],
			},
		],
	};
}

export function installClaude(
	opts: { overwrite?: boolean; withMcp?: boolean } = {},
): InstallResult & {
	installedCommands: string[];
	settingsPath: string;
	pluginInstalled: boolean;
} {
	const overwrite = opts.overwrite ?? false;
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite, installed });

	const cmdsSrc = join(templatesRoot(), "claude", "commands");
	const installedCommands: string[] = [];
	if (existsSync(cmdsSrc)) {
		for (const file of readdirSync(cmdsSrc)) {
			if (!file.endsWith(".md")) continue;
			const dest = p(".claude", "commands", file);
			if (
				copyOne(join(cmdsSrc, file), dest, overwrite, installed, process.cwd())
			) {
				installedCommands.push(file);
			}
		}
	}

	const settingsPath = p(".claude", "settings.json");
	const hooksMerged = mergeJsonKeyAbsent(
		settingsPath,
		{ hooks: desiredClaudeHooks() },
		{ overwrite: false, warnLabel: settingsPath },
	);
	if (hooksMerged) installed.push(".claude/settings.json");

	const pluginSrc = TEMPLATE.pluginRoot();
	let pluginInstalled = false;
	if (existsSync(pluginSrc)) {
		const dest = p(".claude", "plugins", "inference-chain");
		copyTree(pluginSrc, dest, overwrite, installed, process.cwd());
		pluginInstalled = true;
	}

	if (opts.withMcp) {
		notes.push(
			"Claude Code MCP: add `ic mcp --cwd <project>` via your Claude MCP settings if desired (slash commands cover the common loop).",
		);
	}

	return {
		target: "claude",
		installed,
		notes,
		installedCommands,
		settingsPath,
		pluginInstalled,
	};
}

export const claudeAdapter: AgentAdapter = {
	id: "claude",
	install(opts: InstallOpts): InstallResult {
		const res = installClaude(opts);
		return {
			target: res.target,
			installed: res.installed,
			notes: res.notes,
		};
	},
};
