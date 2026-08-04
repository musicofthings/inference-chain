import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { templatesRoot } from "../../storage/packageAssets.js";
import { copyOne } from "./fs.js";

export const COMMON_COMMANDS = [
	"ic-checkpoint",
	"ic-stop",
	"ic-evolve",
	"ic-resume",
] as const;

export type CommonCommand = (typeof COMMON_COMMANDS)[number];

export type CommandMeta = {
	description: string;
	/** Claude Code / plugin frontmatter; omitted for Cursor-style md. */
	allowedTools?: string;
};

export const COMMAND_META: Record<CommonCommand, CommandMeta> = {
	"ic-checkpoint": {
		description:
			"Capture an Inference Chain interaction-level checkpoint (small memory-evolution event).",
		allowedTools: "Write, Read",
	},
	"ic-stop": {
		description:
			"Capture an Inference Chain session-level handoff (final Session Brief).",
		allowedTools: "Write, Read",
	},
	"ic-evolve": {
		description:
			"Produce a Memory Evolution Record reconciling current ledger with latest brief/update.",
		allowedTools: "Write, Read",
	},
	"ic-resume": {
		description:
			"Resume a coding-agent session from the latest Inference Chain resume brief.",
		allowedTools: "Read",
	},
};

export function commonCommandPath(name: CommonCommand): string {
	return join(templatesRoot(), "common", "commands", `${name}.md`);
}

export function readCommandBody(name: CommonCommand): string {
	const path = commonCommandPath(name);
	if (!existsSync(path)) {
		throw new Error(`Missing common command body: ${path}`);
	}
	return `${readFileSync(path, "utf8").replace(/\n+$/, "")}\n`;
}

function writeIfChanged(
	dest: string,
	content: string,
	overwrite: boolean,
	installed: string[],
	cwd: string,
): boolean {
	if (existsSync(dest) && !overwrite) return false;
	mkdirSync(dirname(dest), { recursive: true });
	if (existsSync(dest) && readFileSync(dest, "utf8") === content) {
		return false;
	}
	writeFileSync(dest, content, "utf8");
	installed.push(relative(cwd, dest) || dest);
	return true;
}

/** Claude Code / plugin: YAML frontmatter + shared body. */
export function writeClaudeMarkdownCommand(
	dest: string,
	name: CommonCommand,
	opts: { overwrite: boolean; installed: string[]; cwd?: string },
): boolean {
	const meta = COMMAND_META[name];
	const body = readCommandBody(name);
	const front = [
		"---",
		`description: ${meta.description}`,
		...(meta.allowedTools ? [`allowed-tools: ${meta.allowedTools}`] : []),
		"---",
		"",
	].join("\n");
	return writeIfChanged(
		dest,
		front + body,
		opts.overwrite,
		opts.installed,
		opts.cwd ?? process.cwd(),
	);
}

/** Cursor-style: description-only frontmatter + shared body. */
export function writeCursorMarkdownCommand(
	dest: string,
	name: CommonCommand,
	opts: { overwrite: boolean; installed: string[]; cwd?: string },
): boolean {
	const meta = COMMAND_META[name];
	const body = readCommandBody(name);
	const front = ["---", `description: ${meta.description}`, "---", ""].join(
		"\n",
	);
	return writeIfChanged(
		dest,
		front + body,
		opts.overwrite,
		opts.installed,
		opts.cwd ?? process.cwd(),
	);
}

/** Gemini CLI: TOML with prompt triple-quoted body. */
export function writeGeminiTomlCommand(
	dest: string,
	name: CommonCommand,
	opts: { overwrite: boolean; installed: string[]; cwd?: string },
): boolean {
	const meta = COMMAND_META[name];
	const body = readCommandBody(name).replace(/\n+$/, "");
	const content = [
		`description = ${JSON.stringify(meta.description)}`,
		"",
		'prompt = """',
		body,
		'"""',
		"",
	].join("\n");
	return writeIfChanged(
		dest,
		content,
		opts.overwrite,
		opts.installed,
		opts.cwd ?? process.cwd(),
	);
}

/** Grok skills: SKILL.md with name + description frontmatter. */
export function writeGrokSkillCommand(
	destDir: string,
	name: CommonCommand,
	opts: { overwrite: boolean; installed: string[]; cwd?: string },
): boolean {
	const meta = COMMAND_META[name];
	const body = readCommandBody(name);
	const dest = join(destDir, "SKILL.md");
	const front = [
		"---",
		`name: ${name}`,
		`description: ${meta.description}`,
		"---",
		"",
	].join("\n");
	return writeIfChanged(
		dest,
		front + body,
		opts.overwrite,
		opts.installed,
		opts.cwd ?? process.cwd(),
	);
}

/** Install all four Claude-style commands into a directory. */
export function installClaudeStyleCommands(
	destDir: string,
	opts: { overwrite: boolean; installed: string[]; cwd?: string },
): string[] {
	const written: string[] = [];
	for (const name of COMMON_COMMANDS) {
		const dest = join(destDir, `${name}.md`);
		if (writeClaudeMarkdownCommand(dest, name, opts)) {
			written.push(`${name}.md`);
		}
	}
	return written;
}

/** Copy optional host-only extras (e.g. Cursor rules) without touching commands. */
export function copyHostExtra(
	src: string,
	dest: string,
	overwrite: boolean,
	installed: string[],
	cwd: string = process.cwd(),
): boolean {
	return copyOne(src, dest, overwrite, installed, cwd);
}
