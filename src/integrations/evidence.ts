import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENTS_MD_START } from "./shared/merge.js";
import type { AgentTarget } from "./types.js";

/**
 * Files that indicate Inference Chain wiring was installed for a host
 * (stronger than mere host presence — e.g. `.cursor/` without ic commands).
 */
export const HOST_INSTALL_EVIDENCE: Partial<Record<AgentTarget, string[]>> = {
	claude: [".claude/commands/ic-checkpoint.md", ".mcp.json"],
	cursor: [
		".cursor/commands/ic-checkpoint.md",
		".cursor/rules/inference-chain.mdc",
	],
	codex: [".codex/hooks.json", ".codex/config.toml"],
	gemini: [".gemini/commands/ic-checkpoint.toml"],
	grok: [".grok/skills/ic-checkpoint/SKILL.md"],
	openhands: [".openhands/mcp.json"],
	generic: ["AGENTS.md"],
	desktop: [".inference-chain/mcp-desktop.json"],
	copilot: [".github/copilot-instructions.md"],
	vscode: [".vscode/mcp.json"],
	opencode: ["opencode.json"],
	chatgpt: [".inference-chain/mcp-chatgpt-desktop.json"],
	windsurf: [".windsurfrules", ".windsurf/mcp.json"],
	continue: [".continue/config.json"],
};

export type WiringStatus = {
	target: AgentTarget;
	/** Evidence paths that exist. */
	present: string[];
	/** Evidence paths still missing. */
	missing: string[];
	/** True when at least one evidence file exists. */
	wired: boolean;
	/** True when MCP config for this host mentions inference-chain (best-effort). */
	mcpConfigured: boolean | null;
};

function fileMentionsInferenceChain(absPath: string): boolean {
	if (!existsSync(absPath)) return false;
	try {
		return readFileSync(absPath, "utf8").includes("inference-chain");
	} catch {
		return false;
	}
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
	for (const f of files) {
		const abs = resolve(root, f);
		if (!existsSync(abs)) continue;
		if (f.endsWith(".toml")) {
			try {
				if (readFileSync(abs, "utf8").includes("inference-chain")) return true;
			} catch {
				/* ignore */
			}
			continue;
		}
		if (fileMentionsInferenceChain(abs)) return true;
	}
	return false;
}

export function inspectWiring(
	target: AgentTarget,
	cwd: string = process.cwd(),
): WiringStatus {
	const root = resolve(cwd);
	const evidence = HOST_INSTALL_EVIDENCE[target] ?? [];
	const present: string[] = [];
	const missing: string[] = [];
	for (const rel of evidence) {
		if (existsSync(resolve(root, rel))) present.push(rel);
		else missing.push(rel);
	}

	// AGENTS.md only counts if our marker block is present.
	if (target === "generic" || present.includes("AGENTS.md")) {
		const agents = resolve(root, "AGENTS.md");
		if (existsSync(agents)) {
			try {
				const text = readFileSync(agents, "utf8");
				if (!text.includes(AGENTS_MD_START)) {
					const idx = present.indexOf("AGENTS.md");
					if (idx >= 0) present.splice(idx, 1);
					if (!missing.includes("AGENTS.md")) missing.push("AGENTS.md");
				}
			} catch {
				/* ignore */
			}
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
