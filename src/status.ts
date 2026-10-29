import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lastBeat, type Beat } from './heartbeat.js';

/** Rows per last status for one night. `null` on the board when the night's file cannot be read. */
export type NightCounts = { ok: number; retry: number; fail: number };

/**
 * One night on disk, paired with the counts of its rows by last status.
 *
 * `counts` is `null` when the file cannot be read: the row stays on the board (nothing is
 * dropped) and renders `—`, never invented zeros.
 */
export type NightOnDisk = {
  night: string;
  counts: NightCounts | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightOnDisk[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Reads one night through the same reader the digest page uses (`readNight`), so the counts on
 * the board and the rows on the digest can never disagree (ADR 0001). A row is counted once, by
 * its `lastStatus`.
 */
function nightOnDisk(runsDir: string, night: string): NightOnDisk {
  const digest = readNight(runsDir, night);
  if (digest === null) {
    return { night, counts: null };
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of digest.rows) {
    counts[row.lastStatus] += 1;
  }
  return { night, counts };
}

// File IO stays here, not in the view: the view gets plain data (styleguide).
export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => nightOnDisk(config.runsDir, night)),
  };
}
