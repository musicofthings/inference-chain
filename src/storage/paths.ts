import { join } from 'node:path';

export const IC_DIR = '.inference-chain';

export const SUBDIRS = [
  'inbox',
  'briefs',
  'updates',
  'evolutions',
  'resumes',
  'prompts',
  'locks',
] as const;

export function p(...segments: string[]): string {
  return join(process.cwd(), ...segments);
}

export function ic(...segments: string[]): string {
  return join(process.cwd(), IC_DIR, ...segments);
}

export const PATHS = {
  root: () => ic(),
  db: () => ic('chain.db'),
  ledgerJsonl: () => ic('ledger.jsonl'),
  projectYml: () => ic('project.yml'),
  currentYml: () => ic('current.yml'),
  inboxUpdate: () => ic('inbox', 'latest-update.yml'),
  inboxBrief: () => ic('inbox', 'latest-brief.yml'),
  inboxEvolution: () => ic('inbox', 'latest-evolution.yml'),
  resumeLatest: () => ic('resumes', 'resume_latest.md'),
};
