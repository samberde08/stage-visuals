/* Venue library: real US clubs, amphitheatres and festival stages, built on the parametric templates in stage.html.
 *
 * All sizes are metres and are estimates from public information (capacity figures, published stage widths,
 * photos and aerial imagery), not copies of venue drawings. Festival stages are rebuilt every year, so their
 * presets are generic proportions for that stage's scale, not the current production design. `confidence`
 * says which: 'published' when the key figures come from a cited source, 'estimated' otherwise.
 *
 * Realism fields for lighting, sky and crowd simulation:
 *   setting        'indoor' | 'open-air' (no roof over the crowd) | 'tent' | 'outdoor' (field or lawn)
 *   lat, lon       for sun and moon position
 *   elevationM     site elevation above sea level
 *   audienceFacing compass bearing (degrees, 0 = north) the audience looks toward the stage, or null if unverified.
 *                  The app's +z axis points from the stage to the audience, so the stage faces audienceFacing + 180.
 *   capacity       venue or stage capacity; crowd.n is how many people are drawn (capped for frame rate)
 *   season         months the venue or festival usually runs (1-12)
 *   showHours      typical doors to curfew, local time, 24 h; end earlier than start means it runs past midnight
 *   tz             IANA time zone
 *
 * Template options (room) are read by the builders in stage.html:
 *   w, l, ceil     room width, length and ceiling height (ceil 0 = no roof)
 *   crowdN         people drawn; crowdW, crowdDepth, fohZ for field venues
 *   rows, rowDepth, rise, fan, r0, lawn, rocks   amphitheatre bowl
 *   trees          scatter a forest around a festival field
 */
(function (root) {
  'use strict';
  const POLLSTAR_MIRAGE = 'https://news.pollstar.com/2026/01/07/brooklyn-mirage-purchased-by-pacha-parent-company/';
  const DJMAG_ECHO = 'https://djmag.com/top100clubs/2026/6/echostage';

  const VENUES = [
    /* ---------- Clubs ---------- */
    {
      id: 'brooklyn-mirage', name: 'Brooklyn Mirage', city: 'Brooklyn', region: 'NY', kind: 'club', template: 'warehouse',
      setting: 'open-air', capacity: 4500, lat: 40.7110, lon: -73.9298, elevationM: 10, audienceFacing: null, tz: 'America/New_York',
      season: [5, 6, 7, 8, 9, 10], showHours: ['18:00', '04:00'],
      stage: { W: 20, D: 8, H: 1.5, trim: 9 }, led: { wallW: 22, wallH: 8 }, rig: { count: 36, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 52, l: 78, ceil: 0, crowdN: 3200 },
      notes: 'Open-air club inside the Avant Gardner complex. Sold to FIVE Holdings (Pacha) in Jan 2026; the 2026 season reverts to the original open-air layout with a 4,500-person dancefloor.',
      confidence: 'published', sources: [POLLSTAR_MIRAGE],
    },
    {
      id: 'knockdown-center', name: 'Knockdown Center', city: 'Queens', region: 'NY', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3000, lat: 40.7153, lon: -73.9218, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['22:00', '06:00'],
      stage: { W: 12, D: 6, H: 1.2, trim: 8 }, led: { wallW: 12, wallH: 5 }, rig: { count: 28, program: 'wave', visual: 'tunnel', lasers: 'sweep' },
      room: { w: 30, l: 60, ceil: 12, crowdN: 2200 },
      notes: 'Former door factory in Maspeth with a timber-truss main hall.',
      confidence: 'estimated', sources: ['https://en.wikipedia.org/wiki/Knockdown_Center'],
    },
    {
      id: 'elsewhere-hall', name: 'Elsewhere (Hall)', city: 'Brooklyn', region: 'NY', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 800, lat: 40.7096, lon: -73.9230, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['22:00', '05:00'],
      stage: { W: 10, D: 4, H: 1.0, trim: 5 }, led: { wallW: 8, wallH: 3.5 }, rig: { count: 14, program: 'cross', visual: 'bars', lasers: 'sweep' },
      room: { w: 18, l: 26, ceil: 7, crowdN: 600 },
      notes: 'Main room of the Bushwick multi-room club.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'echostage', name: 'Echostage', city: 'Washington', region: 'DC', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3000, lat: 38.9206, lon: -76.9737, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['21:00', '03:00'],
      stage: { W: 11, D: 6, H: 1.5, trim: 9 }, led: { wallW: 18, wallH: 7 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 40, l: 55, ceil: 14, crowdN: 2400 },
      notes: '3,000-person dancefloor and a 36 ft (11 m) stage. 2025 refit: seven LED walls, 200+ fixtures, 16 lasers, L-Acoustics L2. DJ Mag Top 100 Clubs 2026: #6.',
      confidence: 'published', sources: [DJMAG_ECHO],
    },
    {
      id: 'club-space', name: 'Club Space (Terrace)', city: 'Miami', region: 'FL', kind: 'club', template: 'club',
      setting: 'open-air', capacity: 1500, lat: 25.7836, lon: -80.1931, elevationM: 2, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['23:00', '12:00'],
      stage: { W: 6, D: 3, H: 0.9, trim: 4.5 }, led: { wallW: 6, wallH: 3 }, rig: { count: 12, program: 'ballyhoo', visual: 'bars', lasers: 'sweep' },
      room: { w: 28, l: 32, ceil: 0, crowdN: 1100 },
      notes: 'Rooftop terrace known for sets running past sunrise, a good test for time of day.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'exchange-la', name: 'Exchange LA', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 1500, lat: 34.0469, lon: -118.2513, elevationM: 90, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 9, D: 4, H: 1.2, trim: 7 }, led: { wallW: 10, wallH: 4 }, rig: { count: 20, program: 'cross', visual: 'tunnel', lasers: 'sweep' },
      room: { w: 22, l: 30, ceil: 11, crowdN: 1000 },
      notes: 'Former Pacific Stock Exchange trading floor with balconies. Check current operating status before a pitch.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'academy-la', name: 'Academy LA', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 1500, lat: 34.1017, lon: -118.3247, elevationM: 110, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '03:00'],
      stage: { W: 10, D: 4, H: 1.2, trim: 6 }, led: { wallW: 10, wallH: 4 }, rig: { count: 20, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 20, l: 28, ceil: 8, crowdN: 900 },
      notes: 'Hollywood club on Vine.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'avalon-hollywood', name: 'Avalon Hollywood', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 1500, lat: 34.1029, lon: -118.3266, elevationM: 115, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['21:30', '04:00'],
      stage: { W: 12, D: 6, H: 1.2, trim: 8 }, led: { wallW: 10, wallH: 5 }, rig: { count: 20, program: 'fan', visual: 'tunnel', lasers: 'fan' },
      room: { w: 24, l: 32, ceil: 12, crowdN: 900 },
      notes: '1927 theatre with a proscenium stage and balconies; the floor is standing room.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'sound-nightclub', name: 'Sound Nightclub', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 500, lat: 34.0983, lon: -118.3264, elevationM: 110, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 6, D: 3, H: 0.6, trim: 3.4 }, led: { wallW: 5, wallH: 2.5 }, rig: { count: 10, program: 'cross', visual: 'text', lasers: 'sweep' },
      room: { w: 14, l: 20, ceil: 5, crowdN: 320 },
      notes: 'Intimate Hollywood house and techno club.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'xs-las-vegas', name: 'XS Nightclub', city: 'Las Vegas', region: 'NV', kind: 'club', template: 'club',
      setting: 'open-air', capacity: 4000, lat: 36.1293, lon: -115.1650, elevationM: 620, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:30', '04:00'],
      stage: { W: 10, D: 5, H: 1.5, trim: 6 }, led: { wallW: 12, wallH: 5 }, rig: { count: 28, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 40, l: 50, ceil: 0, crowdN: 2000 },
      notes: 'Indoor club that opens onto a pool deck at Encore; modelled as the open-air pool side.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'smartbar', name: 'Smartbar', city: 'Chicago', region: 'IL', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 400, lat: 41.9497, lon: -87.6589, elevationM: 180, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 4, D: 2.5, H: 0.6, trim: 2.8 }, led: { wallW: 4, wallH: 2 }, rig: { count: 8, program: 'cross', visual: 'text', lasers: 'off' },
      room: { w: 12, l: 18, ceil: 4, crowdN: 260 },
      notes: 'Low-ceiling basement club under Metro.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'radius-chicago', name: 'Radius', city: 'Chicago', region: 'IL', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 4000, lat: 41.8530, lon: -87.6440, elevationM: 180, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 16, D: 7, H: 1.5, trim: 10 }, led: { wallW: 18, wallH: 7 }, rig: { count: 40, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 36, l: 60, ceil: 12, crowdN: 2600 },
      notes: 'Large warehouse venue in Pilsen.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'the-midway-sf', name: 'The Midway', city: 'San Francisco', region: 'CA', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 2000, lat: 37.7509, lon: -122.3861, elevationM: 5, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 12, D: 6, H: 1.2, trim: 8 }, led: { wallW: 14, wallH: 5 }, rig: { count: 28, program: 'wave', visual: 'plasma', lasers: 'sweep' },
      room: { w: 26, l: 40, ceil: 10, crowdN: 1300 },
      notes: 'Dogpatch warehouse arts and nightlife complex.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'public-works-sf', name: 'Public Works', city: 'San Francisco', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 700, lat: 37.7689, lon: -122.4196, elevationM: 20, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 7, D: 3, H: 0.8, trim: 4.5 }, led: { wallW: 6, wallH: 3 }, rig: { count: 12, program: 'cross', visual: 'bars', lasers: 'sweep' },
      room: { w: 16, l: 24, ceil: 6, crowdN: 450 },
      notes: 'Mission District club.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'concourse-project', name: 'Concourse Project', city: 'Austin', region: 'TX', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3000, lat: 30.3337, lon: -97.6807, elevationM: 190, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 14, D: 6, H: 1.2, trim: 9 }, led: { wallW: 16, wallH: 6 }, rig: { count: 36, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 30, l: 50, ceil: 10, crowdN: 2000 },
      notes: 'Warehouse club with an outdoor area. DJ Mag Top 100 Clubs 2026: #31.',
      confidence: 'estimated', sources: ['https://djmag.com/top100clubs/2026/31/concourse-project'],
    },

    /* ---------- Amphitheatres ---------- */
    {
      id: 'red-rocks', name: 'Red Rocks Amphitheatre', city: 'Morrison', region: 'CO', kind: 'amphitheatre', template: 'amphi',
      setting: 'outdoor', capacity: 9525, lat: 39.6654, lon: -105.2057, elevationM: 1960, audienceFacing: 80, tz: 'America/Denver',
      season: [4, 5, 6, 7, 8, 9, 10], showHours: ['18:00', '23:00'],
      stage: { W: 20, D: 14, H: 1.5, trim: 13 }, led: { wallW: 16, wallH: 8 }, rig: { count: 40, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { rows: 70, rowDepth: 1.0, rise: 0.42, fan: 55, r0: 12, rocks: true, crowdN: 4000 },
      notes: 'Steep, near-straight rows between Ship Rock and Creation Rock; the audience looks east toward Denver. 11 pm curfew.',
      confidence: 'estimated', sources: ['https://www.structuremag.org/article/new-stage-roof-rocks-iconic-venue/'],
    },
    {
      id: 'the-gorge', name: 'The Gorge Amphitheatre', city: 'George', region: 'WA', kind: 'amphitheatre', template: 'amphi',
      setting: 'outdoor', capacity: 27500, lat: 47.1010, lon: -119.9957, elevationM: 380, audienceFacing: 255, tz: 'America/Los_Angeles',
      season: [5, 6, 7, 8, 9], showHours: ['16:00', '02:00'],
      stage: { W: 24, D: 16, H: 2, trim: 15 }, led: { wallW: 22, wallH: 9 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { rows: 55, rowDepth: 1.8, rise: 0.38, fan: 110, r0: 16, lawn: true, crowdN: 4000 },
      notes: 'Terraced lawn above the Columbia River; the sun sets behind the stage. Home of Bass Canyon.',
      confidence: 'estimated', sources: ['https://en.wikipedia.org/wiki/The_Gorge_Amphitheatre'],
    },

    /* ---------- Festival stages ---------- */
    {
      id: 'edc-kineticfield', name: 'EDC Las Vegas: kineticFIELD', city: 'Las Vegas', region: 'NV', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 80000, lat: 36.2719, lon: -115.0106, elevationM: 600, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [5], showHours: ['19:00', '05:30'],
      stage: { W: 70, D: 28, H: 3, trim: 28 }, led: { wallW: 48, wallH: 18 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 150, crowdDepth: 120, fohZ: 65 },
      notes: 'Main stage on the Las Vegas Motor Speedway infield. Redesigned every year; this is a generic stage at that scale. Sets run until sunrise.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'edc-circuitgrounds', name: 'EDC Las Vegas: circuitGROUNDS', city: 'Las Vegas', region: 'NV', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 36.2700, lon: -115.0130, elevationM: 600, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [5], showHours: ['19:00', '05:30'],
      stage: { W: 40, D: 18, H: 2.5, trim: 18 }, led: { wallW: 36, wallH: 14 }, rig: { count: 56, program: 'cross', visual: 'tunnel', lasers: 'scan' },
      room: { crowdN: 4000, crowdW: 95, crowdDepth: 75, fohZ: 45 },
      notes: 'LED-heavy techno and house stage. Generic proportions, not the current design.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'coachella-sahara', name: 'Coachella: Sahara', city: 'Indio', region: 'CA', kind: 'festival', template: 'arch',
      setting: 'tent', capacity: 25000, lat: 33.6823, lon: -116.2376, elevationM: 0, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [4], showHours: ['12:00', '00:00'],
      stage: { W: 30, D: 12, H: 2, trim: 14 }, led: { wallW: 26, wallH: 10 }, rig: { count: 48, program: 'audience', visual: 'plasma', lasers: 'fan' },
      room: { l: 90, crowdN: 4000 },
      notes: 'Electronic tent at the Empire Polo Club. Generic arch tent at that scale.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'ultra-main', name: 'Ultra Miami: Main Stage', city: 'Miami', region: 'FL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 55000, lat: 25.7753, lon: -80.1857, elevationM: 2, audienceFacing: null, tz: 'America/New_York',
      season: [3], showHours: ['12:00', '00:00'],
      stage: { W: 60, D: 26, H: 3, trim: 26 }, led: { wallW: 46, wallH: 16 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 120, crowdDepth: 90, fohZ: 50 },
      notes: 'Bayfront Park main stage. Generic proportions, not the current design.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'ultra-resistance', name: 'Ultra Miami: Resistance Megastructure', city: 'Miami', region: 'FL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 20000, lat: 25.7770, lon: -80.1862, elevationM: 2, audienceFacing: null, tz: 'America/New_York',
      season: [3], showHours: ['12:00', '00:00'],
      stage: { W: 36, D: 18, H: 2.5, trim: 20 }, led: { wallW: 26, wallH: 10 }, rig: { count: 56, program: 'cross', visual: 'tunnel', lasers: 'scan' },
      room: { crowdN: 3500, crowdW: 80, crowdDepth: 60, fohZ: 38 },
      notes: 'Techno stage built as a large truss structure. Generic proportions.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'ef-ranch-arena', name: 'Electric Forest: Ranch Arena', city: 'Rothbury', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 43.4970, lon: -86.3530, elevationM: 220, audienceFacing: null, tz: 'America/Detroit',
      season: [6], showHours: ['14:00', '02:00'],
      stage: { W: 36, D: 18, H: 2.5, trim: 18 }, led: { wallW: 28, wallH: 11 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4000, crowdW: 90, crowdDepth: 80, fohZ: 45 },
      notes: 'Main field stage at the Double JJ Ranch.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'ef-sherwood-court', name: 'Electric Forest: Sherwood Court', city: 'Rothbury', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 12000, lat: 43.4990, lon: -86.3490, elevationM: 220, audienceFacing: null, tz: 'America/Detroit',
      season: [6], showHours: ['14:00', '02:00'],
      stage: { W: 24, D: 14, H: 2, trim: 13 }, led: { wallW: 18, wallH: 8 }, rig: { count: 32, program: 'audience', visual: 'tunnel', lasers: 'fan' },
      room: { crowdN: 2500, crowdW: 50, crowdDepth: 45, fohZ: 30, trees: true },
      notes: 'Stage in a clearing inside the Sherwood Forest woods.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'lolla-perrys', name: "Lollapalooza: Perry's", city: 'Chicago', region: 'IL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 41.8740, lon: -87.6200, elevationM: 180, audienceFacing: null, tz: 'America/Chicago',
      season: [8], showHours: ['12:00', '22:00'],
      stage: { W: 40, D: 18, H: 2.5, trim: 18 }, led: { wallW: 30, wallH: 12 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4000, crowdW: 100, crowdDepth: 90, fohZ: 50 },
      notes: 'Electronic stage in Grant Park. 10 pm curfew, so the headliner plays at dusk.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'movement-detroit', name: 'Movement Detroit: Movement Stage', city: 'Detroit', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 15000, lat: 42.3275, lon: -83.0446, elevationM: 180, audienceFacing: null, tz: 'America/Detroit',
      season: [5], showHours: ['12:00', '00:00'],
      stage: { W: 24, D: 14, H: 2, trim: 14 }, led: { wallW: 20, wallH: 8 }, rig: { count: 36, program: 'wave', visual: 'tunnel', lasers: 'sweep' },
      room: { crowdN: 3000, crowdW: 70, crowdDepth: 60, fohZ: 36 },
      notes: 'Main stage in Hart Plaza on the Detroit River.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'lost-lands', name: 'Lost Lands: Main Stage', city: 'Thornville', region: 'OH', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 50000, lat: 39.9050, lon: -82.4180, elevationM: 300, audienceFacing: null, tz: 'America/New_York',
      season: [9], showHours: ['14:00', '02:00'],
      stage: { W: 64, D: 26, H: 3, trim: 26 }, led: { wallW: 44, wallH: 16 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 120, crowdDepth: 100, fohZ: 55 },
      notes: 'Bass festival at Legend Valley. Generic stage at that scale, not the themed set pieces.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'portola-warehouse', name: 'Portola: The Warehouse', city: 'San Francisco', region: 'CA', kind: 'festival', template: 'warehouse',
      setting: 'indoor', capacity: 10000, lat: 37.7550, lon: -122.3800, elevationM: 3, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [9], showHours: ['12:00', '22:00'],
      stage: { W: 20, D: 10, H: 1.8, trim: 12 }, led: { wallW: 20, wallH: 8 }, rig: { count: 48, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 60, l: 120, ceil: 16, crowdN: 4000 },
      notes: 'Indoor stage in a cargo shed at Pier 80.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'crssd-city-steps', name: 'CRSSD: City Steps', city: 'San Diego', region: 'CA', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 15000, lat: 32.7215, lon: -117.1725, elevationM: 5, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [3, 9], showHours: ['12:00', '22:00'],
      stage: { W: 24, D: 14, H: 2, trim: 13 }, led: { wallW: 18, wallH: 8 }, rig: { count: 32, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 3000, crowdW: 60, crowdDepth: 60, fohZ: 35 },
      notes: 'Main stage at Waterfront Park by the bay.',
      confidence: 'estimated', sources: [],
    },
    {
      id: 'hard-summer', name: 'HARD Summer: Main Stage', city: 'Inglewood', region: 'CA', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 33.9500, lon: -118.3400, elevationM: 30, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [8], showHours: ['14:00', '23:00'],
      stage: { W: 56, D: 24, H: 3, trim: 24 }, led: { wallW: 40, wallH: 15 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4500, crowdW: 110, crowdDepth: 90, fohZ: 50 },
      notes: 'Main stage at Hollywood Park. Generic proportions.',
      confidence: 'estimated', sources: [],
    },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = VENUES;
  else root.STAGE_VENUES = VENUES;
})(this);
