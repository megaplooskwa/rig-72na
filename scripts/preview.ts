/**
 * Preview for review: renders one rig page to a single self-contained HTML file.
 *
 * Plan: plan.md § 3. See also docs/adr/0001 (the page is self-contained: inline stylesheet,
 * no client JS, so a saved copy opens on its own) and docs/adr/0003 (previews are public and
 * short-lived, and no preview lives in the repo — the output is written under the git-ignored
 * `var/` tree).
 *
 *   npm run preview -- [night] [output]
 *
 *   night   the night whose digest to render; defaults to 2026-10-28.
 *   output  the file to write; defaults to var/preview/digest-<night>.html.
 *
 * It goes through the app itself (`createApp(loadConfig())` plus `app.request(...)`), not a
 * browser and not a headless tool: the bytes written are the same bytes the server would send.
 * A night with no run log fails with a message and a non-zero exit code; it never writes an
 * empty file.
 *
 * The banner shows this lane's marker, read from `.env` exactly as the server reads it
 * (LANE_MARKER shows in the banner; unset renders "no marker set"). The same command run with
 * LANE_MARKER unset is what takes the marker off the published copy (plan.md § 4).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const DEFAULT_NIGHT = '2026-10-28';

export function defaultOutputPath(night: string): string {
  return `var/preview/digest-${night}.html`;
}

async function main(): Promise<void> {
  const night = process.argv[2] ?? DEFAULT_NIGHT;
  const output = process.argv[3] ?? defaultOutputPath(night);

  const app = createApp(loadConfig());
  const res = await app.request(`/digest/${night}`);

  if (!res.ok) {
    console.error(
      `preview: ${night}: no digest page (HTTP ${res.status}) — expected runs/${night}.jsonl`,
    );
    process.exitCode = 1;
    return;
  }

  const html = await res.text();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, html);
  console.log(`preview: ${night} → ${output} (${Buffer.byteLength(html)} bytes)`);
}

await main();
