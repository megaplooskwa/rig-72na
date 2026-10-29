import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

// A throwaway runs dir: `runs/` is read-only.
function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  for (const [night, body] of Object.entries(files)) {
    writeFileSync(join(dir, `${night}.jsonl`), body);
  }
  return dir;
}

describe('digest JSON route', () => {
  it('returns the night and its rows, sorted by job', async () => {
    const dir = tempRuns({
      '2026-10-28': [
        '{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
        '{"at":"2026-10-28T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"at":"2026-10-29T01:00:04+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
        '{"at":"2026-10-29T02:00:03+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
        '{"at":"2026-10-29T02:00:33+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      ].join('\n'),
    });
    const res = await createApp(config(dir)).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(body.rows[0]).toMatchObject({ job: 'lane/sync', runs: 3, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(body.rows[1]).toMatchObject({ job: 'rig/rotate-logs', owner: 'lane-07', runs: 2 });
  });

  it('answers 404 as JSON for a night with no file', async () => {
    const res = await createApp(config(tempRuns({}))).request('/api/digest/2099-01-01');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.night).toBe('2099-01-01');
  });

  it('answers an empty night with 200 and no rows', async () => {
    const res = await createApp(config(tempRuns({ '2026-10-26': '' }))).request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-26', rows: [], badLines: 0 });
  });

  it('drops a bad line, keeps the rest, and keeps a null owner', async () => {
    const dir = tempRuns({
      '2026-10-25': [
        '{"at":"2026-10-25T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        'this is not json',
        '{"at":"2026-10-25T23:05:00+01:00","job":"notes/backup","status":"fail","owner":null,"error":"quota exceeded"}',
      ].join('\n'),
    });
    const res = await createApp(config(dir)).request('/api/digest/2026-10-25');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['lane/sync', 'notes/backup']);
    expect(body.rows[1]).toMatchObject({ job: 'notes/backup', owner: null, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('matches the page job order for the 2026-10-28 fixture', async () => {
    const res = await createApp(config('runs')).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });
});
