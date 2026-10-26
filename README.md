# Stage Visuals

A browser stage previsualizer for practising show design and showing clients how visuals will look in a real venue. Pick a venue type, size it, and run moving lights, lasers, a dancing crowd and LED-wall content over it, from built-in effects synced to music or live from a lighting console over sACN or Art-Net.

**Venues:** club, DJ booth in the round with LED cube, warehouse, arch tent, festival main stage, stadium, arena, proscenium theatre, thrust and amphitheatre templates, all parametric.

**Real venue library:** 30 top US club and festival venues in `app/venues.js`, picked from the **Real venue** menu: 15 clubs (Brooklyn Mirage, Knockdown Center, Echostage, Club Space, Exchange LA, Radius and more), Red Rocks and The Gorge, and 13 festival stages (EDC kineticFIELD and circuitGROUNDS, Coachella Sahara, Ultra, Electric Forest, Lollapalooza Perry's, Movement, Lost Lands, Portola, CRSSD, HARD Summer). Each venue is marked by how much real data backs it, and the panel under the menu lists every cited figure with a link to its source:

- **Real data (demo stages):** Red Rocks Amphitheatre, Avalon Hollywood and Brooklyn Mirage (2022 design). Stage, LED wall, room or bowl sizes come from published specs (venue tech pages, ESTA and Lighting & Sound America for Red Rocks, EDM.com for the Mirage), and the builders model what those specs describe: Red Rocks' 69-row bowl between Creation Rock and Ship Rock with a left-centre-right PA, Avalon's balcony and flown PA, the Mirage's 200 ft LED wall under a space-frame roof.
- **Partly sourced:** Echostage, Knockdown Center, Club Space, The Gorge, EDC kineticFIELD and Coachella Sahara, where some figures (capacity, stage width, rig, tent size) are cited and the rest estimated.
- **Estimated:** the rest, sized from capacity, photos and aerial imagery.

Nothing is copied from venue drawings, and festival stages are proportions for that stage's scale because the designs change every year. Each venue also carries realism data for sky and crowd simulation: indoor or outdoor, latitude and longitude, the direction the audience faces, capacity, time zone, season and typical show hours. The page exposes it as `state.venueMeta` and fires a `stagevenue` event on `window` when it changes.

**Music:** play the built-in demo beat or load your own track. A track's tempo and beat phase are worked out from its kick drum when it loads, and lights, lasers, LED content and crowd lock to it. **Drop** gives a one-beat blackout, then four bars at full energy.

**Look:** High quality adds bloom, filmic colour and sun shadows; Fast drops them for laptops and phones. Outdoor venues (arch tent, festival, stadium) get a sky, a sun placed from the time of day for midsummer, and stars after dark, and beams wash out in full sun as they do on site. The crowd is made of people with arms, phones held up to film and mixed clothing, facing the stage, and the Crowd slider thins it out.

**Surroundings:** outdoor venues sit inside a real sky and their real surroundings. The sky is a Poly Haven HDRI (CC0, in `app/hdri/`, credits in its README): a midday image, a golden-hour image and, for wooded sites, a night image, crossfaded by sun height and turned so the image's sun lines up with the computed sun. The scenery is built from each venue's `scenery` list in `app/venues.js`, placed by compass bearing from the stage: city skylines with the real heights of their tallest towers (Manhattan from Brooklyn Mirage, the Loop from Grant Park, downtown Miami from Bayfront Park, the Renaissance Center from Hart Plaza, Denver from Red Rocks, the Strip from the speedway), mountain ranges at their real relief and distance, bays, rivers and lakes, pine, hardwood and palm trees, Sherwood Forest's lit trees, grandstands, and the orange glow of city light at night. Distant features are drawn at a fixed radius and scaled to keep their real angular size. Lit windows and aircraft warning lights come on after dark. The HDRIs are generic skies matched to each site's landscape, not photos of the venues, and stage orientation is estimated for most festival sites. **Surroundings** in the Look panel turns it off.

**Being there:** the view is meant to feel like standing in the venue rather than looking at a model.

- **Crowd at real size.** Each area fills towards the venue's capacity (up to 24,000 people at High quality, 6,000 at Fast), packed no tighter than about 3.3 people per square metre. People are posed on the graphics card: they hop and nod on the beat, throw their hands up as the energy builds, and about one in ten films on a glowing phone. At night they are silhouettes, with their edges lit by the colour of the stage and the rig. Anyone standing where the camera is steps aside.
- **Walk.** The Walk camera puts you in the crowd at 1.7 m eye height. Use WASD or the arrow keys to walk (Shift to run) and drag to look around. You follow the ground, so you can climb Red Rocks' rows, and your head bobs as you walk and moves with the beat when you stand still.
- **Beam optics.** Beams are hot at the lens and fade with distance, with a soft core and feathered edges. A fixture pointed at you flares, with a starburst that grows as you move into the beam.
- **Lens.** In the Look panel, *Your eyes* adapts exposure to what you look at (the LED wall darkens the room around it, the dark crowd opens up), darkening faster than it brightens. *Phone video* adds faster auto-exposure, sensor grain, colour fringing and vignetting. *Clean render* turns it all off. The lens effects need High quality.
- **Venue sound.** With *Sound: In the venue*, music plays through the room you're standing in: a reverb tail for the kind of space (short outdoors, long in a warehouse or arena), a slap back off the rocks at Red Rocks and off the stands in a stadium, high end lost to distance from the PA, the PA placed around your head in 3D, and a crowd that roars on the drop. Reverb times are typical for each kind of space, not measurements of these venues. Headphones help.

### Further realism, using your Mac

These need assets or hardware the cloud build can't fetch:

1. **Scanned venues.** A phone scan (Polycam, RealityScan or Scaniverse on iPhone) of a room you're in, exported as glTF, would replace the modelled room with the real one. Only scan where you have permission, and keep scans private unless the venue agrees.
2. **Sharper skies.** 4K versions of the Poly Haven HDRIs in `app/hdri/` (CC0, free) from polyhaven.com, saved with the same names.
3. **Path-traced stills.** A path tracer (such as three-gpu-pathtracer, MIT) can render a single frame with real bounce light and haze for client pitches. It needs a recent GPU, so it runs on the Mac rather than in the online preview.

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
