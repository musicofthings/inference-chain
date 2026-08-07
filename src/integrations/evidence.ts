import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENTS_MD_START } from "./shared/merge.js";
import type { AgentTarget } from "./types.js";

/**
 * A file whose presence indicates Inference Chain wiring for a host.
 * Shared host config (`.mcp.json`, `opencode.json`, …) exists in plenty of
 * repos that never installed us, so those entries only count when the file
 * actually references inference-chain.
 */
export type EvidencePath = {
	path: string;
	/** "mention" → must contain "inference-chain"; "marker" → our AGENTS.md block. */
	requires?: "mention" | "marker";
};

export const HOST_INSTALL_EVIDENCE: Partial<
	Record<AgentTarget, EvidencePath[]>
> = {
	claude: [
		{ path: ".claude/commands/ic-checkpoint.md" },
		{ path: ".mcp.json", requires: "mention" },
	],
	cursor: [
		{ path: ".cursor/commands/ic-checkpoint.md" },
		{ path: ".cursor/rules/inference-chain.mdc" },
	],
	codex: [
		{ path: ".codex/hooks.json", requires: "mention" },
		{ path: ".codex/config.toml", requires: "mention" },
	],
	gemini: [{ path: ".gemini/commands/ic-checkpoint.toml" }],
	grok: [{ path: ".grok/skills/ic-checkpoint/SKILL.md" }],
	openhands: [{ path: ".openhands/mcp.json", requires: "mention" }],
	generic: [{ path: "AGENTS.md", requires: "marker" }],
	desktop: [{ path: ".inference-chain/mcp-desktop.json" }],
	copilot: [{ path: ".github/copilot-instructions.md", requires: "marker" }],
	vscode: [{ path: ".vscode/mcp.json", requires: "mention" }],
	opencode: [{ path: "opencode.json", requires: "mention" }],
	chatgpt: [{ path: ".inference-chain/mcp-chatgpt-desktop.json" }],
	windsurf: [
		{ path: ".windsurfrules", requires: "marker" },
		{ path: ".windsurf/mcp.json", requires: "mention" },
	],
	continue: [{ path: ".continue/config.json", requires: "mention" }],
};

export type WiringStatus = {
	target: AgentTarget;
	/** Evidence paths that exist and pass their content requirement. */
	present: string[];
	/** Evidence paths still missing. */
	missing: string[];
	/** True when at least one evidence file counts. */
	wired: boolean;
	/** True when this host's MCP config references inference-chain (best-effort). */
	mcpConfigured: boolean | null;
};

function readIfPresent(absPath: string): string | null {
	if (!existsSync(absPath)) return null;
	try {
		return readFileSync(absPath, "utf8");
	} catch {
		return null;
	}
}

function satisfies(
	absPath: string,
	requires?: EvidencePath["requires"],
): boolean {
	const text = readIfPresent(absPath);
	if (text === null) return false;
	if (requires === "mention") return text.includes("inference-chain");
	if (requires === "marker") return text.includes(AGENTS_MD_START);
	return true;
}

/** Best-effort: does this host's MCP config reference inference-chain? */
export function hostMcpConfigured(
	target: AgentTarget,
	cwd: string = process.cwd(),
): boolean | null {
	const root = resolve(cwd);
	const mcpFiles: Partial<Record<AgentTarget, string[]>> = {
		claude: [".mcp.json"],
		cursor: [".cursor/mcp.json"],
		codex: [".codex/config.toml"],
		gemini: [".gemini/settings.json"],
		grok: [".grok/config.toml"],
		openhands: [".openhands/mcp.json"],
		copilot: [".vscode/mcp.json"],
		vscode: [".vscode/mcp.json"],
		opencode: ["opencode.json"],
		windsurf: [".windsurf/mcp.json"],
		continue: [".continue/config.json"],
		desktop: [".inference-chain/mcp-desktop.json"],
		chatgpt: [".inference-chain/mcp-chatgpt-desktop.json"],
	};
	const files = mcpFiles[target];
	if (!files) return null;
	return files.some((f) => satisfies(resolve(root, f), "mention"));
}

export function inspectWiring(
	target: AgentTarget,
	cwd: string = process.cwd(),
): WiringStatus {
	const root = resolve(cwd);
	const present: string[] = [];
	const missing: string[] = [];
	for (const entry of HOST_INSTALL_EVIDENCE[target] ?? []) {
		if (satisfies(resolve(root, entry.path), entry.requires)) {
			present.push(entry.path);
		} else {
			missing.push(entry.path);
		}
	}

	return {
		target,
		present,
		missing,
		wired: present.length > 0,
		mcpConfigured: hostMcpConfigured(target, cwd),
	};
}
