/* Public RTA snapshot helpers. No account data or DOM access. */
(function (root) {
  'use strict';
  function validate(data) {
    const fail = () => { throw new Error('Invalid RTA snapshot'); };
    const count = n => Number.isSafeInteger(n) && n >= 0;
    const text = (s, max = 160) => typeof s === 'string' && s.length > 0 && s.length <= max;
    if (!data || data.schemaVersion !== 1) fail();
    if (!text(data.generatedAt) || !Number.isFinite(Date.parse(data.generatedAt))) fail();
    if (!data.source || data.source.name !== 'SWRT' || data.source.url !== 'https://m.swranking.com/'
      || !text(data.source.scope) || !count(data.source.reportedTotal)) fail();
    if (!text(data.season, 40) || !text(data.patch, 40) || !text(data.windowStart) || !text(data.windowEnd)
      || !count(data.matches) || !count(data.skipped) || !count(data.firstPickGames) || !count(data.firstPickWins)
      || data.firstPickGames > data.matches || data.firstPickWins > data.firstPickGames) fail();
    if (!Array.isArray(data.monsters) || data.monsters.length > 2000 || !Array.isArray(data.pairs) || data.pairs.length > 100000) fail();
    const ids = new Set();
    for (const row of data.monsters) {
      if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || ids.has(row.id) || !text(row.name)
        || !['Fire', 'Water', 'Wind', 'Light', 'Dark', 'Unknown'].includes(row.element)
        || !['picks', 'bans', 'played', 'wins', 'firstPicks'].every(k => count(row[k]))
        || row.picks !== row.played + row.bans || row.picks > data.matches
        || row.wins > row.played || row.firstPicks > row.picks) fail();
      ids.add(row.id);
    }
    const pairs = new Set();
    for (const row of data.pairs) {
      if (!row || !Array.isArray(row.ids) || row.ids.length !== 2 || row.ids[0] >= row.ids[1]
        || !row.ids.every(id => ids.has(id)) || !count(row.games) || !count(row.wins)
        || row.wins > row.games || row.games > data.matches || pairs.has(row.ids.join(':'))) fail();
      pairs.add(row.ids.join(':'));
    }
    return data;
  }
  function filter(data, opts = {}) {
    const search = String(opts.search || '').trim().toLocaleLowerCase();
    const min = Math.max(0, Number(opts.minGames) || 0);
    return data.monsters.filter(row => row.played >= min && (!opts.element || row.element === opts.element)
      && (!opts.ownedIds || opts.ownedIds.has(row.id))
      && (!search || `${row.name} ${row.element} ${row.id}`.toLocaleLowerCase().includes(search)));
  }
  function rates(row, matches) {
    return {
      pickRate: matches ? 100 * row.picks / matches : null,
      banRate: row.picks ? 100 * row.bans / row.picks : null,
      winRate: row.played ? 100 * row.wins / row.played : null,
    };
  }
  function pairRows(data, opts = {}) {
    const byId = new Map(data.monsters.map(row => [row.id, row]));
    const search = String(opts.search || '').trim().toLocaleLowerCase();
    const min = Math.max(0, Number(opts.minGames) || 0);
    return data.pairs.filter(row => {
      const members = row.ids.map(id => byId.get(id));
      return row.games >= min && (!opts.ownedIds || row.ids.every(id => opts.ownedIds.has(id)))
        && (!opts.element || members.some(m => m.element === opts.element))
        && (!search || members.some(m => `${m.name} ${m.element} ${m.id}`.toLocaleLowerCase().includes(search)));
    }).map(row => ({ ...row, names: row.ids.map(id => {
      const m = byId.get(id);
      return `${m.name} (${m.element})`;
    }).join(' + ') }));
  }
  function isStale(data, now = Date.now()) {
    return now - Date.parse(data.generatedAt) > 2 * 60 * 60 * 1000;
  }
  const api = { validate, filter, rates, pairRows, isStale };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RtaMeta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
