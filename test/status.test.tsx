import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night on disk to its digest, with its counts beside it', async () => {
    const res = await createApp(config).request('/');
    const html = await res.text();

    // Both nights on disk link to a digest (plan.md § 2c).
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('href="/digest/2026-10-28"');

    // 2026-10-27: four rows, all `ok`. 2026-10-28: four `ok`, one `fail`.
    const board = html.slice(html.indexOf('nights on disk'));
    expect(board).toMatch(/2026-10-27<\/a>[\s\S]*?ok 4 · retry 0 · fail 0/);
    expect(board).toMatch(/2026-10-28<\/a>[\s\S]*?ok 4 · retry 0 · fail 1/);
    // ...and a `fail` count wants attention.
    expect(board).toContain('class="warn"');
  });

  it('links every night to a digest that answers 200', async () => {
    const app = createApp(config);
    const html = await (await app.request('/')).text();
    const nights = [...html.matchAll(/href="(\/digest\/\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);

    expect(nights.sort()).toEqual(['/digest/2026-10-27', '/digest/2026-10-28']);
    for (const href of nights) {
      const res = await app.request(href);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('digest ·');
    }
  });

  it('keeps a night whose file cannot be read, linking it with `—` counts', async () => {
    // A directory named like a run log lists as a night but cannot be read: the row stays.
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-nights-'));
    mkdirSync(join(runsDir, '2026-10-24.jsonl'));
    writeFileSync(
      join(runsDir, '2026-10-25.jsonl'),
      JSON.stringify({ at: '2026-10-25T01:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }) + '\n',
    );

    const res = await createApp({ ...config, runsDir }).request('/');
    const html = await res.text();
    const board = html.slice(html.indexOf('nights on disk'));

    // nothing is dropped: both nights are listed and linked
    expect(board).toContain('href="/digest/2026-10-24"');
    expect(board).toContain('href="/digest/2026-10-25"');
    // the unreadable night shows `—`, not invented zeros
    expect(board).toMatch(/2026-10-24<\/a>[\s\S]*?—/);
    expect(board).not.toMatch(/2026-10-24<\/a>[\s\S]*?ok \d/);
    expect(board).toMatch(/2026-10-25<\/a>[\s\S]*?ok 1 · retry 0 · fail 0/);
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
