import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

// Issue #2 owns the reader (`src/digest/reader.js`); it lands on main in parallel with this
// route, so the page's own behaviour is pinned here against the declared contract
// (`readNight(runsDir, night): NightDigest | null`) with the reader stubbed.
const nights: Record<string, NightDigest | null> = {
  '2026-10-28': {
    night: '2026-10-28',
    badLines: 1,
    rows: [
      {
        job: 'fixtures/refresh',
        owner: 'rook',
        runs: 4,
        retries: 3,
        lastStatus: 'ok',
        lastError: 'upstream 503',
        firstAt: '2026-10-28T01:30:00+01:00',
        lastAt: '2026-10-28T01:37:00+01:00',
      },
      {
        job: 'lane/sync',
        owner: null,
        runs: 8,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'lock held',
        firstAt: '2026-10-28T00:00:04+01:00',
        lastAt: '2026-10-28T23:00:06+01:00',
      },
      {
        job: 'notes/backup',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-28T04:00:01+01:00',
        lastAt: '2026-10-28T04:00:01+01:00',
      },
    ],
  },
  '2026-10-26': { night: '2026-10-26', badLines: 0, rows: [] },
};

vi.mock('../src/digest/reader.js', () => ({
  readNight: (_runsDir: string, night: string): NightDigest | null => nights[night] ?? null,
}));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest page', () => {
  it('renders one table, rows in reader order, with the lane banner', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    // one layout: the lane banner rides on every page
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('lane-07');
    expect(html).toContain('digest · 2026-10-28');
    // one table, rows as the reader sorted them
    expect(html.match(/<table>/g)?.length).toBe(1);
    expect(html.indexOf('fixtures/refresh')).toBeLessThan(html.indexOf('lane/sync'));
    expect(html.indexOf('lane/sync')).toBeLessThan(html.indexOf('notes/backup'));
    // missing data is `—`, never an empty cell
    expect(html).toContain('—');
    // retries >= 3 and fail are marked
    expect(html).toContain('class="warn"');
    // times keep the log's offset
    expect(html).toContain('2026-10-28T01:30:00+01:00');
    // a bad line is counted, not fatal
    expect(html).toContain('1 unparseable line');
  });

  it('404s for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2026-10-25');
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });
});
