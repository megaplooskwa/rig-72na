/**
 * Run log reader: reads `runs/<night>.jsonl` into one row per job.
 *
 * Plan: plan.md § 1. Contract: `src/digest/types.ts` (never edited here).
 *
 * Lines are parsed at the edge and validated before use; a line that does not parse as a log
 * line is counted (`badLines`), never thrown — the night still renders. Times keep the offset
 * from the log; they are never converted to UTC.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** One validated log line. `owner` and `error` are normalised to `null` when absent. */
type LogLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

/**
 * Turns one raw line into a `LogLine`, or `null` when the line is not a valid log line.
 * Any JSON value that is not an object carrying a string `at`, a string `job` and a
 * `ok | retry | fail` status is rejected.
 */
function parseLine(raw: string): LogLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) {
    return null;
  }
  if (owner !== undefined && owner !== null && typeof owner !== 'string') {
    return null;
  }
  if (error !== undefined && typeof error !== 'string') {
    return null;
  }

  return {
    at,
    job,
    status,
    owner: typeof owner === 'string' ? owner : null,
    error: typeof error === 'string' ? error : null,
  };
}

type Acc = DigestRow & {
  /** `Date.parse(at)` of the oldest / newest line seen, for picking the first and last. */
  firstTime: number;
  lastTime: number;
  /** `Date.parse(at)` of the newest line that carried an error, or `-Infinity`. */
  lastErrorTime: number;
};

/**
 * Reads `runs/<night>.jsonl` into one row per job.
 *
 * Returns `null` when the file does not exist (the caller answers 404). An empty file is not
 * missing: it reads as `{ rows: [], badLines: 0 }`. Rows are sorted by `job` ascending, so the
 * digest page and the digest JSON can never disagree (ADR 0001).
 */
export function readNight(runsDir: string, night: string): NightDigest | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const byJob = new Map<string, Acc>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') {
      continue;
    }

    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }

    const time = Date.parse(line.at);
    const acc = byJob.get(line.job);
    if (acc === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error,
        firstAt: line.at,
        lastAt: line.at,
        firstTime: time,
        lastTime: time,
        lastErrorTime: line.error === null ? Number.NEGATIVE_INFINITY : time,
      });
      continue;
    }

    acc.runs += 1;
    if (line.status === 'retry') {
      acc.retries += 1;
    }
    if (line.error !== null && time >= acc.lastErrorTime) {
      acc.lastError = line.error;
      acc.lastErrorTime = time;
    }
    if (time >= acc.lastTime) {
      acc.lastTime = time;
      acc.lastAt = line.at;
      acc.lastStatus = line.status;
      acc.owner = line.owner;
    }
    if (time <= acc.firstTime) {
      acc.firstTime = time;
      acc.firstAt = line.at;
    }
  }

  const rows: DigestRow[] = [];
  for (const acc of byJob.values()) {
    rows.push({
      job: acc.job,
      owner: acc.owner,
      runs: acc.runs,
      retries: acc.retries,
      lastStatus: acc.lastStatus,
      lastError: acc.lastError,
      firstAt: acc.firstAt,
      lastAt: acc.lastAt,
    });
  }
  rows.sort((a, b) => a.job.localeCompare(b.job));

  return { night, rows, badLines };
}
