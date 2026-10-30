# Stage Visuals

A browser stage previsualizer for practising show design and showing clients how visuals will look in a real venue. Pick a venue type, size it, and run moving lights, lasers, a dancing crowd and LED-wall content over it, from built-in effects synced to music or live from a lighting console over sACN or Art-Net.

**Venues:** club, DJ booth in the round with LED cube, warehouse, arch tent, festival main stage, stadium, arena, proscenium theatre, thrust and amphitheatre templates, all parametric.

**Real venue library:** 30 top US club and festival venues in `app/venues.js`, picked from the **Real venue** menu: 15 clubs (Brooklyn Mirage, Knockdown Center, Echostage, Club Space, Exchange LA, Radius and more), Red Rocks and The Gorge, and 13 festival stages (EDC kineticFIELD and circuitGROUNDS, Coachella Sahara, Ultra, Electric Forest, Lollapalooza Perry's, Movement, Lost Lands, Portola, CRSSD, HARD Summer). Each venue is marked by how much real data backs it, and the panel under the menu lists every cited figure with a link to its source:

- **Real data (demo stages):** Red Rocks Amphitheatre, Avalon Hollywood and Brooklyn Mirage (2022 design). Stage, LED wall, room or bowl sizes come from published specs (venue tech pages, ESTA and Lighting & Sound America for Red Rocks, EDM.com for the Mirage), and the builders model what those specs describe: Red Rocks' 69-row bowl between Creation Rock and Ship Rock with a left-centre-right PA, Avalon's balcony and flown PA, the Mirage's 200 ft LED wall under a space-frame roof.
- **Partly sourced:** Echostage, Knockdown Center, Club Space, The Gorge, EDC kineticFIELD and Coachella Sahara, where some figures (capacity, stage width, rig, tent size) are cited and the rest estimated.
- **Estimated:** the rest, sized from capacity, photos and aerial imagery.

Nothing is copied from venue drawings, and festival stages are proportions for that stage's scale because the designs change every year. Each venue also carries realism data for sky and crowd simulation: indoor or outdoor, latitude and longitude, the direction the audience faces, capacity, time zone, season and typical show hours. The page exposes it as `state.venueMeta` and fires a `stagevenue` event on `window` when it changes.

**Music:** play the built-in demo beat or load your own track. A track's tempo and beat phase are worked out from its kick drum when it loads, and lights, lasers, LED content and crowd lock to it. **Drop** gives a one-beat blackout, then four bars at full energy.

**Audio reactive mixer:** **Audio FX** (or the button under Music) opens a mixer that decides how the show reacts to sound. Sources are the built-in demo, your own track, a **microphone or line in**, or **another browser tab's audio** (YouTube, SoundCloud, a DJ stream). On a Mac, the free [BlackHole](https://existential.audio/blackhole/) driver lets Rekordbox, Serato, Traktor or Spotify feed straight in as an input. The mixer shows:

- A live spectrum, plus meters for what it hears: level, six frequency bands, kick, snare and hi-hat hits, the beat, build-up tension and drops.
- The tempo it detects from live input. The show locks to that tempo, and **Auto drop** fires the Drop when the bass comes back after a breakdown.
- **Links**, each connecting one thing it hears to one thing on stage. Lights take dimmer, strobe, white flash, colour shift, beam size, movement size, movement speed and tilt. Lasers take intensity, spread, speed, height and colour. The LED wall takes brightness, flash and motion speed. Haze, crowd jumping and camera shake can be linked too.
  - Each link can target a group of fixtures: overhead, floor, odd, even, left, right or centre.
  - Each link has an amount (negative inverts the effect), plus gain, gate, attack, release and curve under **Response**.
  - Dragging across the spectrum gives the selected link its own frequency band.
- Presets: four built-in setups (Punchy club, Festival main stage, Techno strobe, Chill wash). You can save your own in the browser and export or import them as JSON files.

With no music playing, the links react to a built-in beat at the Tempo slider, so the show is never static. Audio is analysed in the page only: nothing is recorded or sent anywhere. Microphone and tab capture need the local version (`npm start`), because the online preview cannot ask for inputs.

The analysis lives in `app/audio.js`, which has no browser dependencies and is covered by `test/audio.test.js`. Kicks, snares and hats are found by spectral flux against an adaptive threshold. Tempo is a comb over kick intervals with a phase-locked beat counter, and breakdowns are spotted when the bass falls 10 dB below its recent level.

**Look:** High quality adds bloom, filmic colour and sun shadows; Fast drops them for laptops and phones. Outdoor venues (arch tent, festival, stadium) get a sky, a sun placed from the time of day for midsummer, and stars after dark, and beams wash out in full sun as they do on site. The crowd is made of people with arms, phones held up to film and mixed clothing, facing the stage, and the Crowd slider thins it out.

**Surroundings:** outdoor venues sit inside a real sky and their real surroundings. The sky is a Poly Haven HDRI (CC0, in `app/hdri/`, credits in its README): a midday image, a golden-hour image and, for wooded sites, a night image, crossfaded by sun height and turned so the image's sun lines up with the computed sun. The scenery is built from each venue's `scenery` list in `app/venues.js`, placed by compass bearing from the stage: city skylines with the real heights of their tallest towers (Manhattan from Brooklyn Mirage, the Loop from Grant Park, downtown Miami from Bayfront Park, the Renaissance Center from Hart Plaza, Denver from Red Rocks, the Strip from the speedway), mountain ranges at their real relief and distance, bays, rivers and lakes, pine, hardwood and palm trees, Sherwood Forest's lit trees, grandstands, and the orange glow of city light at night. Distant features are drawn at a fixed radius and scaled to keep their real angular size. Lit windows and aircraft warning lights come on after dark. The HDRIs are generic skies matched to each site's landscape, not photos of the venues, and stage orientation is estimated for most festival sites. **Surroundings** in the Look panel turns it off.

**Being there:** the view is meant to feel like standing in the venue rather than looking at a model.

- **Crowd at real size.** Each area fills towards the venue's capacity (up to 24,000 people at High quality, 6,000 at Fast), packed no tighter than about 3.3 people per square metre. People are posed on the graphics card: they hop and nod on the beat, throw their hands up as the energy builds, and about one in ten films on a glowing phone. At night they are silhouettes, with their edges lit by the colour of the stage and the rig. Anyone standing where the camera is steps aside.
- **Walk.** The Walk camera puts you in the crowd at 1.7 m eye height. Use WASD or the arrow keys to walk (Shift to run) and drag to look around. You follow the ground, so you can climb Red Rocks' rows, and your head bobs as you walk and moves with the beat when you stand still.
- **Beam optics.** Beams are hot at the lens and fade with distance, with a soft core and feathered edges. A fixture pointed at you flares, with a starburst that grows as you move into the beam.
- **Lens.** In the Look panel, *Your eyes* adapts exposure to what you look at (the LED wall darkens the room around it, the dark crowd opens up), darkening faster than it brightens. *Phone video* adds faster auto-exposure, sensor grain, colour fringing and vignetting. *Clean render* turns it all off. The lens effects need High quality.
- **DJ booth views.** *DJ view* stands you behind the decks looking out at the crowd. *Behind DJ* is the over-the-shoulder shot from between the DJ and the back wall, pulled back as far as the room allows. The booth has four media players and a four-channel mixer with lit screens, meters and jog wheels, a laptop, booth monitors and a DJ who nods on the beat and throws both hands up on the drop. On big stages it sits on a riser with an LED front running the show's visuals.
- **Surfaces.** Floors, decks, walls and rock are textured by world position at real scale: polished concrete club floors, black marley stage decks with board seams and scuffs, painted brick walls, poured concrete, layered sandstone, worn festival grass, red desert soil. Stages have pleated skirts and black scrims, festivals have steel crowd barriers, a front-of-house tent with lit desks and delay towers on big fields, and clubs have a ceiling with ductwork, a back bar, lit exit signs and subs at the stage front. Red Rocks' monoliths are sculpted rock rather than boxes, and its rows have bench seating.
- **Sky.** *Surroundings: Real location* now shows a rendered sky with drifting clouds that stays sharp at any zoom, while the location's HDRI still lights the scene. *Photo sky (HDRI)* brings back the photo backdrop.
- **Venue photos.** Picking a real venue shows a photo of the place from Wikimedia Commons where a freely licensed one exists (19 of the 30), with a link to its photographer and licence, plus a link to search for more. These load from Wikimedia when you run the app; the online preview can't load outside images, so it shows the links instead.
- **Venue sound.** With *Sound: In the venue*, music plays through the room you're standing in: a reverb tail for the kind of space (short outdoors, long in a warehouse or arena), a slap back off the rocks at Red Rocks and off the stands in a stadium, high end lost to distance from the PA, the PA placed around your head in 3D, and a crowd that roars on the drop. Reverb times are typical for each kind of space, not measurements of these venues. Headphones help.

### Real sites in 3D (venue packs)

Red Rocks is no longer drawn from a template. It is the real site, built from public survey data by `tools/venue3d/build_pack.py`:

- **Ground and rocks** come from USGS 3DEP aerial lidar (Denver regional survey, 2020): about 2.5 million laser returns within 370 m of the stage, turned into a 0.5 m height grid 512 m across. Creation Rock, Ship Rock, the paths, the bowl and the hills behind it are the real shapes, not sculpted stand-ins. In the app the grid becomes an adaptive mesh that stays within 7 cm of the survey, so rock faces stay sharp and flat ground uses few triangles.
- **Rows, roof and trees** are measured from the same points. The stage roof is the largest high, flat patch of returns (34 × 22 m, which agrees with the published 8,500 sq ft). The rows repeat every 1.215 m in the ground returns across the bowl, and 69 of them rise 30.7 m, which matches the published 69 rows and 100 ft drop. Each row's height follows the lidar ground along it. Where the bowl ends is where the trees and rock begin. Every tree taller than 2.5 m is placed where the lidar found it, at its measured height and crown width: about 1,600 of them.
- **Colour** is Sentinel-2 satellite imagery (10 m), sharpened with the lidar's own return brightness (0.5 m). Up close, sandstone and soil grain take over, and steep rock faces get the sandstone's own colour. The bake also stores how much sky each spot sees, so hollows, cracks and the ground under trees are darker in daylight.
- **The horizon** is real land out to 25 km (AWS Terrain Tiles): the foothills behind the rows, the hogback and the plains out to Denver, dropped for the curve of the earth. Land beyond 240 m is drawn closer than it really is, at the same angle you would see it from the rows, so it fits inside the sky.

Anything that can be measured is measured, and the rest is labelled as estimated in the venue's facts. The stage deck, rig, PA and LED wall still come from the venue's published specs.

**Outdoor sites.** Fourteen more outdoor stages now sit on their real ground the same way: EDC kineticFIELD and circuitGROUNDS, The Gorge, Movement (Hart Plaza), CRSSD City Steps, Ultra main stage and Resistance, Brooklyn Mirage, Coachella Sahara, Lost Lands, Electric Forest Ranch Arena and Sherwood Court, Lollapalooza Perry's and HARD Summer. Each pack has the lidar ground within 256 m, with the buildings around it traced from the lidar (walls and flat or sloped roofs at their measured heights), every tree at its measured size, water from the lidar and Sentinel-2, and the real land to the horizon. Only the stage's own footprint is levelled, so the crowd stands on the real slopes (the lawn at The Gorge, the sunken bowl at Hart Plaza). Each venue's facts say where its stage position comes from. Several are estimates, because the festivals publish their maps only as pictures. To move a stage, change `lat`, `lon` or `facing` in its `tools/venue3d/<venue>.json` and rebuild. `tools/venue3d/overview.py` draws a top-down map of a site (lidar shading, buildings by height, trees, water and a 50 m grid) next to the satellite colour, which helps when choosing the position.

**Indoor rooms.** Indoor venues have no lidar, so their rooms are modelled from published facts: Exchange LA's 1931 Los Angeles Stock Exchange trading floor with its barrel vault, chandeliers and balconies, Academy LA's LED ceiling and walls, and the bars, balconies, ceilings, columns and materials of Knockdown Center, Elsewhere, Echostage, Sound, Smartbar, Radius, The Midway, Public Works, Concourse Project and Portola. Each room is described by an `interior` entry in `app/venues.js`, with its sources listed in the venue's facts.

**Adding a site.** Any US venue covered by 3DEP lidar can get a pack: copy `tools/venue3d/red-rocks.json` (an amphitheatre with measured rows) or one of the site configs such as `the-gorge.json`, set the venue's position, the lidar project (listed at https://usgs-lidar-public.s3.amazonaws.com/?delimiter=/), a cloud-free Sentinel-2 scene and roughly where the stage roof is, run `python3 tools/venue3d/build_pack.py tools/venue3d/<venue>.json`, and add `pack: '<venue>'` to its entry in `app/venues.js`. Rebuilding needs Python with `numpy scipy pillow pyproj rasterio laspy lazrs` and takes about a minute. It downloads only from open AWS buckets that need no account.

**Next steps for a pack:**

1. Hand-modelled parts in Blender, exported as glTF, placed in the pack's frame: the stage house and backstage, railings, light poles, stairs and signage. The lidar gives exact positions to model against.
2. Photogrammetry or Gaussian splats of the rock faces, from photos taken on site (with permission), for detail the lidar is too sparse to show.
3. Indoor rooms are modelled from published facts. For an exact match they need a scan from inside (iPhone LiDAR with Polycam or Scaniverse) or a model built from the venue's plans.

**Photoreal 3D (Google, optional).** On a venue with a pack, Look > Photoreal 3D can stream Google's photorealistic 3D mesh of the real site (the same data Google Earth shows, and what the Blosm add-on imports into Blender) around our stage, rig and crowd. It needs your own key, and it only works in the local version (`npm start`), not the online preview.

1. In the Google Cloud console, create a project, turn on billing, and enable the **Map Tiles API**.
2. Under APIs & Services > Credentials, create an API key. Restrict it to the Map Tiles API and to the `http://localhost:8080/*` referrer.
3. In the app, open Look, set Photoreal 3D to On, and paste the key. It is kept in that browser only, never in the repo.

The mesh replaces the lidar ground, rows and trees within about 230 m of the stage, and the lidar land carries on to the horizon. Our stage replaces Google's inside its footprint. The tiles' height is matched to the measured rows automatically. Google's terms allow the tiles to be streamed for display only: they cannot be saved, cached, exported or traced into our own models. That is why the app streams them live and the repo holds none, and why the Blosm route can't be used to build packs. The terms also require Google's attribution on screen, which the app shows under the camera buttons. Google gives a monthly free allowance for the Map Tiles API and bills use beyond it to your Cloud account, so check its current pricing and set a budget alert.

### Further realism, using your Mac

These need assets or hardware the cloud build can't fetch:

1. **Scanned venues.** A phone scan (Polycam, RealityScan or Scaniverse on iPhone) of a room you're in, exported as glTF, would replace the modelled room with the real one. Only scan where you have permission, and keep scans private unless the venue agrees.
2. **Sharper photo skies.** 4K versions of the Poly Haven HDRIs in `app/hdri/` (CC0, free) from polyhaven.com, saved with the same names, for *Photo sky (HDRI)* and sharper reflections.
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
app/audio.js         audio analysis (bands, hits, tempo, builds and drops) and the audio reactive link matrix
bridge/server.js     HTTP page + WebSocket /dmx + UDP receivers, merges sources, pushes at ~44 Hz
bridge/dmx.js        sACN and Art-Net parsers and builders, source merge
bridge/ws.js         minimal WebSocket server
tools/fake-console.js  sends a test show over sACN or Art-Net
tools/venue3d/       builds venue packs (the real site in 3D) from public lidar, imagery and terrain
app/venues3d/        the built packs: height grids, colour, measured rows, roof and trees
touchdesigner/       sender script for live TouchDesigner video
test/                node --test suite (npm test)
```

## Roadmap

Builder phases in progress: audio reactive mixer (done), then custom stage import (GLB, glTF, OBJ, MVR) placed at any venue, a rig builder (place fixtures on truss or any surface, arrays, groups, auto patch, GDTF import, save and load), and a laser designer.

1. MVR import and export, so rigs from Capture, Vectorworks or grandMA3 load directly.
2. GDTF fixture types in place of the generic spot, including real beam angles and DMX modes.
3. Real venue library built from published tech specs.
