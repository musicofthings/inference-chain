import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installTeams } from '../src/integrations/teams/install.js';

let tmp: string;
let cwd: string;

beforeEach(() => {
  cwd = process.cwd();
  tmp = mkdtempSync(join(tmpdir(), 'ic-teams-'));
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(cwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe('installTeams scaffolder', () => {
  it('scaffolds the .inference tree, hook, and workflow', () => {
    writeFileSync('package.json', JSON.stringify({ name: 'acme', version: '1.0.0' }));
    const res = installTeams();

    for (const f of [
      '.inference/masterplan.md',
      '.inference/bot_ledger.md',
      '.inference/prompts/02-semantic-merge.md',
      '.inference/scripts/local_merge.py',
      '.inference/scripts/distill_bots.py',
      '.inference/scripts/pre-commit.sh',
      '.husky/pre-commit',
      '.github/workflows/ic-teams-bot-distill.yml',
    ]) {
      expect(existsSync(join(tmp, f)), f).toBe(true);
    }
    expect(res.huskyInstalled).toBe(true);
    expect(res.workflowInstalled).toBe(true);
  });

  it('adds prepare:husky without clobbering an existing prepare', () => {
    writeFileSync('package.json', JSON.stringify({ name: 'acme', version: '1.0.0' }));
    installTeams();
    const pkg = JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf8'));
    expect(pkg.scripts.prepare).toBe('husky');

    // existing prepare is preserved on a fresh repo
    rmSync(join(tmp, '.inference'), { recursive: true, force: true });
    writeFileSync('package.json', JSON.stringify({ name: 'b', version: '1', scripts: { prepare: 'echo hi' } }));
    installTeams({ overwrite: true });
    const pkg2 = JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf8'));
    expect(pkg2.scripts.prepare).toBe('echo hi');
  });

  it('never copies Python bytecode and is idempotent', () => {
    writeFileSync('package.json', JSON.stringify({ name: 'acme', version: '1.0.0' }));
    // simulate a stray bytecode cache in the source tree is filtered by copyTree
    installTeams();
    expect(existsSync(join(tmp, '.inference/scripts/__pycache__'))).toBe(false);

    const second = installTeams();
    expect(second.installedFiles).toHaveLength(0); // nothing overwritten
    expect(second.huskyInstalled).toBe(false);
  });
});
