import { p } from "../../storage/paths.js";
import {
	preCompactHookCommand,
	sessionStartHookCommand,
	syncHookCommand,
} from "../shared/hooks.js";
import { mcpSnippetNotes, mcpTomlSectionBody } from "../shared/mcp.js";
import {
	mergeJsonKeyAbsent,
	mergeTomlSectionAbsent,
	upsertAgentsMdBlock,
} from "../shared/merge.js";
import { readAgentsBody, writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

function desiredCodexHooks(pin?: boolean): Record<string, unknown> {
	const hook = (command: string) => [{ hooks: [{ type: "command", command }] }];
	return {
		description: "Inference Chain lifecycle hooks",
		hooks: {
			SessionStart: [
				{
					matcher: "startup|resume",
					hooks: [
						{
							type: "command",
							command: sessionStartHookCommand(),
							statusMessage: "Loading Inference Chain resume brief",
						},
					],
				},
			],
			// Codex has no slash commands, so the nudge names the artifact path.
			PreCompact: hook(
				preCompactHookCommand(
					pin,
					"Consider writing .inference-chain/inbox/latest-update.yml before compaction.",
				),
			),
			Stop: hook(syncHookCommand(pin)),
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
		mergeJsonKeyAbsent(hooksPath, desiredCodexHooks(opts.pinLaunch), {
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
