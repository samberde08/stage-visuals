'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const VENUES = require('../app/venues');

const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'stage.html'), 'utf8');
const templates = new Set([...html.matchAll(/^  (\w+):\s+\{ label:/gm)].map((m) => m[1]));
// Slider limits in the rack, so a preset never sets a value its control cannot show.
const limits = {};
for (const m of html.matchAll(/<input id="(\w+)" type="range" min="([\d.]+)" max="([\d.]+)"/g)) limits[m[1]] = [+m[2], +m[3]];

test('library has 30 venues with unique ids', () => {
  assert.strictEqual(VENUES.length, 30);
  assert.strictEqual(new Set(VENUES.map((v) => v.id)).size, 30);
});

test('every venue uses a template the app builds', () => {
  assert.ok(templates.size >= 10, 'found the TEMPLATES table');
  for (const v of VENUES) assert.ok(templates.has(v.template), `${v.id}: ${v.template}`);
});

test('stage, LED and rig values fit the rack sliders', () => {
  for (const v of VENUES) {
    const vals = { ...v.stage, ...v.led, count: v.rig.count };
    for (const k of ['W', 'D', 'H', 'trim', 'wallW', 'wallH', 'count']) {
      const [lo, hi] = limits[k];
      assert.ok(vals[k] >= lo && vals[k] <= hi, `${v.id}.${k}=${vals[k]} outside ${lo}-${hi}`);
    }
  }
});

test('realism fields are present and in range', () => {
  const settings = new Set(['indoor', 'open-air', 'tent', 'outdoor']);
  for (const v of VENUES) {
    assert.ok(settings.has(v.setting), v.id);
    assert.ok(v.lat > 24 && v.lat < 49 && v.lon > -125 && v.lon < -66, `${v.id} is in the contiguous US`);
    assert.ok(v.audienceFacing === null || (v.audienceFacing >= 0 && v.audienceFacing < 360), v.id);
    assert.ok(Number.isInteger(v.capacity) && v.capacity > 0, v.id);
    assert.ok(v.room.crowdN > 0 && v.room.crowdN <= 5000, `${v.id} crowd stays drawable`);
    assert.ok(/^\w+\/\w+$/.test(v.tz), v.id);
    assert.ok(Array.isArray(v.showHours) && v.showHours.every((h) => /^\d\d:\d\d$/.test(h)), v.id);
    assert.ok(['published', 'estimated'].includes(v.confidence), v.id);
    if (v.confidence === 'published') assert.ok(v.sources.length, `${v.id} cites a source`);
  }
});

test('mix of clubs and festival stages', () => {
  const kinds = VENUES.reduce((a, v) => ({ ...a, [v.kind]: (a[v.kind] || 0) + 1 }), {});
  assert.ok(kinds.club >= 12 && kinds.festival >= 10, JSON.stringify(kinds));
});
