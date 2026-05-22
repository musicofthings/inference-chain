import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { TEMPLATE, templatesRoot } from '../../storage/packageAssets.js';
import { p } from '../../storage/paths.js';

/**
 * Install Claude Code integration into the current working directory.
 *
 * Strategy:
 *   1. Copy slash command markdown from templates/claude/commands/ into
 *      .claude/commands/ (skipping any user file that already exists unless
 *      overwrite is true).
 *   2. Merge a small hook block into .claude/settings.json without
 *      clobbering existing keys.
 *   3. If a Claude Code Plugin manifest exists in templates/plugin/, copy
 *      it to .claude/plugins/inference-chain/ as well so the project can be
 *      consumed as a plugin.
 */
export function installClaude(opts: { overwrite?: boolean } = {}): {
  installedCommands: string[];
  settingsPath: string;
  pluginInstalled: boolean;
} {
  const overwrite = opts.overwrite ?? false;
  mkdirSync(p('.claude', 'commands'), { recursive: true });

  const cmdsSrc = join(templatesRoot(), 'claude', 'commands');
  const installed: string[] = [];
  for (const file of readdirSync(cmdsSrc)) {
    if (!file.endsWith('.md')) continue;
    const dest = p('.claude', 'commands', file);
    if (existsSync(dest) && !overwrite) continue;
    copyFileSync(join(cmdsSrc, file), dest);
    installed.push(file);
  }

  const settingsPath = p('.claude', 'settings.json');
  mergeSettings(settingsPath);

  const pluginInstalled = installPlugin(overwrite);

  return { installedCommands: installed, settingsPath, pluginInstalled };
}

function mergeSettings(settingsPath: string): void {
  let existing: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<
        string,
        unknown
      >;
    } catch (err) {
      // Leave a broken settings file alone — refuse to overwrite human
      // edits — but make the skip visible so users can fix the JSON.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[inference-chain] WARN: ${settingsPath} is not valid JSON (${msg}). Skipping hook merge. Fix the file and re-run "ic install-claude".`,
      );
      return;
    }
  }

  const hooks =
    (existing.hooks as Record<string, unknown> | undefined) ?? {};
  const desiredHooks: Record<string, unknown> = {
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command:
              'test -f .inference-chain/resumes/resume_latest.md && cat .inference-chain/resumes/resume_latest.md || true',
          },
        ],
      },
    ],
    PreCompact: [
      {
        hooks: [
          {
            type: 'command',
            command:
              'echo "[inference-chain] Consider /ic-checkpoint before compaction to preserve operating context."',
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command:
              'echo "[inference-chain] Consider /ic-stop to write a Session Brief, then: ic ingest .inference-chain/inbox/latest-brief.yml && ic evolve && ic resume"',
          },
        ],
      },
    ],
  };

  for (const key of Object.keys(desiredHooks)) {
    if (!(key in hooks)) hooks[key] = desiredHooks[key];
  }
  existing.hooks = hooks;

  writeFileSync(settingsPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
}

function installPlugin(overwrite: boolean): boolean {
  const pluginSrc = TEMPLATE.pluginRoot();
  if (!existsSync(pluginSrc)) return false;
  const dest = p('.claude', 'plugins', 'inference-chain');
  copyTree(pluginSrc, dest, overwrite);
  return true;
}

function copyTree(src: string, dest: string, overwrite: boolean): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(s, d, overwrite);
    } else if (entry.isFile()) {
      if (existsSync(d) && !overwrite) continue;
      copyFileSync(s, d);
    }
  }
}
