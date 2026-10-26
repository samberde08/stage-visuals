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
  }
});

test('confidence levels are backed by cited facts', () => {
  for (const v of VENUES) {
    assert.ok(['sourced', 'partial', 'estimated'].includes(v.confidence), v.id);
    assert.ok(Array.isArray(v.facts), `${v.id} has a facts list`);
    for (const f of v.facts) assert.ok(f.k && f.v && /^https?:\/\//.test(f.src), `${v.id}: ${f.k} cites a web source`);
    if (v.confidence !== 'estimated') {
      assert.ok(v.facts.length >= (v.confidence === 'sourced' ? 3 : 1), `${v.id} cites enough facts for ${v.confidence}`);
      assert.ok(typeof v.estimated === 'string' && v.estimated.length, `${v.id} says what is still estimated`);
    }
  }
  assert.ok(VENUES.filter((v) => v.confidence === 'sourced').length >= 3, 'at least three demo stages with real data');
});

test('LED pixel pitch is one the app offers', () => {
  const pitches = new Set([...html.matchAll(/<option value="([\d.]+)"[^>]*>[\d.]+ mm/g)].map((m) => +m[1]));
  for (const v of VENUES) if (v.led.pitch) assert.ok(pitches.has(v.led.pitch), `${v.id}: ${v.led.pitch} mm`);
});

test('mix of clubs and festival stages', () => {
  const kinds = VENUES.reduce((a, v) => ({ ...a, [v.kind]: (a[v.kind] || 0) + 1 }), {});
  assert.ok(kinds.club >= 12 && kinds.festival >= 10, JSON.stringify(kinds));
});

test('outdoor scenery uses shipped HDRIs and known feature types', () => {
  const hdri = new Set(fs.readdirSync(path.join(__dirname, '..', 'app', 'hdri')).filter((f) => f.endsWith('_1k.hdr')).map((f) => f.replace('_1k.hdr', '')));
  const types = new Set(['skyline', 'blocks', 'mountains', 'water', 'trees', 'treelights', 'stand', 'glow']);
  const withScenery = VENUES.filter((v) => v.scenery);
  assert.ok(withScenery.length >= 15, 'most outdoor venues have scenery');
  for (const v of withScenery) {
    const sc = v.scenery;
    assert.ok(v.setting !== 'indoor', `${v.id} is outdoors`);
    for (const k of ['hdri', 'dusk']) assert.ok(hdri.has(sc[k]), `${v.id}.${k}: ${sc[k]}`);
    assert.ok(sc.night === null || hdri.has(sc.night), `${v.id}.night: ${sc.night}`);
    assert.ok(typeof sc.basis === 'string' && sc.basis.length > 20, `${v.id} says what the scenery is based on`);
    assert.ok(v.audienceFacing !== null, `${v.id} needs an audience direction to place scenery`);
    for (const f of sc.features) {
      assert.ok(types.has(f.type), `${v.id}: ${f.type}`);
      if ('bearing' in f) assert.ok(f.bearing >= 0 && f.bearing < 360, `${v.id}: bearing ${f.bearing}`);
      if (f.type === 'skyline') assert.ok(f.dist > 0 && f.width > 0 && f.towers.every((h) => h > 0 && h < 600), `${v.id}: ${f.name}`);
    }
  }
});

test('venue photos name a Commons file and what it shows', () => {
  const withPhoto = VENUES.filter((v) => v.photo);
  assert.ok(withPhoto.length >= 15, 'most venues have a photo');
  for (const v of withPhoto) {
    assert.match(v.photo.file, /^[^/\s]+\.(jpe?g|png)$/i, v.id);
    assert.ok(['show', 'site', 'outside'].includes(v.photo.view), v.id);
  }
});
