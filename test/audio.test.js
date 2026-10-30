'use strict';
const test = require('node:test');
const assert = require('node:assert');
const A = require('../app/audio');

const SR = 48000, FFT = 2048, BIN = SR / FFT, FPS = 60;

// Run the analyzer over a synthetic track: `beatAt(t)` gives the beat position, `shape(t, mags)` can edit each frame.
function run(seconds, bpm, shape) {
  const a = A.createAnalyzer({ sampleRate: SR, fftSize: FFT });
  const mags = new Float32Array(FFT / 2), log = [];
  for (let i = 0; i < seconds * FPS; i++) {
    const t = i / FPS;
    A.synthSpectrum(mags, BIN, t * bpm / 60);
    if (shape) shape(t, mags);
    const f = A.analyze(a, mags, 1 / FPS);
    log.push({ t, kick: a.lastHit.kick === a.t, dropNow: a.dropNow, build: f.build, beat: a.tempo.beat });
  }
  return { a, log };
}

for (const bpm of [100, 124, 128, 140, 174]) {
  test(`finds the tempo of a ${bpm} BPM loop`, () => {
    const { a } = run(12, bpm);
    assert.ok(Math.abs(a.tempo.bpm - bpm) < 1.5, `got ${a.tempo.bpm.toFixed(2)}`);
    assert.ok(a.tempo.locked, `confidence ${a.tempo.confidence.toFixed(2)}`);
  });
}

test('detects one kick per beat', () => {
  const { log } = run(10, 128);
  const kicks = log.filter((x) => x.kick && x.t > 1).length;
  const beats = Math.floor(9 * 128 / 60);
  assert.ok(Math.abs(kicks - beats) <= 2, `${kicks} kicks for ${beats} beats`);
});

test('beat phase locks onto the kicks', () => {
  const { log } = run(12, 128);
  const late = log.filter((x) => x.kick && x.t > 8);
  assert.ok(late.length > 6);
  // The offbeat bass note sometimes reads as a kick too; the beat counter must stay on the real kicks regardless.
  const onBeat = late.filter((x) => Math.abs(x.beat - Math.round(x.beat)) < 0.06).length;
  assert.ok(onBeat >= Math.floor(4 * 128 / 60) - 1, `${onBeat} of ${late.length} kicks on the beat`);
});

test('a breakdown builds tension and the return of the bass is a drop', () => {
  // 10 s of full loop, 8 s with kick and bass removed, then the full loop again.
  const cut = (t, m) => { if (t >= 10 && t < 18) for (let i = 1; i < m.length; i++) if (i * BIN < 300) m[i] = 0.0005; };
  const { log } = run(24, 128, cut);
  assert.ok(!log.some((x) => x.dropNow && x.t < 18), 'no drop before the bass returns');
  const drops = log.filter((x) => x.dropNow);
  assert.strictEqual(drops.length, 1, `drops at ${drops.map((x) => x.t.toFixed(2))}`);
  assert.ok(drops[0].t >= 18 && drops[0].t < 19, `drop at ${drops[0].t}`);
  const peak = Math.max(...log.filter((x) => x.t > 10 && x.t < 18).map((x) => x.build));
  assert.ok(peak > 0.5, `build peaked at ${peak}`);
  assert.ok(log.filter((x) => x.t < 10).every((x) => x.build === 0), 'no build during the full loop');
});

test('silence reads as zero', () => {
  const a = A.createAnalyzer();
  const z = new Float32Array(FFT / 2);
  let f; for (let i = 0; i < 120; i++) f = A.analyze(a, z, 1 / FPS);
  for (const k of ['level', 'bass', 'high', 'kick', 'snare', 'hat', 'build', 'drop']) assert.strictEqual(f[k], 0, k);
});

test('envelope follows attack and release times', () => {
  const m = A.makeMapping({ attack: 100, release: 1000 });
  for (let i = 0; i < 6; i++) A.stepMapping(m, 1, 1 / 60);
  assert.ok(Math.abs(m.env - (1 - Math.exp(-0.1 / 0.1))) < 0.01, `attack ${m.env}`);
  const top = m.env;
  for (let i = 0; i < 60; i++) A.stepMapping(m, 0, 1 / 60);
  assert.ok(Math.abs(m.env - top * Math.exp(-1)) < 0.01, `release ${m.env}`);
  const inst = A.makeMapping({ attack: 0, release: 0 });
  A.stepMapping(inst, 0.7, 1 / 60);
  assert.strictEqual(inst.env, 0.7);
});

test('gate, invert and curve shape the input', () => {
  const m = A.makeMapping({ attack: 0, release: 0, gate: 0.5 });
  assert.strictEqual(A.stepMapping(m, 0.4, 0.01), 0);
  assert.strictEqual(A.stepMapping(m, 0.75, 0.01), 0.5);
  const inv = A.makeMapping({ attack: 0, release: 0, invert: true, curve: 2 });
  assert.ok(Math.abs(A.stepMapping(inv, 0.5, 0.01) - 0.25) < 1e-9);
});

test('scale destinations duck to 1 - amount, add destinations sum, groups filter', () => {
  const mx = A.createMatrix();
  mx.mappings = [
    A.makeMapping({ src: 'kick', dst: 'rig.dim', amount: 0.8, attack: 0, release: 0 }),
    A.makeMapping({ src: 'hat', dst: 'rig.white', amount: 0.5, group: 'odd', attack: 0, release: 0 }),
    A.makeMapping({ src: 'hat', dst: 'rig.white', amount: 0.25, attack: 0, release: 0 }),
  ];
  const a = A.createAnalyzer();
  A.updateMatrix(mx, a, { kick: 0, hat: 1 }, 1 / 60);
  assert.ok(Math.abs(A.modValue(mx, 'rig.dim') - 0.2) < 1e-9);
  assert.strictEqual(A.modValue(mx, 'rig.white', (g) => g === 'odd'), 0.75);
  assert.strictEqual(A.modValue(mx, 'rig.white', (g) => g === 'even'), 0.25);
  A.updateMatrix(mx, a, { kick: 1, hat: 0 }, 1 / 60);
  assert.strictEqual(A.modValue(mx, 'rig.dim'), 1);
});

test('presets only use known sources, destinations and groups, and survive a save round trip', () => {
  const srcs = new Set(A.SOURCES.map((s) => s.id));
  for (const [name, list] of Object.entries(A.PRESETS)) {
    for (const p of list) {
      assert.ok(srcs.has(p.src), `${name}: ${p.src}`);
      const d = A.DEST_BY_ID[p.dst];
      assert.ok(d, `${name}: ${p.dst}`);
      assert.ok(d.groups.includes(p.group || 'all'), `${name}: ${p.dst} group ${p.group}`);
    }
    const ms = A.presetMappings(name);
    const back = A.loadMappings(JSON.parse(JSON.stringify(A.saveMappings(ms))));
    assert.deepStrictEqual(A.saveMappings(back), A.saveMappings(ms));
  }
});

test('loading rejects junk and clamps values', () => {
  const ms = A.loadMappings([null, 3, { src: 'nope', dst: 'nope', amount: 9, attack: -5, group: 'odd', lo: 900, hi: 100 }]);
  assert.strictEqual(ms.length, 1);
  const m = ms[0];
  assert.strictEqual(m.src, 'kick'); assert.strictEqual(m.dst, 'rig.dim'); assert.strictEqual(m.amount, 1); assert.strictEqual(m.attack, 0);
  assert.strictEqual(m.group, 'odd'); assert.deepStrictEqual([m.lo, m.hi], [100, 900]);
  assert.strictEqual(A.loadMappings({}).length, 0);
});
