'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../app/importer');

const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${msg}: ${a} vs ${b}`));
// Apply a column-major 4x4 to a point.
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

const SCENE = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<GeneralSceneDescription verMajor="1" verMinor="6">
  <UserData/>
  <Scene>
    <AUXData>
      <Symdef uuid="SYM-1" name="Truss 3m"><ChildList><Geometry3D fileName="truss3m.3ds"/></ChildList></Symdef>
    </AUXData>
    <Layers>
      <Layer name="Stage &amp; Set" uuid="L1">
        <ChildList>
          <SceneObject name="Deck" uuid="S1">
            <Matrix>{1,0,0}{0,1,0}{0,0,1}{0,-8000,0}</Matrix>
            <Geometries><Geometry3D fileName="deck.glb"/></Geometries>
          </SceneObject>
          <Truss name="Front truss" uuid="T1">
            <Matrix>{1,0,0}{0,1,0}{0,0,1}{-1500,-2000,9000}</Matrix>
            <Geometries><Symbol uuid="X" symdef="SYM-1"><Matrix>{1,0,0}{0,1,0}{0,0,1}{3000,0,0}</Matrix></Symbol></Geometries>
            <ChildList>
              <Fixture name="Spot 1" uuid="F1">
                <Matrix>{1,0,0}{0,-1,0}{0,0,-1}{500,0,-300}</Matrix>
                <GDTFSpec>Robe@MegaPointe.gdtf</GDTFSpec><GDTFMode>Mode 1</GDTFMode><FixtureID>101</FixtureID>
                <Addresses><Address break="0">513</Address></Addresses>
              </Fixture>
            </ChildList>
          </Truss>
          <!-- a floor wash -->
          <Fixture name="Wash 1" uuid="F2"><Matrix>{0,1,0}{-1,0,0}{0,0,1}{2000,-1000,0}</Matrix><GDTFSpec>Generic@Wash.gdtf</GDTFSpec></Fixture>
        </ChildList>
      </Layer>
    </Layers>
  </Scene>
</GeneralSceneDescription>`;

test('reads the XML tree, attributes and entities', () => {
  const d = I.parseXml('<?xml version="1.0"?><a x="1" y=\'&lt;2&gt;\'><b/><!-- c --><c><![CDATA[<raw>]]></c>t&amp;u</a>');
  const a = d.children[0];
  assert.strictEqual(a.name, 'a'); assert.deepStrictEqual(a.attrs, { x: '1', y: '<2>' });
  assert.deepStrictEqual(a.children.map((c) => c.name), ['b', 'c']);
  assert.strictEqual(a.children[1].text, '<raw>'); assert.strictEqual(a.text.trim(), 't&u');
});

test('MVR matrices convert millimetres Z-up to metres Y-up', () => {
  const m = I.toApp(I.parseMatrix('{1,0,0}{0,1,0}{0,0,1}{1000,2000,3000}'));
  // MVR x stays x, MVR z (up) becomes y, MVR y (upstage) becomes -z.
  near(apply(m, [0, 0, 0]), [1, 3, -2], 'origin');
  assert.deepStrictEqual(I.parseMatrix('junk'), I.IDENT());
});

test('reads layers, nested objects, symbols and fixtures from an MVR scene', () => {
  const s = I.readMvrScene(SCENE);
  assert.strictEqual(s.version, '1.6');
  assert.deepStrictEqual(s.layers, ['Stage & Set']);
  assert.deepStrictEqual(s.meshes.map((m) => [m.file, m.owner]), [['deck.glb', 'Deck'], ['truss3m.3ds', 'Front truss']]);
  // The deck sits 8 m upstage; glTF content is Y-up already, so its own up stays up.
  const deck = s.meshes[0].matrix;
  near(apply(deck, [0, 1, 0]), [0, 1, 8], 'deck up');
  // The truss symbol is 3 m along the truss from the truss origin, at 9 m trim; 3DS millimetres become metres.
  const tr = s.meshes[1].matrix;
  near(apply(tr, [0, 0, 0]), [1.5, 9, 2], 'truss origin');
  near(apply(tr, [1000, 0, 0]), [2.5, 9, 2], 'truss 1 m along');
  assert.strictEqual(s.fixtures.length, 2);
  const [spot, wash] = s.fixtures;
  assert.strictEqual(spot.gdtf, 'Robe@MegaPointe.gdtf'); assert.strictEqual(spot.mode, 'Mode 1'); assert.strictEqual(spot.fixtureId, '101');
  assert.deepStrictEqual(spot.address, { universe: 2, channel: 1 });
  const sp = I.fixturePose(spot.matrix);
  near(sp.pos, [-1, 8.7, 2], 'spot under the truss');
  assert.strictEqual(sp.flip, true);
  const wp = I.fixturePose(wash.matrix);
  assert.strictEqual(wp.flip, false); near(wp.pos, [2, 0, 1], 'wash on the floor');
  assert.ok(Math.abs(Math.abs(wp.yaw) - Math.PI / 2) < 1e-9, `wash turned a quarter: ${wp.yaw}`);
  assert.strictEqual(wash.address, null);
});

test('rejects files that are not MVR scenes', () => {
  assert.throws(() => I.readMvrScene('<html></html>'), /Not an MVR scene/);
});

test('guesses units and spots LED surfaces by name', () => {
  assert.strictEqual(I.guessUnits(30), 'm'); assert.strictEqual(I.guessUnits(2400), 'mm'); assert.strictEqual(I.guessUnits(900), 'cm');
  for (const n of ['LED_Wall', 'Screen Left', 'video-panel', 'IMAG screen']) assert.ok(I.isLedName(n), n);
  for (const n of ['Deck', 'Truss', 'Ledge', 'Speaker']) assert.ok(!I.isLedName(n), n);
});
