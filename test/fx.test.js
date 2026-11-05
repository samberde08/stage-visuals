'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FX = require('../app/fx');
const RIG = require('../app/rig');

// A small seeded random so particle tests repeat.
function rng(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const pools = () => ({ glow: FX.createPool(20000), puff: FX.createPool(8000), paper: FX.createPool(8000) });
const run = (P, u, secs, opts = {}) => {
  const r = rng(opts.seed || 7); let t = 0;
  for (let i = 0; i < secs * 60; i++) {
    t += 1 / 60;
    const firing = opts.until === undefined || t < opts.until;
    if (firing) FX.emit(P, u, 1 / 60, r, i === 0);
    FX.step(P, 1 / 60, { ground: opts.ground || (() => 0), time: t, onBurst: opts.onBurst }, r);
    if (opts.each) opts.each(P, t);
  }
};
const maxY = (pool) => { let m = -Infinity; for (let i = 0; i < pool.n; i++) m = Math.max(m, pool.p[i * 3 + 1]); return m; };

test('every laser pattern stays within its beam count and sensible angles', () => {
  for (const { id } of FX.LASER_PATTERNS) {
    for (let beat = 0; beat < 16; beat += 0.37) {
      const f = FX.laserFrame(id, beat, beat, 1, 4, 9);
      assert.ok(f.n >= 1 && f.n <= FX.MAX_BEAMS, id);
      for (let b = 0; b < FX.MAX_BEAMS; b++) {
        assert.ok(Math.abs(f.yaw[b]) <= 80 * Math.PI / 180, `${id} yaw ${f.yaw[b]}`);
        assert.ok(Math.abs(f.pitch[b]) <= 15 * Math.PI / 180, `${id} pitch`);
        if (b >= f.n) assert.strictEqual(f.on[b], 0);
      }
      if (id === 'off') assert.strictEqual(f.flick, 0);
    }
  }
  assert.strictEqual(FX.laserFrame('sheet', 0, 0, 0, 1, 3).n, FX.MAX_BEAMS);
  const chase = FX.laserFrame('chase', 1.2, 1.2, 0, 1, 9);
  assert.strictEqual([...chase.on].filter((x) => x === 1).length, 2);
});

test('jets fire while held, for at least their minimum, and cut off at their maximum', () => {
  const s = FX.createUnitState();
  assert.strictEqual(FX.stepUnit(s, 'flame', true, 0), true);
  FX.stepUnit(s, 'flame', false, 0.05);
  assert.ok(s.active, 'a tap still makes a minimum burst');
  FX.stepUnit(s, 'flame', false, 0.3);
  assert.ok(!s.active);
  // Held past the safety cut-off: it stops and will not restart until released.
  const h = FX.createUnitState();
  for (let t = 0; t <= 5; t += 0.1) FX.stepUnit(h, 'flame', true, t);
  assert.ok(!h.active, 'flame cut off after its maximum');
  FX.stepUnit(h, 'flame', false, 5.1); FX.stepUnit(h, 'flame', true, 5.5);
  assert.ok(h.active, 'fires again after a release');
});

test('cues fire once per press and wait for their reload; the arm switch blocks pyro but not fog', () => {
  const s = FX.createUnitState();
  let shots = 0;
  for (let t = 0; t < 1; t += 0.05) if (FX.stepUnit(s, 'confetti', true, t)) shots++;
  assert.strictEqual(shots, 1, 'held down is one shot');
  FX.stepUnit(s, 'confetti', false, 1); assert.strictEqual(FX.stepUnit(s, 'confetti', true, 1.05), false, 'still reloading');
  FX.stepUnit(s, 'confetti', false, 2); assert.strictEqual(FX.stepUnit(s, 'confetti', true, 2.05), true);
  const p = FX.createUnitState();
  assert.strictEqual(FX.stepUnit(p, 'mine', true, 0, false), false);
  const f = FX.createUnitState();
  assert.strictEqual(FX.stepUnit(f, 'fog', true, 0, false), true);
});

test('DMX: flames need arm and fire, outputs scale, lasers read pattern slices', () => {
  const data = new Uint8Array(512);
  data[9] = 255; // channel 10: fire only
  assert.strictEqual(FX.decodeFx('flame', data, 9).fire, false);
  data[8] = 200; // channel 9: arm
  assert.strictEqual(FX.decodeFx('flame', data, 9).fire, true);
  data[19] = 128; assert.ok(Math.abs(FX.decodeFx('fog', data, 20).level - 128 / 255) < 1e-9);
  data[30] = 0; assert.strictEqual(FX.decodeLaser(data, 30).pattern, 'off');
  data[30] = 255; assert.strictEqual(FX.decodeLaser(data, 30).pattern, FX.LASER_IDS[FX.LASER_IDS.length - 1]);
  // The rig builder's effect types use the same channel layouts.
  for (const k of FX.KIND_IDS) assert.deepStrictEqual(RIG.TYPES[k].channels, FX.FX_CHANNELS[k], k);
  assert.deepStrictEqual(RIG.TYPES.laser.channels, FX.LASER_CHANNELS);
});

test('a flame jet rises several metres and burns out', () => {
  const P = pools(); let top = 0;
  run(P, { kind: 'flame', pos: [0, 2, 0], dir: [0, 1, 0] }, 1, { each: (p) => { top = Math.max(top, maxY(p.glow)); } });
  assert.ok(top > 6 && top < 14, `flame top ${top}`);
  run(P, { kind: 'flame', pos: [0, 2, 0], dir: [0, 1, 0] }, 2, { until: 0 });
  assert.strictEqual(P.glow.n, 0);
});

test('confetti goes up, hangs in the air, drifts out over the crowd and lands', () => {
  const P = pools(); let top = 0, airborneAt8 = 0;
  const aim = 35 * Math.PI / 180;
  run(P, { kind: 'confetti', pos: [0, 2.5, -1.5], dir: [0, Math.cos(aim), Math.sin(aim)] }, 20, {
    until: 0.2,
    each: (p, t) => { top = Math.max(top, maxY(p.paper)); if (Math.abs(t - 8) < 1e-6 || (t > 7.99 && t < 8.01)) { for (let i = 0; i < p.paper.n; i++) if (!p.paper.landed[i]) airborneAt8++; } },
  });
  assert.ok(top > 7, `confetti top ${top}`);
  assert.ok(airborneAt8 > 1000, `${airborneAt8} pieces still in the air after 8 s`);
  let z = 0, landed = 0; for (let i = 0; i < P.paper.n; i++) { z += P.paper.p[i * 3 + 2]; landed += P.paper.landed[i]; }
  assert.ok(z / P.paper.n > 2, `mean distance ${z / P.paper.n}`);
  assert.ok(landed > P.paper.n * 0.9, 'most have landed by 20 s');
  for (let i = 0; i < P.paper.n; i++) if (P.paper.landed[i]) assert.ok(Math.abs(P.paper.p[i * 3 + 1] - 0.01) < 1e-6);
});

test('landing uses the first surface below, so a deck catches what falls on it', () => {
  const P = pools();
  const deck = (x, z, y) => (z < 0 && y >= 2 ? 2 : 0);
  run(P, { kind: 'snow', pos: [0, 10, -3], dir: [0, -1, 0] }, 12, { until: 0.5, ground: deck });
  let onDeck = 0, n = 0; for (let i = 0; i < P.puff.n; i++) if (P.puff.landed[i]) { n++; if (P.puff.p[i * 3 + 2] < 0 && Math.abs(P.puff.p[i * 3 + 1] - 2.01) < 1e-6) onDeck++; }
  assert.ok(n > 50 && onDeck > n * 0.5, `${onDeck} of ${n} on the deck`);
});

test('a firework shell bursts into stars high above the stage', () => {
  const P = pools(); const bursts = [];
  run(P, { kind: 'firework', pos: [0, 0, -20], dir: [0, 1, 0] }, 2.5, { until: 0.02, onBurst: (at) => bursts.push(at) });
  assert.strictEqual(bursts.length, 1);
  assert.ok(bursts[0][1] > 18 && bursts[0][1] < 40, `burst at ${bursts[0][1]} m`);
  assert.ok(P.glow.n > 200);
});

test('low fog stays on the floor', () => {
  const P = pools(); let top = 0;
  run(P, { kind: 'fog', pos: [0, 0.2, 0], dir: [0, 0, 1] }, 6, { each: (p, t) => { if (t > 2) top = Math.max(top, maxY(p.puff)); } });
  assert.ok(P.puff.n > 100);
  assert.ok(top < 0.9, `fog rose to ${top}`);
});

test('pools never overflow', () => {
  const P = { glow: FX.createPool(500), puff: FX.createPool(100), paper: FX.createPool(100) };
  run(P, { kind: 'gerb', pos: [0, 0, 0], dir: [0, 1, 0] }, 1);
  run(P, { kind: 'confetti', pos: [0, 0, 0], dir: [0, 1, 0] }, 0.1);
  assert.ok(P.glow.n <= 500 && P.paper.n <= 100);
});
