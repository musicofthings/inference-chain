import { resolve } from "node:path";

export const IC_DIR = ".inference-chain";

export const SUBDIRS = [
	"inbox",
	"briefs",
	"updates",
	"evolutions",
	"resumes",
	"prompts",
	"locks",
] as const;

/**
 * Resolve path segments against process.cwd().
 * Uses path.resolve (not join) so an absolute CLI arg like /tmp/foo is kept
 * absolute — join(cwd, "/tmp/foo") incorrectly nests under cwd on modern Node.
 */
export function p(...segments: string[]): string {
	return resolve(process.cwd(), ...segments);
}

export function ic(...segments: string[]): string {
	return resolve(process.cwd(), IC_DIR, ...segments);
}

export const PATHS = {
	root: () => ic(),
	db: () => ic("chain.db"),
	ledgerJsonl: () => ic("ledger.jsonl"),
	ledgerLock: () => ic("locks", "ledger.lock"),
	projectYml: () => ic("project.yml"),
	currentYml: () => ic("current.yml"),
	inboxUpdate: () => ic("inbox", "latest-update.yml"),
	inboxBrief: () => ic("inbox", "latest-brief.yml"),
	inboxEvolution: () => ic("inbox", "latest-evolution.yml"),
	resumeLatest: () => ic("resumes", "resume_latest.md"),
};
