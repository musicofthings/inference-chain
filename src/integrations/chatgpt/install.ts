import { writeFileSync } from "node:fs";
import { p } from "../../storage/paths.js";
import { installCodex } from "../codex/install.js";
import { mcpDesktopConfigSnippet, mcpSnippetNotes } from "../shared/mcp.js";
import { writeNeutralPrompts } from "../shared/prompts.js";
import type { AgentAdapter, InstallOpts, InstallResult } from "../types.js";

/**
 * ChatGPT Desktop / Codex app: reuse Codex CLI project wiring, plus a Desktop
 * MCP snippet for hosts that only read a global mcpServers JSON file.
 */
export function installChatgpt(opts: InstallOpts): InstallResult {
	const installed: string[] = [];
	const notes: string[] = [];

	writeNeutralPrompts({ overwrite: opts.overwrite, installed });

	const codex = installCodex(opts);
	for (const path of codex.installed) {
		if (!installed.includes(path)) installed.push(path);
	}
	notes.push(...codex.notes);

	const snippetPath = p(".inference-chain", "mcp-chatgpt-desktop.json");
	const snippet = mcpDesktopConfigSnippet();
	writeFileSync(snippetPath, `${snippet}\n`, "utf8");
	if (!installed.includes(".inference-chain/mcp-chatgpt-desktop.json")) {
		installed.push(".inference-chain/mcp-chatgpt-desktop.json");
	}
	notes.push(...mcpSnippetNotes("chatgpt"));
	notes.push(snippet);

	return { target: "chatgpt", installed, notes };
}

export const chatgptAdapter: AgentAdapter = {
	id: "chatgpt",
	install: installChatgpt,
};
