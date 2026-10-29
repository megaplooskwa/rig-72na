import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, NightDigest } from '../src/digest/types.js';

/**
 * Route tests for the digest page (§ 2a) and the digest JSON (§ 2b), driven through the REAL
 * reader (`src/digest/reader.ts`) against a temp runs dir — no stubbed reader here. `runs/` is
 * read-only, so every case builds its own throwaway dir with `mkdtempSync`.
 *
 * Plan: plan.md § 2d. Four cases per route: 200, 404 for a night with no file, the empty night,
 * and a night with a bad line — plus the page/JSON agreement the plan cares about (same jobs,
 * same order; ADR 0001).
 */

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A throwaway runs dir. `files` maps a night (`YYYY-MM-DD`) to its log body. */
function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(dir);
  for (const [night, body] of Object.entries(files)) {
    writeFileSync(join(dir, `${night}.jsonl`), body);
  }
  return dir;
}

const config = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

const app = (runsDir: string) => createApp(config(runsDir));

const line = (
  at: string,
  job: string,
  status: 'ok' | 'retry' | 'fail',
  owner: string | null,
  error?: string,
): string =>
  JSON.stringify(error === undefined ? { at, job, status, owner } : { at, job, status, owner, error });

// Deliberately out of order in the file: the reader sorts by job, and both routes must show
// that sorted order. `fixtures/refresh` retries 3 times (>= 3, marked); `notes/backup` fails.
const MIXED_NIGHT = '2026-10-20';
const MIXED_BODY = [
  line('2026-10-20T04:00:01+01:00', 'notes/backup', 'fail', 'lane-07', 'quota exceeded'),
  line('2026-10-20T23:00:06+01:00', 'lane/sync', 'ok', 'rook'),
  line('2026-10-21T01:30:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  line('2026-10-21T01:31:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  line('2026-10-21T01:33:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  line('2026-10-21T02:00:06+01:00', 'lane/sync', 'ok', 'rook'),
].join('\n');

const MIXED_JOBS = ['fixtures/refresh', 'lane/sync', 'notes/backup'];

type JsonBody = { night: string; rows: DigestRow[]; badLines: number };

describe('digest routes · a night with rows (200)', () => {
  it('serves the page as HTML with one table, rows in reader order, markers and the banner', async () => {
    process.env.LANE_MARKER = 'ROUTE-MARKER';
    const dir = tempRuns({ [MIXED_NIGHT]: MIXED_BODY });

    const res = await app(dir).request(`/digest/${MIXED_NIGHT}`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    // the usual layout rides on every page
    expect(html).toContain('ROUTE-MARKER');
    expect(html).toContain(`digest · ${MIXED_NIGHT}`);
    // one table, rows exactly as the real reader sorted them
    expect(html.match(/<table>/g)?.length).toBe(1);
    expect(html.indexOf('fixtures/refresh')).toBeLessThan(html.indexOf('lane/sync'));
    expect(html.indexOf('lane/sync')).toBeLessThan(html.indexOf('notes/backup'));
    // retries >= 3 and any fail are marked
    expect(html).toContain('class="warn"');
    // a null-owner job would render `—`; here every owner is present
    expect(html).toContain('lane-07');
    // times keep the log's offset (no UTC conversion)
    expect(html).toContain('2026-10-21T01:30:00+01:00');
    expect(html).toContain('2026-10-20T04:00:01+01:00');
  });

  it('serves the JSON with the same night, the same rows, in the same order', async () => {
    const dir = tempRuns({ [MIXED_NIGHT]: MIXED_BODY });

    const res = await app(dir).request(`/api/digest/${MIXED_NIGHT}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as JsonBody;
    expect(body.night).toBe(MIXED_NIGHT);
    expect(body.rows.map((r) => r.job)).toEqual(MIXED_JOBS);
    expect(body.rows[0]).toMatchObject({
      job: 'fixtures/refresh',
      runs: 3,
      retries: 3,
      lastStatus: 'retry',
      lastError: 'upstream 503',
    });
    expect(body.rows[2]).toMatchObject({ job: 'notes/backup', lastStatus: 'fail' });
  });

  it('agrees between the page and the JSON: same jobs, same order', async () => {
    const dir = tempRuns({ [MIXED_NIGHT]: MIXED_BODY });
    const request = app(dir);

    const pageHtml = await (await request.request(`/digest/${MIXED_NIGHT}`)).text();
    const json = (await (await request.request(`/api/digest/${MIXED_NIGHT}`)).json()) as JsonBody;

    const jsonJobs = json.rows.map((r) => r.job);
    expect(jsonJobs).toEqual(MIXED_JOBS);

    // the page shows the jobs in exactly the JSON's order
    const pageOrder = [...jsonJobs].sort((a, b) => pageHtml.indexOf(a) - pageHtml.indexOf(b));
    expect(pageOrder).toEqual(jsonJobs);
    for (const job of jsonJobs) {
      expect(pageHtml).toContain(job);
    }
  });
});

describe('digest routes · a night with no file (404)', () => {
  it('404s the page', async () => {
    const res = await app(tempRuns({})).request('/digest/2099-01-01');
    expect(res.status).toBe(404);
  });

  it('404s the JSON with a night and an error', async () => {
    const res = await app(tempRuns({})).request('/api/digest/2099-01-01');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { night: string };
    expect(body.night).toBe('2099-01-01');
  });
});

describe('digest routes · the empty night (200)', () => {
  const EMPTY_NIGHT = '2026-10-19';

  it('renders "nothing ran" and no table', async () => {
    const dir = tempRuns({ [EMPTY_NIGHT]: '' });
    const res = await app(dir).request(`/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('returns 200 with no rows and no bad lines', async () => {
    const dir = tempRuns({ [EMPTY_NIGHT]: '' });
    const res = await app(dir).request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as NightDigest & { night: string }).toEqual({
      night: EMPTY_NIGHT,
      rows: [],
      badLines: 0,
    });
  });
});

describe('digest routes · a night with a bad line (200)', () => {
  const BAD_NIGHT = '2026-10-18';
  // one good line, one non-JSON line, one line that parses but is not a log line
  const BAD_BODY = [
    line('2026-10-18T23:00:00+01:00', 'lane/sync', 'ok', 'rook'),
    'this is not json',
    '{"job":"no-at"}',
  ].join('\n');

  it('counts the bad lines, keeps the rest, and still renders', async () => {
    const dir = tempRuns({ [BAD_NIGHT]: BAD_BODY });
    const res = await app(dir).request(`/digest/${BAD_NIGHT}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('lane/sync');
    expect(html).toContain('2 unparseable lines');
  });

  it('reports the same bad-line count in the JSON', async () => {
    const dir = tempRuns({ [BAD_NIGHT]: BAD_BODY });
    const res = await app(dir).request(`/api/digest/${BAD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonBody;
    expect(body.badLines).toBe(2);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync']);
  });

  it('agrees between the page and the JSON on the bad-line count', async () => {
    const dir = tempRuns({ [BAD_NIGHT]: BAD_BODY });
    const request = app(dir);

    const pageHtml = await (await request.request(`/digest/${BAD_NIGHT}`)).text();
    const json = (await (await request.request(`/api/digest/${BAD_NIGHT}`)).json()) as JsonBody;

    expect(json.badLines).toBe(2);
    expect(pageHtml).toContain(`${json.badLines} unparseable lines`);
  });
});
