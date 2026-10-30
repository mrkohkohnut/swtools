/* global SW */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota or private mode */ } },
};

const state = { units: [], runes: [], byId: {}, bestiary: store.get('bestiary') || {} };

// ---------- tabs ----------
$('#nav').onclick = (e) => {
  const t = e.target.dataset.tab;
  if (!t) return;
  $$('#nav button').forEach((b) => b.classList.toggle('on', b === e.target));
  $$('main section').forEach((s) => s.classList.toggle('on', s.id === t));
};

// ---------- generic sortable table ----------
// cols: [{ k, label, v?: row => sortValue, f?: row => html }]
function table(el, cols, rows, sortKey, max = 500) {
  el._s ??= { k: sortKey, desc: true };
  const s = el._s;
  const col = cols.find((c) => c.k === s.k) || cols[0];
  const val = col.v || ((r) => r[col.k]);
  const sorted = [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * (s.desc ? -1 : 1);
  });
  el.innerHTML = rows.length
    ? `<table><thead><tr>${cols.map((c) => `<th data-k="${c.k}">${c.label}${c.k === s.k ? (s.desc ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
       <tbody>${sorted.slice(0, max).map((r) => `<tr>${cols.map((c) => `<td>${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table>
       ${rows.length > max ? `<p class="muted">Showing ${max} of ${rows.length}.</p>` : ''}`
    : '<div class="empty">Nothing to show.</div>';
  el.querySelectorAll('th').forEach((th) => (th.onclick = () => {
    s.desc = s.k === th.dataset.k ? !s.desc : true;
    s.k = th.dataset.k;
    table(el, cols, rows, sortKey, max);
  }));
}

const options = (obj, any) => (any ? `<option value="">${any}</option>` : '') + Object.entries(obj).map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('');
const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '–');

// ---------- monsters ----------
const monName = (u) => state.bestiary[u.unit_master_id]?.name || `#${u.unit_master_id}`;
const monCell = (u) => {
  const b = state.bestiary[u.unit_master_id];
  return `<span class="mon">${b?.img ? `<img src="https://swarfarm.com/static/herders/images/monsters/${b.img}" alt="" loading="lazy">` : ''}${esc(monName(u))}</span>`;
};

// SWARFARM bestiary for names/icons; cached. Optional: app works with #ids if this fails.
async function loadBestiary() {
  if (Object.keys(state.bestiary).length) return;
  let url = 'https://swarfarm.com/api/v2/monsters/?page_size=1000';
  const out = {};
  try {
    while (url) {
      const j = await (await fetch(url)).json();
      for (const m of j.results) out[m.com2us_id] = { name: m.name, img: m.image_filename };
      url = j.next;
    }
    state.bestiary = out;
    store.set('bestiary', out);
    renderAll();
  } catch (e) {
    console.warn('Bestiary unavailable', e);
  }
}

// ---------- import ----------
function load(data) {
  const units = data.unit_list || [];
  const runes = [];
  for (const u of units) for (const r of Object.values(u.runes || {})) runes.push({ ...r, occupied_id: u.unit_id });
  for (const r of data.runes || []) runes.push({ ...r, occupied_id: 0 });
  for (const r of runes) Object.assign(r, SW.efficiency(r));
  state.units = units.sort((a, b) => b.class - a.class || b.unit_level - a.unit_level);
  state.runes = runes;
  state.byId = Object.fromEntries(units.map((u) => [u.unit_id, u]));
  state.wizard = data.wizard_info?.wizard_name;
  renderAll();
  loadBestiary();
}

function readFile(f) {
  f.text().then((t) => {
    try {
      const data = JSON.parse(t);
      load(data);
      store.set('account', data);
    } catch (e) {
      $('#summary').innerHTML = `<div class="empty bad">Could not read file: ${esc(e.message)}</div>`;
    }
  });
}
$('#file').onchange = (e) => e.target.files[0] && readFile(e.target.files[0]);
const drop = $('#drop');
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0]); };

function renderSummary() {
  const r = state.runes;
  if (!state.units.length) return;
  const avg = r.reduce((s, x) => s + x.eff, 0) / (r.length || 1);
  const speedSubs = r.map((x) => (x.sec_eff || []).find(([t]) => t === 8)).filter(Boolean).map(([, v, , g]) => v + (g || 0));
  $('#summary').innerHTML = `<h2>${esc(state.wizard || 'Account')}</h2><div class="stats">
    <div class="stat"><span>Monsters</span><b>${state.units.length}</b></div>
    <div class="stat"><span>Runes</span><b>${r.length}</b></div>
    <div class="stat"><span>Avg efficiency</span><b>${avg.toFixed(1)}%</b></div>
    <div class="stat"><span>Runes ≥ 100% eff</span><b>${r.filter((x) => x.eff >= 100).length}</b></div>
    <div class="stat"><span>Speed subs ≥ 20</span><b>${speedSubs.filter((v) => v >= 20).length}</b></div>
    <div class="stat"><span>Speed subs ≥ 25</span><b>${speedSubs.filter((v) => v >= 25).length}</b></div>
  </div>`;
}

// ---------- runes ----------
$('#fSet').innerHTML = options(SW.SETS, 'All');
$('#fMain').innerHTML = options(SW.STAT, 'All');
$('#fSub').innerHTML = options(SW.STAT, 'Any');
['#fSet', '#fSlot', '#fMain', '#fSub', '#fEff', '#fLoc'].forEach((s) => ($(s).oninput = renderRunes));

const runeSubs = (r) => [...(r.prefix_eff?.[0] ? [`<span class="chip">★ ${SW.fmtStat(...r.prefix_eff)}</span>`] : []),
  ...(r.sec_eff || []).map(([t, v, gem, g]) => `<span class="chip">${SW.fmtStat(t, v + (g || 0))}${gem ? ' ◆' : ''}${g ? ' ⚒' : ''}</span>`)].join('');
const owner = (r) => (r.occupied_id && state.byId[r.occupied_id] ? monCell(state.byId[r.occupied_id]) : '<span class="muted">Inventory</span>');

function renderRunes() {
  const set = +$('#fSet').value, slot = +$('#fSlot').value, main = +$('#fMain').value, sub = +$('#fSub').value;
  const eff = +$('#fEff').value, loc = $('#fLoc').value;
  const rows = state.runes.filter((r) => (!set || r.set_id === set) && (!slot || r.slot_no === slot) && (!main || r.pri_eff[0] === main)
    && (!sub || (r.sec_eff || []).some(([t]) => t === sub)) && r.eff >= eff
    && (!loc || (loc === 'eq') === !!r.occupied_id));
  const tiers = [[110, 'Hero (≥110%)'], [100, 'Great (≥100%)'], [85, 'Good (≥85%)'], [0, 'Rest']];
  $('#runeStats').innerHTML = `<div class="stats">${tiers.map(([t, n], i) => {
    const hi = i ? tiers[i - 1][0] : Infinity;
    return `<div class="stat"><span>${n}</span><b>${rows.filter((r) => r.eff >= t && r.eff < hi).length}</b></div>`;
  }).join('')}</div>`;
  table($('#runeTable'), [
    { k: 'set', label: 'Set', v: (r) => SW.SETS[r.set_id] || '', f: (r) => esc(SW.SETS[r.set_id] || r.set_id) },
    { k: 'slot_no', label: 'Slot' },
    { k: 'stars', label: '★', v: (r) => r.class % 10, f: (r) => `${r.class % 10}${r.class > 10 ? ' A' : ''}` },
    { k: 'upgrade_curr', label: 'Lvl', f: (r) => '+' + r.upgrade_curr },
    { k: 'main', label: 'Main', v: (r) => r.pri_eff[0], f: (r) => esc(SW.fmtStat(...r.pri_eff)) },
    { k: 'subs', label: 'Substats', v: (r) => (r.sec_eff || []).length, f: runeSubs },
    { k: 'eff', label: 'Eff', f: (r) => `<b>${r.eff.toFixed(1)}%</b>` },
    { k: 'max', label: 'Max eff', f: (r) => r.max.toFixed(1) + '%' },
    { k: 'owner', label: 'Equipped', v: (r) => (r.occupied_id ? monName(state.byId[r.occupied_id] || {}) : ''), f: owner },
  ], rows, 'eff');
}

// ---------- builder ----------
const STAT_OPTS = Object.fromEntries(SW.STAT_KEYS.map((k) => [k, k]));
$$('.bSet').forEach((s) => (s.innerHTML = options(SW.SETS, '—')));
$$('.bMain').forEach((s) => (s.innerHTML = options(SW.STAT, 'Any')));
$('#bMax').innerHTML = options(STAT_OPTS);
$('#bMins').innerHTML = SW.STAT_KEYS.map((k) => `<label>${k} <input type="number" data-k="${k}" placeholder="0"></label>`).join('');
$('#bMon').onchange = renderCurrent;

const unitRunes = (u) => state.runes.filter((r) => r.occupied_id === u.unit_id);
const statGrid = (st, cmp) => `<div class="stats">${SW.STAT_KEYS.map((k) => {
  const d = cmp ? st[k] - cmp[k] : 0;
  return `<div class="stat"><span>${k}</span><b>${st[k]}</b>${d ? `<span class="${d > 0 ? 'good' : 'bad'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</div>`;
}).join('')}</div>`;
const setChips = (ids) => ids.map((s) => `<span class="chip">${esc(SW.SETS[s] || s)}</span>`).join('');

function renderCurrent() {
  const u = state.byId[$('#bMon').value];
  if (!u) return ($('#bCurrent').innerHTML = '<div class="empty">Import an account first.</div>');
  const st = SW.unitStats(u, unitRunes(u));
  $('#bCurrent').innerHTML = `<h3>Current build ${setChips(st.sets)}</h3>${statGrid(st)}`;
}

$('#bRun').onclick = () => {
  const u = state.byId[$('#bMon').value];
  if (!u) return;
  const min = {};
  $$('#bMins input').forEach((i) => i.value && (min[i.dataset.k] = +i.value));
  const mains = {};
  $$('.bMain').forEach((s) => s.value && (mains[s.dataset.slot] = s.value));
  const pool = state.runes.filter((r) => $('#bEquipped').checked || !r.occupied_id || r.occupied_id === u.unit_id);
  const maximize = $('#bMax').value;
  $('#bResults').innerHTML = '<div class="empty">Searching…</div>';
  setTimeout(() => {
    const t = performance.now();
    const res = SW.optimize(u, pool, { sets: $$('.bSet').map((s) => +s.value).filter(Boolean), mains, min, maximize, perSlot: +$('#bPer').value || 6 });
    if (res.error) return ($('#bResults').innerHTML = `<div class="empty bad">${esc(res.error)}</div>`);
    const cur = SW.unitStats(u, unitRunes(u));
    const rows = res.results.map((b, i) => ({ i: i + 1, ...b.stats, b }));
    $('#bResults')._s = { k: maximize, desc: true };
    table($('#bResults'), [
      { k: 'i', label: '#' },
      ...SW.STAT_KEYS.map((k) => ({ k, label: k, f: (r) => { const d = r[k] - cur[k]; return `${r[k]} <span class="${d >= 0 ? 'good' : 'bad'} muted">${d ? (d > 0 ? '+' : '') + d : ''}</span>`; } })),
      { k: 'sets', label: 'Sets', v: (r) => r.sets.length, f: (r) => setChips(r.sets) },
      { k: 'runes', label: 'Runes', v: (r) => r.i, f: (r) => `<details><summary>View</summary>${r.b.runes.map((x) =>
        `<div>${x.slot_no}: ${esc(SW.SETS[x.set_id])} · ${esc(SW.fmtStat(...x.pri_eff))} · ${x.eff.toFixed(0)}% · ${owner(x)}</div>`).join('')}</details>` },
    ], rows, maximize);
    $('#bResults').insertAdjacentHTML('afterbegin', `<p class="muted">${res.evaluated.toLocaleString()} combinations in ${Math.round(performance.now() - t)} ms${res.capped ? ' (budget hit — lower candidates or add sets)' : ''}.</p>`);
  });
};

// ---------- siege: outspeed ----------
const sIn = ['#sBase', '#sLead', '#eBase', '#eRune', '#eLead'];
sIn.forEach((s) => ($(s).oninput = renderOutspeed));
$('#sMon').onchange = () => {
  const u = state.byId[$('#sMon').value];
  if (u) $('#sBase').value = u.spd;
  renderOutspeed();
};
function renderOutspeed() {
  const [base, lead, eb, er, el] = sIn.map((s) => +$(s).value || 0);
  const enemy = SW.combatSpeed(eb, er, el);
  const need = SW.minRuneSpeed(base, lead, enemy);
  const u = state.byId[$('#sMon').value];
  const have = u ? SW.unitStats(u, unitRunes(u)).SPD - u.spd : null;
  $('#sOut').innerHTML = `
    <div class="stat"><span>Enemy combat speed</span><b>${enemy}</b></div>
    <div class="stat"><span>Rune speed you need</span><b class="big">${need}</b></div>
    <div class="stat"><span>Your combat speed</span><b>${SW.combatSpeed(base, need, lead)}</b><span>${base} base + ${SW.leadBonus(base, lead)} lead</span></div>
    ${have !== null ? `<div class="stat"><span>Current rune speed</span><b class="${have >= need ? 'good' : 'bad'}">${have}</b><span>${have >= need ? 'Outspeeds ✓' : `Short by ${need - have}`}</span></div>` : ''}`;
}

// ---------- siege: tuner ----------
let tune = store.get('tune') || [
  { name: 'Booster', team: 'A', base: 103, rune: 200, lead: 24, boost: 30 },
  { name: 'Nuker', team: 'A', base: 101, rune: 100, lead: 24, boost: 0 },
  { name: 'Enemy fastest', team: 'B', base: 100, rune: 150, lead: 0, boost: 0 },
];
const combat = (u) => SW.combatSpeed(+u.base || 0, +u.rune || 0, +u.lead || 0);
function renderTune() {
  store.set('tune', tune);
  $('#tune tbody').innerHTML = tune.map((u, i) => `<tr data-i="${i}">
    <td><input data-f="name" value="${esc(u.name)}" style="width:110px"></td>
    <td><select data-f="team"><option ${u.team === 'A' ? 'selected' : ''}>A</option><option ${u.team === 'B' ? 'selected' : ''}>B</option></select></td>
    ${['base', 'rune', 'lead', 'boost'].map((f) => `<td><input type="number" data-f="${f}" value="${u[f]}"></td>`).join('')}
    <td><b>${combat(u)}</b></td><td><button class="btn ghost" data-del>✕</button></td></tr>`).join('');
  const opts = tune.map((u, i) => `<option value="${i}">${esc(u.name)}</option>`).join('');
  const [w, b] = [$('#tWho').value, $('#tBefore').value];
  $('#tWho').innerHTML = opts;
  $('#tBefore').innerHTML = opts;
  $('#tWho').value = w && tune[w] ? w : 0;
  $('#tBefore').value = b && tune[b] ? b : tune.length - 1;
  renderOrder();
}
const tuneUnits = () => tune.map((u) => ({ name: u.name, team: u.team, spd: combat(u), boost: +u.boost || 0 }));
function renderOrder() {
  $('#tOrder').innerHTML = SW.turnOrder(tuneUnits()).map((o, n) => `<span class="chip ${o.team}">${n + 1}. ${esc(o.name)} <span class="muted">t${o.tick}</span></span>`).join('');
}
$('#tune').oninput = (e) => {
  const i = e.target.closest('tr').dataset.i, f = e.target.dataset.f;
  tune[i][f] = e.target.value;
  e.target.closest('tr').querySelector('b').textContent = combat(tune[i]);
  store.set('tune', tune);
  renderOrder();
};
$('#tune').onchange = (e) => e.target.dataset.f === 'name' && renderTune();
$('#tune').onclick = (e) => {
  if (e.target.dataset.del === undefined) return;
  tune.splice(e.target.closest('tr').dataset.i, 1);
  renderTune();
};
$('#tAdd').onclick = () => { tune.push({ name: 'Unit ' + (tune.length + 1), team: 'A', base: 100, rune: 100, lead: 0, boost: 0 }); renderTune(); };
$('#tFind').onclick = () => {
  const who = +$('#tWho').value, before = +$('#tBefore').value;
  if (who === before) return ($('#tResult').innerHTML = '<span class="muted">Pick two different units.</span>');
  const s = SW.minSpeedBefore(tuneUnits(), who, before);
  const u = tune[who];
  $('#tResult').innerHTML = s === null
    ? '<span class="bad">Not reachable under 500 speed.</span>'
    : `<b>${esc(u.name)}</b> needs <b class="big">${s}</b> combat speed → <b>${Math.max(0, s - (+u.base || 0) - SW.leadBonus(+u.base || 0, +u.lead || 0))}</b> rune speed
       <span class="muted">(current ${combat(u)})</span>`;
};

// ---------- RTA ----------
$('#rFile').onchange = (e) => e.target.files[0]?.text().then((t) => { $('#rText').value = t; analyzeRta(); });
$('#rRun').onclick = analyzeRta;
function analyzeRta() {
  let a;
  try { a = SW.analyzeMatches(SW.parseMatches($('#rText').value || $('#rText').placeholder)); } catch (e) {
    return ($('#rOut').innerHTML = `<div class="card bad">Could not parse: ${esc(e.message)}</div>`);
  }
  store.set('rta', $('#rText').value);
  const wr = (r) => (r.picks ? r.wins / r.picks : 0);
  $('#rOut').innerHTML = `<div class="card"><div class="stats">
      <div class="stat"><span>Matches</span><b>${a.games}</b></div>
      <div class="stat"><span>Win rate</span><b>${pct(a.wins, a.games)}</b><span>${a.wins}W ${a.games - a.wins}L</span></div>
      <div class="stat"><span>First pick win rate</span><b>${pct(a.firstPick.wins, a.firstPick.games)}</b><span>${a.firstPick.games} games</span></div>
      <div class="stat"><span>Second pick win rate</span><b>${pct(a.secondPick.wins, a.secondPick.games)}</b><span>${a.secondPick.games} games</span></div>
    </div></div>
    <div class="card"><h2>Monsters</h2><div class="tbl" id="rMons"></div></div>
    <div class="card"><h2>Best pairs <span class="muted">(2+ games)</span></h2><div class="tbl" id="rPairs"></div></div>`;
  table($('#rMons'), [
    { k: 'name', label: 'Monster' },
    { k: 'picks', label: 'Picked', f: (r) => `${r.picks} <span class="muted">${pct(r.picks, a.games)}</span>` },
    { k: 'wr', label: 'Win rate', v: wr, f: (r) => (r.picks ? `<b>${pct(r.wins, r.picks)}</b>` : '–') },
    { k: 'bannedByOpp', label: 'Banned by opp', f: (r) => `${r.bannedByOpp} <span class="muted">${pct(r.bannedByOpp, r.picks)}</span>` },
    { k: 'banned', label: 'You banned' },
    { k: 'faced', label: 'Faced' },
    { k: 'fwr', label: 'Win rate vs', v: (r) => (r.faced ? r.facedWins / r.faced : 0), f: (r) => (r.faced ? pct(r.facedWins, r.faced) : '–') },
  ], a.monsters, 'picks');
  table($('#rPairs'), [
    { k: 'name', label: 'Pair' },
    { k: 'games', label: 'Games' },
    { k: 'wr', label: 'Win rate', v: wr2, f: (r) => `<b>${pct(r.wins, r.games)}</b>` },
  ], a.pairs.filter((p) => p.games >= 2), 'wr', 50);
}
const wr2 = (r) => r.wins / r.games + r.games / 1e6; // tie-break by games

// ---------- render ----------
function renderAll() {
  const monOpts = state.units.map((u) => `<option value="${u.unit_id}">${esc(monName(u))} · ${u.class}★ L${u.unit_level}</option>`).join('');
  const keep = [$('#bMon').value, $('#sMon').value];
  $('#bMon').innerHTML = monOpts;
  $('#sMon').innerHTML = '<option value="">— manual —</option>' + monOpts;
  if (keep[0]) $('#bMon').value = keep[0];
  if (keep[1]) $('#sMon').value = keep[1];
  renderSummary();
  renderRunes();
  renderCurrent();
  renderOutspeed();
}

const saved = store.get('account');
if (saved) load(saved);
else renderAll();
renderTune();
if (store.get('rta')) $('#rText').value = store.get('rta');
