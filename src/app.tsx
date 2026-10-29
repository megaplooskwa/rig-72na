import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Digest } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  // Plan: plan.md § 2a.
  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (digest === null) return c.notFound();
    return c.html(
      <Layout title={`digest ${digest.night}`} lane={lane()}>
        <Digest digest={digest} />
      </Layout>,
    );
  });

  // The digest as JSON, for agents. Same rows as the page, by construction (ADR 0001).
  // Plan: plan.md § 2b.
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (digest === null) {
      return c.json({ night, error: 'no run log for that night' }, 404);
    }
    // `badLines` rides along so the page and the JSON tell the same story (ADR 0001).
    return c.json({ night: digest.night, rows: digest.rows, badLines: digest.badLines });
  });

  return app;
}
