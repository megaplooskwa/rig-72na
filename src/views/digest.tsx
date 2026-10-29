import type { DigestRow, NightDigest } from '../digest/types.js';

// Missing data renders as `—`, never dropped and never an empty cell (styleguide).
const DASH = '—';

function cell(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? DASH : value;
}

// A row is worth a second look when it retried hard or ended in `fail`; the layout's `.warn`
// carries that. `retries >= 3` marks the count, `fail` marks the whole row.
function rowClass(row: DigestRow): string | undefined {
  return row.lastStatus === 'fail' ? 'warn' : undefined;
}

function retriesClass(row: DigestRow): string | undefined {
  return row.retries >= 3 ? 'warn' : undefined;
}

export function Digest({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 ? (
        <p class="mute">
          {digest.badLines} unparseable {digest.badLines === 1 ? 'line' : 'lines'}
        </p>
      ) : null}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first seen</th>
              <th>last seen</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr class={rowClass(row)}>
                <td>{row.job}</td>
                <td>{cell(row.owner)}</td>
                <td>{row.runs}</td>
                <td class={retriesClass(row)}>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{cell(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
