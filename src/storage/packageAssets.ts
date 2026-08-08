import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the on-disk path to bundled templates. Works whether the CLI is
 * being run from src (via tsx) or from dist (via `node dist/cli.js`).
 */
export function templatesRoot(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		resolve(here, "..", "..", "templates"),
		resolve(here, "..", "..", "..", "templates"),
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	throw new Error(
		`templates/ directory not found relative to ${here}. Looked in: ${candidates.join(", ")}`,
	);
}

/**
 * Version from the installed package.json. Resolved the same way as templates
 * so it works from src (tsx) and from dist alike.
 */
export function packageVersion(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	for (const c of [
		resolve(here, "..", "..", "package.json"),
		resolve(here, "..", "..", "..", "package.json"),
	]) {
		if (existsSync(c)) {
			const pkg = JSON.parse(readFileSync(c, "utf8")) as { version?: string };
			if (pkg.version) return pkg.version;
		}
	}
	return "unknown";
}

export const TEMPLATE = {
	promptCaptureUpdate: () =>
		join(templatesRoot(), "common", "prompts", "capture-interaction-update.md"),
	promptCaptureBrief: () =>
		join(templatesRoot(), "common", "prompts", "capture-session-brief.md"),
	promptEvolveLedger: () =>
		join(templatesRoot(), "common", "prompts", "evolve-ledger.md"),
	promptResumeSession: () =>
		join(templatesRoot(), "common", "prompts", "resume-session.md"),
	commonCommand: (name: string) =>
		join(templatesRoot(), "common", "commands", `${name}.md`),
	pluginRoot: () => join(templatesRoot(), "plugin"),
	agentRoot: (agent: string) => join(templatesRoot(), agent),
};
