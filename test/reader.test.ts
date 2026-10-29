import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

// `runs/` is read-only: tests read the real fixtures as-is, and use a temp dir for anything else.
const runsDir = 'runs';

const tempDirs: string[] = [];

function makeRunsDir(content: string | null, night = '2026-01-02'): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  tempDirs.push(dir);
  if (content !== null) {
    writeFileSync(join(dir, `${night}.jsonl`), content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('readNight', () => {
  it('aggregates 2026-10-28 into one row per job, sorted by job', () => {
    const digest = readNight(runsDir, '2026-10-28');

    expect(digest).not.toBeNull();
    expect(digest!.night).toBe('2026-10-28');
    expect(digest!.badLines).toBe(1); // the file's last line is truncated
    expect(digest!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps the row of a job whose owner is null', () => {
    const digest = readNight(runsDir, '2026-10-28');

    expect(digest!.rows.find((r) => r.job === 'digest/render')).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
  });

  it('counts runs and retries, and takes the newest status, error and time', () => {
    const digest = readNight(runsDir, '2026-10-28');
    const byJob = new Map(digest!.rows.map((r) => [r.job, r]));

    expect(byJob.get('lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });

    expect(byJob.get('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });

    expect(byJob.get('notes/backup')).toEqual({
      job: 'notes/backup',
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-10-29T04:00:01+01:00',
      lastAt: '2026-10-29T04:00:01+01:00',
    });
  });

  it('returns null when the night has no file', () => {
    expect(readNight(runsDir, '1999-01-01')).toBeNull();
  });

  it('reads an empty file as no rows and no bad lines', () => {
    const dir = makeRunsDir('');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
    });
  });

  it('counts unparsable lines without throwing and still renders the rest', () => {
    const good = '{"at":"2026-02-01T01:00:00+01:00","job":"a/job","status":"ok","owner":"rook"}';
    const dir = makeRunsDir(`${good}\nnot json\n{"job":"no-at"}\n`);

    const digest = readNight(dir, '2026-01-02');

    expect(digest!.badLines).toBe(2);
    expect(digest!.rows).toHaveLength(1);
    expect(digest!.rows[0]!.job).toBe('a/job');
  });

  it('keeps the offset from the log', () => {
    const line = '{"at":"2026-02-01T01:00:00+05:30","job":"a/job","status":"ok","owner":null}';
    const dir = makeRunsDir(`${line}\n`);

    const digest = readNight(dir, '2026-01-02');

    expect(digest!.rows[0]!.firstAt).toBe('2026-02-01T01:00:00+05:30');
    expect(digest!.rows[0]!.lastAt).toBe('2026-02-01T01:00:00+05:30');
  });
});
