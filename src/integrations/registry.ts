import { chatgptAdapter } from "./chatgpt/install.js";
import { claudeAdapter } from "./claude/install.js";
import { codexAdapter } from "./codex/install.js";
import { continueAdapter } from "./continue/install.js";
import { copilotAdapter } from "./copilot/install.js";
import { cursorAdapter } from "./cursor/install.js";
import { desktopAdapter } from "./desktop/install.js";
import { geminiAdapter } from "./gemini/install.js";
import { genericAdapter } from "./generic/install.js";
import { grokAdapter } from "./grok/install.js";
import { opencodeAdapter } from "./opencode/install.js";
import { openhandsAdapter } from "./openhands/install.js";
import {
	AGENT_TARGETS,
	type AgentAdapter,
	type AgentTarget,
	type InstallOpts,
	type InstallResult,
	isAgentTarget,
} from "./types.js";
import { vscodeAdapter } from "./vscode/install.js";
import { windsurfAdapter } from "./windsurf/install.js";

const adapters: Record<AgentTarget, AgentAdapter> = {
	claude: claudeAdapter,
	codex: codexAdapter,
	gemini: geminiAdapter,
	grok: grokAdapter,
	cursor: cursorAdapter,
	openhands: openhandsAdapter,
	generic: genericAdapter,
	desktop: desktopAdapter,
	copilot: copilotAdapter,
	vscode: vscodeAdapter,
	opencode: opencodeAdapter,
	chatgpt: chatgptAdapter,
	windsurf: windsurfAdapter,
	continue: continueAdapter,
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

export type MultiInstallResult = {
	targets: AgentTarget[];
	results: InstallResult[];
	/** Deduplicated relative paths written across all adapters. */
	installed: string[];
	/** Deduplicated notes (order preserved). */
	notes: string[];
};

/** Install multiple adapters sequentially; merges installed paths and notes. */
export function installAgents(
	targets: AgentTarget[],
	opts: Partial<InstallOpts> = {},
): MultiInstallResult {
	const results: InstallResult[] = [];
	const installed: string[] = [];
	const notes: string[] = [];
	const seenPaths = new Set<string>();
	const seenNotes = new Set<string>();

	for (const target of targets) {
		const res = installAgent(target, opts);
		results.push(res);
		for (const path of res.installed) {
			if (!seenPaths.has(path)) {
				seenPaths.add(path);
				installed.push(path);
			}
		}
		for (const note of res.notes) {
			if (!seenNotes.has(note)) {
				seenNotes.add(note);
				notes.push(note);
			}
		}
	}

	return { targets, results, installed, notes };
}
