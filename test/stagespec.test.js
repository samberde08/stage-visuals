'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../app/stagespec');
const D = require('../bridge/design');

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('shapes: rect decks sit on the front line, polygons put a flat side to the audience', () => {
  const rect = S.layout({ parts: [{ type: 'deck', shape: { kind: 'rect', width: 12, depth: 8 }, height: 1.5 }] });
  const b = S.bounds(rect);
  near(b.maxZ, 0); near(b.minZ, -8); near(b.width, 12); near(b.maxY, 1.5);
  const hex = S.shapeOutline({ kind: 'polygon', sides: 6, radius: 5 });
  assert.strictEqual(hex.length, 6);
  const front = Math.max(...hex.map((p) => p[1]));
  assert.strictEqual(hex.filter((p) => Math.abs(p[1] - front) < 1e-9).length, 2, 'two vertices share the front edge');
  // A hexagon deck with no position is moved back so its front edge is the stage's front line.
  near(S.bounds(S.layout({ parts: [{ type: 'deck', shape: { kind: 'polygon', sides: 6, radius: 5 } }] })).maxZ, 0);
});

test('shapes: thrust runs into the audience, annulus and rounded close up', () => {
  const t = S.shapeOutline({ kind: 'thrust', width: 12, depth: 6, thrustWidth: 3, thrustDepth: 5 });
  near(Math.max(...t.map((p) => p[1])), 5);
  near(Math.min(...t.map((p) => p[1])), -6);
  const a = S.shapeOutline({ kind: 'annulus', inner: 4, outer: 8, from: -45, to: 45 });
  assert.ok(a.length > 6);
  assert.ok(Math.abs(S.area(a)) > 10);
  const r = S.shapeOutline({ kind: 'rounded', width: 10, depth: 4, radius: 1 });
  near(Math.max(...r.map((p) => p[0])), 5);
});

test('heights stack: risers on decks, booths on risers, steps rise to the deck', () => {
  const lay = S.layout(S.starter());
  const riser = lay.prisms.find((p) => p.id === 'booth-riser');
  near(riser.y0, 1.8); near(riser.y1, 2.4);
  const booth = lay.boxes.find((b) => b.id === 'booth');
  near(booth.center[1] - booth.size[1] / 2, 2.4);
  const steps = lay.boxes.filter((b) => b.id.startsWith('stairs-left#'));
  assert.strictEqual(steps.length, 10);
  near(Math.max(...steps.map((s) => s.center[1] + s.size[1] / 2)), 1.8);
  // The LED wall stands on the deck.
  near(lay.screens[0].y0, 1.8 + 0.3);
});

test('normalize: unknown parts and bad links are dropped with a note, ids made unique', () => {
  const { spec, warnings } = S.normalize({ parts: [
    { type: 'deck', id: 'a' }, { type: 'deck', id: 'a' }, { type: 'spaceship' },
    { type: 'riser', on: 'nowhere', shape: { kind: 'rect', width: 2, depth: 2 } },
    { type: 'deck', id: 'x', color: 'red', material: 'gold' },
  ] });
  assert.deepStrictEqual(spec.parts.map((p) => p.id), ['a', 'a-2', 'riser4', 'x']);
  assert.strictEqual(spec.parts[2].on, 'a', 'a riser with a bad link stands on the first deck');
  assert.strictEqual(spec.parts[3].color, undefined);
  assert.strictEqual(spec.parts[3].material, undefined);
  assert.ok(warnings.some((w) => /spaceship/.test(w)));
  assert.ok(warnings.some((w) => /nowhere/.test(w)));
  assert.throws(() => S.normalize('{ not json'), /Not valid JSON/);
});

test('normalize: an "on" loop is cut instead of hanging', () => {
  const { spec, warnings } = S.normalize({ parts: [
    { type: 'riser', id: 'p', on: 'q', shape: { kind: 'circle', radius: 1 } },
    { type: 'riser', id: 'q', on: 'p', shape: { kind: 'circle', radius: 1 } },
  ] });
  assert.ok(warnings.some((w) => /loops/.test(w)));
  assert.doesNotThrow(() => S.layout(spec));
});

test('LED walls face the audience whichever way the path or arc runs', () => {
  const lay = S.layout({ parts: [
    { type: 'led', id: 'arc', arc: { center: [0, -4], radius: 10, from: 140, to: 220 }, height: 6 },
    { type: 'led', id: 'line', path: [[5, -8], [-5, -8]], height: 4 },
    { type: 'led', id: 'back', path: [[5, -8], [-5, -8]], height: 4, facing: 'back' },
  ] });
  const first = (id) => lay.screens.find((s) => s.id === id).path;
  for (const id of ['arc', 'line']) { const p = first(id); assert.ok(p[p.length - 1][0] > p[0][0], `${id} runs left to right`); }
  const b = first('back'); assert.ok(b[b.length - 1][0] < b[0][0]);
  assert.ok(lay.screens.find((s) => s.id === 'arc').length > 10);
});

test('truss fixtures are spread evenly along the run', () => {
  const lay = S.layout({ parts: [{ type: 'truss', id: 't', path: [[-8, 10, -2], [8, 10, -2]], fixtures: { type: 'spot', count: 8 } }] });
  assert.strictEqual(lay.truss.length, 1);
  assert.strictEqual(lay.fixtures.length, 8);
  near(lay.fixtures[0].pos[0], -7); near(lay.fixtures[7].pos[0], 7);
  assert.ok(lay.fixtures.every((f) => f.pos[1] === 10 && f.truss === 't'));
  const loop = S.along([[0, 0, 0], [4, 0, 0], [4, 0, 4], [0, 0, 4], [0, 0, 0]], 4, true);
  assert.deepStrictEqual(loop.map((p) => p.map(Math.round)), [[0, 0, 0], [4, 0, 0], [4, 0, 4], [0, 0, 4]]);
});

test('scenic pieces: arch, ring, stepped pyramid, column and extrude all produce geometry', () => {
  const lay = S.layout({ parts: [
    { type: 'scenic', kind: 'arch', id: 'arch', width: 10, height: 9 },
    { type: 'scenic', kind: 'ring', id: 'ring', radius: 3, led: true },
    { type: 'scenic', kind: 'pyramid', id: 'pyr', width: 4, height: 3, steps: 3 },
    { type: 'scenic', kind: 'pyramid', id: 'smooth', width: 4, height: 3 },
    { type: 'scenic', kind: 'column', id: 'col', height: 5 },
    { type: 'scenic', kind: 'extrude', id: 'ex', shape: { kind: 'polygon', sides: 3, radius: 2 }, height: 2 },
    { type: 'scenic', kind: 'panel', id: 'pan', path: [[0, -5], [4, -5]], height: 3, led: true },
  ] });
  assert.strictEqual(lay.boxes.filter((b) => b.id.startsWith('arch#')).length, 20);
  near(Math.max(...lay.boxes.filter((b) => b.id.startsWith('arch#')).map((b) => b.center[1] + b.size[0] / 2)), 9, 0.4);
  assert.strictEqual(lay.tori.length, 1); assert.ok(lay.tori[0].led);
  assert.strictEqual(lay.boxes.filter((b) => b.id.startsWith('pyr#')).length, 3);
  assert.ok(lay.prisms.find((p) => p.id === 'smooth').apex);
  assert.strictEqual(lay.cylinders.length, 1);
  assert.ok(lay.prisms.find((p) => p.id === 'ex'));
  const pan = lay.boxes.find((b) => b.id === 'pan');
  near(pan.size[0], 4); near(pan.center[0], 2); assert.strictEqual(pan.led, 'front');
});

test('edits: add, update, move, remove, rename; misses are reported, not thrown', () => {
  const r = S.applyEdits(S.starter(), [
    { op: 'update', id: 'back-wall', set: { height: 9, shape: 'arch', bottom: null } },
    { op: 'add', part: { type: 'scenic', kind: 'column', id: 'pillar', at: [3, -2] } },
    { op: 'move', id: 'pillar', by: [1, -1] },
    { op: 'move', id: 'front-truss', by: [0, -2] },
    { op: 'remove', id: 'stairs-left' },
    { op: 'remove', id: 'ghost' },
    { op: 'rename', name: 'Edited' },
  ]);
  const by = Object.fromEntries(r.spec.parts.map((p) => [p.id, p]));
  assert.strictEqual(r.spec.name, 'Edited');
  assert.strictEqual(by['back-wall'].height, 9); assert.strictEqual(by['back-wall'].bottom, undefined);
  assert.deepStrictEqual(by.pillar.at, [4, -3]);
  assert.strictEqual(by['front-truss'].path[0][2], -3);
  assert.ok(!by['stairs-left']);
  assert.deepStrictEqual(r.warnings, ['no part "ghost" to remove']);
});

test('describe summarises the stage for people and for Claude', () => {
  const d = S.describe(S.starter('Mine'));
  assert.strictEqual(d.name, 'Mine');
  assert.match(d.summary, /^6 parts, 17\.8 m wide, 10\.0 m deep/);
  assert.ok(d.lines.includes('booth: booth on booth-riser'));
});

test('design: the reply parser takes a fenced or bare object, with or without the wrapper', () => {
  const spec = { parts: [{ type: 'deck' }] };
  assert.deepStrictEqual(D.parseReply('```json\n' + JSON.stringify({ spec, summary: 'ok' }) + '\n```').summary, 'ok');
  assert.deepStrictEqual(D.parseReply(`Here it is: ${JSON.stringify(spec)}`).spec, spec);
  assert.throws(() => D.parseReply('no json here'), /did not return/);
});

test('design: photos go first, then the current stage and the request', () => {
  const c = D.buildContent({ prompt: 'make it wider', spec: S.starter(), images: [{ media_type: 'image/jpeg', data: 'AAAA' }, { media_type: 'text/html', data: 'x' }], measurement: 'deck is 12 m' });
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[0].type, 'image');
  assert.match(c[1].text, /Current stage:/); assert.match(c[1].text, /Known measurement: deck is 12 m/); assert.match(c[1].text, /Request: make it wider/);
  assert.match(D.buildContent({}).at(-1).text, /no stage yet/);
});

test('design: a Claude reply becomes a clean description; refusals and long runs are errors', async () => {
  const fake = (msg) => ({ beta: { messages: { stream: (params) => { fake.last = params; return { finalMessage: async () => msg }; } } } });
  const ok = fake({ model: 'm', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ spec: { name: 'Hex', parts: [{ type: 'deck', shape: { kind: 'polygon', sides: 6, radius: 6 } }, { type: 'bogus' }] }, summary: 'A hexagon.' }) }] });
  const out = await D.design({ prompt: 'hexagon stage' }, { client: ok });
  assert.strictEqual(out.spec.name, 'Hex');
  assert.strictEqual(out.spec.parts.length, 1);
  assert.strictEqual(out.summary, 'A hexagon.');
  assert.ok(out.warnings.length === 1);
  assert.strictEqual(fake.last.model, D.MODEL);
  assert.deepStrictEqual(fake.last.thinking, { type: 'adaptive' });
  await assert.rejects(D.design({ prompt: 'x' }, { client: fake({ stop_reason: 'refusal', content: [] }) }), /declined/);
  await assert.rejects(D.design({ prompt: 'x' }, { client: fake({ stop_reason: 'max_tokens', content: [] }) }), /too long/);
});

test('colonnades: stacked bales along an arc, with floor uplights aimed at them', () => {
  const lay = S.layout({ parts: [{ type: 'scenic', kind: 'colonnade', id: 'ring', material: 'hay', arc: { center: [0, 6], radius: 10, from: 0, to: 180 }, diameter: 1.5, height: 1.2, stack: 2, fixtures: { type: 'par', every: 2, side: 'inside' } }] });
  const n = lay.cylinders.length / 2;
  assert.ok(Number.isInteger(n) && n > 15, `${lay.cylinders.length} pieces`);
  const top = Math.max(...lay.cylinders.map((c) => c.center[1] + c.height / 2));
  near(top, 2.4, 0.05);
  assert.strictEqual(lay.fixtures.length, Math.ceil(n / 2));
  assert.ok(lay.fixtures.every((f) => f.mount === 'floor' && Math.hypot(f.pos[0], f.pos[2] - 6) < 10), 'uplights sit inside the ring');
});

test('audience: standing areas get a capacity, chair blocks keep the centre aisle clear', () => {
  const lay = S.layout({ parts: [
    { type: 'audience', id: 'floor', shape: { kind: 'rect', width: 10, depth: 5 }, at: [0, 6] },
    { type: 'audience', id: 'chairs', seating: 'chairs', shape: { kind: 'rect', width: 12, depth: 6 }, at: [0, 6], aisle: 1.4 },
  ] });
  const floor = lay.audience.find((a) => a.id === 'floor');
  assert.ok(floor.standing); near(floor.capacity, 100, 1);
  const chairs = lay.audience.find((a) => a.id === 'chairs');
  assert.ok(chairs.seats.length > 40);
  assert.ok(chairs.seats.every(([x]) => Math.abs(x) > 0.7), 'nobody sits in the aisle');
  assert.ok(chairs.seats.every(([x, z]) => S.inside([x, z], chairs.outline)));
});

test('fixtures parts: lasers, fog and effects stand where asked and face their target', () => {
  const lay = S.layout({ parts: [
    { type: 'deck', id: 'stage', shape: { kind: 'rect', width: 6, depth: 3 }, height: 0.5 },
    { type: 'fixtures', id: 'fog', fixture: 'fog', on: 'stage', points: [[-2, -1], [2, -1]], toward: [0, 8] },
    { type: 'fixtures', id: 'ring', fixture: 'beam', arc: { center: [0, 5], radius: 6, from: 0, to: 360, count: 6 }, height: 2 },
  ] });
  const fog = lay.fixtures.filter((f) => f.truss === 'fog');
  assert.strictEqual(fog.length, 2);
  assert.ok(fog.every((f) => f.type === 'fog' && f.pos[1] === 0.5 && f.mount === 'floor'));
  near(fog[0].yaw, Math.atan2(2, 9) / (Math.PI / 180));
  const ring = lay.fixtures.filter((f) => f.truss === 'ring');
  assert.strictEqual(ring.length, 6, 'a full circle does not double its first point');
  assert.ok(ring.every((f) => f.pos[1] === 2));
});

test('colonnade fixtures: a list of blocks, some on top of the stack', () => {
  const lay = S.layout({ parts: [{ type: 'scenic', kind: 'colonnade', id: 'c', arc: { center: [0, 6], radius: 10, from: 0, to: 90 }, stack: 2, height: 1.2,
    fixtures: [{ type: 'par', every: 1 }, { type: 'beam', top: true, every: 3, offset: 1 }] }] });
  const tops = lay.fixtures.filter((f) => f.type === 'beam'), pars = lay.fixtures.filter((f) => f.type === 'par');
  assert.ok(pars.length > tops.length && tops.length > 0);
  assert.ok(tops.every((f) => Math.abs(f.pos[1] - 2.4) < 1e-6 && Math.abs(Math.hypot(f.pos[0], f.pos[2] - 6) - 10) < 1e-3));
});

test('look: kept when readable, bad values dropped with a note', () => {
  const { spec, warnings } = S.normalize({ look: { haze: 2, colors: ['#ff0000'], program: 'wave', lasers: 'sheet', fog: true, time: 22, laserColors: 'red' }, parts: [] });
  assert.deepStrictEqual(spec.look, { haze: 1, colors: ['#ff0000', '#ff0000'], program: 'wave', lasers: 'sheet', fog: true, time: 22 });
  assert.ok(warnings.some((w) => /laserColors/.test(w)));
  assert.strictEqual(S.normalize({ parts: [] }).spec.look, undefined);
});

test('the hay bale ring example: one spiral wall, a standing floor, its own fog and lasers', () => {
  const ex = require('../examples/hay-bale-ring.stage.json');
  const { spec, warnings } = S.normalize(ex); const lay = S.layout(spec);
  assert.deepStrictEqual(warnings, []); assert.deepStrictEqual(lay.warnings, []);
  // One spiral: each bale a little nearer the centre than the last, and where the wall overlaps itself the
  // corridor between the turns stays walkable.
  const c = lay.cylinders.filter((x) => x.id.startsWith('bale-ring') && x.id.endsWith('.0'));
  const r = c.map((x) => Math.hypot(x.center[0], x.center[2] - 4.6));
  assert.ok(r.every((v, i) => i === 0 || v < r[i - 1]), 'the radius only ever shrinks');
  let gap = 99; for (let i = 0; i < c.length; i++) for (let j = i + 3; j < c.length; j++) gap = Math.min(gap, Math.hypot(c[i].center[0] - c[j].center[0], c[i].center[2] - c[j].center[2]));
  assert.ok(gap > 2.8, `corridor ${gap}`);
  assert.ok(lay.audience.every((a) => a.standing));
  const kinds = new Set(lay.fixtures.map((f) => f.type));
  ['par', 'beam', 'fog', 'laser', 'spark'].forEach((k) => assert.ok(kinds.has(k), k));
});
