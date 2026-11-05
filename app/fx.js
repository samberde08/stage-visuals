/* Lasers and performance effects: laser beam patterns, and flame, CO2, spark, confetti, pyro, fog, snow and bubble
 * units with their firing rules, DMX channels and particles. No DOM or three.js, so node --test runs it; the page copies
 * the particle arrays into GPU buffers and draws them. Positions are app space: metres, Y up, audience toward +z.
 * The firing rules follow how show control treats special effects: an arm switch, hold-to-fire for jets with a minimum
 * burst and a safety cut-off, one-shot cues with a reload time for cannons and pyro. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StageFx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const DEG = Math.PI / 180;
  const frac = (x) => x - Math.floor(x);

  /* ---------- Lasers ---------- */
  const LASER_PATTERNS = [
    { id: 'off', label: 'Off' },
    { id: 'fan', label: 'Fan' },
    { id: 'sweep', label: 'Sweep' },
    { id: 'scan', label: 'Crowd scan' },
    { id: 'tunnel', label: 'Tunnel (cone)' },
    { id: 'sheet', label: 'Liquid sky' },
    { id: 'wave', label: 'Wave' },
    { id: 'chase', label: 'Chase' },
    { id: 'cross', label: 'Cross' },
    { id: 'burst', label: 'Beat burst' },
  ];
  const LASER_IDS = LASER_PATTERNS.map((p) => p.id);
  const MAX_BEAMS = 24;
  // One laser's beams for a frame. beat drives the motion, sync is the music's own beat (for flashes), li and nl are
  // this laser's index and the count, nb the beam count. Angles in radians: yaw turns a beam across the fan, pitch
  // lifts it (negative is up), tilt is the whole head's. on is each beam's level, flick the head's.
  function laserFrame(pattern, beat, sync, li, nl, nb, out) {
    out = out || { yaw: new Float32Array(MAX_BEAMS), pitch: new Float32Array(MAX_BEAMS), on: new Float32Array(MAX_BEAMS) };
    nb = clamp(Math.round(nb), 1, MAX_BEAMS);
    out.n = pattern === 'sheet' ? MAX_BEAMS : nb; out.tilt = 0; out.flick = 1;
    const n = out.n, u = (b) => (n === 1 ? 0 : b / (n - 1) - 0.5) * 2;
    for (let b = 0; b < MAX_BEAMS; b++) { out.yaw[b] = 0; out.pitch[b] = 0; out.on[b] = b < n ? 1 : 0; }
    const fan = (half) => { for (let b = 0; b < n; b++) out.yaw[b] = u(b) * half * DEG; };
    switch (pattern) {
      case 'fan': fan(14 + 22 * (0.5 + 0.5 * Math.sin(beat * Math.PI / 8))); out.tilt = -(3 + 5 * Math.sin(beat * Math.PI / 4 + li)) * DEG; break;
      case 'sweep': { const s = 45 * Math.sin(beat * Math.PI / 4 + li * 0.9); fan(3); for (let b = 0; b < n; b++) out.yaw[b] += s * DEG; out.tilt = -4 * DEG; break; }
      case 'scan': fan(32); out.tilt = (1.5 + 1.5 * Math.sin(beat * Math.PI / 2 + li)) * DEG; out.flick = frac(sync * 2) < 0.5 ? 1 : 0.15; break;
      case 'tunnel': {
        const r = (5 + 2.5 * Math.sin(beat * Math.PI / 8)) * DEG, spin = beat * Math.PI / 4 * (li % 2 ? -1 : 1);
        for (let b = 0; b < n; b++) { const a = (b / n) * Math.PI * 2 + spin; out.yaw[b] = r * Math.cos(a); out.pitch[b] = r * Math.sin(a); }
        out.tilt = -2 * DEG; break;
      }
      case 'sheet': fan(38); for (let b = 0; b < n; b++) out.pitch[b] = 1.4 * DEG * Math.sin(beat * Math.PI / 2 + b * 0.45 + li); out.tilt = -1.5 * DEG; break;
      case 'wave': fan(30); for (let b = 0; b < n; b++) out.pitch[b] = 7 * DEG * Math.sin(beat * Math.PI / 2 + b * 0.8 + li); out.tilt = -5 * DEG; break;
      case 'chase': {
        fan(30); out.tilt = -4 * DEG;
        const i = Math.floor(beat * 2 + li) % n;
        for (let b = 0; b < n; b++) out.on[b] = b === i || b === n - 1 - i ? 1 : 0.04;
        break;
      }
      case 'cross': { const s = 35 * Math.sin(beat * Math.PI / 4) * (li % 2 ? -1 : 1); fan(2); for (let b = 0; b < n; b++) out.yaw[b] += s * DEG; out.tilt = -4 * DEG; break; }
      case 'burst': fan(35); out.tilt = -5 * DEG; out.flick = 0.08 + 0.92 * Math.exp(-frac(sync) * 6); break;
      default: out.flick = 0;
    }
    return out;
  }

  /* ---------- Effect units ---------- */
  // How each kind fires. hold: runs while asked, at least min seconds once started and at most max (then it must be
  // released), then cool seconds before it can fire again. shot: one cue per press, emitting for dur seconds, then a
  // reload of cool seconds. latch: atmosphere that the pad switches on and off. armed: needs the arm switch.
  const KINDS = {
    flame: { label: 'Flame jet', mode: 'hold', min: 0.25, max: 4, cool: 0.15, armed: true, trigger: 'fx.flame', light: [1, 0.55, 0.15] },
    co2: { label: 'CO2 jet', mode: 'hold', min: 0.5, max: 8, cool: 0.1, armed: true, trigger: 'fx.co2' },
    spark: { label: 'Sparkular (cold spark)', mode: 'hold', min: 1, max: 30, cool: 0, armed: true, trigger: 'fx.spark', light: [1, 0.75, 0.4] },
    confetti: { label: 'Confetti cannon', mode: 'shot', dur: 0.25, cool: 1.5, armed: true, trigger: 'fx.confetti' },
    streamer: { label: 'Streamer cannon', mode: 'shot', dur: 0.2, cool: 1.5, armed: true, trigger: 'fx.confetti' },
    gerb: { label: 'Gerb (pyro fountain)', mode: 'shot', dur: 2.5, cool: 0.5, armed: true, trigger: 'fx.pyro', light: [1, 0.8, 0.5] },
    comet: { label: 'Comet', mode: 'shot', dur: 0.05, cool: 0.6, armed: true, trigger: 'fx.pyro', light: [1, 0.85, 0.6] },
    mine: { label: 'Mine', mode: 'shot', dur: 0.05, cool: 1, armed: true, trigger: 'fx.pyro', light: [1, 0.7, 0.4] },
    firework: { label: 'Firework airburst', mode: 'shot', dur: 0.05, cool: 1.2, armed: true, trigger: 'fx.pyro', light: [1, 0.85, 0.7] },
    smoke: { label: 'Smoke jet', mode: 'hold', min: 0.4, max: 10, cool: 0, armed: false, trigger: 'fx.smoke' },
    fog: { label: 'Low fog (dry ice)', mode: 'latch', armed: false, trigger: 'fx.fog' },
    snow: { label: 'Snow machine', mode: 'latch', armed: false, trigger: 'fx.snow' },
    bubble: { label: 'Bubble machine', mode: 'latch', armed: false, trigger: 'fx.snow' },
  };
  const KIND_IDS = Object.keys(KINDS);

  function createUnitState() { return { active: false, since: 0, until: 0, ready: 0, prev: false, shots: 0, level: 1 }; }
  // One frame of a unit. want is whether anything (pad, audio link, console, drop) asks it to fire. Returns true on the
  // frame a shot or a jet starts.
  function stepUnit(s, kind, want, now, armed = true) {
    const k = KINDS[kind];
    if (k.armed && !armed) want = false;
    const rising = want && !s.prev; s.prev = want;
    let started = false;
    if (k.mode === 'shot') {
      if (rising && now >= s.ready) { s.active = true; s.since = now; s.until = now + k.dur; s.ready = now + k.dur + k.cool; s.shots++; started = true; }
      else if (s.active && now >= s.until) s.active = false;
    } else if (k.mode === 'hold') {
      if (!s.active && want && now >= s.ready && !s.tripped) { s.active = true; s.since = now; s.shots++; started = true; }
      if (s.active) {
        const held = now - s.since;
        if ((!want && held >= k.min) || held >= k.max) { s.active = false; s.ready = now + k.cool; s.tripped = want; }
      }
      if (!want) s.tripped = false;
    } else {
      if (want && !s.active) { s.active = true; s.since = now; s.shots++; started = true; } else if (!want) s.active = false;
    }
    return started;
  }

  // DMX layouts for the effect types the rig builder places. 1-based offsets; fire channels fire at 50 % and up.
  const FX_CHANNELS = {
    flame: { arm: 1, fire: 2 }, co2: { fire: 1 }, spark: { fire: 1, height: 2 }, confetti: { fire: 1 }, streamer: { fire: 1 },
    gerb: { fire: 1 }, comet: { fire: 1 }, mine: { fire: 1 }, firework: { fire: 1 }, smoke: { fire: 1 },
    fog: { output: 1 }, snow: { output: 1 }, bubble: { output: 1 },
  };
  const LASER_CHANNELS = { dim: 1, pattern: 2, size: 3, speed: 4, tilt: 5, r: 6, g: 7, b: 8 };
  function decodeFx(kind, data, offset) {
    const C = FX_CHANNELS[kind] || { fire: 1 }, c = (k) => (C[k] ? data[offset + C[k] - 2] || 0 : null);
    if (C.output) { const v = c('output'); return { fire: v >= 13, level: v / 255 }; }
    const fire = c('fire') >= 128 && (C.arm ? c('arm') >= 128 : true);
    return { fire, level: C.height ? 0.3 + 0.7 * c('height') / 255 : 1 };
  }
  // A laser on DMX: dimmer, pattern (equal slices of the range, the first one off), size, speed, tilt and colour.
  function decodeLaser(data, offset) {
    const c = (k) => data[offset + LASER_CHANNELS[k] - 2] || 0;
    const p = Math.min(LASER_IDS.length - 1, Math.floor(c('pattern') / 256 * LASER_IDS.length));
    return { dim: c('dim') / 255, pattern: LASER_IDS[p], size: c('size') / 127.5, speed: c('speed') / 63.75, tilt: (c('tilt') / 255 - 0.5) * 40 * DEG, r: c('r') / 255, g: c('g') / 255, b: c('b') / 255 };
  }

  /* ---------- Particles ---------- */
  // Three pools, by how they are drawn: glow (fire and sparks, added light), puff (CO2, smoke, fog, snow, bubbles,
  // blended) and paper (confetti and streamers, lit flat pieces). Struct-of-arrays, swap-removed when they die.
  const STYLE = { glow: 0, puff: 1, paper: 2 };
  function createPool(max) {
    const F = (k = 1) => new Float32Array(max * k);
    return {
      max, n: 0, p: F(3), v: F(3), age: F(), life: F(), s0: F(), s1: F(), c0: F(3), c1: F(3), a0: F(), fin: F(), fout: F(),
      drag: F(), qdrag: F(), grav: F(), sway: F(), bounce: F(), rest: F(), spin: F(), ang: F(), axis: F(3), w: F(), h: F(),
      trail: F(), burst: new Uint8Array(max), shape: new Uint8Array(max), seed: F(), landed: new Uint8Array(max),
    };
  }
  const LAYOUT = ['p', 'v', 'c0', 'c1', 'axis'];
  function kill(P, i) {
    const j = --P.n;
    if (i === j) return;
    for (const k of LAYOUT) { const a = P[k]; a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; }
    for (const k of ['age', 'life', 's0', 's1', 'a0', 'fin', 'fout', 'drag', 'qdrag', 'grav', 'sway', 'bounce', 'rest', 'spin', 'ang', 'w', 'h', 'trail', 'burst', 'shape', 'seed', 'landed']) P[k][i] = P[k][j];
  }
  // Add one particle. o: pos, vel, life, size [from, to], col [r,g,b], col1, alpha, fadeIn, fadeOut, drag, qdrag
  // (quadratic, for paper), grav (m/s², negative falls), sway, bounce, rest (seconds a landed piece stays), spin,
  // w and h (paper size), trail (sparks per second behind it), burst (1: a firework shell), shape (puff: 0 cloud,
  // 1 bubble, 2 flake).
  function spawn(P, o) {
    if (P.n >= P.max) return -1;
    const i = P.n++, r = o.rnd || Math.random;
    P.p.set(o.pos, i * 3); P.v.set(o.vel, i * 3);
    P.age[i] = 0; P.life[i] = o.life; P.s0[i] = o.size[0]; P.s1[i] = o.size[1];
    P.c0.set(o.col, i * 3); P.c1.set(o.col1 || o.col, i * 3);
    P.a0[i] = o.alpha ?? 1; P.fin[i] = o.fadeIn ?? 0; P.fout[i] = o.fadeOut ?? 1;
    P.drag[i] = o.drag || 0; P.qdrag[i] = o.qdrag || 0; P.grav[i] = o.grav || 0; P.sway[i] = o.sway || 0;
    P.bounce[i] = o.bounce || 0; P.rest[i] = o.rest || 0; P.spin[i] = o.spin || 0; P.ang[i] = r() * 6.283;
    const ax = [r() - 0.5, r() - 0.5, r() - 0.5], al = Math.hypot(...ax) || 1; P.axis.set(ax.map((x) => x / al), i * 3);
    P.w[i] = o.w || 0; P.h[i] = o.h || 0; P.trail[i] = o.trail || 0; P.burst[i] = o.burst || 0; P.shape[i] = o.shape || 0;
    P.seed[i] = r() * 100; P.landed[i] = 0;
    return i;
  }

  // A direction within a cone of half-angle `half` (radians) around unit vector d.
  function cone(d, half, r) {
    const ax = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let a = [d[1] * ax[2] - d[2] * ax[1], d[2] * ax[0] - d[0] * ax[2], d[0] * ax[1] - d[1] * ax[0]];
    const al = Math.hypot(...a); a = a.map((x) => x / al);
    const b = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]];
    const ct = 1 - r() * (1 - Math.cos(half)), st = Math.sqrt(1 - ct * ct), ph = r() * Math.PI * 2;
    return [0, 1, 2].map((k) => d[k] * ct + (a[k] * Math.cos(ph) + b[k] * Math.sin(ph)) * st);
  }
  const PALETTE = [[1, 0.78, 0.25], [0.85, 0.88, 0.95], [1, 0.2, 0.3], [0.2, 0.5, 1], [1, 0.35, 0.75], [0.25, 0.95, 0.5], [0.7, 0.35, 1]];
  const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];

  // Emit for one active unit over dt seconds. u: { kind, pos, dir, level (0..1 output or height), scale (throw and
  // jet height), colors (optional list of [r,g,b] for paper and pyro), carry (fractional particle carry-over, kept on u) }.
  // started is true on the frame a cue fires, which is when one-shot kinds launch.
  function emit(pools, u, dt, r = Math.random, started = false) {
    const { kind, pos, dir } = u, L = u.level ?? 1, S = u.scale ?? 1;
    const many = (rate) => { u.carry = (u.carry || 0) + rate * dt; const n = Math.floor(u.carry); u.carry -= n; return n; };
    const scale = (d, s) => d.map((x) => x * s * S);
    const jit = (p, s) => p.map((x) => x + (r() - 0.5) * s);
    const G = pools.glow, Pf = pools.puff, Pp = pools.paper;
    switch (kind) {
      case 'flame': for (let i = many(1100); i--;) {
        const sp = 15 + r() * 5;
        spawn(G, { rnd: r, pos: jit(pos, 0.12), vel: scale(cone(dir, 4 * DEG, r), sp), life: 0.35 + r() * 0.3, size: [0.3, 2.2], col: [1, 0.72, 0.3], col1: [0.85, 0.16, 0.02], alpha: 0.2, fadeIn: 0.05, fadeOut: 1.6, drag: 1.8, grav: 7 });
        if (r() < 0.02) spawn(Pf, { rnd: r, pos: [pos[0] + dir[0] * 6 * S, pos[1] + dir[1] * 6 * S, pos[2] + dir[2] * 6 * S], vel: scale(cone(dir, 15 * DEG, r), 1.5), life: 1.5 + r(), size: [1.2, 3], col: [0.3, 0.27, 0.25], alpha: 0.12, fadeIn: 0.3, fadeOut: 1.5, drag: 0.8, grav: 1.5, sway: 0.4 });
      } break;
      case 'co2': for (let i = many(520); i--;) {
        spawn(Pf, { rnd: r, pos: jit(pos, 0.05), vel: scale(cone(dir, 5 * DEG, r), 20 + r() * 6), life: 1 + r() * 0.8, size: [0.25, 2.6], col: [0.95, 0.97, 1], alpha: 0.42, fadeIn: 0.02, fadeOut: 2.2, drag: 2.6, grav: 0.4, sway: 0.6 });
      } break;
      case 'smoke': for (let i = many(160); i--;) {
        spawn(Pf, { rnd: r, pos: jit(pos, 0.08), vel: scale(cone(dir, 7 * DEG, r), 9 + r() * 3), life: 3 + r() * 1.5, size: [0.4, 5], col: [0.5, 0.5, 0.52], alpha: 0.4, fadeIn: 0.05, fadeOut: 1.2, drag: 1.4, grav: 0.3, sway: 0.8 });
      } break;
      case 'spark': case 'gerb': {
        const g = kind === 'gerb', sp = (g ? 11 : 7.5) * (g ? 1 : L);
        for (let i = many(g ? 900 : 650); i--;) spawn(G, { rnd: r, pos: jit(pos, 0.05), vel: scale(cone(dir, (g ? 10 : 7) * DEG, r), sp * (0.8 + r() * 0.35)), life: 0.7 + r() * 0.7, size: [0.07, 0.035], col: [1, 0.97, 0.8], col1: g ? [1, 0.45, 0.08] : [1, 0.6, 0.2], alpha: 1, fadeOut: 0.7, drag: 0.35, grav: -9.8, bounce: 0.3 });
        break;
      }
      case 'comet': if (started) spawn(G, { rnd: r, pos: [...pos], vel: scale(cone(dir, 2 * DEG, r), 30 + r() * 4), life: 1.7, size: [0.55, 0.3], col: pick(u.colors || [[1, 0.85, 0.5]], r), alpha: 1, fadeOut: 0.4, drag: 0.15, grav: -9.8, trail: 260 }); break;
      case 'mine': if (started) {
        const c = pick(u.colors || PALETTE, r);
        for (let i = 0; i < 260; i++) spawn(G, { rnd: r, pos: jit(pos, 0.1), vel: scale(cone(dir, 22 * DEG, r), 12 + r() * 14), life: 0.9 + r() * 0.8, size: [0.28, 0.12], col: [1, 1, 0.9], col1: c, alpha: 1, fadeOut: 1.2, drag: 0.9, grav: -9.8 });
      } break;
      case 'firework': if (started) spawn(G, { rnd: r, pos: [...pos], vel: scale(cone(dir, 3 * DEG, r), 25 + r() * 3), life: 1.3 + r() * 0.25, size: [0.3, 0.25], col: [1, 0.8, 0.5], alpha: 1, fadeOut: 0, drag: 0.1, grav: -9.8, trail: 90, burst: 1 }); break;
      case 'confetti': case 'streamer': {
        const s = kind === 'streamer', n = started ? (s ? 60 : 1600) : 0;
        for (let i = 0; i < n; i++) {
          const c = pick(u.colors || PALETTE, r);
          spawn(Pp, { rnd: r, pos: jit(pos, 0.15), vel: scale(cone(dir, (s ? 9 : 13) * DEG, r), (s ? 22 : 18) + r() * 9), life: 14 + r() * 8, size: [1, 1], col: c, alpha: 1, fadeOut: 0, drag: 0.2, qdrag: s ? 3 : 20, grav: -9.8, sway: s ? 0.5 : 1.4, spin: s ? 1.5 + r() * 2 : 5 + r() * 9, rest: 8, w: s ? 0.06 : 0.06, h: s ? 2.2 : 0.08 });
        }
        break;
      }
      case 'fog': for (let i = many(55 * L); i--;) {
        spawn(Pf, { rnd: r, pos: jit(pos, 0.2), vel: scale(cone([dir[0], 0, dir[2]].map((x, k, a) => x / (Math.hypot(a[0], a[2]) || 1)), 35 * DEG, r), 2.5 + r() * 2).map((x, k) => (k === 1 ? 0 : x)), life: 7 + r() * 4, size: [0.6, 4.5], col: [0.92, 0.94, 1], alpha: 0.3, fadeIn: 0.15, fadeOut: 1.2, drag: 0.5, grav: -1.5, sway: 0.3, bounce: 0, rest: 99 });
      } break;
      case 'snow': for (let i = many(420 * L); i--;) {
        spawn(Pf, { rnd: r, pos: jit(pos, 0.3), vel: scale(cone(dir, 55 * DEG, r), 1.5 + r() * 2.5), life: 14 + r() * 6, size: [0.05, 0.05], col: [1, 1, 1], alpha: 0.95, fadeIn: 0.02, fadeOut: 0.2, drag: 10, grav: -8, sway: 0.5, rest: 4, shape: 2 });
      } break;
      case 'bubble': for (let i = many(35 * L); i--;) {
        const sz = 0.05 + r() * 0.1;
        spawn(Pf, { rnd: r, pos: jit(pos, 0.2), vel: scale(cone(dir, 25 * DEG, r), 2 + r() * 1.5), life: 5 + r() * 4, size: [sz, sz], col: [0.9, 0.95, 1], alpha: 0.8, fadeIn: 0.05, fadeOut: 0.05, drag: 1.4, grav: -0.35, sway: 0.35, shape: 1 });
      } break;
      default: break;
    }
  }

  // Age, move and land every particle. env: { ground(x, z, y) -> the height of the first surface below y, wind: [x, z],
  // time, colors (firework stars), onBurst(pos, colour) }. Landed paper and snow lie
  // still until their rest time runs out; firework shells burst into stars where they burn out; trails leave sparks.
  function step(pools, dt, env = {}, r = Math.random) {
    const ground = env.ground || (() => 0), t = env.time || 0, wind = env.wind || [0, 0];
    for (const [name, P] of Object.entries(pools)) {
      const st = STYLE[name];
      for (let i = P.n - 1; i >= 0; i--) {
        P.age[i] += dt;
        const i3 = i * 3;
        if (P.age[i] >= P.life[i]) {
          if (P.burst[i] === 1) {
            const c = pick(env.colors || PALETTE, r), c2 = r() < 0.4 ? pick(PALETTE, r) : c, at = [P.p[i3], P.p[i3 + 1], P.p[i3 + 2]];
            for (let k = 0; k < 320; k++) {
              const d = cone([0, 1, 0], Math.PI, r), sp = 9 + r() * 4;
              spawn(pools.glow, { rnd: r, pos: at, vel: d.map((x) => x * sp), life: 1.4 + r() * 1.2, size: [0.32, 0.12], col: (k % 2 ? c : c2).map((x) => Math.min(1, x + 0.35)), col1: k % 2 ? c : c2, alpha: 1, fadeOut: 0.9, drag: 1.3, grav: -3.5 });
            }
            if (env.onBurst) env.onBurst(at, c);
          }
          kill(P, i); continue;
        }
        if (P.landed[i]) continue;
        const v = P.v, p = P.p;
        if (P.qdrag[i]) {
          // Paper: thrown as a clump for half a second, it opens out and then drifts down at under a metre a second.
          const sp = Math.hypot(v[i3], v[i3 + 1], v[i3 + 2]), k = P.qdrag[i] * clamp((P.age[i] - 0.45) / 1.1, 0.001, 1) * sp * dt;
          const f = 1 / (1 + k); v[i3] *= f; v[i3 + 1] *= f; v[i3 + 2] *= f;
        }
        if (P.drag[i]) { const f = Math.exp(-P.drag[i] * dt); v[i3] *= f; v[i3 + 1] *= f; v[i3 + 2] *= f; }
        v[i3 + 1] += P.grav[i] * dt;
        const sw = P.sway[i];
        let sx = 0, sz = 0;
        if (sw) { const ph = t * 1.7 + P.seed[i]; sx = (Math.sin(ph) + wind[0]) * sw; sz = (Math.cos(ph * 0.83) + wind[1]) * sw; }
        const y0 = p[i3 + 1];
        p[i3] += (v[i3] + sx) * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += (v[i3 + 2] + sz) * dt;
        P.ang[i] += P.spin[i] * dt;
        if (P.trail[i]) {
          const n = Math.floor(P.trail[i] * dt + r());
          for (let k = 0; k < n; k++) spawn(pools.glow, { rnd: r, pos: [p[i3], p[i3 + 1], p[i3 + 2]], vel: [(r() - 0.5) * 1.5, (r() - 0.5) * 1.5, (r() - 0.5) * 1.5], life: 0.35 + r() * 0.4, size: [0.12, 0.04], col: [1, 0.9, 0.6], col1: [1, 0.45, 0.1], alpha: 0.9, fadeOut: 1, drag: 2, grav: -3 });
        }
        if (v[i3 + 1] < 0) {
          const gy = ground(p[i3], p[i3 + 2], y0 + 0.05);
          if (p[i3 + 1] < gy) {
            if (P.bounce[i] && v[i3 + 1] < -1) { p[i3 + 1] = gy; v[i3 + 1] *= -P.bounce[i]; v[i3] *= 0.5; v[i3 + 2] *= 0.5; }
            else if (st === STYLE.puff && !P.rest[i]) { p[i3 + 1] = gy; v[i3 + 1] = 0; }
            else if (P.rest[i]) {
              // Fog keeps rolling along the floor; paper and snow settle.
              p[i3 + 1] = gy + (st === STYLE.puff && P.shape[i] === 0 ? P.s1[i] * 0.12 : 0.01);
              if (st === STYLE.puff && P.shape[i] === 0) v[i3 + 1] = 0;
              else { P.landed[i] = 1; P.life[i] = Math.min(P.life[i], P.age[i] + P.rest[i]); v[i3] = v[i3 + 1] = v[i3 + 2] = 0; }
            } else P.life[i] = P.age[i];
          }
        }
      }
    }
  }

  // Per-particle draw values: size now, and colour times alpha (glow) or colour plus alpha (puff, paper).
  function look(P, i, out) {
    const t = P.age[i] / P.life[i], fin = P.fin[i], fo = P.fout[i];
    let a = P.a0[i] * (fin > 0 ? Math.min(1, t / fin) : 1) * (fo > 0 ? Math.pow(Math.max(0, 1 - t), fo) : 1);
    if (P.landed[i] && P.rest[i]) a *= Math.min(1, (P.life[i] - P.age[i]) / 1.5);
    const i3 = i * 3;
    out[0] = P.c0[i3] + (P.c1[i3] - P.c0[i3]) * t; out[1] = P.c0[i3 + 1] + (P.c1[i3 + 1] - P.c0[i3 + 1]) * t; out[2] = P.c0[i3 + 2] + (P.c1[i3 + 2] - P.c0[i3 + 2]) * t;
    out[3] = a; out[4] = P.s0[i] + (P.s1[i] - P.s0[i]) * Math.sqrt(t);
    return out;
  }

  return { LASER_PATTERNS, LASER_IDS, MAX_BEAMS, laserFrame, KINDS, KIND_IDS, createUnitState, stepUnit, FX_CHANNELS, LASER_CHANNELS, decodeFx, decodeLaser, STYLE, createPool, spawn, emit, step, look, cone, PALETTE };
});
