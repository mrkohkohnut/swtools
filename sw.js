// Pure game logic: no DOM. Loaded by index.html and by test.js (node).
const STAT = { 1: 'HP', 2: 'HP%', 3: 'ATK', 4: 'ATK%', 5: 'DEF', 6: 'DEF%', 8: 'SPD', 9: 'CRI Rate', 10: 'CRI Dmg', 11: 'RES', 12: 'ACC' };
const PCT = { 2: 1, 4: 1, 6: 1, 9: 1, 10: 1, 11: 1, 12: 1 };
const SETS = {
  1: 'Energy', 2: 'Guard', 3: 'Swift', 4: 'Blade', 5: 'Rage', 6: 'Focus', 7: 'Endure', 8: 'Fatal', 10: 'Despair', 11: 'Vampire',
  13: 'Violent', 14: 'Nemesis', 15: 'Will', 16: 'Shield', 17: 'Revenge', 18: 'Destroy', 19: 'Fight', 20: 'Determination',
  21: 'Enhance', 22: 'Accuracy', 23: 'Tolerance', 24: 'Seal', 25: 'Intangible', 99: 'Immemorial',
};
const FOUR_SETS = { 3: 1, 5: 1, 8: 1, 10: 1, 11: 1, 13: 1 };
const setSize = (id) => (FOUR_SETS[id] ? 4 : id === 25 ? 1 : 2);
// 5 max rolls of a 6* rune; standard efficiency denominators
const SUB_MAX = { 1: 1875, 2: 40, 3: 100, 4: 40, 5: 100, 6: 40, 8: 30, 9: 30, 10: 35, 11: 40, 12: 40 };

const fmtStat = (t, v) => `${STAT[t] || '?'} +${v}${PCT[t] ? '%' : ''}`;

function subs(r) {
  return (r.sec_eff || []).map(([t, v, , g]) => [t, v + (g || 0)]);
}

// (main + sum(sub/max)) / 2.8 — main counts 1 for 6*, prorated below that.
// ponytail: lower-star main ratio is approximate.
function efficiency(r) {
  const all = subs(r);
  if (r.prefix_eff && r.prefix_eff[0]) all.push(r.prefix_eff);
  const sum = all.reduce((s, [t, v]) => s + v / (SUB_MAX[t] || 1e9), 0);
  const stars = r.class % 10;
  const main = stars >= 6 ? 1 : stars / 6;
  const rollsLeft = Math.max(0, 4 - Math.floor(Math.min(r.upgrade_curr, 12) / 3));
  return { eff: ((main + sum) / 2.8) * 100, max: ((main + sum + rollsLeft * 0.2) / 2.8) * 100 };
}

// Effects are summed into an array indexed by effect type; index 7 (unused by runes) holds set SPD%.
const SPD_PCT = 7;
const SET_BONUS = { 1: [2, 15], 2: [6, 15], 3: [SPD_PCT, 25], 4: [9, 12], 5: [10, 40], 6: [12, 20], 7: [11, 20], 8: [4, 35] };

function runeVec(r) {
  if (r._v) return r._v;
  const v = new Float64Array(13);
  for (const [t, x] of [r.pri_eff, r.prefix_eff, ...subs(r)]) if (t) v[t] += x;
  return (r._v = v);
}

function activeSets(counts) {
  const active = [];
  for (const id in counts) for (let n = Math.floor(counts[id] / setSize(+id)); n > 0; n--) active.push(+id);
  return active;
}

// SWEX unit: con*15 = base HP. Artifacts ignored. ponytail: add artifact stats when someone needs them.
function statsFrom(unit, add, active) {
  const a = Float64Array.from(add);
  for (const id of active) if (SET_BONUS[id]) a[SET_BONUS[id][0]] += SET_BONUS[id][1];
  const hp = unit.con * 15;
  return {
    HP: hp + Math.ceil((hp * a[2]) / 100) + a[1],
    ATK: unit.atk + Math.ceil((unit.atk * a[4]) / 100) + a[3],
    DEF: unit.def + Math.ceil((unit.def * a[6]) / 100) + a[5],
    SPD: unit.spd + Math.ceil((unit.spd * a[SPD_PCT]) / 100) + a[8],
    'CRI Rate': unit.critical_rate + a[9],
    'CRI Dmg': unit.critical_damage + a[10],
    RES: unit.resist + a[11],
    ACC: unit.accuracy + a[12],
    sets: active,
  };
}

function unitStats(unit, runes) {
  const add = new Float64Array(13);
  const counts = {};
  for (const r of runes) {
    runeVec(r).forEach((x, t) => (add[t] += x));
    counts[r.set_id] = (counts[r.set_id] || 0) + 1;
  }
  return statsFrom(unit, add, activeSets(counts));
}

const STAT_KEYS = ['HP', 'ATK', 'DEF', 'SPD', 'CRI Rate', 'CRI Dmg', 'RES', 'ACC'];
// stat key -> rune effect types that feed it, with rough weight for candidate ranking
const FEEDS = { HP: { 1: 1, 2: 1 }, ATK: { 3: 1, 4: 1 }, DEF: { 5: 1, 6: 1 }, SPD: { 8: 1 }, 'CRI Rate': { 9: 1 }, 'CRI Dmg': { 10: 1 }, RES: { 11: 1 }, ACC: { 12: 1 } };

function relevance(r, keys) {
  let s = 0;
  for (const [t, v] of [r.pri_eff, r.prefix_eff, ...subs(r)]) {
    if (!t) continue;
    for (const k of keys) if (FEEDS[k][t]) s += v / SUB_MAX[t];
  }
  return s;
}

// Find best rune sets for a unit.
// opts: { sets: [setId...], mains: {2: type, 4: type, 6: type}, min: {SPD: 200}, maximize: 'SPD', perSlot, limit }
// ponytail: top-N-per-slot pruning + eval budget, not a full search. Raise perSlot for better (slower) results.
function optimize(unit, runes, opts) {
  const { sets = [], mains = {}, min = {}, maximize = 'SPD', perSlot = 6, limit = 20, budget = 3e6 } = opts;
  const keys = [...new Set([maximize, ...Object.keys(min)])];
  const need = {};
  for (const s of sets) need[s] = (need[s] || 0) + setSize(s);
  const needTotal = Object.values(need).reduce((a, b) => a + b, 0);
  if (needTotal > 6) return { results: [], evaluated: 0, error: 'Selected sets need more than 6 runes' };

  const slots = [];
  for (let slot = 1; slot <= 6; slot++) {
    let pool = runes.filter((r) => r.slot_no === slot && (!mains[slot] || r.pri_eff[0] === +mains[slot]));
    const top = (arr) => arr.map((r) => [relevance(r, keys), r]).sort((a, b) => b[0] - a[0]).slice(0, perSlot).map((x) => x[1]);
    const pick = new Set(needTotal < 6 ? top(pool) : []);
    for (const s in need) top(pool.filter((r) => r.set_id === +s)).forEach((r) => pick.add(r));
    slots.push([...pick]);
  }

  const results = [];
  const chosen = [];
  const count = {};
  const add = new Float64Array(13);
  let evaluated = 0;
  let floor = -Infinity;
  (function dfs(i) {
    if (evaluated >= budget) return;
    let missing = 0;
    for (const s in need) missing += Math.max(0, need[s] - (count[s] || 0));
    if (missing > 6 - i) return;
    if (i === 6) {
      evaluated++;
      const st = statsFrom(unit, add, activeSets(count));
      if (st[maximize] <= floor) return;
      for (const k in min) if (st[k] < min[k]) return;
      results.push({ stats: st, runes: [...chosen] });
      if (results.length > limit * 4) {
        results.sort((a, b) => b.stats[maximize] - a.stats[maximize]);
        results.length = limit;
        floor = results[limit - 1].stats[maximize];
      }
      return;
    }
    for (const r of slots[i]) {
      const v = runeVec(r);
      for (let t = 1; t < 13; t++) add[t] += v[t];
      chosen.push(r);
      count[r.set_id] = (count[r.set_id] || 0) + 1;
      dfs(i + 1);
      count[r.set_id]--;
      chosen.pop();
      for (let t = 1; t < 13; t++) add[t] -= v[t];
    }
  })(0);
  results.sort((a, b) => b.stats[maximize] - a.stats[maximize]);
  return { results: results.slice(0, limit), evaluated, capped: evaluated >= budget };
}

// ---- Speed ----
const leadBonus = (base, lead) => Math.ceil((base * lead) / 100);
const combatSpeed = (base, runeSpd, lead = 0) => base + runeSpd + leadBonus(base, lead);
// Strictly faster always moves first; equal speed is a coin flip, so +1.
const minRuneSpeed = (base, lead, enemyCombat) => Math.max(0, enemyCombat + 1 - base - leadBonus(base, lead));
// Same target as an SPD stat (base + runes, no lead), for optimizer minimums.
const minSpeedStat = (base, lead, enemyCombat) => base + minRuneSpeed(base, lead, enemyCombat);

// Opening turn order. Each tick ATB += speed * 7%; >=100 takes a turn, highest ATB first.
// units: [{ name, team, spd (combat speed), boost (ATB % given to allies after its turn) }]
function turnOrder(units) {
  const u = units.map((x, i) => ({ ...x, i, atb: x.atb || 0, done: false }));
  const order = [];
  for (let tick = 1; order.length < u.length && tick < 2000; tick++) {
    for (const x of u) if (!x.done) x.atb += x.spd * 0.07;
    for (;;) {
      const ready = u.filter((x) => !x.done && x.atb >= 100);
      if (!ready.length) break;
      const x = ready.reduce((a, b) => (b.atb > a.atb ? b : a));
      x.done = true;
      order.push({ i: x.i, name: x.name, team: x.team, tick });
      if (x.boost) for (const y of u) if (!y.done && y.team === x.team) y.atb += +x.boost;
    }
  }
  return order;
}

// Smallest combat speed for units[idx] so it moves before units[target].
function minSpeedBefore(units, idx, target, maxSpd = 500) {
  for (let s = 1; s <= maxSpd; s++) {
    // a hair under s so exact ties count as losing (equal speed is a coin flip in game)
    const trial = units.map((u, i) => (i === idx ? { ...u, spd: s - 1e-9 } : u));
    const order = turnOrder(trial).map((o) => o.i);
    if (order.indexOf(idx) !== -1 && order.indexOf(idx) < order.indexOf(target)) return s;
  }
  return null;
}

// ---- RTA ----
// Accepts JSON [{result, picks, opp_picks, bans, opp_bans, first}] or CSV with those headers.
// List fields separated by | or ;. result: win/loss (or w/l/1/0). first: me/opp.
function parseMatches(text) {
  text = text.trim();
  let rows;
  if (text[0] === '[') rows = JSON.parse(text);
  else {
    const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
    const h = head.split(',').map((s) => s.trim().toLowerCase());
    rows = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [h[i], v.trim()])));
  }
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[|;]/)).map((s) => String(s).trim()).filter(Boolean);
  return rows.map((r) => ({
    win: /^(w|win|1|true)$/i.test(String(r.result).trim()),
    picks: list(r.picks),
    opp: list(r.opp_picks),
    bans: list(r.bans),
    oppBans: list(r.opp_bans),
    first: String(r.first || '').toLowerCase() === 'me' ? true : String(r.first || '').toLowerCase() === 'opp' ? false : null,
  }));
}

function analyzeMatches(matches) {
  const mons = {};
  const m = (n) => (mons[n] ??= { name: n, picks: 0, wins: 0, bannedByOpp: 0, faced: 0, facedWins: 0, banned: 0 });
  const pairs = {};
  let wins = 0, fp = 0, fpWins = 0, sp = 0, spWins = 0;
  for (const g of matches) {
    if (g.win) wins++;
    if (g.first === true) { fp++; if (g.win) fpWins++; }
    if (g.first === false) { sp++; if (g.win) spWins++; }
    for (const n of g.picks) { m(n).picks++; if (g.win) m(n).wins++; }
    for (const n of g.opp) { m(n).faced++; if (g.win) m(n).facedWins++; }
    for (const n of g.oppBans) m(n).bannedByOpp++;
    for (const n of g.bans) m(n).banned++;
    const p = [...g.picks].sort();
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const k = p[i] + ' + ' + p[j];
        pairs[k] ??= { name: k, games: 0, wins: 0 };
        pairs[k].games++;
        if (g.win) pairs[k].wins++;
      }
  }
  return {
    games: matches.length, wins,
    firstPick: { games: fp, wins: fpWins }, secondPick: { games: sp, wins: spWins },
    monsters: Object.values(mons),
    pairs: Object.values(pairs),
  };
}

const SW = {
  STAT, SETS, STAT_KEYS, setSize, fmtStat, efficiency, unitStats, optimize,
  leadBonus, combatSpeed, minRuneSpeed, minSpeedStat, turnOrder, minSpeedBefore, parseMatches, analyzeMatches,
};
if (typeof module !== 'undefined') module.exports = SW;
