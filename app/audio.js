/* Audio reactivity engine: turns an FFT stream into show features (bands, kick/snare/hat hits, tempo and beat phase,
 * builds and drops) and runs a modulation matrix that maps those features onto show parameters.
 * Plain functions with no DOM or Web Audio, so the page feeds it AnalyserNode frames and node --test feeds it synthetic ones.
 * The idea of per-parameter audio envelopes with gain, band and attack/release follows how VJ and lighting tools expose
 * audio reactivity in their manuals; the code is our own. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StageAudio = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const EPS = 1e-9;

  // Frequency bands (Hz). Onset detectors listen to narrower ranges so a kick does not read as a snare.
  const BANDS = { sub: [20, 60], bass: [60, 250], lowmid: [250, 500], mid: [500, 2000], highmid: [2000, 6000], high: [6000, 16000] };
  const ONSETS = {
    kick: { ranges: [[40, 130]], gap: 0.2, k: 1.6, decay: 0.16 },
    snare: { ranges: [[150, 280], [1800, 5000]], gap: 0.12, k: 1.7, decay: 0.14 },
    hat: { ranges: [[7000, 15000]], gap: 0.06, k: 1.5, decay: 0.07 },
  };

  // Everything a mapping can listen to.
  const SOURCES = [
    { id: 'level', label: 'Overall level' },
    { id: 'sub', label: 'Sub (20-60 Hz)' },
    { id: 'bass', label: 'Bass (60-250 Hz)' },
    { id: 'lowmid', label: 'Low mids (250-500 Hz)' },
    { id: 'mid', label: 'Mids (0.5-2 kHz)' },
    { id: 'highmid', label: 'High mids (2-6 kHz)' },
    { id: 'high', label: 'Highs (6-16 kHz)' },
    { id: 'kick', label: 'Kick hit' },
    { id: 'snare', label: 'Snare / clap hit' },
    { id: 'hat', label: 'Hi-hat hit' },
    { id: 'beat', label: 'Beat pulse' },
    { id: 'bar', label: 'Bar pulse (every 4 beats)' },
    { id: 'phase', label: 'Beat ramp (saw)' },
    { id: 'sine', label: 'Slow sine (1 bar)' },
    { id: 'build', label: 'Build-up tension' },
    { id: 'drop', label: 'Drop hit' },
    { id: 'band', label: 'Custom band (drag on spectrum)' },
  ];

  // Everything a mapping can drive. 'scale' targets multiply their base (a dimmer ducks to 1 - amount when the source is silent);
  // 'add' targets offset it by amount x envelope, in the units the page gives them. `groups` lists which groups make sense.
  const RIG_GROUPS = ['all', 'hang', 'floor', 'odd', 'even', 'left', 'right', 'centre'];
  const SIDE_GROUPS = ['all', 'left', 'right'];
  const DESTS = [
    { id: 'rig.dim', label: 'Lights: dimmer', kind: 'scale', groups: RIG_GROUPS },
    { id: 'rig.strobe', label: 'Lights: strobe', kind: 'add', groups: RIG_GROUPS },
    { id: 'rig.white', label: 'Lights: white flash', kind: 'add', groups: RIG_GROUPS },
    { id: 'rig.hue', label: 'Lights: colour shift', kind: 'add', groups: RIG_GROUPS },
    { id: 'rig.zoom', label: 'Lights: beam size', kind: 'add', groups: RIG_GROUPS },
    { id: 'rig.size', label: 'Lights: movement size', kind: 'scale', groups: RIG_GROUPS },
    { id: 'rig.speed', label: 'Lights: movement speed', kind: 'add', groups: ['all'] },
    { id: 'rig.tilt', label: 'Lights: tilt lift', kind: 'add', groups: RIG_GROUPS },
    { id: 'laser.dim', label: 'Lasers: intensity', kind: 'scale', groups: SIDE_GROUPS },
    { id: 'laser.spread', label: 'Lasers: fan spread', kind: 'add', groups: SIDE_GROUPS },
    { id: 'laser.speed', label: 'Lasers: speed', kind: 'add', groups: ['all'] },
    { id: 'laser.tilt', label: 'Lasers: height', kind: 'add', groups: SIDE_GROUPS },
    { id: 'laser.hue', label: 'Lasers: colour shift', kind: 'add', groups: SIDE_GROUPS },
    { id: 'led.dim', label: 'LED wall: brightness', kind: 'scale', groups: ['all'] },
    { id: 'led.flash', label: 'LED wall: flash', kind: 'add', groups: ['all'] },
    { id: 'led.speed', label: 'LED wall: motion speed', kind: 'add', groups: ['all'] },
    { id: 'haze', label: 'Haze density', kind: 'add', groups: ['all'] },
    { id: 'crowd', label: 'Crowd jumping', kind: 'add', groups: ['all'] },
    { id: 'cam.shake', label: 'Camera shake', kind: 'add', groups: ['all'] },
  ];
  const DEST_BY_ID = Object.fromEntries(DESTS.map((d) => [d.id, d]));
  const SOURCE_IDS = new Set(SOURCES.map((s) => s.id));

  /* ---------- Feature extraction ---------- */
  // dB-domain auto gain: each band is shown relative to its own recent peak, so a quiet laptop mic and a hot line-in both
  // span the full range. The peak falls back slowly (AGC_FALL seconds) so a breakdown still reads as quieter.
  const AGC_RANGE = 30, AGC_FALL = 6, NOISE = 1e-5;

  function createAnalyzer(opts = {}) {
    const a = {
      sampleRate: opts.sampleRate || 48000, fftSize: opts.fftSize || 2048,
      agc: opts.agc !== false, gainDb: opts.gainDb || 0,
      t: 0, prevLog: null, features: {}, peaks: {}, onsets: {}, history: {}, lastHit: {},
      kickTimes: [], tempo: { bpm: 0, confidence: 0, beat: 0, locked: false, lastEstimate: -1, target: 0, miss: 0 },
      slow: { bassP: 0, highP: 0, bassRef: -200, highRef: -200, breakTime: 0, dropAge: 99 }, raw: {},
      spectrum: null,
    };
    a.binHz = a.sampleRate / a.fftSize;
    for (const k of Object.keys(ONSETS)) { a.history[k] = []; a.lastHit[k] = -99; a.onsets[k] = 0; }
    for (const s of SOURCES) a.features[s.id] = 0;
    return a;
  }

  function bandPower(mags, binHz, lo, hi) {
    const i0 = Math.max(1, Math.floor(lo / binHz)), i1 = Math.min(mags.length - 1, Math.ceil(hi / binHz));
    let s = 0; for (let i = i0; i <= i1; i++) s += mags[i] * mags[i];
    return Math.sqrt(s / Math.max(1, i1 - i0 + 1));
  }

  // Map a linear amplitude to 0..1, either against the band's tracked peak (AGC) or against a fixed reference.
  function normalise(a, key, rms, dt) {
    const g = rms * Math.pow(10, a.gainDb / 20);
    if (a.agc) {
      const p = a.peaks[key] || 0;
      a.peaks[key] = Math.max(g, p * Math.exp(-dt / AGC_FALL), NOISE * 10);
      if (g < NOISE) return 0;
      return clamp(1 + 20 * Math.log10(g / a.peaks[key]) / AGC_RANGE);
    }
    if (g < NOISE) return 0;
    return clamp(1 + 20 * Math.log10(g / 0.05) / AGC_RANGE);
  }

  function median(arr) { const s = arr.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }

  // Spectral flux in the onset's ranges, peak-picked against an adaptive threshold over the last second.
  function detectOnset(a, key, logm, dt) {
    const def = ONSETS[key], prev = a.prevLog;
    let flux = 0, n = 0;
    for (const [lo, hi] of def.ranges) {
      const i0 = Math.max(1, Math.floor(lo / a.binHz)), i1 = Math.min(logm.length - 1, Math.ceil(hi / a.binHz));
      for (let i = i0; i <= i1; i++) { flux += Math.max(0, logm[i] - prev[i]); n++; }
    }
    flux /= Math.max(1, n);
    const h = a.history[key];
    h.push({ t: a.t, v: flux });
    while (h.length && h[0].t < a.t - 1) h.shift();
    const vals = h.map((x) => x.v), med = median(vals);
    let mad = 0; for (const v of vals) mad += Math.abs(v - med); mad /= Math.max(1, vals.length);
    const thr = med + def.k * mad + 0.004;
    let hit = 0;
    if (flux > thr && a.t - a.lastHit[key] >= def.gap) { hit = clamp((flux - thr) / (thr + EPS) + 0.5); a.lastHit[key] = a.t; }
    // The feature is the hit with its own short decay, so meters and simple mappings see a pulse.
    a.onsets[key] = Math.max(hit, a.onsets[key] * Math.exp(-dt / def.decay));
    return hit;
  }

  /* ---------- Tempo and beat phase ---------- */
  // Tempo from the spacing of recent kicks. Each candidate period scores every pair of kicks up to two seconds apart that
  // lands on a whole number of its beats, weighted 1/n so double time (which also fits every pair) loses to the true tempo.
  const BPM_LO = 88, BPM_HI = 176, SIGMA = 0.014;
  function estimateTempo(times) {
    if (times.length < 4) return null;
    const ds = [];
    for (let i = 0; i < times.length; i++) for (let j = i + 1; j < times.length && times[j] - times[i] <= 2.1; j++) ds.push(times[j] - times[i]);
    if (ds.length < 3) return null;
    const score = (bpm) => {
      const p = 60 / bpm; let s = 0;
      for (const d of ds) { const n = Math.round(d / p); if (n >= 1) s += Math.exp(-((d - n * p) ** 2) / (2 * SIGMA * SIGMA)) / n; }
      return s;
    };
    let best = BPM_LO, top = -1;
    for (let b = BPM_LO; b <= BPM_HI; b += 0.25) { const s = score(b); if (s > top) { top = s; best = b; } }
    for (let b = best - 0.25; b <= best + 0.25; b += 0.02) { const s = score(b); if (s > top) { top = s; best = b; } }
    // Confidence: how much of the best possible score (every pair on the grid) the winner explains.
    const p = 60 / best; let max = 0;
    for (const d of ds) max += 1 / Math.max(1, Math.round(d / p));
    return { bpm: best, confidence: clamp(top / (max + EPS)) };
  }

  // A phase-locked loop: the beat counter runs at the estimated tempo and every kick near a beat pulls it into line.
  function trackBeat(a, kickHit, dt) {
    const T = a.tempo;
    if (kickHit) {
      a.kickTimes.push(a.t);
      while (a.kickTimes.length && a.kickTimes[0] < a.t - 8) a.kickTimes.shift();
    }
    if (a.t - T.lastEstimate > 0.5) {
      T.lastEstimate = a.t;
      const est = estimateTempo(a.kickTimes);
      if (est) {
        T.confidence = est.confidence;
        T.target = est.bpm;
        if (!T.bpm) T.bpm = est.bpm;
      } else T.confidence *= 0.8;
    }
    if (T.target) T.bpm += (T.target - T.bpm) * clamp(dt * 2);
    if (a.kickTimes.length && a.t - a.kickTimes[a.kickTimes.length - 1] > 4) T.confidence *= Math.exp(-dt);
    if (T.bpm) T.beat += dt * T.bpm / 60;
    if (kickHit && T.bpm) {
      // Small errors are pulled in gently; three kicks in a row well off the beat mean the phase is wrong, so jump to them.
      const e = T.beat - Math.round(T.beat);
      if (Math.abs(e) < 0.2) { T.beat -= e * 0.35; T.miss = 0; }
      else if (++T.miss >= 3) { T.beat = Math.round(T.beat); T.miss = 0; }
    }
    T.locked = T.confidence > 0.35 && T.bpm > 0;
  }

  /* ---------- Builds and drops ---------- */
  // A breakdown is the bass sitting 10 dB or more under its recent peak (measured before auto gain, which would hide it);
  // tension builds the longer it lasts, and the drop is the bass coming back to within 5 dB after at least two seconds.
  function trackSections(a, kickHit, dt) {
    const S = a.slow, db = (p) => 10 * Math.log10(p + NOISE * NOISE), k = clamp(dt / 0.5);
    // Half-second power averages, so a pulsing kick reads as its loudness rather than its peaks.
    S.bassP += (a.raw.bass * a.raw.bass - S.bassP) * k;
    S.highP += (a.raw.high * a.raw.high - S.highP) * k;
    const bass = db(S.bassP), high = db(S.highP);
    S.bassRef = Math.max(bass, S.bassRef - dt * 0.3);
    S.highRef = Math.max(high, S.highRef - dt * 0.3);
    const under = S.bassRef - bass, silent = S.bassRef < db(NOISE * NOISE * 100);
    let drop = 0;
    if (!silent && under > 10) S.breakTime += dt;
    else if (under < 5) {
      if (S.breakTime > 2) { drop = 1; S.dropAge = 0; }
      S.breakTime = 0;
    }
    S.dropAge += dt;
    // Risers and snare rolls push the highs up during a build, so they add to the tension.
    const lift = clamp(1 - (S.highRef - high) / 12);
    const build = S.breakTime > 0 ? clamp(S.breakTime / 8) * (0.5 + 0.5 * lift) : 0;
    return { build, drop, dropPulse: S.dropAge < 6 ? Math.exp(-S.dropAge / 1.5) : 0 };
  }

  // One analysis step. `mags` are linear FFT magnitudes (AnalyserNode dB values converted with 10^(dB/20)).
  function analyze(a, mags, dt) {
    dt = clamp(dt, 0.001, 0.1);
    a.t += dt;
    a.spectrum = mags;
    const logm = new Float32Array(mags.length);
    for (let i = 0; i < mags.length; i++) logm[i] = Math.log1p(1000 * mags[i]);
    const f = a.features;
    let lv = 0; for (let i = 1; i < mags.length; i++) lv += mags[i] * mags[i];
    f.level = normalise(a, 'level', Math.sqrt(lv / mags.length) * 4, dt);
    for (const [k, [lo, hi]] of Object.entries(BANDS)) { a.raw[k] = bandPower(mags, a.binHz, lo, hi); f[k] = normalise(a, k, a.raw[k], dt); }
    let kickHit = 0;
    if (a.prevLog) {
      kickHit = detectOnset(a, 'kick', logm, dt);
      detectOnset(a, 'snare', logm, dt);
      detectOnset(a, 'hat', logm, dt);
    }
    a.prevLog = logm;
    f.kick = a.onsets.kick; f.snare = a.onsets.snare; f.hat = a.onsets.hat;
    trackBeat(a, kickHit, dt);
    beatFeatures(f, a.tempo.beat);
    const sec = trackSections(a, kickHit, dt);
    f.build = sec.build; f.drop = sec.dropPulse;
    a.dropNow = sec.drop;
    return f;
  }

  // Features that come from the beat counter alone; the page also calls this with its own clock when it owns the tempo.
  function beatFeatures(f, beat) {
    const fr = beat - Math.floor(beat), bar = (beat / 4) - Math.floor(beat / 4);
    f.beat = Math.exp(-fr * 6);
    f.bar = Math.exp(-bar * 4 * 3);
    f.phase = fr;
    f.sine = 0.5 - 0.5 * Math.cos(bar * Math.PI * 2);
    return f;
  }

  // Level of an arbitrary band on the last spectrum, for 'band' mappings. Normalised with its own AGC slot.
  function customBand(a, lo, hi, dt) {
    if (!a.spectrum) return 0;
    return normalise(a, `band:${Math.round(lo)}-${Math.round(hi)}`, bandPower(a.spectrum, a.binHz, lo, hi), dt);
  }

  // A stand-in spectrum for when no music is playing: kick on every beat, clap on 2 and 4, hats on the offbeats and a
  // bass note, so the reactive show keeps running on the Tempo slider and the spectrum view still has something to show.
  function synthSpectrum(out, binHz, beat) {
    const fr = beat - Math.floor(beat), b4 = Math.floor(beat) % 4, half = (beat * 2) - Math.floor(beat * 2);
    const kick = Math.exp(-fr * 9), clap = (b4 === 1 || b4 === 3) ? Math.exp(-fr * 12) : 0, hat = beat * 2 % 2 >= 1 ? Math.exp(-half * 18) : 0;
    const bass = fr > 0.4 ? 0.5 * Math.exp(-(fr - 0.4) * 5) : 0;
    for (let i = 1; i < out.length; i++) {
      const hz = i * binHz;
      let m = 0.002 / (1 + hz / 2000);
      m += kick * 0.5 * Math.exp(-(((hz - 60) / 35) ** 2));
      m += bass * 0.25 * Math.exp(-(((hz - 110) / 30) ** 2));
      m += clap * (0.12 * Math.exp(-(((hz - 220) / 80) ** 2)) + 0.06 * Math.exp(-(((hz - 3000) / 1800) ** 2)));
      m += hat * 0.05 * Math.exp(-(((hz - 10000) / 3000) ** 2));
      m += 0.01 * Math.exp(-(((hz - 800) / 600) ** 2)) * (0.6 + 0.4 * Math.sin(beat * Math.PI / 2));
      out[i] = m;
    }
    return out;
  }

  /* ---------- Modulation matrix ---------- */
  let nextId = 1;
  function makeMapping(o = {}) {
    const m = {
      id: o.id || `m${nextId++}`, on: o.on !== false, src: SOURCE_IDS.has(o.src) ? o.src : 'kick',
      dst: DEST_BY_ID[o.dst] ? o.dst : 'rig.dim', group: o.group || 'all',
      amount: num(o.amount, 0.8, -1, 1), gain: num(o.gain, 1, 0, 4), gate: num(o.gate, 0, 0, 0.95),
      attack: num(o.attack, 5, 0, 4000), release: num(o.release, 180, 0, 8000), curve: num(o.curve, 1, 0.25, 4),
      invert: !!o.invert, lo: num(o.lo, 60, 20, 20000), hi: num(o.hi, 250, 20, 20000), env: 0, input: 0,
    };
    if (m.hi < m.lo) [m.lo, m.hi] = [m.hi, m.lo];
    // Rig destinations also take a fixture type (t:spot) or a rig builder group (g:Front wash).
    const rigGroup = /^[gt]:[\w -]{1,24}$/.test(m.group) && DEST_BY_ID[m.dst].groups.length > 1 && m.dst.startsWith('rig.');
    if (!DEST_BY_ID[m.dst].groups.includes(m.group) && !rigGroup) m.group = 'all';
    return m;
  }
  function num(v, d, lo, hi) { v = Number(v); return Number.isFinite(v) ? clamp(v, lo, hi) : d; }

  // Shape one mapping's input and run its attack/release envelope. Times are milliseconds of a one-pole follower.
  function stepMapping(m, x, dt, sensitivity = 1) {
    x = clamp(x * m.gain * sensitivity);
    x = m.gate ? clamp((x - m.gate) / (1 - m.gate)) : x;
    if (m.invert) x = 1 - x;
    x = Math.pow(x, m.curve);
    m.input = x;
    const tau = (x > m.env ? m.attack : m.release) / 1000;
    m.env = tau <= 0 ? x : m.env + (x - m.env) * (1 - Math.exp(-dt / tau));
    return m.env;
  }

  function createMatrix() { return { mappings: [], sensitivity: 1 }; }

  function updateMatrix(mx, a, features, dt) {
    for (const m of mx.mappings) {
      const x = m.src === 'band' ? customBand(a, m.lo, m.hi, dt) : features[m.src] || 0;
      stepMapping(m, m.on ? x : 0, dt, mx.sensitivity);
    }
  }

  // The combined value of one destination for something in the given groups (e.g. a fixture that is 'hang' and 'left').
  // inGroup(g) says whether the target belongs to group g.
  function modValue(mx, dst, inGroup) {
    const kind = DEST_BY_ID[dst].kind;
    let v = kind === 'scale' ? 1 : 0;
    for (const m of mx.mappings) {
      if (!m.on || m.dst !== dst || (m.group !== 'all' && !(inGroup && inGroup(m.group)))) continue;
      if (kind === 'scale') { const a = Math.abs(m.amount), e = m.amount >= 0 ? m.env : 1 - m.env; v *= 1 - a + a * e; }
      else v += m.amount * m.env;
    }
    return v;
  }
  function hasDest(mx, dst) { return mx.mappings.some((m) => m.on && m.dst === dst); }

  /* ---------- Presets ---------- */
  const P = (src, dst, amount, o = {}) => ({ src, dst, amount, ...o });
  const PRESETS = {
    'Punchy club': [
      P('kick', 'rig.dim', 0.85, { attack: 2, release: 160 }),
      P('hat', 'rig.white', 0.35, { release: 60, group: 'even' }),
      P('bass', 'rig.zoom', 0.35, { attack: 20, release: 250 }),
      P('snare', 'led.flash', 0.45, { release: 120 }),
      P('kick', 'laser.dim', 0.7, { attack: 1, release: 140 }),
      P('level', 'crowd', 0.6, { attack: 80, release: 600 }),
    ],
    'Festival main stage': [
      P('kick', 'rig.dim', 0.6, { attack: 2, release: 220 }),
      P('bass', 'rig.size', 0.5, { attack: 60, release: 500 }),
      P('build', 'rig.speed', 0.9, { attack: 400, release: 300 }),
      P('build', 'laser.speed', 0.8, { attack: 400, release: 300 }),
      P('drop', 'rig.strobe', 1, { attack: 0, release: 1500, gate: 0.6 }),
      P('snare', 'rig.white', 0.3, { release: 100 }),
      P('kick', 'cam.shake', 0.15, { release: 120, gate: 0.3 }),
      P('mid', 'led.speed', 0.5, { attack: 100, release: 600 }),
      P('kick', 'led.flash', 0.25, { release: 150 }),
      P('high', 'laser.spread', 0.5, { attack: 40, release: 400 }),
      P('level', 'crowd', 0.9, { attack: 60, release: 500 }),
    ],
    'Techno strobe': [
      P('kick', 'rig.dim', 1, { attack: 0, release: 90, group: 'odd' }),
      P('hat', 'rig.dim', 1, { attack: 0, release: 60, group: 'even' }),
      P('hat', 'rig.white', 0.6, { release: 50, group: 'even' }),
      P('bass', 'haze', 0.25, { attack: 300, release: 1500 }),
      P('kick', 'laser.dim', 1, { attack: 0, release: 80 }),
      P('build', 'rig.strobe', 0.8, { attack: 1500, release: 300, gate: 0.5 }),
      P('kick', 'led.dim', 0.7, { attack: 0, release: 120 }),
      P('level', 'crowd', 0.7, { attack: 50, release: 400 }),
    ],
    'Chill wash': [
      P('level', 'rig.dim', 0.5, { attack: 300, release: 900 }),
      P('mid', 'rig.hue', 0.25, { attack: 800, release: 2500 }),
      P('sine', 'rig.size', 0.4, { attack: 0, release: 0 }),
      P('bass', 'led.dim', 0.4, { attack: 200, release: 900 }),
      P('high', 'laser.dim', 0.6, { attack: 200, release: 800 }),
      P('level', 'crowd', 0.3, { attack: 400, release: 1200 }),
    ],
    'Off': [],
  };
  function presetMappings(name) { return (PRESETS[name] || []).map((p) => makeMapping(p)); }

  // Serialise only what a user sets, so saved files stay readable and survive new fields.
  const SAVED = ['on', 'src', 'dst', 'group', 'amount', 'gain', 'gate', 'attack', 'release', 'curve', 'invert', 'lo', 'hi'];
  function saveMappings(list) { return list.map((m) => Object.fromEntries(SAVED.map((k) => [k, m[k]]))); }
  function loadMappings(list) { return Array.isArray(list) ? list.filter((o) => o && typeof o === 'object').map((o) => makeMapping(o)) : []; }

  return {
    BANDS, ONSETS, SOURCES, DESTS, DEST_BY_ID, RIG_GROUPS, PRESETS,
    createAnalyzer, analyze, beatFeatures, customBand, synthSpectrum, estimateTempo,
    makeMapping, stepMapping, createMatrix, updateMatrix, modValue, hasDest, presetMappings, saveMappings, loadMappings, clamp,
  };
});
