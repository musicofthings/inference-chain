import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { templatesRoot } from '../../storage/packageAssets.js';
import { p } from '../../storage/paths.js';

export type TeamsInstallResult = {
  inferenceDir: string;
  installedFiles: string[];
  huskyInstalled: boolean;
  workflowInstalled: boolean;
  packageJsonPatched: boolean;
};

const EXECUTABLE = new Set(['.sh', '.py']);

// Never propagate Python bytecode caches into a consuming repo.
const IGNORED_NAMES = new Set(['__pycache__', '.DS_Store']);
const isIgnored = (name: string): boolean =>
  IGNORED_NAMES.has(name) || name.endsWith('.pyc');

/**
 * Install the teams (.inference/) module into the current working directory.
 *
 * Mirrors install-claude: copies a bundled template tree, never clobbering a
 * user's existing file unless `overwrite` is set. Also drops the Husky
 * pre-commit hook and the bot-distillation GitHub Action, and (best-effort)
 * adds a `prepare` script so `npm install` binds the hook.
 */
export function installTeams(opts: { overwrite?: boolean } = {}): TeamsInstallResult {
  const overwrite = opts.overwrite ?? false;
  const teamsRoot = join(templatesRoot(), 'teams');
  const installed: string[] = [];

  // 1) .inference/ tree (seeds, prompts, scripts).
  copyTree(join(teamsRoot, 'inference'), p('.inference'), overwrite, installed);

  // 2) Husky pre-commit hook.
  const huskySrc = join(teamsRoot, 'husky', 'pre-commit');
  const huskyDst = p('.husky', 'pre-commit');
  const huskyInstalled = copyOne(huskySrc, huskyDst, overwrite);
  if (huskyInstalled) installed.push('.husky/pre-commit');

  // 3) GitHub Action.
  const wfSrc = join(teamsRoot, 'github', 'workflows', 'ic-teams-bot-distill.yml');
  const wfDst = p('.github', 'workflows', 'ic-teams-bot-distill.yml');
  const workflowInstalled = copyOne(wfSrc, wfDst, overwrite);
  if (workflowInstalled) installed.push('.github/workflows/ic-teams-bot-distill.yml');

  // 4) Best-effort: ensure `npm install` re-binds the hook via Husky.
  const packageJsonPatched = patchPrepareScript(p('package.json'));

  return {
    inferenceDir: p('.inference'),
    installedFiles: installed,
    huskyInstalled,
    workflowInstalled,
    packageJsonPatched,
  };
}

function copyOne(src: string, dst: string, overwrite: boolean): boolean {
  if (!existsSync(src)) return false;
  if (existsSync(dst) && !overwrite) return false;
  mkdirSync(join(dst, '..'), { recursive: true });
  copyFileSync(src, dst);
  makeExecutableIfNeeded(dst);
  return true;
}

function copyTree(
  src: string,
  dst: string,
  overwrite: boolean,
  installed: string[],
): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (isIgnored(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyTree(s, d, overwrite, installed);
    } else if (entry.isFile()) {
      if (existsSync(d) && !overwrite) continue;
      copyFileSync(s, d);
      makeExecutableIfNeeded(d);
      installed.push(d);
    }
  }
}

function makeExecutableIfNeeded(path: string): void {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot) : '';
  if (EXECUTABLE.has(ext) || path.endsWith('/pre-commit')) {
    try {
      chmodSync(path, 0o755);
    } catch {
      // chmod is a no-op / may throw on some filesystems (Windows); the git
      // executable bit from the template covers those cases.
    }
  }
}

/** Add `"prepare": "husky"` without clobbering an existing prepare script. */
function patchPrepareScript(pkgPath: string): boolean {
  if (!existsSync(pkgPath)) return false;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return false;
  }
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
  if (typeof scripts.prepare === 'string' && scripts.prepare.includes('husky')) {
    return false;
  }
  if (scripts.prepare) return false; // don't clobber a different prepare step
  scripts.prepare = 'husky';
  pkg.scripts = scripts;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  return true;
}
