import type { AgentTarget } from "./types.js";

/** Declares which host surfaces an adapter wires (parity matrix). */
export type HostCapabilities = {
	/** Slash commands, skills, or equivalent prompt packs. */
	commands: boolean;
	/** Lifecycle hooks (SessionStart / PreCompact / Stop, etc.). */
	hooks: boolean;
	/** Always-on rules / instructions files beyond AGENTS.md. */
	rules: boolean;
	/** Project MCP config merge when withMcp is true. */
	mcp: boolean;
	/** Upserts the shared AGENTS.md marker block. */
	agentsMd: boolean;
};

/**
 * Capability matrix — adapters only claim surfaces the host actually has.
 * Sugar (commands/hooks) is never invented for hosts that lack them.
 */
export const HOST_CAPABILITIES: Record<AgentTarget, HostCapabilities> = {
	claude: {
		commands: true,
		hooks: true,
		rules: false,
		mcp: true,
		agentsMd: false,
	},
	codex: {
		commands: false,
		hooks: true,
		rules: false,
		mcp: true,
		agentsMd: true,
	},
	gemini: {
		commands: true,
		hooks: false,
		rules: false,
		mcp: true,
		agentsMd: false,
	},
	grok: {
		commands: true,
		hooks: true,
		rules: false,
		mcp: true,
		agentsMd: true,
	},
	cursor: {
		commands: true,
		hooks: false,
		rules: true,
		mcp: true,
		agentsMd: false,
	},
	openhands: {
		commands: false,
		hooks: false,
		rules: false,
		mcp: true,
		agentsMd: true,
	},
	generic: {
		commands: false,
		hooks: false,
		rules: false,
		mcp: true,
		agentsMd: true,
	},
	desktop: {
		commands: false,
		hooks: false,
		rules: false,
		mcp: true,
		agentsMd: false,
	},
	copilot: {
		commands: false,
		hooks: false,
		rules: true,
		mcp: true,
		agentsMd: true,
	},
	vscode: {
		commands: false,
		hooks: false,
		rules: false,
		mcp: true,
		agentsMd: true,
	},
	opencode: {
		commands: false,
		hooks: false,
		rules: false,
		mcp: true,
		agentsMd: true,
	},
	chatgpt: {
		commands: false,
		hooks: true,
		rules: false,
		mcp: true,
		agentsMd: true,
	},
	windsurf: {
		commands: false,
		hooks: false,
		rules: true,
		mcp: true,
		agentsMd: true,
	},
	continue: {
		commands: false,
		hooks: false,
		rules: false,
		mcp: true,
		agentsMd: true,
	},
};

export function formatCapabilities(caps: HostCapabilities): string {
	const parts: string[] = [];
	if (caps.commands) parts.push("commands");
	if (caps.hooks) parts.push("hooks");
	if (caps.rules) parts.push("rules");
	if (caps.mcp) parts.push("mcp");
	if (caps.agentsMd) parts.push("AGENTS.md");
	return parts.length ? parts.join("+") : "notes-only";
}
