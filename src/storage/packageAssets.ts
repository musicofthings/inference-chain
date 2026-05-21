import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the on-disk path to bundled templates. Works whether the CLI is
 * being run from src (via tsx) or from dist (via `node dist/cli.js`).
 */
export function templatesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '..', '..', 'templates'),
    resolve(here, '..', '..', '..', 'templates'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    `templates/ directory not found relative to ${here}. Looked in: ${candidates.join(', ')}`,
  );
}

export const TEMPLATE = {
  promptCaptureUpdate: () =>
    join(templatesRoot(), 'claude', 'prompts', 'capture-interaction-update.md'),
  promptCaptureBrief: () =>
    join(templatesRoot(), 'claude', 'prompts', 'capture-session-brief.md'),
  promptEvolveLedger: () =>
    join(templatesRoot(), 'claude', 'prompts', 'evolve-ledger.md'),
  promptResumeSession: () =>
    join(templatesRoot(), 'claude', 'prompts', 'resume-session.md'),
  claudeCommand: (name: string) =>
    join(templatesRoot(), 'claude', 'commands', `${name}.md`),
  pluginRoot: () => join(templatesRoot(), 'plugin'),
};
