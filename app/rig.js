/* Rig builder model: fixture types, the user's rig, DMX patching and decoding, arrays, and MVR export.
 * No DOM or three.js, so node --test runs it. Positions are app space: metres, Y up, audience toward +z.
 * Fixture types follow how lighting desks describe fixtures (a DMX mode is a list of channels, each one attribute);
 * GDTF files fill the same shape through StageImport.readGdtf. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StageRig = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  // Channel layouts: attribute -> channel offset (1-based). Pan and tilt carry fine channels; ranges are degrees.
  const GENERIC16 = { pan: 1, panFine: 2, tilt: 3, tiltFine: 4, dim: 5, shutter: 6, r: 7, g: 8, b: 9, w: 10, zoom: 11 };
  // Built-in types. kind picks the body and how it moves: heads follow the movement programs, static units aim
  // where they are placed. zoom is the full beam angle in degrees: [min, max] for a zooming head, one number if fixed.
  const TYPES = {
    spot: { label: 'Spot moving head', kind: 'head', move: true, zoom: [3, 35], footprint: 16, channels: GENERIC16, panRange: 540, tiltRange: 270 },
    beam: { label: 'Beam moving head', kind: 'beam', move: true, zoom: [1.5, 6], footprint: 16, channels: GENERIC16, panRange: 540, tiltRange: 270 },
    wash: { label: 'Wash moving head', kind: 'wash', move: true, zoom: [12, 55], footprint: 16, channels: GENERIC16, panRange: 540, tiltRange: 270 },
    blinder: { label: 'Blinder (4-lite)', kind: 'blinder', move: false, zoom: 70, aim: 55, footprint: 5, channels: { dim: 1, r: 2, g: 3, b: 4, shutter: 5 } },
    strobe: { label: 'Strobe', kind: 'strobe', move: false, zoom: 90, aim: 25, footprint: 5, channels: { dim: 1, shutter: 2, r: 3, g: 4, b: 5 } },
    bar: { label: 'LED bar', kind: 'bar', move: false, zoom: 25, aim: 15, footprint: 5, channels: { dim: 1, r: 2, g: 3, b: 4, shutter: 5 } },
    par: { label: 'LED par', kind: 'par', move: false, zoom: 30, aim: 35, footprint: 5, channels: { dim: 1, r: 2, g: 3, b: 4, shutter: 5 } },
  };

  // Turn a parsed GDTF fixture (StageImport.readGdtf) into a type. Its look comes from its beam and whether it pans.
  function typeFromGdtf(g, modeName) {
    const mode = g.modes.find((m) => m.name === modeName) || g.modes[0];
    if (!mode) throw new Error('This GDTF file has no DMX modes.');
    const ch = {}, A = mode.attributes;
    const pick = (key, names, fine) => { for (const n of names) if (A[n]) { ch[key] = A[n][0]; if (fine && A[n][1]) ch[fine] = A[n][1]; return; } };
    pick('pan', ['Pan'], 'panFine'); pick('tilt', ['Tilt'], 'tiltFine'); pick('dim', ['Dimmer']);
    pick('shutter', ['Shutter1', 'Shutter1Strobe', 'StrobeFrequency', 'StrobeModeShutter']);
    pick('r', ['ColorAdd_R', 'ColorRGB_Red']); pick('g', ['ColorAdd_G', 'ColorRGB_Green']); pick('b', ['ColorAdd_B', 'ColorRGB_Blue']);
    pick('w', ['ColorAdd_W', 'ColorRGB_White']); pick('zoom', ['Zoom']);
    const move = !!(ch.pan && ch.tilt), beam = g.beamAngle || (move ? 20 : 40);
    const kind = move ? (beam <= 6 ? 'beam' : beam >= 25 ? 'wash' : 'head') : /strobe/i.test(g.name) ? 'strobe' : /bar|batten/i.test(g.name) ? 'bar' : /blind|molefay|audience/i.test(g.name) ? 'blinder' : 'par';
    return {
      label: `${g.manufacturer ? `${g.manufacturer} ` : ''}${g.name}${g.modes.length > 1 ? ` (${mode.name})` : ''}`, kind, move,
      zoom: ch.zoom && g.zoomRange ? g.zoomRange : move ? (ch.zoom ? [Math.max(1, beam * 0.4), beam * 2] : [beam, beam]) : beam,
      aim: move ? undefined : 35, footprint: mode.footprint, channels: ch, panRange: g.panRange || 540, tiltRange: g.tiltRange || 270,
      gdtf: g.file || `${g.manufacturer}@${g.name}.gdtf`, mode: mode.name, colorless: !(ch.r || ch.g || ch.b),
    };
  }

  /* ---------- The rig ---------- */
  let seq = 1;
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  function makeFixture(o = {}, types = TYPES) {
    const type = types[o.type] ? o.type : 'spot';
    return {
      id: o.id || `f${Date.now().toString(36)}${seq++}`, type, name: String(o.name || '').slice(0, 40),
      pos: Array.isArray(o.pos) && o.pos.length === 3 ? o.pos.map((v) => num(v, 0)) : [0, 0, 0],
      yaw: num(o.yaw, 0), flip: !!o.flip, aim: o.aim == null ? null : clamp(num(o.aim, 0), -90, 90),
      group: String(o.group || '').replace(/[^\w -]/g, '').slice(0, 24),
      universe: clamp(Math.round(num(o.universe, 0)), 0, 63999), address: clamp(Math.round(num(o.address, 0)), 0, 512),
    };
  }
  // Consecutive addresses from a start, never splitting a fixture across universes. Fixtures keep their order.
  function autoPatch(list, types = TYPES, startU = 1, startA = 1) {
    let u = Math.max(1, startU), a = clamp(startA, 1, 512);
    for (const f of list) {
      const n = (types[f.type] || TYPES.spot).footprint;
      if (a + n - 1 > 512) { u++; a = 1; }
      f.universe = u; f.address = a; a += n;
      if (a > 512) { u++; a = 1; }
    }
    return list;
  }
  // Fixtures whose channels overlap another's, by id.
  function patchClashes(list, types = TYPES) {
    const taken = new Map(), clash = new Set();
    for (const f of list) {
      if (!f.universe || !f.address) continue;
      const n = (types[f.type] || TYPES.spot).footprint;
      for (let c = f.address; c < f.address + n; c++) {
        const k = `${f.universe}.${c}`, o = taken.get(k);
        if (o && o !== f.id) { clash.add(o); clash.add(f.id); } else taken.set(k, f.id);
      }
    }
    return clash;
  }

  // Read one fixture's state from a DMX universe. offset is the fixture's first channel (1-based).
  function decode(type, data, offset, nowMs) {
    const C = type.channels, c = (k) => (C[k] ? data[offset + C[k] - 2] || 0 : null);
    const v16 = (hi, lo) => ((c(hi) || 0) * 256 + (c(lo) || 0)) / 65535;
    let dim = c('dim') == null ? 1 : c('dim') / 255;
    const sh = c('shutter');
    if (sh != null) {
      if (sh < 8) dim = C.dim ? dim : 0;
      else if (sh >= 32) { const hz = 1 + (sh - 32) / 223 * 19; if (((nowMs / 1000) * hz) % 1 > 0.35) dim = 0; }
    }
    const w = (c('w') || 0) / 255, col = (k) => (C.r || C.g || C.b ? Math.min(1, (c(k) || 0) / 255 + w) : 1);
    const [z0, z1] = Array.isArray(type.zoom) ? type.zoom : [type.zoom, type.zoom];
    return {
      pan: C.pan ? (v16('pan', 'panFine') - 0.5) * (type.panRange || 540) : 0,
      tilt: C.tilt ? (v16('tilt', 'tiltFine') - 0.5) * (type.tiltRange || 270) : 0,
      dim, r: col('r'), g: col('g'), b: col('b'),
      zoom: C.zoom ? z0 + (c('zoom') / 255) * (z1 - z0) : (z0 + z1) / 2,
    };
  }

  // n points along a line from a to b, bowed by sag metres (positive hangs down, like a curved truss), with the yaw that
  // faces each one out from the line toward the audience.
  function arrayPoints(a, b, n, sag = 0) {
    n = clamp(Math.round(n), 1, 200);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1), bow = 4 * t * (1 - t) * sag;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - bow, a[2] + (b[2] - a[2]) * t]);
    }
    return out;
  }

  /* ---------- Saving ---------- */
  const SAVED = ['id', 'type', 'name', 'pos', 'yaw', 'flip', 'aim', 'group', 'universe', 'address'];
  function saveRig(list, types) {
    const custom = Object.fromEntries(Object.entries(types || {}).filter(([k]) => !TYPES[k]));
    return { app: 'stage-visuals', kind: 'rig', version: 1, types: custom, fixtures: list.map((f) => Object.fromEntries(SAVED.map((k) => [k, f[k]]))) };
  }
  function loadRig(data) {
    if (!data || data.kind !== 'rig' || !Array.isArray(data.fixtures)) throw new Error('Not a rig file from this app.');
    const types = { ...TYPES };
    for (const [k, t] of Object.entries(data.types || {})) if (/^gdtf:/.test(k) && t && t.channels && t.footprint > 0) types[k] = { ...t, footprint: clamp(Math.round(t.footprint), 1, 512) };
    return { types, fixtures: data.fixtures.slice(0, 2000).map((o) => makeFixture(o, types)) };
  }

  /* ---------- MVR export ---------- */
  // GeneralSceneDescription.xml for the rig, so Vectorworks, Capture or grandMA3 can take it. MVR is Z-up millimetres:
  // app (x, y, z) is MVR (x, -z, y). A hung fixture is turned half a turn about its own x.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const f3 = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
  function uuid(i, salt) { const h = (n) => ((n * 2654435761 + salt) >>> 0).toString(16).padStart(8, '0'); return `${h(i)}-${h(i + 7).slice(0, 4)}-4${h(i + 3).slice(1, 4)}-a${h(i + 5).slice(1, 4)}-${h(i + 11)}${h(i + 13).slice(0, 4)}`.toUpperCase(); }
  function mvrMatrix(f) {
    // Rotation in app space: yaw about +y, then half a turn about z when hung (as the page draws fixtures).
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw), s = f.flip ? -1 : 1;
    // Local axes in app space.
    const X = [cy * s, 0, -sy * s], Y = [0, s, 0], Z = [sy, 0, cy];
    const toM = (v) => [v[0], -v[2], v[1]];
    const u = toM(X), v = toM(Y), w = toM(Z), o = toM(f.pos).map((x) => x * 1000);
    // MVR's local z is the fixture's up, which is the app's local y.
    return `{${[u, w.map((x) => -x), v, o].map((a) => a.map(f3).join(',')).join('}{')}}`;
  }
  function exportMvrXml(list, types = TYPES) {
    const salt = Date.now() >>> 0;
    const rows = list.map((f, i) => {
      const t = types[f.type] || TYPES.spot;
      return `<Fixture name="${esc(f.name || `${t.label} ${i + 1}`)}" uuid="${uuid(i + 1, salt)}"><Matrix>${mvrMatrix(f)}</Matrix><GDTFSpec>${esc(t.gdtf || `Generic@${t.label.replace(/\W+/g, '_')}.gdtf`)}</GDTFSpec><GDTFMode>${esc(t.mode || `${t.footprint}ch`)}</GDTFMode><FixtureID>${101 + i}</FixtureID><UnitNumber>${i + 1}</UnitNumber>${f.universe ? `<Addresses><Address break="0">${(f.universe - 1) * 512 + f.address}</Address></Addresses>` : ''}</Fixture>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<GeneralSceneDescription verMajor="1" verMinor="6" provider="stage-visuals" providerVersion="1"><UserData/><Scene><Layers><Layer name="Rig" uuid="${uuid(0, salt)}"><ChildList>${rows.join('')}</ChildList></Layer></Layers></Scene></GeneralSceneDescription>`;
  }

  return { TYPES, GENERIC16, typeFromGdtf, makeFixture, autoPatch, patchClashes, decode, arrayPoints, saveRig, loadRig, exportMvrXml };
});
