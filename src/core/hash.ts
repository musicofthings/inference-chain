import { createHash } from 'node:crypto';
import { canonicalJson } from './canonicalJson.js';

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashEvent(input: Record<string, unknown>): string {
  return sha256(canonicalJson(input));
}
