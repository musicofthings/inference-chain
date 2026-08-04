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

/** Standard stdio MCP launch for Inference Chain, pinned to an absolute cwd. */
export function mcpStdioBlock(cwd: string = process.cwd()): McpStdioBlock {
	const launch = resolveIcLaunch();
	return {
		command: launch.command,
		args: [...launch.prefixArgs, "mcp", "--cwd", resolve(cwd)],
	};
}

/** JSON shape used by Claude Desktop, Cursor, Gemini, OpenHands, Claude Code `.mcp.json`. */
export function mcpJsonServerEntry(cwd?: string): McpStdioBlock {
	return mcpStdioBlock(cwd);
}

/**
 * VS Code workspace MCP (`.vscode/mcp.json`) uses a top-level `servers` map.
 */
export function mcpVscodeServerEntry(cwd?: string): Record<string, unknown> {
	const block = mcpStdioBlock(cwd);
	return {
		command: block.command,
		args: block.args,
	};
}

/**
 * OpenCode project config (`opencode.json`) local MCP server entry.
 * command is a single argv array (not command+args).
 */
export function mcpOpencodeServerEntry(cwd?: string): Record<string, unknown> {
	const block = mcpStdioBlock(cwd);
	return {
		type: "local",
		command: [block.command, ...block.args],
		enabled: true,
	};
}

/** Pretty-printed Claude Desktop / generic mcpServers snippet. */
export function mcpDesktopConfigSnippet(cwd: string = process.cwd()): string {
	return JSON.stringify(
		{
			mcpServers: {
				"inference-chain": mcpJsonServerEntry(cwd),
			},
		},
		null,
		2,
	);
}

/** TOML body (without the `[mcp_servers.inference-chain]` header). */
export function mcpTomlSectionBody(cwd?: string): string {
	const block = mcpStdioBlock(cwd);
	const args = block.args.map((a) => JSON.stringify(a)).join(", ");
	return `command = ${JSON.stringify(block.command)}\nargs = [${args}]`;
}

export function mcpSnippetNotes(
	target: string,
	cwd: string = process.cwd(),
): string[] {
	const abs = resolve(cwd);
	const notes: string[] = [];
	switch (target) {
		case "claude":
			notes.push(
				`Claude Code project MCP written to .mcp.json (not settings.json). Or: claude mcp add -s project inference-chain -- ic mcp --cwd ${abs}`,
			);
			break;
		case "codex":
			notes.push(
				`Or run: codex mcp add inference-chain -- ic mcp --cwd ${abs}`,
			);
			break;
		case "gemini":
			notes.push(
				`Or run: gemini mcp add -s project inference-chain ic mcp --cwd ${abs}`,
			);
			break;
		case "grok":
			notes.push(
				`Or run: grok mcp add inference-chain --scope project -- ic mcp --cwd ${abs}`,
			);
			break;
		case "openhands":
			notes.push(
				`Or run: openhands mcp add inference-chain --transport stdio -- ic mcp --cwd ${abs}`,
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
