import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunStatus } from './types.js';

/**
 * Run log reader. Plan: plan.md § 1.
 *
 * Reads `runs/<night>.jsonl` into one row per job. This is the only reader: the page, the JSON
 * and the board link all call it, so they can never disagree (ADR 0001).
 */

function isRunStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

type LogLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

// Parse one line at the edge: unknown in, typed LogLine or null out. Never throws.
function parseLine(text: string): LogLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.at !== 'string' || typeof rec.job !== 'string') return null;
  if (!isRunStatus(rec.status)) return null;
  return {
    at: rec.at,
    job: rec.job,
    status: rec.status,
    owner: typeof rec.owner === 'string' ? rec.owner : null,
    error: typeof rec.error === 'string' ? rec.error : null,
  };
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  // Rows keep the order jobs first appear in the log, so the page and the JSON share one order.
  const rows: DigestRow[] = [];
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const parsed = parseLine(line);
    if (parsed === null) {
      badLines += 1;
      continue;
    }

    let row = byJob.get(parsed.job);
    if (row === undefined) {
      row = {
        job: parsed.job,
        owner: parsed.owner,
        runs: 0,
        retries: 0,
        lastStatus: parsed.status,
        lastError: parsed.error,
        firstAt: parsed.at,
        lastAt: parsed.at,
      };
      byJob.set(parsed.job, row);
      rows.push(row);
    }

    row.runs += 1;
    if (parsed.status === 'retry') row.retries += 1;
    row.lastStatus = parsed.status;
    if (parsed.error !== null) row.lastError = parsed.error;
    if (parsed.owner !== null) row.owner = parsed.owner;
    row.lastAt = parsed.at;
  }

  return { night, rows, badLines };
}
