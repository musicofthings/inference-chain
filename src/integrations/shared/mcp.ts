import { resolve, sep } from "node:path";

export type McpStdioBlock = {
	command: string;
	args: string[];
};

export type IcLaunch = {
	command: string;
	/** Args before `mcp --cwd …` (usually absolute path to cli.js). */
	prefixArgs: string[];
};

/**
 * Prefer pinning the currently running CLI entrypoint via `node <cli.js>` so
 * Desktop / IDE MCP configs work without a global `ic` on PATH. Fall back to
 * the `ic` binary when argv is not our CLI (e.g. vitest, library import).
 */
export function resolveIcLaunch(): IcLaunch {
	const entry = process.argv[1] ? resolve(process.argv[1]) : "";
	if (entry && isInferenceChainCli(entry)) {
		return { command: process.execPath, prefixArgs: [entry] };
	}
	return { command: "ic", prefixArgs: [] };
}

function isInferenceChainCli(entry: string): boolean {
	const base = entry.split(sep).pop() ?? "";
	if (base !== "cli.js" && base !== "cli.ts") return false;
	return (
		entry.includes(`${sep}inference-chain${sep}`) ||
		entry.endsWith(`${sep}dist${sep}cli.js`) ||
		entry.endsWith(`${sep}src${sep}cli.ts`)
	);
}

/**
 * Machine-specific launch: this node binary, this CLI checkout, this absolute
 * project path. Only safe for configs that never leave the machine that ran
 * the install (Desktop app settings, paste-ready snippets).
 */
export function mcpStdioBlock(cwd: string = process.cwd()): McpStdioBlock {
	const launch = resolveIcLaunch();
	return {
		command: launch.command,
		args: [...launch.prefixArgs, "mcp", "--cwd", resolve(cwd)],
	};
}

export type McpEntryOpts = {
	/** Embed the machine-specific launch instead of the portable `ic mcp`. */
	pin?: boolean;
	/** Only meaningful with pin. */
	cwd?: string;
};

/**
 * Launch block for project-scoped config files (`.mcp.json`, `opencode.json`,
 * `.vscode/mcp.json`, …). These get committed and shared, so they must not
 * embed this machine's node binary, CLI checkout, or project path — hosts
 * already start stdio servers with the project as cwd. `pin` opts back in for
 * setups where `ic` is not on PATH.
 */
export function mcpProjectStdioBlock(opts: McpEntryOpts = {}): McpStdioBlock {
	if (opts.pin) return mcpStdioBlock(opts.cwd);
	return { command: "ic", args: ["mcp"] };
}

/** JSON shape used by Cursor, Gemini, OpenHands, Claude Code `.mcp.json`. */
export function mcpJsonServerEntry(opts: McpEntryOpts = {}): McpStdioBlock {
	return mcpProjectStdioBlock(opts);
}

/**
 * VS Code workspace MCP (`.vscode/mcp.json`) uses a top-level `servers` map.
 */
export function mcpVscodeServerEntry(
	opts: McpEntryOpts = {},
): Record<string, unknown> {
	const block = mcpProjectStdioBlock(opts);
	return {
		command: block.command,
		args: block.args,
	};
}

/**
 * OpenCode project config (`opencode.json`) local MCP server entry.
 * command is a single argv array (not command+args).
 */
export function mcpOpencodeServerEntry(
	opts: McpEntryOpts = {},
): Record<string, unknown> {
	const block = mcpProjectStdioBlock(opts);
	return {
		type: "local",
		command: [block.command, ...block.args],
		enabled: true,
	};
}

/** Pretty-printed Claude Desktop / generic mcpServers snippet (always pinned). */
export function mcpDesktopConfigSnippet(cwd: string = process.cwd()): string {
	return JSON.stringify(
		{
			mcpServers: {
				"inference-chain": mcpStdioBlock(cwd),
			},
		},
		null,
		2,
	);
}

/** TOML body (without the `[mcp_servers.inference-chain]` header). */
export function mcpTomlSectionBody(opts: McpEntryOpts = {}): string {
	const block = mcpProjectStdioBlock(opts);
	const args = block.args.map((a) => JSON.stringify(a)).join(", ");
	return `command = ${JSON.stringify(block.command)}\nargs = [${args}]`;
}

/** One-line explanation of what went into the project-scoped MCP configs. */
export function projectLaunchNote(pinned: boolean): string {
	return pinned
		? "Project MCP config pins this machine's node binary, CLI path, and project path (--pin-launch). Do not commit it to a shared repo."
		: "Project MCP config launches `ic mcp` so it stays portable across machines — install the CLI globally (npm i -g inference-chain), or re-run with --pin-launch to hardcode this machine's node + CLI path.";
}

export function mcpSnippetNotes(target: string): string[] {
	const notes: string[] = [];
	switch (target) {
		case "claude":
			notes.push(
				"Claude Code project MCP written to .mcp.json (not settings.json). Or: claude mcp add -s project inference-chain -- ic mcp",
			);
			break;
		case "codex":
			notes.push("Or run: codex mcp add inference-chain -- ic mcp");
			break;
		case "gemini":
			notes.push("Or run: gemini mcp add -s project inference-chain ic mcp");
			break;
		case "grok":
			notes.push(
				"Or run: grok mcp add inference-chain --scope project -- ic mcp",
			);
			break;
		case "openhands":
			notes.push(
				"Or run: openhands mcp add inference-chain --transport stdio -- ic mcp",
			);
			notes.push(
				"OpenClaw: same stdio block under mcp.servers.inference-chain in openclaw.json.",
			);
			break;
		case "desktop":
			notes.push(
				"Merge the printed mcpServers block into Claude Desktop's claude_desktop_config.json (or ChatGPT Desktop MCP settings if applicable).",
			);
			notes.push(
				"If `ic` is not on PATH, point command at `node` and args at the absolute path to dist/cli.js plus mcp --cwd …",
			);
			break;
		case "opencode":
			notes.push(
				"OpenCode reads opencode.json mcp.<name> local servers (command argv array).",
			);
			break;
		case "vscode":
			notes.push(
				"VS Code / Copilot Chat: reload window after editing .vscode/mcp.json, then trust the server when prompted.",
			);
			break;
		case "chatgpt":
			notes.push(
				"ChatGPT Desktop / Codex app: paste the mcpServers snippet into the app's MCP settings if project .codex/ is not picked up.",
			);
			break;
		default:
			break;
	}
	return notes;
}
