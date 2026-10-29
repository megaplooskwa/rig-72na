import type { NightOnDisk, Status } from '../status.js';

// Missing data renders as `—`, never an empty cell and never dropped (styleguide).
const DASH = '—';

// The counts sit beside the link; a night that retried or failed carries the layout's `.warn`.
function NightCounts({ night }: { night: NightOnDisk }) {
  if (night.counts === null) {
    return <span class="mute">{DASH}</span>;
  }
  const { ok, retry, fail } = night.counts;
  const cls = retry > 0 || fail > 0 ? 'warn' : 'mute';
  return <span class={cls}>{`ok ${ok} · retry ${retry} · fail ${fail}`}</span>;
}

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map((n) => (
            <li>
              <a href={`/digest/${n.night}`}>{n.night}</a>{' '}
              <NightCounts night={n} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
