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
