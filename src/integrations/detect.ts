import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentTarget } from "./types.js";

/**
 * Markers that imply a host is already in use in this repo.
 * Paths are relative to the project root. A target matches if any marker exists.
 */
export const HOST_DETECT_MARKERS: Partial<Record<AgentTarget, string[]>> = {
	claude: [".claude", ".mcp.json"],
	cursor: [".cursor"],
	codex: [".codex"],
	gemini: [".gemini"],
	grok: [".grok"],
	openhands: [".openhands"],
	copilot: [".github/copilot-instructions.md"],
	vscode: [".vscode"],
	opencode: ["opencode.json", ".opencode"],
	windsurf: [".windsurf", ".windsurfrules"],
	continue: [".continue"],
};

/**
 * Targets installed by `ic install --all`.
 * Excludes `chatgpt` (redundant with codex + desktop snippet) and keeps
 * `desktop` so multi-agent repos get a paste-ready Desktop MCP file.
 */
export const ALL_INSTALL_TARGETS: readonly AgentTarget[] = [
	"claude",
	"codex",
	"gemini",
	"grok",
	"cursor",
	"openhands",
	"generic",
	"desktop",
	"copilot",
	"vscode",
	"opencode",
	"windsurf",
	"continue",
] as const;

export type DetectedHost = {
	target: AgentTarget;
	/** Markers that matched under cwd. */
	matched: string[];
};

/** Scan cwd for host config markers. Order follows ALL_INSTALL_TARGETS then others. */
export function detectHosts(cwd: string = process.cwd()): DetectedHost[] {
	const root = resolve(cwd);
	const found: DetectedHost[] = [];

	for (const [target, markers] of Object.entries(HOST_DETECT_MARKERS) as [
		AgentTarget,
		string[],
	][]) {
		const matched = markers.filter((m) => existsSync(resolve(root, m)));
		if (matched.length) found.push({ target, matched });
	}

	return found;
}

/**
 * Resolve which adapters to install for `--detect`.
 * If nothing is detected, fall back to `generic` so the repo still gets
 * AGENTS.md + a printable MCP snippet.
 */
export function targetsForDetect(cwd: string = process.cwd()): {
	targets: AgentTarget[];
	detected: DetectedHost[];
	fallback: boolean;
} {
	const detected = detectHosts(cwd);
	if (detected.length === 0) {
		return { targets: ["generic"], detected, fallback: true };
	}
	return {
		targets: detected.map((d) => d.target),
		detected,
		fallback: false,
	};
}
