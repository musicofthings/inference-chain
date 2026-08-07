export const AGENT_TARGETS = [
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
	"chatgpt",
	"windsurf",
	"continue",
] as const;

export type AgentTarget = (typeof AGENT_TARGETS)[number];

export type InstallOpts = {
	overwrite: boolean;
	withMcp: boolean;
	/**
	 * Write this machine's node + CLI + project paths into project-scoped MCP
	 * config instead of the portable `ic mcp` launch. Off by default because
	 * those files are committed and shared.
	 */
	pinLaunch?: boolean;
};

export type InstallResult = {
	target: AgentTarget;
	/** Relative paths written or updated this run. */
	installed: string[];
	/** Human-readable notes (MCP snippets, trust reminders, etc.). */
	notes: string[];
};

export type AgentAdapter = {
	id: AgentTarget;
	install(opts: InstallOpts): InstallResult;
};

export function isAgentTarget(value: string): value is AgentTarget {
	return (AGENT_TARGETS as readonly string[]).includes(value);
}
