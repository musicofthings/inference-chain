import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

const IGNORED_NAMES = new Set(["__pycache__", ".DS_Store"]);

export function copyOne(
	src: string,
	dst: string,
	overwrite: boolean,
	installed?: string[],
	cwd?: string,
): boolean {
	if (!existsSync(src)) return false;
	if (existsSync(dst) && !overwrite) return false;
	mkdirSync(dirname(dst), { recursive: true });
	copyFileSync(src, dst);
	if (installed) {
		installed.push(cwd ? relative(cwd, dst) || dst : dst);
	}
	return true;
}

export function copyTree(
	src: string,
	dst: string,
	overwrite: boolean,
	installed?: string[],
	cwd?: string,
): void {
	if (!existsSync(src)) return;
	mkdirSync(dst, { recursive: true });
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		if (IGNORED_NAMES.has(entry.name) || entry.name.endsWith(".pyc")) continue;
		const s = join(src, entry.name);
		const d = join(dst, entry.name);
		if (entry.isDirectory()) {
			copyTree(s, d, overwrite, installed, cwd);
		} else if (entry.isFile()) {
			if (existsSync(d) && !overwrite) continue;
			copyFileSync(s, d);
			if (installed) {
				installed.push(cwd ? relative(cwd, d) || d : d);
			}
		}
	}
}

export function makeExecutable(path: string): void {
	try {
		chmodSync(path, 0o755);
	} catch {
		// chmod may fail on some filesystems; ignore.
	}
}
