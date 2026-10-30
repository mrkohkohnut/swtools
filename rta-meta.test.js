'use strict';
// Synthetic fixtures are unit-test inputs, never published as collected data.
const test = require('node:test');
const assert = require('node:assert/strict');
const Meta = require('./rta-meta.js');

function snapshot() {
  return {
    schemaVersion: 1, generatedAt: '2026-10-30T05:00:00.000Z',
    source: { name: 'SWRT', url: 'https://m.swranking.com/', scope: 'Public replay feed, source level 1', reportedTotal: 1000 },
    season: '39', patch: 'V9.3.6', matches: 10, firstPickGames: 10, firstPickWins: 6,
    windowStart: '2026-10-28 14:00:00', windowEnd: '2026-10-28 15:00:00', skipped: 0,
    monsters: [
      { id: 101, name: 'Same name', element: 'Water', picks: 8, bans: 2, played: 6, wins: 4, firstPicks: 3 },
      { id: 102, name: 'Same name', element: 'Wind', picks: 4, bans: 1, played: 3, wins: 1, firstPicks: 2 },
    ],
    pairs: [{ ids: [101, 102], games: 3, wins: 1 }],
  };
}

test('public boot never fetches the bundled account export', () => {
  const fs = require('node:fs');
  const app = fs.readFileSync(require.resolve('./app.js'), 'utf8');
  assert.doesNotMatch(app, /fetch\(['"]data\/account\.json/);
  assert.match(app, /if \(saved\) load\(saved\)/);
});

test('accepts a versioned public snapshot without account data', () => {
  const data = snapshot();
  assert.equal(Meta.validate(data), data);
});

test('filters monsters by stable ID, name, element, sample size and private ownership', () => {
  const data = snapshot();
  assert.deepEqual(Meta.filter(data, { search: 'same', element: 'Water', minGames: 5 }).map(r => r.id), [101]);
  assert.deepEqual(Meta.filter(data, { search: '102' }).map(r => r.id), [102]);
  assert.deepEqual(Meta.filter(data, { ownedIds: new Set([102]) }).map(r => r.id), [102]);
  assert.deepEqual(Meta.filter(data, { ownedIds: new Set() }), []);
  assert.deepEqual(Meta.filter(data, { minGames: 7 }), []);
  assert.equal(Meta.filter(data, { minGames: -1 }).length, 2);
  assert.equal(data.monsters.length, 2);
});

test('uses explicit denominators and never reports a zero-sample win rate', () => {
  const row = snapshot().monsters[0];
  const rates = Meta.rates(row, 10);
  assert.equal(rates.pickRate, 80);
  assert.equal(rates.banRate, 25);
  assert.ok(Math.abs(rates.winRate - 100 * 4 / 6) < 1e-9);
  assert.deepEqual(Meta.rates({ picks: 0, bans: 0, played: 0, wins: 0 }, 0), { pickRate: null, banRate: null, winRate: null });
});

test('pair filtering preserves IDs even when two monsters share the same name', () => {
  const data = snapshot();
  const rows = Meta.pairRows(data, { minGames: 2, search: 'Wind' });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].ids, [101, 102]);
  assert.equal(rows[0].names, 'Same name (Water) + Same name (Wind)');
  assert.deepEqual(Meta.pairRows(data, { minGames: 4 }), []);
  assert.deepEqual(Meta.pairRows(data, { ownedIds: new Set([101]) }), []);
});

test('marks cached snapshots stale after two hours without pretending source dates are UTC', () => {
  const data = snapshot();
  assert.equal(Meta.isStale(data, Date.parse('2026-10-30T06:00:00Z')), false);
  assert.equal(Meta.isStale(data, Date.parse('2026-10-30T08:00:01Z')), true);
  assert.equal(data.windowEnd, '2026-10-28 15:00:00');
});

test('rejects malformed, inconsistent, duplicate or unsafe snapshot fields', () => {
  const cases = [
    d => { d.schemaVersion = 2; },
    d => { d.generatedAt = 'not-a-date'; },
    d => { d.matches = -1; },
    d => { d.firstPickWins = 11; },
    d => { d.source.url = 'javascript:alert(1)'; },
    d => { d.monsters[0].wins = 99; },
    d => { d.monsters[0].played = 5; },
    d => { d.monsters.push({ ...d.monsters[0] }); },
    d => { d.monsters[0].id = '__proto__'; },
    d => { d.monsters[0].element = '<svg>'; },
    d => { d.pairs[0].ids[0] = 999; },
    d => { d.pairs[0].wins = 4; },
    d => { d.pairs.push({ ...d.pairs[0] }); },
    d => { d.monsters = null; },
  ];
  for (const mutate of cases) {
    const data = snapshot();
    mutate(data);
    assert.throws(() => Meta.validate(data), /snapshot/i);
  }
});
