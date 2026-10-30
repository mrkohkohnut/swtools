'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const catalog = JSON.parse(fs.readFileSync(require.resolve('./monster-catalog.json'), 'utf8'));
const imageName = /^[A-Za-z0-9_-]+\.(?:png|webp|jpe?g)$/i;

// Real public SWARFARM metadata, not an account export or generated fixture.
test('public artwork catalog has provenance and contains only public metadata', () => {
  assert.deepEqual(Object.keys(catalog).sort(), ['generatedAt', 'monsters', 'schemaVersion', 'skills', 'source']);
  assert.equal(catalog.schemaVersion, 1);
  assert.ok(Number.isFinite(Date.parse(catalog.generatedAt)));
  assert.deepEqual(catalog.source, { name: 'SWARFARM', url: 'https://swarfarm.com/api/v2/' });
  assert.ok(Object.keys(catalog.monsters).length > 3000);
  assert.ok(Object.keys(catalog.skills).length > 5000);
  for (const [id, monster] of Object.entries(catalog.monsters)) {
    assert.match(id, /^[1-9]\d*$/);
    assert.deepEqual(Object.keys(monster).sort(), ['element', 'img', 'name']);
    assert.equal(typeof monster.name, 'string');
    assert.ok(monster.name.length > 0);
    assert.ok(['Fire', 'Water', 'Wind', 'Light', 'Dark', 'Pure'].includes(monster.element));
    assert.ok(monster.img === '' || imageName.test(monster.img));
  }
  for (const [id, skill] of Object.entries(catalog.skills)) {
    assert.match(id, /^[1-9]\d*$/);
    assert.deepEqual(Object.keys(skill).sort(), ['description', 'img', 'max', 'name']);
    assert.equal(typeof skill.name, 'string');
    assert.ok(skill.name.length > 0);
    assert.equal(typeof skill.description, 'string');
    assert.ok(Number.isSafeInteger(skill.max) && skill.max >= 1 && skill.max <= 20);
    assert.ok(skill.img === '' || imageName.test(skill.img));
  }
});

test('catalog keys use game IDs, not SWARFARM database IDs', () => {
  assert.equal(catalog.monsters['13812'].name, 'Vanessa');
  assert.equal(catalog.monsters['13812'].img, 'unit_icon_0014_1_2.png');
  assert.equal(catalog.skills['6002'].name, 'Sword of Promise');
  assert.equal(catalog.skills['6002'].max, 4);
  assert.equal(catalog.skills['6002'].img, 'skill_icon_0004_9_9.png');
});
