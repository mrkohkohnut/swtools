// node test.js
const assert = require('assert');
const SW = require('./sw.js');

const rune = (slot, set, pri, sec, extra = {}) => ({
  slot_no: slot, set_id: set, class: 6, upgrade_curr: 15, pri_eff: pri, prefix_eff: [0, 0], sec_eff: sec, ...extra,
});

// efficiency: 4 subs at 1 max roll each + 3 extra max rolls = 7 rolls * 0.2 => (1 + 1.4)/2.8
const r = rune(2, 3, [8, 42], [[2, 8, 0, 0], [4, 8, 0, 0], [9, 6, 0, 0], [10, 7 * 4, 0, 0]]);
assert.ok(Math.abs(SW.efficiency(r).eff - (2.4 / 2.8) * 100) < 1e-9);
assert.strictEqual(SW.efficiency({ ...r, upgrade_curr: 0 }).max > SW.efficiency(r).eff, true);

// stats: swift 4-set on base 100 speed => +25, plus 42 main + 10 sub
const unit = { con: 1000, atk: 800, def: 600, spd: 100, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0 };
const swift = [1, 2, 3, 4].map((s) => rune(s, 3, [3, 160], [[8, s === 1 ? 10 : 0, 0, 0]]));
const st = SW.unitStats(unit, [...swift, rune(5, 15, [1, 2448], []), rune(6, 15, [4, 63], [])]);
assert.strictEqual(st.SPD, 100 + 25 + 10);
assert.deepStrictEqual(st.sets.sort((a, b) => a - b), [3, 15]);
assert.strictEqual(st.ATK, 800 + Math.ceil(800 * 0.63) + 640);

// optimizer picks the speed rune when maximizing SPD with Swift+Will
const pool = [...swift, rune(2, 3, [8, 42], []), rune(5, 15, [1, 2448], []), rune(6, 15, [4, 63], []), rune(6, 1, [4, 63], [[8, 30, 0, 0]])];
const res = SW.optimize(unit, pool, { sets: [3, 15], maximize: 'SPD' });
assert.strictEqual(res.results[0].stats.SPD, 100 + 25 + 10 + 42);
assert.ok(res.results[0].stats.sets.includes(15));
assert.strictEqual(SW.optimize(unit, pool, { sets: [3, 15], min: { SPD: 999 } }).results.length, 0);

// speed
assert.strictEqual(SW.combatSpeed(101, 100, 24), 101 + 100 + 25);
assert.strictEqual(SW.minRuneSpeed(101, 24, 250), 250 + 1 - 101 - 25);

// turn order: faster first; ATB boost lets slower ally jump ahead of enemy
const team = [
  { name: 'Booster', team: 'A', spd: 300, boost: 30 },
  { name: 'Nuker', team: 'A', spd: 200 },
  { name: 'Enemy', team: 'B', spd: 250 },
];
assert.deepStrictEqual(SW.turnOrder(team).map((o) => o.name), ['Booster', 'Nuker', 'Enemy']);
assert.deepStrictEqual(SW.turnOrder(team.map((u) => ({ ...u, boost: 0 }))).map((o) => o.name), ['Booster', 'Enemy', 'Nuker']);
const s = SW.minSpeedBefore(team, 1, 2);
assert.ok(s < 250 && s > 1);
assert.deepStrictEqual(SW.turnOrder(team.map((u, i) => (i === 1 ? { ...u, spd: s } : u))).map((o) => o.name)[1], 'Nuker');
assert.notStrictEqual(SW.turnOrder(team.map((u, i) => (i === 1 ? { ...u, spd: s - 1 } : u))).map((o) => o.name)[1], 'Nuker');

// rta
const csv = 'result,picks,opp_picks,bans,opp_bans,first\nwin,A|B|C,X|Y,Z,C,me\nloss,A|B,X,Z,A,opp\nw,A|C,Y,,,me';
const a = SW.analyzeMatches(SW.parseMatches(csv));
assert.strictEqual(a.games, 3);
assert.strictEqual(a.wins, 2);
const A = a.monsters.find((m) => m.name === 'A');
assert.deepStrictEqual([A.picks, A.wins, A.bannedByOpp], [3, 2, 1]);
assert.deepStrictEqual(a.firstPick, { games: 2, wins: 2 });
assert.strictEqual(a.pairs.find((p) => p.name === 'A + B').games, 2);
assert.strictEqual(SW.parseMatches(JSON.stringify([{ result: 'win', picks: ['A'] }]))[0].win, true);

console.log('ok');
