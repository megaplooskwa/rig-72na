/**
 * Digest types. This file is the contract section 2 builds against: the page, the JSON and the
 * board link all render `DigestRow`s, so the shape is fixed here, before the reader exists.
 *
 * Plan: plan.md § 1.
 */

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One row per job, for one night. Aggregated from the lines of `runs/<night>.jsonl`. */
export type DigestRow = {
  job: string;
  /** `null` when the log line carries no owner. Rendered as `—`, never dropped. */
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** The `error` of the newest line that has one, or `null` if no line does. */
  lastError: string | null;
  /** `at` of the oldest line for this job, offset kept as it is in the log. */
  firstAt: string;
  /** `at` of the newest line for this job, offset kept as it is in the log. */
  lastAt: string;
};

/** One night's rows, plus the lines the reader could not parse. */
export type NightDigest = {
  /** `YYYY-MM-DD`, the part of the file name. */
  night: string;
  rows: DigestRow[];
  /** Counted, never thrown: a bad line does not stop the night from rendering. */
  badLines: number;
};

/**
 * Reads `runs/<night>.jsonl` into one row per job.
 *
 * Returns `null` when that night has no file, so the caller can answer 404. An empty file is not
 * missing: it reads as `{ rows: [], badLines: 0 }`.
 */
export declare function readNight(runsDir: string, night: string): NightDigest | null;
