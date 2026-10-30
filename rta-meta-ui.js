/* global RtaMeta, state, table, esc, monCell */
// Public statistics are separate from account imports and personal RTA logs.
const publicRtaState = { data: null, loading: null, error: '' };
const metaEl = id => document.getElementById(id);
const metaPercent = value => value === null ? '–' : `${value.toFixed(1)}%`;

function renderRtaMeta() {
  const data = publicRtaState.data;
  const status = metaEl('mStatus');
  if (!data) {
    status.textContent = publicRtaState.loading ? 'Loading public snapshot…'
      : publicRtaState.error || 'No public dataset configured. A permitted data source is required.';
    status.className = publicRtaState.error ? 'bad' : 'muted';
    return;
  }
  const stale = RtaMeta.isStale(data);
  const note = publicRtaState.loading ? ' Checking for a newer snapshot…'
    : publicRtaState.error ? ` Reload failed: ${publicRtaState.error} Showing the last loaded snapshot.`
      : stale ? ' Cached snapshot is over two hours old; the collector may be offline.' : '';
  status.className = stale || publicRtaState.error ? 'bad' : 'muted';
  // textContent is deliberate: never insert source-controlled metadata as HTML.
  status.textContent = `${data.source.name} · ${data.source.scope} · Season ${data.season} · ${data.patch}. `
    + `Collected ${new Date(data.generatedAt).toLocaleString()}. Source replay window: ${data.windowStart} → ${data.windowEnd} `
    + `(source time; timezone not supplied). This window can lag behind today.${note}`;
  const ownedIds = metaEl('mOwned').checked ? new Set(state.units.map(u => u.unit_master_id)) : null;
  metaEl('mOwnedNote').textContent = ownedIds && !ownedIds.size
    ? 'No monsters imported. Use the Import tab first; ownership data stays in this browser.'
    : 'Ownership filtering uses only your locally imported account; nothing is uploaded.';
  const opts = { search: metaEl('mSearch').value, element: metaEl('mElement').value,
    minGames: metaEl('mMin').value, ownedIds };
  const rows = RtaMeta.filter(data, opts).map(row => ({ ...row, ...RtaMeta.rates(row, data.matches) }));
  metaEl('mStats').innerHTML = `<div class="stats">
    <div class="stat"><span>Collected matches</span><b>${data.matches.toLocaleString()}</b></div>
    <div class="stat"><span>Monsters in sample</span><b>${data.monsters.length}</b></div>
    <div class="stat"><span>Matching monsters</span><b>${rows.length}</b></div>
    <div class="stat"><span>First-pick side win rate</span><b>${metaPercent(data.firstPickGames ? 100 * data.firstPickWins / data.firstPickGames : null)}</b><span>${data.firstPickGames} decided games</span></div>
  </div><p class="muted">Source reports ${data.source.reportedTotal.toLocaleString()} available records; only the ${data.matches.toLocaleString()} collected matches above are used here. ${data.skipped} invalid or unknown-result records skipped in the latest collection. Historical season completeness is not guaranteed.</p>`;
  table(metaEl('mTable'), [
    { k: 'name', label: 'Monster', f: r => `${monCell({ unit_master_id: r.id, name: r.name, element: r.element })} <span class="muted">${esc(r.element)}</span>` },
    { k: 'picks', label: 'Drafts' },
    { k: 'pickRate', label: 'Pick rate', f: r => metaPercent(r.pickRate) },
    { k: 'bans', label: 'Bans' },
    { k: 'banRate', label: 'Ban rate', f: r => metaPercent(r.banRate) },
    { k: 'played', label: 'Played' },
    { k: 'wins', label: 'Wins' },
    { k: 'winRate', label: 'Win rate', f: r => `<b>${metaPercent(r.winRate)}</b>${r.played < 30 ? ' <span class="muted">low n</span>' : ''}` },
    { k: 'firstPicks', label: 'First drafts' },
  ], rows, 'picks');
  const pairs = RtaMeta.pairRows(data, opts).map(row => ({ ...row, winRate: row.games ? 100 * row.wins / row.games : null }));
  table(metaEl('mPairs'), [
    { k: 'names', label: 'Pair' }, { k: 'games', label: 'Games' }, { k: 'wins', label: 'Wins' },
    { k: 'winRate', label: 'Win rate', f: r => `${metaPercent(r.winRate)}${r.games < 30 ? ' <span class="muted">low n</span>' : ''}` },
  ], pairs, 'games', 100);
}

async function loadRtaMeta() {
  if (publicRtaState.loading) return publicRtaState.loading;
  metaEl('mRefresh').disabled = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  publicRtaState.error = '';
  publicRtaState.loading = (async () => {
    try {
      const response = await fetch('rta-meta.json', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 404
        ? 'No public dataset configured. Waiting for a permitted data source.' : `Snapshot request failed (HTTP ${response.status}).`);
      const raw = await response.text();
      if (raw.length > 5 * 1024 * 1024) throw new Error('Public snapshot exceeds the size limit.');
      publicRtaState.data = RtaMeta.validate(JSON.parse(raw));
    } catch (error) {
      publicRtaState.error = error.name === 'AbortError' ? 'Snapshot request timed out.' : error.message;
    } finally {
      clearTimeout(timer);
      publicRtaState.loading = null;
      metaEl('mRefresh').disabled = false;
      renderRtaMeta();
    }
  })();
  renderRtaMeta();
  return publicRtaState.loading;
}

document.getElementById('nav').addEventListener('click', event => {
  if (event.target.dataset.tab === 'rtaMeta') {
    if (!publicRtaState.data || RtaMeta.isStale(publicRtaState.data)) loadRtaMeta();
    else renderRtaMeta();
  }
});
metaEl('mRefresh').onclick = loadRtaMeta;
for (const id of ['mSearch', 'mElement', 'mMin', 'mOwned']) metaEl(id).oninput = renderRtaMeta;
