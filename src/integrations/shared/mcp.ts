import { resolve } from "node:path";

export type McpStdioBlock = {
	command: string;
	args: string[];
};

/** Standard stdio MCP launch for Inference Chain, pinned to an absolute cwd. */
export function mcpStdioBlock(cwd: string = process.cwd()): McpStdioBlock {
	return {
		command: "ic",
		args: ["mcp", "--cwd", resolve(cwd)],
	};
}

/** JSON shape used by Claude Desktop, Cursor, Gemini, OpenHands. */
export function mcpJsonServerEntry(cwd?: string): McpStdioBlock {
	return mcpStdioBlock(cwd);
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
		default:
			break;
	}
	return notes;
}
