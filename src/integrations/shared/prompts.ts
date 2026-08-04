import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { templatesRoot } from "../../storage/packageAssets.js";
import { ic } from "../../storage/paths.js";
import { copyOne } from "./fs.js";

/** Canonical AGENTS.md / instruction blob body (no marker wrappers). */
export function readAgentsBody(): string {
	const path = join(templatesRoot(), "common", "AGENTS.inference-chain.md");
	return existsSync(path)
		? readFileSync(path, "utf8")
		: "## Inference Chain\n\nSee docs/agents.md\n";
}

/** Copy agent-neutral prompts into `.inference-chain/prompts/` if missing. */
export function writeNeutralPrompts(
	opts: {
		overwrite?: boolean;
		installed?: string[];
	} = {},
): string[] {
	const overwrite = opts.overwrite ?? false;
	const installed = opts.installed ?? [];
	const srcDir = join(templatesRoot(), "common", "prompts");
	if (!existsSync(srcDir)) return installed;

	const destDir = ic("prompts");
	for (const file of readdirSync(srcDir)) {
		if (!file.endsWith(".md")) continue;
		copyOne(
			join(srcDir, file),
			join(destDir, file),
			overwrite,
			installed,
			process.cwd(),
		);
	}
	return installed;
}

export function commonPromptPath(name: string): string {
	return join(templatesRoot(), "common", "prompts", name);
}
