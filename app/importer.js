/* Custom stage import: reads MVR scene descriptions (DIN SPEC 15801, the open format Vectorworks, Capture, grandMA3 and
 * Depence export) into plain objects the page turns into meshes and fixtures. No DOM, so node --test can run it.
 * MVR is Z-up in millimetres; the app is Y-up in metres. Matrices here are column-major 4x4 arrays like three.js's
 * Matrix4.elements, already converted to app space. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StageImport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- A small XML reader ---------- */
  // Enough XML for MVR and GDTF: elements, attributes, text, comments, CDATA and the prolog. Entities are decoded.
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m));
  function parseXml(text) {
    const rootEl = { name: '#root', attrs: {}, children: [], text: '' }, stack = [rootEl];
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(text))) {
      const top = stack[stack.length - 1];
      if (m[1] !== undefined) top.text += m[1];
      else if (m[2]) { if (stack.length > 1) stack.pop(); }
      else if (m[3]) {
        const el = { name: m[3], attrs: {}, children: [], text: '' };
        for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) el.attrs[a[1]] = decode(a[2] ?? a[3]);
        top.children.push(el);
        if (!m[5]) stack.push(el);
      } else if (m[6] !== undefined) top.text += decode(m[6]);
    }
    return rootEl;
  }
  const kids = (el, name) => (el ? el.children.filter((c) => !name || c.name === name) : []);
  const kid = (el, name) => kids(el, name)[0] || null;
  const textOf = (el) => (el ? el.text.trim() : '');

  /* ---------- Matrices ---------- */
  const IDENT = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  // "{u1,u2,u3}{v1,v2,v3}{w1,w2,w3}{o1,o2,o3}": u, v and w are the local x, y and z axes, o the origin in millimetres.
  function parseMatrix(s) {
    const nums = (String(s || '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (nums.length < 12) return IDENT();
    const [u1, u2, u3, v1, v2, v3, w1, w2, w3, o1, o2, o3] = nums;
    return [u1, u2, u3, 0, v1, v2, v3, 0, w1, w2, w3, 0, o1 / 1000, o2 / 1000, o3 / 1000, 1];
  }
  // Z-up to Y-up: (x, y, z) -> (x, z, -y), a -90 degree turn about x.
  const ZUP = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
  const ZUP_INV = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
  // An object's world matrix maps its local (MVR-frame) coordinates into MVR world space; turning the result to Y-up
  // gives a matrix that places the same content in the app.
  const toApp = (m) => mul(ZUP, m);
  // Geometry files: 3DS is Z-up millimetres, glTF is Y-up metres (MVR 1.5 and GDTF 1.2).
  function geometryFix(file) {
    if (/\.3ds$/i.test(file)) return [0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 1];
    if (/\.gl(b|tf)$/i.test(file)) return ZUP_INV;
    return IDENT();
  }

  /* ---------- MVR scene ---------- */
  const OBJECT_KINDS = new Set(['SceneObject', 'Truss', 'Support', 'VideoScreen', 'Projector', 'Fixture', 'GroupObject', 'FocusPoint']);
  // Read GeneralSceneDescription.xml. Returns meshes to load (file + world matrix in app space, metres) and fixtures
  // (world matrix, GDTF file and mode, DMX address), grouped by layer.
  function readMvrScene(xml) {
    const doc = parseXml(xml), gsd = kid(doc, 'GeneralSceneDescription');
    if (!gsd) throw new Error('Not an MVR scene: no GeneralSceneDescription');
    const scene = kid(gsd, 'Scene');
    const symdefs = {};
    for (const sd of kids(kid(scene, 'AUXData'), 'Symdef')) symdefs[sd.attrs.uuid] = sd;
    const out = { version: `${gsd.attrs.verMajor || '?'}.${gsd.attrs.verMinor || '?'}`, layers: [], meshes: [], fixtures: [], skipped: 0 };

    // Geometry3D and Symbol children of a Geometries or ChildList block, with the parent's world matrix (MVR space).
    function geometries(block, world, owner, depth = 0) {
      for (const g of kids(block)) {
        const local = mul(world, parseMatrix(textOf(kid(g, 'Matrix'))));
        if (g.name === 'Geometry3D' && g.attrs.fileName) out.meshes.push({ file: g.attrs.fileName, matrix: toApp(mul(local, geometryFix(g.attrs.fileName))), owner });
        else if (g.name === 'Symbol' && symdefs[g.attrs.symdef] && depth < 8) geometries(kid(symdefs[g.attrs.symdef], 'ChildList'), local, owner, depth + 1);
      }
    }
    function walk(list, world, layer, depth = 0) {
      for (const o of kids(list)) {
        if (!OBJECT_KINDS.has(o.name)) continue;
        const m = mul(world, parseMatrix(textOf(kid(o, 'Matrix'))));
        const name = o.attrs.name || textOf(kid(o, 'Name')) || o.name;
        if (o.name === 'Fixture') {
          const addr = kid(kid(o, 'Addresses'), 'Address');
          const abs = addr ? Number(textOf(addr)) : 0;
          out.fixtures.push({
            name, layer, uuid: o.attrs.uuid || '', gdtf: textOf(kid(o, 'GDTFSpec')), mode: textOf(kid(o, 'GDTFMode')),
            fixtureId: textOf(kid(o, 'FixtureID')), address: abs ? { universe: Math.floor((abs - 1) / 512) + 1, channel: ((abs - 1) % 512) + 1 } : null,
            matrix: toApp(m),
          });
        } else if (o.name !== 'FocusPoint') geometries(kid(o, 'Geometries'), m, name);
        if (depth < 16) walk(kid(o, 'ChildList'), m, layer, depth + 1);
      }
    }
    for (const L of kids(kid(scene, 'Layers'), 'Layer')) {
      const name = L.attrs.name || 'Layer';
      out.layers.push(name);
      walk(kid(L, 'ChildList'), parseMatrix(textOf(kid(L, 'Matrix'))), name);
    }
    return out;
  }

  /* ---------- Fixture placement from a matrix ---------- */
  // A fixture's local z is its "up" in MVR. Hung fixtures point their base up at the truss, so their up runs downward
  // in the room. Yaw is the turn of its local x about the vertical, as the generic rig uses it.
  function fixturePose(m) {
    // Column 2 is the fixture's local z (its MVR up) in app space, so its y says whether it points up or down.
    const up = [m[8], m[9], m[10]];
    const hang = up[1] < 0;
    // The generic fixture turns by yaw and then, when hung, half a turn about its own z, which mirrors its x axis.
    const yaw = hang ? Math.atan2(m[2], -m[0]) : Math.atan2(-m[2], m[0]);
    return { pos: [m[12], m[13], m[14]], flip: hang, yaw };
  }

  /* ---------- GDTF fixture types ---------- */
  // description.xml of a .gdtf (DIN SPEC 15800): name, maker, beam angle, and each DMX mode's channels by attribute
  // (offsets of coarse and fine bytes), its footprint, and the pan, tilt and zoom ranges in degrees.
  function walkAll(el, fn) { fn(el); el.children.forEach((c) => walkAll(c, fn)); }
  function readGdtf(xml) {
    const doc = parseXml(xml), ft = kid(kid(doc, 'GDTF'), 'FixtureType');
    if (!ft) throw new Error('Not a GDTF fixture: no FixtureType');
    let beamAngle = 0;
    walkAll(kid(ft, 'Geometries') || { children: [] }, (el) => { if (el.name === 'Beam' && !beamAngle) beamAngle = Number(el.attrs.BeamAngle) || 0; });
    let panRange = 0, tiltRange = 0, zoomRange = null;
    const modes = kids(kid(ft, 'DMXModes'), 'DMXMode').map((m) => {
      const attributes = {}; let footprint = 0;
      for (const ch of kids(kid(m, 'DMXChannels'), 'DMXChannel')) {
        if ((ch.attrs.DMXBreak || '1') !== '1') continue;
        const offs = String(ch.attrs.Offset || '').split(',').map(Number).filter((n) => n > 0);
        if (!offs.length) continue;
        footprint = Math.max(footprint, ...offs);
        const lc = kid(ch, 'LogicalChannel'), cf = kid(lc, 'ChannelFunction');
        const attr = (lc && lc.attrs.Attribute) || (cf && cf.attrs.Attribute);
        if (!attr || attributes[attr]) continue;
        attributes[attr] = offs;
        const from = Number(cf && cf.attrs.PhysicalFrom), to = Number(cf && cf.attrs.PhysicalTo);
        if (Number.isFinite(from) && Number.isFinite(to) && to !== from) {
          if (attr === 'Pan') panRange = Math.abs(to - from);
          if (attr === 'Tilt') tiltRange = Math.abs(to - from);
          if (attr === 'Zoom') zoomRange = [Math.min(from, to), Math.max(from, to)];
        }
      }
      return { name: m.attrs.Name || 'Mode', footprint, attributes };
    }).filter((m) => m.footprint > 0);
    return { name: ft.attrs.LongName || ft.attrs.Name || 'Fixture', shortName: ft.attrs.ShortName || '', manufacturer: ft.attrs.Manufacturer || '', beamAngle, panRange, tiltRange, zoomRange, modes };
  }

  /* ---------- Units for plain 3D files ---------- */
  const UNITS = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 };
  // Guess a file's units from its size: a stage is roughly 5 to 120 m across.
  function guessUnits(maxDim) {
    if (!(maxDim > 0)) return 'm';
    if (maxDim > 2000) return 'mm';
    if (maxDim > 400) return 'cm';
    return 'm';
  }
  // Names that mark a surface as LED or projection, so the wall content plays on it.
  const LED_NAME = /\b(led|screen|video|display|projection|lcd|panel_?led)\b|led[_\s-]?wall|^screen/i;
  const isLedName = (s) => LED_NAME.test(String(s || '').replace(/[_.]/g, ' '));

  return { parseXml, parseMatrix, mul, toApp, readMvrScene, readGdtf, fixturePose, UNITS, guessUnits, isLedName, IDENT };
});
