import { claudeAdapter } from "./claude/install.js";
import { codexAdapter } from "./codex/install.js";
import { cursorAdapter } from "./cursor/install.js";
import { geminiAdapter } from "./gemini/install.js";
import { grokAdapter } from "./grok/install.js";
import { openhandsAdapter } from "./openhands/install.js";
import {
	AGENT_TARGETS,
	type AgentAdapter,
	type AgentTarget,
	type InstallOpts,
	type InstallResult,
	isAgentTarget,
} from "./types.js";

const adapters: Record<AgentTarget, AgentAdapter> = {
	claude: claudeAdapter,
	codex: codexAdapter,
	gemini: geminiAdapter,
	grok: grokAdapter,
	cursor: cursorAdapter,
	openhands: openhandsAdapter,
};

export { AGENT_TARGETS, isAgentTarget };
export type { AgentTarget, InstallOpts, InstallResult };

export function getAdapter(target: AgentTarget): AgentAdapter {
	return adapters[target];
}

export function installAgent(
	target: AgentTarget,
	opts: Partial<InstallOpts> = {},
): InstallResult {
	const normalized: InstallOpts = {
		overwrite: opts.overwrite ?? false,
		withMcp: opts.withMcp ?? true,
	};
	return getAdapter(target).install(normalized);
}
