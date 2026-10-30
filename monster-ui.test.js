'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const ui = () => { const file = path.join(__dirname, 'monster-ui.js'); return fs.existsSync(file) ? require(file) : {}; };
const catalog = () => ({ schemaVersion: 1, generatedAt: '2026-10-30T00:00:00Z',
  source: { name: 'SWARFARM', url: 'https://swarfarm.com/api/v2/' },
  monsters: { 13812: { name: 'Vanessa', img: 'unit_icon_0014_1_2.png', element: 'Fire' } },
  skills: { 6002: { name: 'Sword of Promise', img: 'skill_icon_0004_9_9.png', max: 4, description: 'Attacks the enemy.' } } });
const unit = (id = 71) => ({ unit_id: id, unit_master_id: 13812, attribute: 2, class: 6, unit_level: 40,
  skills: [[6002, 2]], _st: { SPD: 220, HP: 30000 } });

test('portrait uses game master ID to render the supplied name and SWARFARM image', () => {
  assert.equal(typeof ui().portrait, 'function', 'portrait renderer is missing');
  const html = ui().portrait(unit(), catalog());
  assert.match(html, /Vanessa/);
  assert.match(html, /https:\/\/swarfarm.com\/static\/herders\/images\/monsters\/unit_icon_0014_1_2.png/);
  assert.doesNotMatch(html, /#13812|#71/);
});

test('missing metadata has a readable element fallback without exposing IDs or broken image URLs', () => {
  const html = ui().portrait(unit(), {});
  assert.match(html, /Unknown monster/);
  assert.match(html, /Fire/);
  assert.doesNotMatch(html, /<img|undefined|13812|#71/);
});

test('hostile image filenames are rejected and catalog names are escaped in attributes and text', () => {
  for (const img of ['../a.png', 'https://evil/a.png', 'x.png?x', 'x.svg', 'a/b.png', 'x.png\" onerror=\"alert(1)', '%2e%2e.png', '.hidden.png']) {
    const c = catalog(); c.monsters[13812] = { name: '<img src=x onerror="bad">\'&', img };
    const html = ui().portrait(unit(), c);
    assert.doesNotMatch(html, /<img|onerror="bad"|https:\/\/evil/);
    assert.match(html, /&lt;img/);
    assert.match(html, /&#39;&amp;/);
  }
  for (const img of ['icon.png', 'icon-2.webp', 'icon_3.jpg']) {
    const c = catalog(); c.monsters[13812].img = img;
    assert.match(ui().portrait(unit(), c), /<img/);
  }
});

test('skill strip resolves game skill IDs to icons, tooltips and level progress', () => {
  assert.equal(typeof ui().skillInfo, 'function', 'skill presentation is missing');
  const info = ui().skillInfo(unit(), catalog());
  assert.equal(info.used, 1);
  assert.equal(info.missing, 2);
  assert.match(info.html, /images\/skills\/skill_icon_0004_9_9.png/);
  assert.match(info.html, /Sword of Promise/);
  assert.match(info.html, /Attacks the enemy/);
  assert.match(info.html, /Level 2 of 4/);
  assert.equal((info.html.match(/class="skill-dot(?: filled)?"/g) || []).length, 4);
  assert.doesNotMatch(info.html, /6002|2\/4/);
});

test('missing, numeric-only and hostile skill metadata never produce broken or injected icons', () => {
  for (const metadata of [undefined, 4, { name: '<bad>\"\'', img: '../evil.png', max: 100000, description: '<script>bad</script>' }]) {
    const c = catalog(); c.skills[6002] = metadata;
    const info = ui().skillInfo(unit(), c);
    assert.equal(info.missing, null);
    assert.doesNotMatch(info.html, /<img|<script>|6002|undefined/);
    assert.match(info.html, /skill-placeholder/);
    assert.match(info.html, /maximum unknown/);
    assert.ok(info.html.length < 1500);
  }
  assert.match(ui().skillInfo({ skills: [] }, {}).html, /Skills unavailable/);
});

test('versioned catalog cache rejects old numeric skill cache and old bestiary shapes', () => {
  assert.equal(typeof ui().catalogFromCache, 'function', 'versioned cache migration is missing');
  for (const old of [null, { 6002: 4 }, { bestiary: catalog().monsters, skills: { 6002: 4 } },
    { ...catalog(), schemaVersion: 0 }, { ...catalog(), skills: { 6002: 4 } }]) {
    assert.equal(ui().catalogFromCache(old), null);
  }
  assert.deepEqual(ui().catalogFromCache(catalog()), catalog());
});

test('duplicate copies remain separately selectable by unique unit ID and have stable letter labels', () => {
  assert.equal(typeof ui().pickerEntries, 'function', 'portrait picker entries are missing');
  const a = unit(71), b = { ...unit(92), _st: { SPD: 180, HP: 21000 } };
  const entries = ui().pickerEntries([b, a], catalog(), 'Vanessa');
  assert.equal(entries.length, 2);
  const first = entries.find(e => e.id === '71'), second = entries.find(e => e.id === '92');
  assert.match(first.label, /Copy A/);
  assert.match(second.label, /Copy B/);
  assert.match(first.label, /SPD 220/);
  assert.match(second.label, /HP 21000/);
  assert.match(first.html, /data-unit-choice="71"/);
  assert.match(second.html, /data-unit-choice="92"/);
  assert.match(first.html, /<img/);
  assert.doesNotMatch(first.label + second.label, /#71|#92|13812/);
  assert.equal(ui().pickerEntries([a, b], catalog(), 'copy b')[0].id, '92');
  assert.equal(ui().pickerEntries([a, b], catalog(), 'water').length, 0);
  assert.equal(ui().pickerEntries([a, b], catalog(), 'fire').length, 2);
});

const vm = require('node:vm');

// Minimal DOM boundary for exercising the actual app without browser dependencies.
// Rendering, SW calculations, storage and event handlers are production code.
function boot(initial = {}) {
  const elements = new Map(), listeners = {}, requests = [], warnings = [];
  let document;
  class Element {
    constructor(tag = 'div', attrs = '') {
      this.tagName = tag.toUpperCase(); this.dataset = {}; this.listeners = {}; this.value = '';
      this.classList = { toggle() {}, add() {}, remove() {} }; this.isConnected = true;
      this.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] || '';
      this.type = attrs.match(/\btype="([^"]*)"/)?.[1] || '';
    }
    set innerHTML(html) {
      this.html = html;
      this.choices = [...html.matchAll(/<button\b[^>]*data-unit-choice="([^"]+)"[^>]*>/g)].map(match => {
        const button = new Element('button'); button.dataset = { unitChoice: match[1] };
        button.closest = () => button;
        button.click = () => this.onclick?.({ target: button });
        return button;
      });
      if (this.tagName === 'SELECT') {
        const opts = [...html.matchAll(/<option(?:\s+([^>]*))?>([^<]*)/g)];
        const option = opts.find(o => /\bselected\b/.test(o[1])) || opts[0];
        this.value = option ? option[1]?.match(/value="([^"]*)"/)?.[1] ?? option[2] : '';
      }
    }
    get innerHTML() { return this.html || ''; }
    querySelectorAll(selector) { return selector === '[data-unit-choice]' ? this.choices || [] : []; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.({ target: this }); }
    setAttribute(key, value) { this[key] = String(value); }
    insertAdjacentHTML(position, html) { this.innerHTML = html + this.innerHTML; }
  }
  for (const match of source('index.html').matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) elements.set('#' + match[3], new Element(match[1], match[2]));
  elements.set('#tune tbody', new Element('tbody'));
  document = { activeElement: null, querySelector: s => elements.get(s) || null,
    getElementById: id => elements.get('#' + id), querySelectorAll: () => [],
    addEventListener: (type, fn) => { listeners[type] = fn; } };
  const storage = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  const context = vm.createContext({ document, console: { warn: (...args) => warnings.push(args) },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    fetch: url => { let resolve; const promise = new Promise(r => { resolve = r; }); requests.push({ url, resolve }); return promise; },
    setTimeout, clearTimeout, AbortController, performance, Event, confirm: () => true });
  vm.runInContext(source('sw.js'), context);
  vm.runInContext(source('monster-ui.js'), context);
  vm.runInContext(source('app.js'), context);
  return { elements, listeners, requests, storage, warnings, context, Element, run: script => vm.runInContext(script, context) };
}
const accountFixture = () => ({ unit_list: [unit(71), { ...unit(92), unit_level: 35 }].map(u => ({ ...u, con: 1000, atk: 700, def: 600, spd: 101, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0 })) });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('boot refreshes same-origin catalog once independently of imports and retains selections and local plan', async () => {
  const plan = { teams: [{ name: 'Saved', vs: 'Defense', enemySpd: '', lead: '', units: ['92', '', ''] }], builds: {} };
  const app = boot({ bestiary: { 13812: { name: 'Stale' } }, skills: { 6002: 4 }, siegePlan: plan });
  assert.deepEqual(app.requests.map(r => r.url), ['monster-catalog.json']);
  app.run(`load(${JSON.stringify(accountFixture())})`);
  app.elements.get('#bMon').value = '92';
  app.elements.get('#sMon').value = '71';
  app.requests[0].resolve({ ok: true, json: async () => catalog() });
  await tick();
  assert.equal(app.elements.get('#bMon').value, '92');
  assert.equal(app.elements.get('#sMon').value, '71');
  assert.match(app.elements.get('#collectionTable').innerHTML, /Vanessa/);
  assert.match(app.elements.get('#collectionTable').innerHTML, /skill-strip/);
  assert.match(app.elements.get('#bCurrent').innerHTML, /skill-strip/);
  assert.match(app.elements.get('#pTeams').innerHTML, /Vanessa/);
  assert.equal(app.run('plan.teams[0].units[0]'), '92');
  assert.equal(JSON.parse(app.storage.get('monsterCatalogV1')).schemaVersion, 1);
  app.run(`load(${JSON.stringify(accountFixture())})`);
  assert.equal(app.requests.length, 1, 'import must not fetch third-party API pages or an account');
  assert.equal(app.warnings.length, 0);
});

test('portrait picker selects exact copies in builder, speed tool and saved siege slots', () => {
  const app = boot({ monsterCatalogV1: catalog() });
  app.run(`load(${JSON.stringify(accountFixture())})`);
  assert.ok(app.elements.has('#unitPicker'), 'accessible shared picker dialog is missing');
  assert.match(source('index.html'), /<select id="bMon"[^>]*hidden/);
  assert.match(source('index.html'), /<select id="sMon"[^>]*hidden/);
  const open = dataset => {
    const trigger = new app.Element('button'); trigger.dataset = dataset;
    trigger.closest = () => trigger;
    app.listeners.click({ target: trigger });
    assert.equal(app.elements.get('#unitPicker').open, true);
    return trigger;
  };
  const choose = id => {
    const choice = new app.Element('button'); choice.dataset = { unitChoice: id }; choice.closest = () => choice;
    app.elements.get('#unitPickerGrid').onclick({ target: choice });
  };
  open({ unitPicker: 'builder' });
  assert.match(app.elements.get('#unitPickerGrid').innerHTML, /Copy A/);
  assert.match(app.elements.get('#unitPickerGrid').innerHTML, /Copy B/);
  choose('92');
  assert.equal(app.elements.get('#bMon').value, '92');
  assert.match(app.elements.get('#bCurrent').innerHTML, /Vanessa/);
  assert.equal(app.elements.get('#unitPicker').open, false);
  open({ unitPicker: 'speed' }); choose('71');
  assert.equal(app.elements.get('#sMon').value, '71');
  assert.equal(Number(app.elements.get('#sBase').value), 101);
  assert.match(app.elements.get('#sSelected').innerHTML, /skill-strip/);
  app.run("plan.teams.push({name:'Test',vs:'',enemySpd:'',lead:'',units:['','','']}); renderPlan()");
  assert.match(app.elements.get('#pTeams').innerHTML, /data-unit-picker="plan"/);
  assert.doesNotMatch(app.elements.get('#pTeams').innerHTML, /unitList|#13812|#71|#92/);
  open({ unitPicker: 'plan', team: '0', slot: '1' }); choose('92');
  assert.equal(app.run('plan.teams[0].units[1]'), '92');
  assert.equal(JSON.parse(app.storage.get('siegePlan')).teams[0].units[1], '92');
  open({ unitPicker: 'plan', team: '0', slot: '1' });
  app.elements.get('#unitPickerClear').onclick();
  assert.equal(app.run('plan.teams[0].units[1]'), '');
});

test('picker supports keyboard search/selection, Escape dismissal and focus restoration after rerender', () => {
  const app = boot({ monsterCatalogV1: catalog() });
  app.run(`load(${JSON.stringify(accountFixture())})`);
  const trigger = app.elements.get('#bPicker'); trigger.dataset = { unitPicker: 'builder' }; trigger.closest = () => trigger;
  app.listeners.click({ target: trigger });
  const search = app.elements.get('#unitPickerSearch'), grid = app.elements.get('#unitPickerGrid'), dialog = app.elements.get('#unitPicker');
  assert.equal(app.run('document.activeElement'), search);
  search.value = 'copy b'; search.oninput();
  assert.match(grid.innerHTML, /Copy B/); assert.doesNotMatch(grid.innerHTML, /Copy A/);
  assert.equal(typeof search.onkeydown, 'function', 'keyboard search navigation is missing');
  search.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.equal(app.elements.get('#bMon').value, '92');
  assert.equal(app.run('document.activeElement'), trigger);
  app.listeners.click({ target: trigger });
  search.onkeydown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(app.run('document.activeElement'), grid.choices[0]);
  grid.onkeydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(app.run('document.activeElement'), grid.choices[1]);
  grid.onkeydown({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(app.run('document.activeElement'), grid.choices[0]);
  let prevented = false;
  dialog.listeners.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(dialog.open, false);
  assert.equal(app.run('document.activeElement'), trigger);
  assert.equal(app.elements.get('#bMon').value, '92');
  app.run("plan.teams.push({name:'Test',vs:'',enemySpd:'',lead:'',units:['','','']}); renderPlan()");
  const planTrigger = new app.Element('button'); planTrigger.dataset = { unitPicker: 'plan', team: '0', slot: '2' }; planTrigger.closest = () => planTrigger;
  const replacement = new app.Element('button');
  app.elements.set('[data-unit-picker="plan"][data-team="0"][data-slot="2"]', replacement);
  app.listeners.click({ target: planTrigger });
  search.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.equal(app.run('document.activeElement'), replacement, 'focus must return to newly rendered slot trigger');
});

test('public meta rows use portraits and source names without exposing numeric monster IDs', () => {
  const app = boot({ monsterCatalogV1: catalog() });
  app.run(source('rta-meta.js'));
  app.run(source('rta-meta-ui.js'));
  app.elements.get('#mMin').value = '0';
  app.run(`publicRtaState.data = ${JSON.stringify({ ...catalog(), source: { name: 'Test fixture', reportedTotal: 10, scope: 'unit test' }, season: 'test', patch: 'test', matches: 10, firstPickGames: 10, firstPickWins: 6, windowStart: 'test', windowEnd: 'test', skipped: 0,
    monsters: [{ id: 13812, name: 'Vanessa', element: 'Fire', picks: 8, bans: 2, played: 6, wins: 4, firstPicks: 3 },
      { id: 999999, name: 'Source name', element: 'Pure', picks: 4, bans: 1, played: 3, wins: 1, firstPicks: 2 }], pairs: [] })}; renderRtaMeta()`);
  const html = app.elements.get('#mTable').innerHTML;
  assert.doesNotMatch(html, /#13812|#999999/);
  assert.match(html, /images\/monsters\/unit_icon_0014_1_2.png/);
  assert.match(html, /Source name/);
  assert.match(html, /Pure/);
});

test('HTML IDs are unique, with collection containers separate from public meta', () => {
  const ids = [...source('index.html').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate IDs target the wrong tab');
  assert.ok(ids.includes('collectionStats'));
  assert.ok(ids.includes('collectionTable'));
  assert.ok(ids.includes('mStats') && ids.includes('mTable'));
});
