import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Merge `patch` into a JSON object file. Nested objects under `path` keys are
 * shallow-merged at the leaf: for each key in `patch`, set only if absent
 * (unless overwrite). Returns whether the file was written.
 */
export function mergeJsonKeyAbsent(
	filePath: string,
	patch: Record<string, unknown>,
	opts: { overwrite?: boolean; warnLabel?: string } = {},
): boolean {
	const overwrite = opts.overwrite ?? false;
	let existing: Record<string, unknown> = {};
	if (existsSync(filePath)) {
		try {
			existing = JSON.parse(readFileSync(filePath, "utf8")) as Record<
				string,
				unknown
			>;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(
				`[inference-chain] WARN: ${opts.warnLabel ?? filePath} is not valid JSON (${msg}). Skipping merge.`,
			);
			return false;
		}
	}

	const before = JSON.stringify(existing);
	deepMergeAbsent(existing, patch, overwrite);
	if (JSON.stringify(existing) === before && existsSync(filePath)) {
		return false;
	}

	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
	return true;
}

function deepMergeAbsent(
	target: Record<string, unknown>,
	patch: Record<string, unknown>,
	overwrite: boolean,
): void {
	for (const [key, value] of Object.entries(patch)) {
		if (
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			typeof target[key] === "object" &&
			target[key] !== null &&
			!Array.isArray(target[key])
		) {
			deepMergeAbsent(
				target[key] as Record<string, unknown>,
				value as Record<string, unknown>,
				overwrite,
			);
			continue;
		}
		if (!(key in target) || overwrite) {
			target[key] = value;
		}
	}
}

/**
 * Append a TOML table if the header is absent. Does not parse TOML — only
 * checks for a line matching `[sectionHeader]` (exact).
 */
export function mergeTomlSectionAbsent(
	filePath: string,
	sectionHeader: string,
	sectionBody: string,
	opts: { overwrite?: boolean } = {},
): boolean {
	const headerLine = `[${sectionHeader}]`;
	const block = `${headerLine}\n${sectionBody.trimEnd()}\n`;
	mkdirSync(dirname(filePath), { recursive: true });

	if (!existsSync(filePath)) {
		writeFileSync(filePath, `${block}\n`, "utf8");
		return true;
	}

	const current = readFileSync(filePath, "utf8");
	const hasSection = current
		.split("\n")
		.some((line) => line.trim() === headerLine);

	if (hasSection && !opts.overwrite) return false;

	if (hasSection && opts.overwrite) {
		const rewritten = replaceTomlSection(current, sectionHeader, block);
		writeFileSync(
			filePath,
			rewritten.endsWith("\n") ? rewritten : `${rewritten}\n`,
			"utf8",
		);
		return true;
	}

	const sep = current.endsWith("\n") ? "\n" : "\n\n";
	writeFileSync(filePath, `${current}${sep}${block}\n`, "utf8");
	return true;
}

function replaceTomlSection(
	source: string,
	sectionHeader: string,
	newBlock: string,
): string {
	const headerLine = `[${sectionHeader}]`;
	const lines = source.split("\n");
	const start = lines.findIndex((line) => line.trim() === headerLine);
	if (start < 0) return `${source}\n${newBlock}`;

	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		const t = lines[i].trim();
		if (t.startsWith("[") && t.endsWith("]")) {
			end = i;
			break;
		}
	}

	const before = lines.slice(0, start).join("\n").replace(/\n+$/, "");
	const after = lines.slice(end).join("\n").replace(/^\n+/, "");
	const parts = [before, newBlock.trimEnd(), after].filter((p) => p.length > 0);
	return `${parts.join("\n\n")}\n`;
}

export const AGENTS_MD_START = "<!-- inference-chain -->";
export const AGENTS_MD_END = "<!-- /inference-chain -->";

function normalizeTrailingNl(text: string): string {
	return `${text.replace(/\n+$/, "")}\n`;
}

/** Idempotently upsert the marked Inference Chain block in AGENTS.md. */
export function upsertAgentsMdBlock(filePath: string, body: string): boolean {
	const block = `${AGENTS_MD_START}\n${body.trimEnd()}\n${AGENTS_MD_END}\n`;
	mkdirSync(dirname(filePath), { recursive: true });

	if (!existsSync(filePath)) {
		writeFileSync(filePath, block, "utf8");
		return true;
	}

	const current = readFileSync(filePath, "utf8");
	const start = current.indexOf(AGENTS_MD_START);
	const end = current.indexOf(AGENTS_MD_END);

	if (start >= 0 && end > start) {
		const afterEnd = end + AGENTS_MD_END.length;
		const prefix = current.slice(0, start).replace(/\n+$/, "");
		const suffix = current.slice(afterEnd).replace(/^\n*/, "");
		const parts = [prefix, block.trimEnd(), suffix].filter((p) => p.length > 0);
		const next = normalizeTrailingNl(parts.join("\n\n"));
		if (normalizeTrailingNl(current) === next) return false;
		writeFileSync(filePath, next, "utf8");
		return true;
	}

	const sep = current.endsWith("\n") ? "\n" : "\n\n";
	writeFileSync(
		filePath,
		normalizeTrailingNl(`${current}${sep}${block}`),
		"utf8",
	);
	return true;
}
