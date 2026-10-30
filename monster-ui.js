/* Shared, account-independent monster presentation. No account storage or network. */
(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const name = (unit, catalog) => catalog?.monsters?.[unit.unit_master_id]?.name || unit.name || 'Unknown monster';
  const elements = { 1: 'Water', 2: 'Fire', 3: 'Wind', 4: 'Light', 5: 'Dark' };
  const filename = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*\.(?:png|webp|jpg)$/.test(value) ? value : '';
  function portrait(unit, catalog) {
    const monster = catalog?.monsters?.[unit.unit_master_id];
    const element = elements[unit.attribute] || monster?.element || unit.element || 'Element unknown';
    const image = filename(monster?.img);
    const icon = image ? `<img src="https://swarfarm.com/static/herders/images/monsters/${image}" alt="" loading="lazy">`
      : `<span class="mon-placeholder" aria-label="${escape(element)}">${escape(element)}</span>`;
    return `<span class="mon">${icon}<span>${escape(name(unit, catalog))}</span></span>`;
  }
  function skillInfo(unit, catalog) {
    const skills = (unit.skills || []).map(([id, level]) => {
      const metadata = catalog?.skills?.[id];
      return { ...metadata, level: Math.max(1, Number(level) || 1), max: Number.isInteger(metadata?.max) && metadata.max > 0 && metadata.max <= 30 ? metadata.max : null };
    });
    return {
      used: skills.reduce((sum, skill) => sum + skill.level - 1, 0),
      missing: skills.length && skills.every(skill => skill.max) ? skills.reduce((sum, skill) => sum + Math.max(0, skill.max - skill.level), 0) : null,
      html: skills.length ? `<span class="skill-strip">${skills.map(skill => {
        const label = `${skill.name || 'Unknown skill'} — Level ${skill.level}${skill.max ? ` of ${skill.max}` : ' (maximum unknown)'}${skill.description ? ` — ${skill.description}` : ''}`;
        const image = filename(skill.img);
        const icon = image ? `<img src="https://swarfarm.com/static/herders/images/skills/${image}" alt="" loading="lazy">` : '<span class="skill-placeholder" aria-hidden="true">✦</span>';
        return `<span class="skill" tabindex="0" title="${escape(label)}" aria-label="${escape(label)}">${icon}<span class="skill-dots" aria-hidden="true">${Array.from({ length: skill.max || 0 }, (_, i) => `<i class="skill-dot${i < skill.level ? ' filled' : ''}"></i>`).join('')}</span></span>`;
      }).join('')}</span>` : '<span class="muted">Skills unavailable</span>',
    };
  }
  function catalogFromCache(value) {
    const records = object => object && typeof object === 'object' && !Array.isArray(object)
      && Object.values(object).every(record => record && typeof record === 'object' && typeof record.name === 'string');
    return value?.schemaVersion === 1 && typeof value.generatedAt === 'string' && Number.isFinite(Date.parse(value.generatedAt))
      && value.source?.name === 'SWARFARM' && records(value.monsters) && records(value.skills) ? value : null;
  }
  function pickerEntries(units, catalog, search = '') {
    const groups = new Map();
    for (const unit of units) {
      const key = String(unit.unit_master_id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(String(unit.unit_id));
    }
    for (const ids of groups.values()) ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return units.map(unit => {
      const id = String(unit.unit_id), copies = groups.get(String(unit.unit_master_id));
      let letter = '', index = copies.indexOf(id) + 1;
      while (index > 0) { index--; letter = String.fromCharCode(65 + index % 26) + letter; index = Math.floor(index / 26); }
      const copy = copies.length > 1 ? `Copy ${letter} · ` : '';
      const details = `${copy}${unit.class % 10}★ L${unit.unit_level}${unit._st ? ` · SPD ${unit._st.SPD} · HP ${unit._st.HP}` : ''}`;
      const label = `${name(unit, catalog)} · ${details}`;
      const element = elements[unit.attribute] || catalog?.monsters?.[unit.unit_master_id]?.element || '';
      return { id, label, details, element, html: `<button type="button" class="unit-choice" data-unit-choice="${escape(id)}" aria-label="${escape(label)}">${portrait(unit, catalog)}<span class="muted">${escape(details)}</span></button>` };
    }).filter(entry => `${entry.label} ${entry.element}`.toLowerCase().includes(search.trim().toLowerCase()));
  }
  const api = { escape, name, portrait, skillInfo, catalogFromCache, pickerEntries };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MonsterUI = api;
})(typeof globalThis === 'object' ? globalThis : this);
