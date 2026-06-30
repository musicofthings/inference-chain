import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import YAML from 'yaml';
import { renderResumeBrief } from '../core/resume.js';
import { type ChainLedger, ChainLedgerSchema } from '../core/schemas.js';
import { type TeamInput, type TeamMergeResult, mergeTeamLedgers } from './merge.js';

export type DirMergeResult = {
  result: TeamMergeResult;
  teamYaml: string;
  resume: string;
  authors: string[];
};

const DEV_FILE = /^dev[-_](.+)\.ya?ml$/i;

/** author name from a `dev_<name>.yml` filename. */
function authorOf(file: string): string {
  const m = basename(file).match(DEV_FILE);
  return m ? m[1] : basename(file).replace(/\.ya?ml$/i, '');
}

function parseLedger(path: string): ChainLedger {
  try {
    return ChainLedgerSchema.parse(YAML.parse(readFileSync(path, 'utf8')));
  } catch (err) {
    // Surface a single actionable line naming the file, not a raw ZodError dump.
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    throw new Error(`Invalid developer ledger ${basename(path)}: ${reason}`);
  }
}

/**
 * Deterministically merge every `dev_<name>.yml` ChainLedger in a directory
 * into one team ledger. Pure except for the directory read — the merge math
 * itself is `mergeTeamLedgers`. Returns the merged ledger as YAML plus a
 * rendered team resume brief, ready for the CLI to write/print.
 */
export function mergeTeamLedgersFromDir(dir: string): DirMergeResult {
  const files = readdirSync(dir)
    .filter((f) => DEV_FILE.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(
      `No developer ledgers found in ${dir}. Expected files named dev_<name>.yml.`,
    );
  }

  const inputs: TeamInput[] = files.map((f) => ({
    author: authorOf(f),
    ledger: parseLedger(join(dir, f)),
  }));

  const result = mergeTeamLedgers(inputs);
  return {
    result,
    teamYaml: YAML.stringify(result.teamLedger),
    resume: renderResumeBrief(result.teamLedger),
    authors: inputs.map((i) => i.author),
  };
}
