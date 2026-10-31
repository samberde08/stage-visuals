'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../app/rig');
const I = require('../app/importer');

const GDTF = `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2"><FixtureType Name="MegaBeam" LongName="Mega Beam 300" Manufacturer="Acme" ShortName="MB300">
  <Geometries><Geometry Name="Base"><Axis Name="Yoke"><Axis Name="Head"><Beam Name="Beam" BeamAngle="2.5" BeamType="Spot"/></Axis></Axis></Geometry></Geometries>
  <DMXModes>
    <DMXMode Name="Standard" Geometry="Base"><DMXChannels>
      <DMXChannel DMXBreak="1" Offset="1,2" Geometry="Yoke"><LogicalChannel Attribute="Pan"><ChannelFunction Attribute="Pan" PhysicalFrom="-270" PhysicalTo="270"/></LogicalChannel></DMXChannel>
      <DMXChannel DMXBreak="1" Offset="3,4" Geometry="Head"><LogicalChannel Attribute="Tilt"><ChannelFunction Attribute="Tilt" PhysicalFrom="-135" PhysicalTo="135"/></LogicalChannel></DMXChannel>
      <DMXChannel DMXBreak="1" Offset="5" Geometry="Head"><LogicalChannel Attribute="Shutter1"><ChannelFunction Attribute="Shutter1"/></LogicalChannel></DMXChannel>
      <DMXChannel DMXBreak="1" Offset="6" Geometry="Head"><LogicalChannel Attribute="Dimmer"><ChannelFunction Attribute="Dimmer"/></LogicalChannel></DMXChannel>
      <DMXChannel DMXBreak="1" Offset="7" Geometry="Head"><LogicalChannel Attribute="ColorAdd_R"/></DMXChannel>
      <DMXChannel DMXBreak="1" Offset="8" Geometry="Head"><LogicalChannel Attribute="ColorAdd_G"/></DMXChannel>
      <DMXChannel DMXBreak="1" Offset="9" Geometry="Head"><LogicalChannel Attribute="ColorAdd_B"/></DMXChannel>
      <DMXChannel DMXBreak="1" Offset="None" Geometry="Head"><LogicalChannel Attribute="NoFeature"/></DMXChannel>
    </DMXChannels></DMXMode>
    <DMXMode Name="Basic"><DMXChannels><DMXChannel DMXBreak="1" Offset="1"><LogicalChannel Attribute="Dimmer"/></DMXChannel></DMXChannels></DMXMode>
  </DMXModes>
</FixtureType></GDTF>`;

test('reads a GDTF fixture: beam, modes, channels and ranges', () => {
  const g = I.readGdtf(GDTF);
  assert.strictEqual(g.name, 'Mega Beam 300'); assert.strictEqual(g.manufacturer, 'Acme'); assert.strictEqual(g.beamAngle, 2.5);
  assert.deepStrictEqual(g.modes.map((m) => [m.name, m.footprint]), [['Standard', 9], ['Basic', 1]]);
  assert.deepStrictEqual(g.modes[0].attributes.Pan, [1, 2]);
  assert.strictEqual(g.panRange, 540); assert.strictEqual(g.tiltRange, 270);
  assert.throws(() => I.readGdtf('<GDTF/>'), /Not a GDTF/);
});

test('a GDTF mode becomes a fixture type that decodes DMX', () => {
  const t = R.typeFromGdtf(I.readGdtf(GDTF), 'Standard');
  assert.strictEqual(t.kind, 'beam'); assert.strictEqual(t.move, true); assert.strictEqual(t.footprint, 9);
  assert.deepStrictEqual(t.channels, { pan: 1, panFine: 2, tilt: 3, tiltFine: 4, shutter: 5, dim: 6, r: 7, g: 8, b: 9 });
  const data = new Uint8Array(512);
  // Fixture at address 101: pan full right, tilt centre, shutter open, full red at half dimmer.
  data.set([255, 255, 128, 0, 20, 128, 255, 0, 0], 100);
  const d = R.decode(t, data, 101, 0);
  assert.ok(Math.abs(d.pan - 270) < 0.01, `pan ${d.pan}`); assert.ok(Math.abs(d.tilt) < 1, `tilt ${d.tilt}`);
  assert.ok(Math.abs(d.dim - 128 / 255) < 1e-9); assert.deepStrictEqual([d.r, d.g, d.b], [1, 0, 0]);
  data[104] = 0; assert.strictEqual(R.decode(t, data, 101, 0).dim, 128 / 255, 'shutter closed under 8 only blacks out fixtures without a dimmer');
  const basic = R.typeFromGdtf(I.readGdtf(GDTF), 'Basic');
  assert.strictEqual(basic.move, false); assert.strictEqual(basic.footprint, 1); assert.strictEqual(basic.colorless, true);
});

test('the built-in 16-channel spot decodes as the console guide says', () => {
  const data = new Uint8Array(512);
  data.set([128, 0, 128, 0, 255, 0, 0, 255, 0, 0, 255], 16);
  const d = R.decode(R.TYPES.spot, data, 17, 0);
  assert.ok(Math.abs(d.pan) < 0.01 && Math.abs(d.tilt) < 0.01);
  assert.strictEqual(d.dim, 1); assert.deepStrictEqual([d.r, d.g, d.b], [0, 1, 0]); assert.strictEqual(d.zoom, 35);
});

test('auto patch is consecutive and never splits a fixture across universes', () => {
  const list = [];
  for (let i = 0; i < 60; i++) list.push(R.makeFixture({ type: i % 2 ? 'spot' : 'blinder' }));
  R.autoPatch(list);
  assert.deepStrictEqual([list[0].universe, list[0].address, list[1].address, list[2].address], [1, 1, 6, 22]);
  for (const f of list) assert.ok(f.address + R.TYPES[f.type].footprint - 1 <= 512, `${f.universe}.${f.address}`);
  assert.ok(list.some((f) => f.universe === 2));
  assert.strictEqual(R.patchClashes(list).size, 0);
  list[3].universe = list[2].universe; list[3].address = list[2].address + 2;
  assert.deepStrictEqual([...R.patchClashes(list)].sort(), [list[2].id, list[3].id].sort());
});

test('arrays space fixtures evenly and bow by the sag', () => {
  const p = R.arrayPoints([-5, 10, 0], [5, 10, 0], 5, 1);
  assert.deepStrictEqual(p.map((q) => q[0]), [-5, -2.5, 0, 2.5, 5]);
  assert.strictEqual(p[0][1], 10); assert.strictEqual(p[2][1], 9); assert.strictEqual(R.arrayPoints([0, 0, 0], [2, 0, 0], 1)[0][0], 1);
});

test('rig files round trip, keep GDTF types and reject junk', () => {
  const t = R.typeFromGdtf(I.readGdtf(GDTF));
  const types = { ...R.TYPES, 'gdtf:mb': t };
  const list = R.autoPatch([R.makeFixture({ type: 'gdtf:mb', pos: [1, 9, -2], flip: true, group: 'Beams!' }, types), R.makeFixture({ type: 'wash', name: 'W1' }, types)], types);
  const back = R.loadRig(JSON.parse(JSON.stringify(R.saveRig(list, types))));
  assert.strictEqual(back.fixtures[0].type, 'gdtf:mb'); assert.strictEqual(back.fixtures[0].group, 'Beams');
  assert.deepStrictEqual(back.types['gdtf:mb'].channels, t.channels);
  assert.deepStrictEqual(back.fixtures.map((f) => f.address), [1, 10]);
  assert.throws(() => R.loadRig({ kind: 'audio' }), /Not a rig/);
  assert.strictEqual(R.makeFixture({ type: 'nope' }).type, 'spot');
});

test('MVR export reads back with the same positions, hanging and yaw', () => {
  const list = R.autoPatch([
    R.makeFixture({ type: 'spot', pos: [-3, 9.5, -4], flip: true, yaw: 0.4 }),
    R.makeFixture({ type: 'blinder', pos: [2, 0.5, 1], flip: false, yaw: -1.2 }),
  ]);
  const s = I.readMvrScene(R.exportMvrXml(list));
  assert.strictEqual(s.fixtures.length, 2);
  s.fixtures.forEach((fx, i) => {
    const p = I.fixturePose(fx.matrix), f = list[i];
    p.pos.forEach((v, k) => assert.ok(Math.abs(v - f.pos[k]) < 1e-6, `pos ${p.pos} vs ${f.pos}`));
    assert.strictEqual(p.flip, f.flip);
    assert.ok(Math.abs(Math.atan2(Math.sin(p.yaw - f.yaw), Math.cos(p.yaw - f.yaw))) < 1e-6, `yaw ${p.yaw} vs ${f.yaw}`);
  });
  assert.deepStrictEqual(s.fixtures.map((f) => f.address), [{ universe: 1, channel: 1 }, { universe: 1, channel: 17 }]);
});
