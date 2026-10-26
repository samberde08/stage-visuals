# Stage Visuals

A browser stage previsualizer for practising show design and showing clients how visuals will look in a real venue. Pick a venue type, size it, and run moving lights, lasers, a dancing crowd and LED-wall content over it, from built-in effects synced to music or live from a lighting console over sACN or Art-Net.

**Venues:** club, DJ booth in the round with LED cube, warehouse, arch tent, festival main stage, stadium, arena, proscenium theatre, thrust and amphitheatre templates, all parametric.

**Real venue library:** 30 top US club and festival venues in `app/venues.js`, picked from the **Real venue** menu: 15 clubs (Brooklyn Mirage, Knockdown Center, Echostage, Club Space, Exchange LA, Radius and more), Red Rocks and The Gorge, and 13 festival stages (EDC kineticFIELD and circuitGROUNDS, Coachella Sahara, Ultra, Electric Forest, Lollapalooza Perry's, Movement, Lost Lands, Portola, CRSSD, HARD Summer). Sizes are estimates from public information (capacity, published stage widths, photos), not venue drawings, and festival stages are generic proportions for that stage's scale because the designs change every year. Each venue also carries realism data for sky and crowd simulation: indoor or outdoor, latitude and longitude, the direction the audience faces, capacity, time zone, season and typical show hours. The page exposes it as `state.venueMeta` and fires a `stagevenue` event on `window` when it changes.

**Music:** play the built-in demo beat or load your own track. A track's tempo and beat phase are worked out from its kick drum when it loads, and lights, lasers, LED content and crowd lock to it. **Drop** gives a one-beat blackout, then four bars at full energy.

**Look:** High quality adds bloom, filmic colour and sun shadows; Fast drops them for laptops and phones. Outdoor venues (arch tent, festival, stadium) get a sky, a sun placed from the time of day for midsummer, and stars after dark, and beams wash out in full sun as they do on site. The crowd is made of people with arms, phones held up to film and mixed clothing, facing the stage, and the Crowd slider thins it out.

Online preview (built-in effects only): https://claude.ai/artifact/DvhX2dgvYb9dXB9nP7aKWh

## Run it with a console

Needs Node.js 18 or newer. No packages to install.

```sh
npm start
```

Then open http://localhost:8080. The bridge listens for:

- **sACN (E1.31)** on UDP 5568, unicast or multicast for universes 1 to 4
- **Art-Net (ArtDmx)** on UDP 6454, where port-address 0:0:0 is shown as universe 1

As soon as DMX arrives, the page switches its Control setting to **Live DMX from console** and lists each source with its packet rate.

No console handy? In a second terminal:

```sh
npm run fake-console              # sACN, 32 fixtures
npm run fake-console -- --artnet  # Art-Net instead
```

### Bridge options

```
node bridge/server.js --port 8080 --host 127.0.0.1 --universes 1-8 --iface 192.168.1.20 --artnet-offset 1 --no-artnet
```

- `--host 0.0.0.0` lets a tablet or second computer on the network open the visualizer.
- `--iface` picks the network card for sACN multicast when the machine has several.
- `--no-artnet` frees UDP 6454 if another Art-Net program already uses it.
- When two sACN sources send the same universe, the higher priority wins. A source drops out after 2.5 s of silence.

### Console setup

Patch the rig as the generic **16-channel spot** below, starting at universe 1, address 1, with consecutive addresses (fixture 101 at 1.001, 102 at 1.017, and so on). The Patch panel in the page lists every address. Then enable sACN or Art-Net output on the console and point it at this computer's IP, or use multicast.

| Ch | Function | Range |
|----|----------|-------|
| 1-2 | Pan, 16 bit | 540°, 50% = home |
| 3-4 | Tilt, 16 bit | 270°, 50% = home (straight along the hang direction) |
| 5 | Dimmer | 0-100% |
| 6 | Shutter | 0-31 open, 32-255 strobe 1-20 Hz |
| 7-9 | Red, green, blue | 0-100% |
| 10 | White | adds to all three |
| 11 | Zoom | 3° to 35° |
| 12-16 | Reserved | focus, colour wheel, gobo, speed, control |

Free consoles that can drive this: **QLC+** (sACN or Art-Net output plugin) and **grandMA3 onPC** (sACN output in DMX protocols). Real fixture types will replace this profile once GDTF import lands.

## Live TouchDesigner video

With the bridge running, TouchDesigner can send its output straight onto the LED walls as JPEG frames over a WebSocket. This works on macOS and Windows without Syphon, Spout or NDI. Setup takes a WebSocket DAT and an Execute DAT; see [touchdesigner/README.md](touchdesigner/README.md).

## Layout

```
app/stage.html       visualizer (three.js). A body fragment so the same file can be published as an artifact;
                     the bridge wraps it in a document and turns on live DMX.
bridge/server.js     HTTP page + WebSocket /dmx + UDP receivers, merges sources, pushes at ~44 Hz
bridge/dmx.js        sACN and Art-Net parsers and builders, source merge
bridge/ws.js         minimal WebSocket server
tools/fake-console.js  sends a test show over sACN or Art-Net
touchdesigner/       sender script for live TouchDesigner video
test/                node --test suite (npm test)
```

## Roadmap

1. MVR import and export, so rigs from Capture, Vectorworks or grandMA3 load directly.
2. GDTF fixture types in place of the generic spot, including real beam angles and DMX modes.
3. Real venue library built from published tech specs.
