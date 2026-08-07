import { existsSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE } from "../../storage/packageAssets.js";
import { p } from "../../storage/paths.js";
import { installClaudeStyleCommands } from "../shared/commands.js";
import { copyTree } from "../shared/fs.js";
import { mcpJsonServerEntry, mcpSnippetNotes } from "../shared/mcp.js";
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
	opts: { overwrite?: boolean; withMcp?: boolean; pinLaunch?: boolean } = {},
): InstallResult & {
	installedCommands: string[];
	settingsPath: string;
	pluginInstalled: boolean;
} {
	const overwrite = opts.overwrite ?? false;
	const withMcp = opts.withMcp ?? true;
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite, installed });

	const installedCommands = installClaudeStyleCommands(
		p(".claude", "commands"),
		{
			overwrite,
			installed,
		},
	);

	const settingsPath = p(".claude", "settings.json");
	const hooksMerged = mergeJsonKeyAbsent(
		settingsPath,
		{ hooks: desiredClaudeHooks() },
		{ overwrite, warnLabel: settingsPath },
	);
	if (hooksMerged) installed.push(".claude/settings.json");

	const pluginSrc = TEMPLATE.pluginRoot();
	let pluginInstalled = false;
	if (existsSync(pluginSrc)) {
		const dest = p(".claude", "plugins", "inference-chain");
		copyTree(pluginSrc, dest, overwrite, installed, process.cwd());
		pluginInstalled = true;
		// Regenerate plugin commands from common/commands so the scaffold cannot
		// drift from the single source.
		installClaudeStyleCommands(join(dest, "commands"), {
			overwrite,
			installed,
		});
	}

	if (withMcp) {
		const mcpPath = p(".mcp.json");
		if (
			mergeJsonKeyAbsent(
				mcpPath,
				{
					mcpServers: {
						"inference-chain": mcpJsonServerEntry({ pin: opts.pinLaunch }),
					},
				},
				{ overwrite, warnLabel: mcpPath },
			)
		) {
			installed.push(".mcp.json");
		}
		notes.push(...mcpSnippetNotes("claude"));
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
