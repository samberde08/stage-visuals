/* Stage descriptions: a plain JSON format for any stage design, and the geometry it builds. A person, Claude or a
 * tool writes the description; the page turns the layout into meshes. No DOM or three.js, so node --test runs it.
 *
 * Space is the app's: metres, Y up, the front edge of the stage at z = 0 and the audience toward +z, so the stage
 * itself sits at z < 0. A plan point is [x, z]: x to the audience's right, z toward the audience. Angles are degrees;
 * on a plan, 0 points at the audience (+z) and 90 to the audience's right (+x).
 *
 * The format (version 1):
 *   { format: 'stage-visuals/stage', version: 1, name, notes?, parts: [part, ...] }
 * Every part has a type and an id (made up if missing). Shared optional fields: at [x, z] moves it, rotate (deg)
 * turns it on plan about its own origin, on: an id of a deck or riser it stands on (its base is that part's top),
 * elevation: metres above that base, material, color.
 *   deck    a platform. shape (below) or outline [[x, z], ...]; height (top of deck above the floor); skirt (true).
 *   riser   the same, stacked: height is its own height above what it stands on (on defaults to the first deck).
 *   steps   a flight of stairs: from [x, z] (bottom) to [x, z] (top edge), width, height (rise; default: the deck).
 *   booth   a DJ table: at, width, depth, height, face ('led' | 'black').
 *   led     a screen. Flat or bent along path [[x, z], ...], or along arc { center, radius, from, to }; bottom (m above
 *           its base), height, and shape 'rect' | 'arch' (round top) | 'gable' (pointed top). Or floor: true with a
 *           shape/outline, for an LED floor on top of what it stands on.
 *   truss   a run of truss: path [[x, y, z], ...] (y = height above the floor), size (0.3 box truss), closed.
 *           fixtures { type, count } spreads rig fixtures evenly along it (types as in app/rig.js).
 *   scenic  set pieces. kind:
 *             panel   a slab: path [[x, z], [x, z]] or width + at; bottom, height, thickness.
 *             column  a cylinder: at, radius, height.
 *             arch    an arched portal: at, width, height, depth (thickness), facing the audience.
 *             ring    a hoop: at, radius, tube, centerHeight, facing ('audience' | 'up').
 *             pyramid a stepped or plain pyramid: at, width, depth, height, steps (0 = smooth).
 *             extrude any outline (shape or outline) pushed straight up: bottom, height.
 *             colonnade  a row of cylinders along an arc { center, radius, from, to } or a path: hay bales, pillars,
 *                     speaker stacks. diameter (1.5), height of one piece (1.2), stack (pieces high, 1), spacing
 *                     (centre to centre; default the diameter, so they touch) or count. fixtures { type, every (1),
 *                     side ('inside' | 'outside' for arcs, 'left' | 'right' for paths), inset, aim } puts floor
 *                     lights at their feet, aimed up the face.
 *           led: true makes its front an LED surface.
 *   audience  where the crowd goes: shape or outline; seating 'standing' (density per m², 2) or 'chairs' (rows
 *           curved round facing [x, z], rowPitch 0.95, seatPitch 0.6, aisle: width of a centre aisle, occupancy 0..1).
 *           With any audience part the template's own crowd is replaced.
 *   Shapes (plan outlines, centred on at unless noted):
 *     { kind: 'rect', width, depth, anchor?: 'front' | 'center' }   anchor front puts the front edge at z = 0 (default
 *                                                                  for decks: the stage's front line)
 *     { kind: 'polygon', sides, radius }        regular polygon (hexagon: sides 6), a flat side facing the audience
 *     { kind: 'circle', radius }
 *     { kind: 'trapezoid', front, back, depth } front edge at z = 0, narrower or wider at the back
 *     { kind: 'rounded', width, depth, radius } a rectangle with rounded corners
 *     { kind: 'annulus', inner, outer, from, to }  part of a ring (a curved runway or an amphitheatre-style deck)
 *     { kind: 'thrust', width, depth, thrustWidth, thrustDepth }  a main deck with a runway into the crowd
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StageSpec = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FORMAT = 'stage-visuals/stage';
  const TYPES = ['deck', 'riser', 'steps', 'booth', 'led', 'truss', 'scenic', 'audience'];
  const SCENIC = ['panel', 'column', 'arch', 'ring', 'pyramid', 'extrude', 'colonnade'];
  const MATERIALS = ['deck', 'black', 'metal', 'mirror', 'wood', 'concrete', 'white', 'fabric', 'rock', 'hay', 'led'];
  const MAX_PARTS = 400, MAX_SIZE = 400;
  const DEG = Math.PI / 180;
  const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const size = (x, d, lo = 0.01) => clamp(num(x, d), lo, MAX_SIZE);
  const pt2 = (p) => (Array.isArray(p) && p.length >= 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)) ? [p[0], p[1]] : null);
  const pt3 = (p) => (Array.isArray(p) && p.length >= 3 && p.every((v) => typeof v === 'number' && Number.isFinite(v)) ? [p[0], p[1], p[2]] : null);
  const r4 = (x) => Math.round(x * 1e4) / 1e4;

  /* ---------- Plan outlines ---------- */
  // Plan angle a (0 = toward the audience, 90 = audience's right) to a direction [x, z].
  const dir = (a) => [Math.sin(a * DEG), Math.cos(a * DEG)];
  function arcPoints(cx, cz, r, from, to, segs) {
    const n = Math.max(2, segs || Math.ceil(Math.abs(to - from) / 6) + 1), out = [];
    for (let i = 0; i < n; i++) { const a = from + (to - from) * i / (n - 1), d = dir(a); out.push([cx + d[0] * r, cz + d[1] * r]); }
    return out;
  }
  // A shape to a closed outline (no repeated last point), counter-clockwise seen from above (+y), before at/rotate.
  function shapeOutline(s, defAnchor) {
    if (!s || typeof s !== 'object') return null;
    const k = s.kind;
    let pts;
    if (k === 'rect') {
      const w = size(s.width, 8), d = size(s.depth, 4), anchor = s.anchor || defAnchor || 'center', z0 = anchor === 'front' ? -d : -d / 2;
      pts = [[-w / 2, z0], [-w / 2, z0 + d], [w / 2, z0 + d], [w / 2, z0]];
    } else if (k === 'polygon') {
      const n = clamp(Math.round(num(s.sides, 6)), 3, 64), r = size(s.radius, 4);
      // A flat side faces the audience: vertices start half a step off +z.
      pts = []; for (let i = 0; i < n; i++) { const d = dir(180 / n + 360 * i / n); pts.push([d[0] * r, d[1] * r]); }
    } else if (k === 'circle') {
      const r = size(s.radius, 4), n = clamp(Math.round(num(s.segments, 48)), 8, 128);
      pts = []; for (let i = 0; i < n; i++) { const d = dir(360 * i / n); pts.push([d[0] * r, d[1] * r]); }
    } else if (k === 'trapezoid') {
      const f = size(s.front, 10), b = size(s.back, 6), d = size(s.depth, 5);
      pts = [[-f / 2, 0], [f / 2, 0], [b / 2, -d], [-b / 2, -d]];
    } else if (k === 'rounded') {
      const w = size(s.width, 8), d = size(s.depth, 4), r = clamp(num(s.radius, 1), 0.01, Math.min(w, d) / 2), anchor = s.anchor || defAnchor || 'center';
      const cz = anchor === 'front' ? -d / 2 : 0, hx = w / 2 - r, hz = d / 2 - r;
      pts = [
        ...arcPoints(hx, cz + hz, r, 0, 90, 7), ...arcPoints(hx, cz - hz, r, 90, 180, 7),
        ...arcPoints(-hx, cz - hz, r, 180, 270, 7), ...arcPoints(-hx, cz + hz, r, 270, 360, 7),
      ];
    } else if (k === 'annulus') {
      const ri = size(s.inner, 4, 0), ro = Math.max(ri + 0.05, size(s.outer, 8)), a0 = num(s.from, -60), a1 = num(s.to, 60);
      pts = [...arcPoints(0, 0, ro, a0, a1), ...arcPoints(0, 0, ri, a1, a0)];
      if (ri < 0.01) pts = [...arcPoints(0, 0, ro, a0, a1), [0, 0]];
    } else if (k === 'thrust') {
      const w = size(s.width, 12), d = size(s.depth, 6), tw = clamp(num(s.thrustWidth, 3), 0.3, w), td = size(s.thrustDepth, 6);
      pts = [[-w / 2, -d], [-w / 2, 0], [-tw / 2, 0], [-tw / 2, td], [tw / 2, td], [tw / 2, 0], [w / 2, 0], [w / 2, -d]];
    } else return null;
    return orient(pts);
  }
  const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
  // Counter-clockwise seen from above (+y): with x right and z toward the viewer's feet, that is a negative signed
  // area in (x, z), so flip any outline that comes out positive.
  const orient = (p) => (area(p) > 0 ? p.slice().reverse() : p);
  function place(pts, at, rotate) {
    const a = num(rotate, 0) * DEG, c = Math.cos(a), s = Math.sin(a), o = pt2(at) || [0, 0];
    // Turning by +rotate on plan swings +z (audience) toward +x.
    return pts.map(([x, z]) => [r4(o[0] + x * c + z * s), r4(o[1] - x * s + z * c)]);
  }
  function planOutline(p, defAnchor) {
    let pts = null;
    if (Array.isArray(p.outline)) { pts = p.outline.map(pt2).filter(Boolean); if (pts.length < 3) pts = null; else pts = orient(pts); }
    if (!pts) {
      pts = shapeOutline(p.shape, defAnchor);
      // A deck with no position puts its front-most edge on the stage's front line (a thrust's runway goes past it).
      if (pts && defAnchor === 'front' && !pt2(p.at) && p.shape.anchor !== 'center' && p.shape.kind !== 'thrust') {
        const front = Math.max(...pts.map((q) => q[1]));
        pts = pts.map(([x, z]) => [x, z - front]);
      }
    }
    return pts ? place(pts, p.at, p.rotate) : null;
  }

  /* ---------- Normalising ---------- */
  // Any input to a clean description: known parts only, sizes clamped, ids unique, and a list of what was fixed.
  function normalize(input) {
    const warnings = [];
    let src = input;
    if (typeof src === 'string') { try { src = JSON.parse(src); } catch (e) { throw new Error(`Not valid JSON: ${e.message}`); } }
    if (!src || typeof src !== 'object') throw new Error('A stage description is a JSON object.');
    if (Array.isArray(src)) src = { parts: src };
    if (src.format && src.format !== FORMAT) warnings.push(`format "${src.format}" read as ${FORMAT}`);
    const rawParts = Array.isArray(src.parts) ? src.parts : [];
    if (rawParts.length > MAX_PARTS) warnings.push(`only the first ${MAX_PARTS} parts are kept`);
    const ids = new Set(), parts = [];
    rawParts.slice(0, MAX_PARTS).forEach((raw, i) => {
      if (!raw || typeof raw !== 'object') { warnings.push(`part ${i + 1} is not an object`); return; }
      const type = String(raw.type || '').toLowerCase();
      if (!TYPES.includes(type)) { warnings.push(`part ${i + 1}: unknown type "${raw.type}"`); return; }
      let id = String(raw.id || `${type}${i + 1}`).replace(/[^\w.-]+/g, '-').slice(0, 48) || `${type}${i + 1}`;
      while (ids.has(id)) id += '-2';
      ids.add(id);
      const p = JSON.parse(JSON.stringify(raw));
      p.type = type; p.id = id;
      if (p.material && !MATERIALS.includes(p.material)) { warnings.push(`${id}: material "${p.material}" read as default`); delete p.material; }
      if (p.color != null && !/^#[0-9a-f]{6}$/i.test(String(p.color))) { warnings.push(`${id}: color must be #rrggbb`); delete p.color; }
      if (type === 'scenic' && !SCENIC.includes(p.kind)) { warnings.push(`${id}: unknown scenic kind "${p.kind}", made a panel`); p.kind = 'panel'; }
      parts.push(p);
    });
    // on: must name an earlier-or-later deck/riser; drop links that do not, and break cycles.
    const platforms = new Set(parts.filter((p) => p.type === 'deck' || p.type === 'riser').map((p) => p.id));
    const firstDeck = parts.find((p) => p.type === 'deck');
    parts.forEach((p) => {
      if (p.on != null && !platforms.has(p.on)) { warnings.push(`${p.id}: "on" names no deck or riser (${p.on})`); delete p.on; }
      if (p.on === p.id) delete p.on;
      if (p.on == null && p.type === 'riser' && firstDeck) p.on = firstDeck.id;
    });
    const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
    parts.forEach((p) => { const seen = new Set([p.id]); for (let q = p; q.on; q = byId[q.on]) { if (seen.has(q.on)) { warnings.push(`${p.id}: "on" loops, cut`); delete q.on; break; } seen.add(q.on); } });
    return { spec: { format: FORMAT, version: 1, name: String(src.name || 'Custom stage').slice(0, 80), notes: src.notes ? String(src.notes).slice(0, 2000) : undefined, parts }, warnings };
  }

  /* ---------- Layout: the geometry to draw ---------- */
  // Heights: a part's base is the top of what it stands on (plus elevation); a deck's top is its height.
  function tops(spec) {
    const byId = Object.fromEntries(spec.parts.map((p) => [p.id, p])), memo = {};
    const top = (id, depth = 0) => {
      if (memo[id] != null) return memo[id];
      const p = byId[id]; if (!p || depth > 50) return 0;
      const base = (p.on ? top(p.on, depth + 1) : 0) + num(p.elevation, 0);
      return (memo[id] = p.type === 'deck' && !p.on ? size(p.height, 1.2, 0) + num(p.elevation, 0) : base + size(p.height, p.type === 'riser' ? 0.4 : 1.2, 0));
    };
    const baseOf = (p) => (p.on ? top(p.on) : 0) + num(p.elevation, 0);
    spec.parts.forEach((p) => { if (p.type === 'deck' || p.type === 'riser') top(p.id); });
    return { top, baseOf };
  }
  // The geometry, as plain shapes the page meshes:
  //   prisms: { id, outline, y0, y1, material, color, skirt?, led? }   an outline pushed from y0 up to y1
  //   boxes:  { id, center [x,y,z], size [w,h,d], yaw (deg), material, color, led? }
  //   screens: { id, path [[x,z]...], y0, y1, profile: 'rect'|'arch'|'gable', length }  vertical LED surfaces
  //   floors: { id, outline, y }   LED floors
  //   cylinders: { id, center, radius, height, material }
  //   tori: { id, center, radius, tube, facing, material, led }
  //   truss: { id, from [x,y,z], to [x,y,z], size }
  //   fixtures: { type, pos [x,y,z], truss }   hints for the rig builder
  function layout(input) {
    const { spec, warnings } = input && input.format === FORMAT && Array.isArray(input.parts) ? { spec: input, warnings: [] } : normalize(input);
    const { top, baseOf } = tops(spec);
    const out = { name: spec.name, prisms: [], boxes: [], screens: [], floors: [], cylinders: [], tori: [], truss: [], fixtures: [], audience: [], warnings: warnings.slice() };
    const mat = (p, d) => p.material || d;
    for (const p of spec.parts) {
      const base = baseOf(p);
      if (p.type === 'deck' || p.type === 'riser') {
        const ol = planOutline(p, p.type === 'deck' ? 'front' : 'center') || (p.type === 'deck' ? place(shapeOutline({ kind: 'rect', width: 12, depth: 8 }, 'front'), p.at, p.rotate) : null);
        if (!ol) { out.warnings.push(`${p.id}: needs a shape or outline`); continue; }
        out.prisms.push({ id: p.id, outline: ol, y0: p.type === 'deck' && !p.on ? 0 : base, y1: top(p.id), material: mat(p, 'deck'), color: p.color, skirt: p.skirt !== false });
      } else if (p.type === 'steps') {
        const a = pt2(p.from), b = pt2(p.to);
        if (!a || !b) { out.warnings.push(`${p.id}: needs from and to`); continue; }
        const rise = size(p.height, p.on ? top(p.on) - num(p.elevation, 0) : 1.2, 0.05), run = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = clamp(Math.round(rise / 0.18), 1, 60), w = size(p.width, 1.5), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) / DEG;
        const y0 = p.on ? 0 : num(p.elevation, 0);
        for (let i = 0; i < n; i++) {
          const t0 = i / n, h = rise * (i + 1) / n, len = run * (1 - t0);
          const c = [a[0] + (b[0] - a[0]) * (t0 + (1 - t0) / 2), a[1] + (b[1] - a[1]) * (t0 + (1 - t0) / 2)];
          out.boxes.push({ id: `${p.id}#${i}`, center: [r4(c[0]), r4(y0 + h / 2), r4(c[1])], size: [w, r4(h), r4(Math.max(0.05, len))], yaw: r4(yaw), material: mat(p, 'deck'), color: p.color });
        }
      } else if (p.type === 'booth') {
        const at = pt2(p.at) || [0, -2], w = size(p.width, 2.4), d = size(p.depth, 0.9), h = size(p.height, 1.05);
        out.boxes.push({ id: p.id, center: [at[0], r4(base + h / 2), at[1]], size: [w, h, d], yaw: num(p.rotate, 0), material: mat(p, 'black'), color: p.color, led: p.face === 'led' ? 'front' : null, booth: true });
      } else if (p.type === 'led') {
        if (p.floor) {
          const ol = planOutline(p, 'center');
          if (!ol) { out.warnings.push(`${p.id}: an LED floor needs a shape or outline`); continue; }
          out.floors.push({ id: p.id, outline: ol, y: r4(base + 0.01) });
          continue;
        }
        let path = null;
        if (p.arc && typeof p.arc === 'object') {
          const c = pt2(p.arc.center) || [0, 0];
          path = arcPoints(c[0], c[1], size(p.arc.radius, 8), num(p.arc.from, 150), num(p.arc.to, 210), p.arc.segments);
        } else if (Array.isArray(p.path)) path = p.path.map(pt2).filter(Boolean);
        else if (p.width) { const w = size(p.width, 10), at = pt2(p.at) || [0, -4]; path = place([[-w / 2, 0], [w / 2, 0]], at, p.rotate); }
        if (!path || path.length < 2) { out.warnings.push(`${p.id}: needs a path, an arc or a width`); continue; }
        if (p.arc || Array.isArray(p.path)) path = place(path, p.at, p.rotate);
        // A screen's face is on its left as you walk the path; walking stage right to stage left faces it upstage,
        // so turn such paths round to face the audience unless facing: 'back' asks for that.
        if (path[path.length - 1][0] < path[0][0] && p.facing !== 'back') path = path.slice().reverse();
        let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        const y0 = base + num(p.bottom, 0.5), y1 = y0 + size(p.height, 5);
        out.screens.push({ id: p.id, path: path.map((q) => [r4(q[0]), r4(q[1])]), y0: r4(y0), y1: r4(y1), profile: ['arch', 'gable'].includes(p.shape) ? p.shape : 'rect', length: r4(len) });
      } else if (p.type === 'truss') {
        const path = Array.isArray(p.path) ? p.path.map(pt3).filter(Boolean) : [];
        if (path.length < 2) { out.warnings.push(`${p.id}: truss needs a path of [x, y, z] points`); continue; }
        const pts = p.closed ? [...path, path[0]] : path, s = size(p.size, 0.3, 0.1);
        for (let i = 1; i < pts.length; i++) out.truss.push({ id: `${p.id}#${i}`, from: pts[i - 1], to: pts[i], size: s });
        const f = p.fixtures;
        if (f && typeof f === 'object' && f.type) {
          const n = clamp(Math.round(num(f.count, 6)), 1, 200);
          along(pts, n, !!p.closed).forEach((pos) => out.fixtures.push({ type: String(f.type), pos, truss: p.id, mount: 'hang' }));
        }
      } else if (p.type === 'scenic') scenic(p, base, out);
      else if (p.type === 'audience') audience(p, base, out);
    }
    return out;
  }
  // n points spread evenly along a polyline: the centres of n equal pieces (an open run), or n equal steps (a loop).
  function along(pts, n, closed) {
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); seg.push(l); total += l; }
    const out = [];
    for (let k = 0; k < n; k++) {
      let d = closed ? total * k / n : total * (k + 0.5) / n, i = 0;
      while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const t = seg[i] ? d / seg[i] : 0, a = pts[i], b = pts[i + 1];
      out.push([0, 1, 2].map((j) => r4(a[j] + (b[j] - a[j]) * t)));
    }
    return out;
  }
  function scenic(p, base, out) {
    const at = pt2(p.at) || [0, -3], m = p.material || 'black', led = !!p.led || m === 'led';
    const yaw = num(p.rotate, 0);
    if (p.kind === 'panel') {
      let a, b;
      if (Array.isArray(p.path) && pt2(p.path[0]) && pt2(p.path[1])) { a = pt2(p.path[0]); b = pt2(p.path[1]); } else { const w = size(p.width, 4); [a, b] = place([[-w / 2, 0], [w / 2, 0]], at, yaw); }
      const h = size(p.height, 4), th = size(p.thickness, 0.15), y0 = base + num(p.bottom, 0);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      out.boxes.push({ id: p.id, center: [r4((a[0] + b[0]) / 2), r4(y0 + h / 2), r4((a[1] + b[1]) / 2)], size: [r4(len), h, th], yaw: r4(-ang / DEG), material: m, color: p.color, led: led ? 'front' : null });
    } else if (p.kind === 'column') {
      out.cylinders.push({ id: p.id, center: [at[0], r4(base + size(p.height, 6) / 2), at[1]], radius: size(p.radius, 0.3), height: size(p.height, 6), material: m, color: p.color, led });
    } else if (p.kind === 'arch') {
      const w = size(p.width, 8), h = size(p.height, 7), d = size(p.depth, 0.6), leg = size(p.leg, Math.max(0.4, w * 0.08));
      const spring = Math.max(0, h - w / 2);
      // Two legs up to the spring line, then a half ring of blocks over the top.
      [-1, 1].forEach((sx, i) => {
        const c = place([[sx * (w / 2 - leg / 2), 0]], at, yaw)[0];
        out.boxes.push({ id: `${p.id}#leg${i}`, center: [c[0], r4(base + spring / 2), c[1]], size: [leg, r4(Math.max(0.05, spring)), d], yaw, material: m, color: p.color, led: led ? 'front' : null });
      });
      const rOut = w / 2, rIn = w / 2 - leg, n = 18;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n, am = (a0 + a1) / 2, rm = (rOut + rIn) / 2;
        const cx = Math.cos(am) * rm, cy = base + spring + Math.sin(am) * rm, c = place([[cx, 0]], at, yaw)[0];
        out.boxes.push({ id: `${p.id}#k${i}`, center: [c[0], r4(cy), c[1]], size: [r4(leg), r4(rm * (a1 - a0) + 0.02), d], yaw, roll: r4(am / DEG), material: m, color: p.color, led: led ? 'front' : null });
      }
    } else if (p.kind === 'ring') {
      const r = size(p.radius, 4);
      out.tori.push({ id: p.id, center: [at[0], r4(base + num(p.centerHeight, r + 1)), at[1]], radius: r, tube: size(p.tube, 0.25), facing: p.facing === 'up' ? 'up' : 'audience', yaw, material: m, color: p.color, led });
    } else if (p.kind === 'pyramid') {
      const w = size(p.width, 6), d = size(p.depth, w), h = size(p.height, 3), steps = clamp(Math.round(num(p.steps, 0)), 0, 30);
      if (steps) for (let i = 0; i < steps; i++) {
        const f = 1 - i / steps, sh = h / steps;
        out.boxes.push({ id: `${p.id}#${i}`, center: [at[0], r4(base + sh * (i + 0.5)), at[1]], size: [r4(w * f), r4(sh), r4(d * f)], yaw, material: m, color: p.color, led: led ? 'front' : null });
      } else out.prisms.push({ id: p.id, outline: place(orient([[-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]]), at, yaw), y0: base, y1: r4(base + h), apex: true, material: m, color: p.color, led });
    } else if (p.kind === 'colonnade') colonnade(p, base, out, m, led);
    else if (p.kind === 'extrude') {
      const ol = planOutline(p, 'center');
      if (!ol) { out.warnings.push(`${p.id}: needs a shape or outline`); return; }
      const y0 = base + num(p.bottom, 0);
      out.prisms.push({ id: p.id, outline: ol, y0: r4(y0), y1: r4(y0 + size(p.height, 2)), material: m, color: p.color, led, skirt: false });
    }
  }
  // Cylinders in a row along an arc or a path, stacked, with optional floor lights at their feet.
  function colonnade(p, base, out, m, led) {
    const dia = size(p.diameter, 1.5, 0.05), h = size(p.height, 1.2, 0.05), stack = clamp(Math.round(num(p.stack, 1)), 1, 20);
    let pts = null, center = null;
    if (p.arc && typeof p.arc === 'object') {
      center = pt2(p.arc.center) || [0, 0];
      const r = size(p.arc.radius, 10), a0 = num(p.arc.from, 0), a1 = num(p.arc.to, 360);
      const len = Math.abs(a1 - a0) * DEG * r;
      const n = clamp(Math.round(num(p.count, Math.floor(len / size(p.spacing, dia)) + 1)), 1, 2000);
      pts = arcPoints(center[0], center[1], r, a0, a1, Math.max(2, n));
      if (n === 1) pts = pts.slice(0, 1);
      pts = place(pts, p.at, p.rotate);
      if (center) center = place([center], p.at, p.rotate)[0];
    } else if (Array.isArray(p.path)) {
      const path = p.path.map(pt2).filter(Boolean);
      if (path.length < 2) { out.warnings.push(`${p.id}: a colonnade needs an arc or a path`); return; }
      const p3 = place(path, p.at, p.rotate).map(([x, z]) => [x, 0, z]);
      let len = 0; for (let i = 1; i < p3.length; i++) len += Math.hypot(p3[i][0] - p3[i - 1][0], p3[i][2] - p3[i - 1][2]);
      const n = clamp(Math.round(num(p.count, Math.floor(len / size(p.spacing, dia)) + 1)), 1, 2000);
      pts = n === 1 ? [[p3[0][0], p3[0][2]]] : alongEnds(p3, n).map((q) => [q[0], q[2]]);
    } else { out.warnings.push(`${p.id}: a colonnade needs an arc or a path`); return; }
    pts.forEach(([x, z], i) => {
      for (let k = 0; k < stack; k++) out.cylinders.push({ id: `${p.id}#${i}.${k}`, center: [r4(x), r4(base + h * k + h / 2), r4(z)], radius: r4(dia / 2 - 0.01), height: r4(h - 0.02), material: m, color: p.color, led });
    });
    const f = p.fixtures;
    if (!f || typeof f !== 'object' || !f.type) return;
    const every = clamp(Math.round(num(f.every, 1)), 1, 100), inset = num(f.inset, 0.4), side = f.side || (center ? 'inside' : 'left');
    pts.forEach(([x, z], i) => {
      if (i % every) return;
      // Which way is "inside" here: toward the arc's centre, or to the left or right of the path.
      let nx, nz;
      if (center) { nx = center[0] - x; nz = center[1] - z; if (side === 'outside') { nx = -nx; nz = -nz; } }
      else {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1];
        // Walking the path, left is (tz, -tx) with x to the audience's right and z toward them.
        [nx, nz] = side === 'right' ? [-tz, tx] : [tz, -tx];
      }
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const d = dia / 2 + inset, fx = x + nx * d, fz = z + nz * d;
      out.fixtures.push({ type: String(f.type), pos: [r4(fx), r4(base), r4(fz)], mount: 'floor', yaw: r4(Math.atan2(x - fx, z - fz) / DEG), aim: num(f.aim, 12), truss: p.id });
    });
  }
  // n points from the first point of a polyline to the last, evenly spaced.
  function alongEnds(pts, n) {
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]); seg.push(l); total += l; }
    const out = [];
    for (let k = 0; k < n; k++) {
      let d = total * k / (n - 1), i = 0;
      while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const t = seg[i] ? Math.min(1, d / seg[i]) : 0, a = pts[i], b = pts[i + 1];
      out.push([0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * t));
    }
    return out;
  }
  const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - zi) / (zj - zi) + xi) c = !c; } return c; };
  // An audience area: chairs in rows curved round the stage, or a standing area with a density.
  function audience(p, base, out) {
    const ol = planOutline(p, 'center');
    if (!ol) { out.warnings.push(`${p.id}: an audience needs a shape or outline`); return; }
    const a = Math.abs(area(ol));
    if (p.seating !== 'chairs') {
      const density = clamp(num(p.density, 2), 0.1, 4);
      out.audience.push({ id: p.id, outline: ol, y: r4(base), standing: true, area: r4(a), capacity: Math.round(a * density), seats: [] });
      return;
    }
    const f = pt2(p.facing) || [0, -2], rowP = clamp(num(p.rowPitch, 0.95), 0.6, 3), seatP = clamp(num(p.seatPitch, 0.6), 0.4, 3);
    const aisle = clamp(num(p.aisle, 0), 0, 20), occ = clamp(num(p.occupancy, 1), 0, 1);
    const dists = ol.map(([x, z]) => Math.hypot(x - f[0], z - f[1]));
    const r0 = Math.max(rowP, Math.min(...dists)), r1 = Math.max(...dists), seats = [];
    for (let r = r0; r <= r1 && seats.length < 6000; r += rowP) {
      const step = seatP / r;
      // Seats run along the row symmetrically about the centre line so the aisle stays straight.
      for (let k = 0; k * step <= Math.PI && seats.length < 6000; k++) {
        for (const sgn of k ? [1, -1] : [1]) {
          const ang = sgn * (k * step + (aisle ? 0 : 0)), x = f[0] + Math.sin(ang) * r, z = f[1] + Math.cos(ang) * r;
          if (aisle && Math.abs(x - f[0]) < aisle / 2 + seatP / 2) continue;
          if (!inside([x, z], ol)) continue;
          seats.push([r4(x), r4(z), r4(Math.atan2(f[0] - x, f[1] - z) / DEG)]);
        }
      }
    }
    out.audience.push({ id: p.id, outline: ol, y: r4(base), standing: false, area: r4(a), capacity: Math.round(seats.length * occ), occupancy: occ, seats, facing: f });
  }

  // The footprint: x/z extents of everything, and the highest point.
  function bounds(lay) {
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxY: 0 };
    const addP = (x, z, y = 0) => { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); b.maxY = Math.max(b.maxY, y); };
    lay.prisms.forEach((p) => p.outline.forEach(([x, z]) => addP(x, z, p.y1)));
    lay.floors.forEach((p) => p.outline.forEach(([x, z]) => addP(x, z, p.y)));
    lay.screens.forEach((s) => s.path.forEach(([x, z]) => addP(x, z, s.y1)));
    lay.boxes.forEach((o) => { const r = Math.hypot(o.size[0], o.size[2]) / 2; addP(o.center[0] - r, o.center[2] - r, o.center[1] + o.size[1] / 2); addP(o.center[0] + r, o.center[2] + r); });
    lay.cylinders.forEach((c) => { addP(c.center[0] - c.radius, c.center[2] - c.radius, c.center[1] + c.height / 2); addP(c.center[0] + c.radius, c.center[2] + c.radius); });
    lay.tori.forEach((t) => { const r = t.radius + t.tube; addP(t.center[0] - r, t.center[2] - r, t.center[1] + r); addP(t.center[0] + r, t.center[2] + r); });
    lay.truss.forEach((t) => { addP(t.from[0], t.from[2], t.from[1]); addP(t.to[0], t.to[2], t.to[1]); });
    if (b.minX === Infinity) return { minX: -6, maxX: 6, minZ: -8, maxZ: 0, maxY: 1, width: 12, depth: 8 };
    return { ...b, width: r4(b.maxX - b.minX), depth: r4(b.maxZ - b.minZ) };
  }

  /* ---------- Edits ---------- */
  // Small changes, for undo history and for Claude's edit tools:
  //   { op: 'add', part }  { op: 'update', id, set: {...} } (null removes a field)  { op: 'remove', id }
  //   { op: 'move', id, by: [dx, dz] }  { op: 'rename', name }  { op: 'replace', spec }
  function applyEdits(input, edits) {
    let spec = normalize(input).spec;
    const list = Array.isArray(edits) ? edits : [edits], notes = [];
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const i = spec.parts.findIndex((p) => p.id === e.id);
      if (e.op === 'replace') spec = normalize(e.spec).spec;
      else if (e.op === 'rename') spec.name = String(e.name || spec.name).slice(0, 80);
      else if (e.op === 'add' && e.part) spec.parts.push(e.part);
      else if (e.op === 'remove') { if (i < 0) notes.push(`no part "${e.id}" to remove`); else spec.parts.splice(i, 1); }
      else if (e.op === 'update') {
        if (i < 0) { notes.push(`no part "${e.id}" to update`); continue; }
        const p = spec.parts[i];
        Object.entries(e.set || {}).forEach(([k, v]) => { if (k === 'id' || k === 'type') return; if (v === null) delete p[k]; else p[k] = v; });
      } else if (e.op === 'move') {
        if (i < 0) { notes.push(`no part "${e.id}" to move`); continue; }
        const p = spec.parts[i], by = pt2(e.by) || [0, 0];
        if (Array.isArray(p.outline)) p.outline = p.outline.map((q) => [q[0] + by[0], q[1] + by[1]]);
        else if (Array.isArray(p.path) && p.type === 'truss') p.path = p.path.map((q) => [q[0] + by[0], q[1], q[2] + by[1]]);
        else if (p.type === 'steps') { p.from = [p.from[0] + by[0], p.from[1] + by[1]]; p.to = [p.to[0] + by[0], p.to[1] + by[1]]; }
        else { const a = pt2(p.at) || [0, 0]; p.at = [r4(a[0] + by[0]), r4(a[1] + by[1])]; }
      } else notes.push(`unknown edit "${e.op}"`);
    }
    const n = normalize(spec);
    return { spec: n.spec, warnings: notes.concat(n.warnings) };
  }

  // A line per part, for the panel and for telling Claude what is there.
  function describe(input) {
    const { spec } = normalize(input), lay = layout(spec), b = bounds(lay);
    const lines = spec.parts.map((p) => {
      const what = p.type === 'scenic' ? `${p.kind}` : p.type === 'led' && p.floor ? 'LED floor' : p.type;
      const sh = p.shape ? ` ${p.shape.kind}` : p.outline ? ` ${p.outline.length}-point outline` : '';
      return `${p.id}: ${what}${sh}${p.on ? ` on ${p.on}` : ''}`;
    });
    return { name: spec.name, summary: `${spec.parts.length} parts, ${b.width.toFixed(1)} m wide, ${b.depth.toFixed(1)} m deep, ${b.maxY.toFixed(1)} m tall`, lines };
  }

  // A starting point: a plain festival deck with a back wall, a booth and a front truss.
  function starter(name) {
    return normalize({
      name: name || 'New stage',
      parts: [
        { type: 'deck', id: 'deck', shape: { kind: 'rect', width: 16, depth: 10 }, height: 1.8 },
        { type: 'riser', id: 'booth-riser', on: 'deck', shape: { kind: 'rect', width: 5, depth: 2.6 }, at: [0, -4.5], height: 0.6 },
        { type: 'booth', id: 'booth', on: 'booth-riser', at: [0, -4.4], width: 2.6, depth: 0.9, face: 'led' },
        { type: 'led', id: 'back-wall', on: 'deck', width: 14, at: [0, -9.6], bottom: 0.3, height: 7 },
        { type: 'truss', id: 'front-truss', path: [[-8, 9, -1], [8, 9, -1]], fixtures: { type: 'spot', count: 8 } },
        { type: 'steps', id: 'stairs-left', from: [-9.6, -3], to: [-8, -3], width: 1.2, on: 'deck' },
      ],
    }).spec;
  }

  // What Claude reads to write descriptions: the format notes at the top of this file, plus the rules that matter.
  const GUIDE = [
    'Write a stage-visuals/stage JSON object: { "format": "stage-visuals/stage", "version": 1, "name": "...", "parts": [...] }.',
    'Units are metres. Plan points are [x, z]: x to the audience\'s right, z toward the audience. The stage front line is z = 0 and the stage sits at z < 0. Truss points are [x, y, z] with y the height above the floor.',
    'Part types: deck, riser, steps, booth, led, truss, scenic (kinds panel, column, arch, ring, pyramid, extrude).',
    'Decks take shape { kind: rect | polygon | circle | trapezoid | rounded | annulus | thrust, ... } or outline [[x, z], ...], and height. A rect deck\'s front edge sits on z = 0 unless anchor is "center".',
    'Risers, booths, LED and scenic pieces take on: "<deck or riser id>" to stand on it, at: [x, z], rotate (degrees, 0 faces the audience).',
    'LED walls: width + at, or path [[x, z], ...], or arc { center, radius, from, to } (angles: 0 = toward the audience, 180 = upstage), with bottom and height; shape rect | arch | gable. They face the audience (facing: "back" turns one round). LED floor: floor: true with a shape.',
    'Truss: path of [x, y, z], size, closed, and fixtures { type: spot | beam | wash | blinder | strobe | bar | par | laser, count }.',
    'Rows of round things (hay bales, pillars, barrels): scenic kind colonnade along arc { center, radius, from, to } or path, with diameter, height per piece and stack; fixtures { type, every, side, aim } for uplights at their feet.',
    'Audience: type audience with a shape or outline, seating "standing" (density) or "chairs" (facing [x, z], aisle width, rowPitch, seatPitch). Include one whenever the venue has a defined crowd area.',
    'Materials: deck, black, metal, mirror, wood, concrete, white, fabric, rock, hay, led. color "#rrggbb" tints.',
    'Give every part a short readable id. Keep sizes real: decks 0.6 to 2.5 m high, LED walls up to 40 m wide, truss trims 6 to 20 m.',
    'From photos: work out the plan shape first (look for the deck edge and its corners), then heights against a person (1.75 m) or a known measurement, then LED surfaces and scenic pieces, then truss. Say in notes what was estimated.',
  ].join('\n');

  return { FORMAT, TYPES, SCENIC, MATERIALS, GUIDE, shapeOutline, normalize, layout, bounds, along, applyEdits, describe, starter, area, inside };
});
