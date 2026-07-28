import { renameSync, writeFileSync } from "node:fs";

/**
 * Write `content` to `path` via a same-directory temp file + rename so a
 * crash mid-write cannot leave a half-written current.yml (or similar).
 */
export function writeFileAtomic(path: string, content: string): void {
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tmp, content, "utf8");
	renameSync(tmp, path);
}
