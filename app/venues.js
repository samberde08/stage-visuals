/* Venue library: real US clubs, amphitheatres and festival stages, built on the parametric templates in stage.html.
 *
 * All sizes are metres. Nothing here is copied from venue drawings. Festival stages are rebuilt every year, so their
 * presets are proportions for that stage's scale, not the current production design.
 *
 * `confidence` says how much of a venue is backed by published figures:
 *   'sourced'   the main dimensions (stage, LED wall, room or bowl) come from cited sources. These are the demo stages.
 *   'partial'   some figures are cited (capacity, stage width, rig), the rest are estimates
 *   'estimated' sizes are estimates from capacity, photos and aerial imagery
 * `facts` lists each cited figure as { k: what, v: value, src: URL }, and `estimated` says what is still a guess.
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
 *   rows, rowDepth, rise, fan, r0, lawn          amphitheatre bowl
 *   rocks          true, or { left, right } heights in metres as the audience sees them, for monoliths beside the bowl
 *   pa             'lr' flown left-right arrays (club), 'lcr' left-centre-right (amphitheatre)
 *   balcony        a raised mezzanine at the back of a club room
 *   floorW, floorD marked dancefloor in a club room
 *   roof           { w, d } space-frame roof over an open-air stage (warehouse template)
 *   w, h, ribs     arch tent span, height and rib count (arch template; l is its length)
 *   trees          scatter a forest around a festival field
 */
(function (root) {
  'use strict';
  const DJMAG_ECHO = 'https://djmag.com/top100clubs/2026/6/echostage';

  const VENUES = [
    /* ---------- Clubs ---------- */
    {
      id: 'brooklyn-mirage', name: 'Brooklyn Mirage (2022 design)', city: 'Brooklyn', region: 'NY', kind: 'club', template: 'warehouse',
      setting: 'open-air', capacity: 4500, lat: 40.7110, lon: -73.9298, elevationM: 10, audienceFacing: null, tz: 'America/New_York',
      season: [5, 6, 7, 8, 9, 10], showHours: ['18:00', '04:00'],
      stage: { W: 30.5, D: 15.2, H: 1.5, trim: 12 }, led: { wallW: 61, wallH: 9.1, pitch: 5.9 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 72, l: 85, ceil: 0, roof: { w: 30.5, d: 15.2 }, crowdN: 3500 },
      notes: 'Demo venue, modelled on the 2022 redesign: a 200 ft LED wall behind the stage, a space-frame stage roof and no columns on the dancefloor. The 2025 redesign never opened. Sources disagree on 2026: Pollstar reported a reopening in the original open-air layout, Wikipedia a new Pacha venue on the site.',
      confidence: 'sourced',
      facts: [
        { k: 'LED wall (2022)', v: '200 ft long × 30 ft high (61 × 9.1 m), over 1,000 panels, 15K wide', src: 'https://edm.com/news/brooklyn-mirage-summer-2022-redesign-schedule/' },
        { k: 'Stage roof (2022)', v: 'Modular space frame over 100 ft wide and 50 ft deep (30.5 × 15.2 m)', src: 'https://edm.com/news/brooklyn-mirage-summer-2022-redesign-schedule/' },
        { k: 'Dancefloor', v: '4,500-person open-air dancefloor; the 2022 redesign removed the columns from it', src: 'https://news.pollstar.com/2026/01/07/brooklyn-mirage-purchased-by-pacha-parent-company/' },
        { k: 'Ownership (2026)', v: 'Bought by FIVE Holdings (Pacha) for $110 million', src: 'https://news.pollstar.com/2026/01/07/brooklyn-mirage-purchased-by-pacha-parent-company/' },
        { k: 'Status (2026)', v: 'Outdoor Mirage closed; a new Pacha venue opened on the site in June 2026', src: 'https://en.wikipedia.org/wiki/Avant_Gardner' },
      ],
      estimated: 'Overall site size, deck height, truss trim, LED pixel pitch.',
    },
    {
      id: 'knockdown-center', name: 'Knockdown Center', city: 'Queens', region: 'NY', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3200, lat: 40.7153, lon: -73.9218, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['22:00', '06:00'],
      stage: { W: 12, D: 6, H: 1.2, trim: 8 }, led: { wallW: 12, wallH: 5 }, rig: { count: 28, program: 'wave', visual: 'tunnel', lasers: 'sweep' },
      room: { w: 30, l: 62, ceil: 12, crowdN: 2400 },
      notes: 'Main Space of a former door factory in Maspeth.',
      confidence: 'partial',
      facts: [
        { k: 'Main Space', v: '20,000 sq ft (1,860 m²) inside a 50,000 sq ft building', src: 'https://fohonline.com/articles/venue-focus/knockdown-center/' },
        { k: 'Capacity', v: '3,200 in the Main Space', src: 'https://fohonline.com/articles/venue-focus/knockdown-center/' },
        { k: 'PA', v: 'L-Acoustics: 14 K2 left-right, K3 delays, KS21 subs', src: 'https://fohonline.com/articles/venue-focus/knockdown-center/' },
      ],
      estimated: 'Room proportions (30 × 62 m matches the floor area), ceiling height, stage and LED sizes.',
    },
    {
      id: 'elsewhere-hall', name: 'Elsewhere (Hall)', city: 'Brooklyn', region: 'NY', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 800, lat: 40.7096, lon: -73.9230, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['22:00', '05:00'],
      stage: { W: 10, D: 4, H: 1.0, trim: 5 }, led: { wallW: 8, wallH: 3.5 }, rig: { count: 14, program: 'cross', visual: 'bars', lasers: 'sweep' },
      room: { w: 18, l: 26, ceil: 7, crowdN: 600 },
      notes: 'Main room of the Bushwick multi-room club.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'echostage', name: 'Echostage', city: 'Washington', region: 'DC', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3000, lat: 38.9206, lon: -76.9737, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['21:00', '03:00'],
      stage: { W: 11, D: 6, H: 1.5, trim: 9 }, led: { wallW: 18, wallH: 7 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 40, l: 55, ceil: 14, crowdN: 2400 },
      notes: 'Dancefloor built for 3,000 with a VIP mezzanine overlooking it. DJ Mag Top 100 Clubs 2026: #6.',
      confidence: 'partial',
      facts: [
        { k: 'Capacity', v: '3,000-person dancefloor', src: DJMAG_ECHO },
        { k: 'Stage', v: '36 ft (11 m) wide', src: DJMAG_ECHO },
        { k: '2025 refit', v: 'Seven LED walls, 200+ lighting fixtures, 16 30 W lasers, L-Acoustics L2', src: DJMAG_ECHO },
      ],
      estimated: 'Room size, ceiling height, stage depth, LED wall sizes. The app draws one wall and at most 64 fixtures.',
    },
    {
      id: 'club-space', name: 'Club Space (Terrace)', city: 'Miami', region: 'FL', kind: 'club', template: 'club',
      setting: 'open-air', capacity: 1500, lat: 25.7836, lon: -80.1931, elevationM: 2, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['23:00', '12:00'],
      stage: { W: 6, D: 3, H: 0.9, trim: 4.5 }, led: { wallW: 6, wallH: 3 }, rig: { count: 12, program: 'ballyhoo', visual: 'bars', lasers: 'sweep' },
      room: { w: 28, l: 32, ceil: 0, crowdN: 1100 },
      notes: 'Rooftop terrace known for sets running past sunrise, a good test for time of day.',
      confidence: 'partial',
      facts: [{ k: 'Capacity', v: '2,000 for the whole club', src: 'https://djmag.com/top100clubs/2024/30/club-space' }],
      estimated: 'Terrace size and share of capacity, stage and LED sizes.',
    },
    {
      id: 'exchange-la', name: 'Exchange LA', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 1500, lat: 34.0469, lon: -118.2513, elevationM: 90, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 9, D: 4, H: 1.2, trim: 7 }, led: { wallW: 10, wallH: 4 }, rig: { count: 20, program: 'cross', visual: 'tunnel', lasers: 'sweep' },
      room: { w: 22, l: 30, ceil: 11, crowdN: 1000 },
      notes: 'Former Pacific Stock Exchange trading floor with balconies. Check current operating status before a pitch.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'academy-la', name: 'Academy LA', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 1500, lat: 34.1017, lon: -118.3247, elevationM: 110, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '03:00'],
      stage: { W: 10, D: 4, H: 1.2, trim: 6 }, led: { wallW: 10, wallH: 4 }, rig: { count: 20, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 20, l: 28, ceil: 8, crowdN: 900 },
      notes: 'Hollywood club on Vine.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'avalon-hollywood', name: 'Avalon Hollywood', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 1100, lat: 34.1029, lon: -118.3266, elevationM: 115, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['21:30', '04:00'],
      stage: { W: 12.2, D: 8.1, H: 1.2, trim: 7 }, led: { wallW: 6.9, wallH: 3.9, pitch: 1.8 }, rig: { count: 24, program: 'fan', visual: 'tunnel', lasers: 'fan' },
      room: { w: 20, l: 30, ceil: 11, floorW: 12.2, floorD: 12.2, balcony: true, pa: 'lr', crowdN: 800 },
      notes: 'Demo venue. 1927 theatre turned club: a wide removable stage, a square dance floor ringed by VIP banquettes, and a balcony with tiered VIP seating above the main room. Bardot, the second-floor room, is not modelled.',
      confidence: 'sourced',
      facts: [
        { k: 'Stage', v: '40 ft wide × 26.5 ft deep (12.2 × 8.1 m), removable steel deck, motorised rigging above', src: 'https://avalonhollywood.com/hollywood-event-space-rental/' },
        { k: 'Dance floor', v: 'About 40 × 40 ft (12.2 × 12.2 m), banquette VIP seating for 85 around it', src: 'https://avalonhollywood.com/hollywood-event-space-rental/' },
        { k: 'Capacity', v: '1,100 standing in the main room (1,400 with Bardot)', src: 'https://avalonhollywood.com/hollywood-event-space-rental/' },
        { k: 'Balcony', v: 'Above the main room, eight tiered VIP banquettes for 45 to 50', src: 'https://avalonhollywood.com/hollywood-event-space-rental/' },
        { k: 'Main LED', v: '4K 1.8 mm main screen, one of 13 LED screens. At 3840 × 2160 that is 6.9 × 3.9 m (derived)', src: 'https://avalonhollywood.com/hollywood-event-space-rental/' },
        { k: 'Sound and control', v: 'Flown EAW line array, Void Incubus subs, grandMA2 lighting control', src: 'https://avalonhollywood.com/hollywood-event-space-rental/' },
      ],
      estimated: 'Room width, length and ceiling height, deck height, truss trim, the other 12 LED screens.',
    },
    {
      id: 'sound-nightclub', name: 'Sound Nightclub', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 500, lat: 34.0983, lon: -118.3264, elevationM: 110, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 6, D: 3, H: 0.6, trim: 3.4 }, led: { wallW: 5, wallH: 2.5 }, rig: { count: 10, program: 'cross', visual: 'text', lasers: 'sweep' },
      room: { w: 14, l: 20, ceil: 5, crowdN: 320 },
      notes: 'Intimate Hollywood house and techno club.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'xs-las-vegas', name: 'XS Nightclub', city: 'Las Vegas', region: 'NV', kind: 'club', template: 'club',
      setting: 'open-air', capacity: 4000, lat: 36.1293, lon: -115.1650, elevationM: 620, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:30', '04:00'],
      stage: { W: 10, D: 5, H: 1.5, trim: 6 }, led: { wallW: 12, wallH: 5 }, rig: { count: 28, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 40, l: 50, ceil: 0, crowdN: 2000 },
      notes: 'Indoor club that opens onto a pool deck at Encore; modelled as the open-air pool side.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'smartbar', name: 'Smartbar', city: 'Chicago', region: 'IL', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 400, lat: 41.9497, lon: -87.6589, elevationM: 180, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 4, D: 2.5, H: 0.6, trim: 2.8 }, led: { wallW: 4, wallH: 2 }, rig: { count: 8, program: 'cross', visual: 'text', lasers: 'off' },
      room: { w: 12, l: 18, ceil: 4, crowdN: 260 },
      notes: 'Low-ceiling basement club under Metro.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'radius-chicago', name: 'Radius', city: 'Chicago', region: 'IL', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 4000, lat: 41.8530, lon: -87.6440, elevationM: 180, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 16, D: 7, H: 1.5, trim: 10 }, led: { wallW: 18, wallH: 7 }, rig: { count: 40, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 36, l: 60, ceil: 12, crowdN: 2600 },
      notes: 'Large warehouse venue in Pilsen.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'the-midway-sf', name: 'The Midway', city: 'San Francisco', region: 'CA', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 2000, lat: 37.7509, lon: -122.3861, elevationM: 5, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 12, D: 6, H: 1.2, trim: 8 }, led: { wallW: 14, wallH: 5 }, rig: { count: 28, program: 'wave', visual: 'plasma', lasers: 'sweep' },
      room: { w: 26, l: 40, ceil: 10, crowdN: 1300 },
      notes: 'Dogpatch warehouse arts and nightlife complex.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'public-works-sf', name: 'Public Works', city: 'San Francisco', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 700, lat: 37.7689, lon: -122.4196, elevationM: 20, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 7, D: 3, H: 0.8, trim: 4.5 }, led: { wallW: 6, wallH: 3 }, rig: { count: 12, program: 'cross', visual: 'bars', lasers: 'sweep' },
      room: { w: 16, l: 24, ceil: 6, crowdN: 450 },
      notes: 'Mission District club.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'concourse-project', name: 'Concourse Project', city: 'Austin', region: 'TX', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3000, lat: 30.3337, lon: -97.6807, elevationM: 190, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 14, D: 6, H: 1.2, trim: 9 }, led: { wallW: 16, wallH: 6 }, rig: { count: 36, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 30, l: 50, ceil: 10, crowdN: 2000 },
      notes: 'Warehouse club with an outdoor area. DJ Mag Top 100 Clubs 2026: #31.',
      confidence: 'estimated', facts: [{ k: 'Ranking', v: 'DJ Mag Top 100 Clubs 2026: #31', src: 'https://djmag.com/top100clubs/2026/31/concourse-project' }],
    },

    /* ---------- Amphitheatres ---------- */
    {
      id: 'red-rocks', name: 'Red Rocks Amphitheatre', city: 'Morrison', region: 'CO', kind: 'amphitheatre', template: 'amphi',
      setting: 'outdoor', capacity: 9525, lat: 39.6654, lon: -105.2057, elevationM: 1966, audienceFacing: 90, tz: 'America/Denver',
      season: [4, 5, 6, 7, 8, 9, 10], showHours: ['18:00', '23:00'],
      stage: { W: 28, D: 18, H: 1.5, trim: 12.2 }, led: { wallW: 6.25, wallH: 4.4, pitch: 8 }, rig: { count: 40, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { rows: 69, rowDepth: 1.55, rise: 0.44, fan: 48, r0: 12, rocks: { left: 91, right: 61 }, pa: 'lcr', crowdN: 4500 },
      notes: 'Demo venue. Rows rise west between Creation Rock (north, audience left) and Ship Rock (south, audience right), so the audience looks east toward Denver. New stage roof and rigging grid from 2021. 11 pm curfew.',
      confidence: 'sourced',
      facts: [
        { k: 'Capacity', v: '9,525', src: 'https://en.wikipedia.org/wiki/Red_Rocks_Amphitheatre' },
        { k: 'Elevation', v: '6,450 ft (1,966 m)', src: 'http://www.lightingandsoundamerica.com/reprint/RedRocks.pdf' },
        { k: 'Rigging grid', v: '2 ft above the SkyDeck at 40 ft 2 in over the stage floor, so trim is about 12.2 m; 150,000 lb capacity', src: 'https://protocol.esta.org/articles/red-rocks-amphitheatre-the-famed-venue-gets-a-new-roof-and-rigging-grid-' },
        { k: 'Stage roof', v: '8,500 sq ft (790 m²), four columns', src: 'http://www.lightingandsoundamerica.com/reprint/RedRocks.pdf' },
        { k: 'House LED wall', v: '20.5 × 14.5 ft (6.25 × 4.42 m), 8 mm Daktronics', src: 'http://www.lightingandsoundamerica.com/reprint/RedRocks.pdf' },
        { k: 'House PA', v: 'd&b left, centre and right arrays of four boxes each: ALi160 left and right, ALi90 centre', src: 'http://www.lightingandsoundamerica.com/reprint/RedRocks.pdf' },
        { k: 'Rocks', v: 'Creation Rock on the north, 300 ft (91 m); Ship Rock on the south, 200 ft (61 m)', src: 'https://www.redrocksonline.com/our-story/architecture/' },
        { k: 'Site', v: 'Open space between the rocks 320 × 480 ft (98 × 146 m), dropping 100 ft to Stage Rock', src: 'https://www.redrocksonline.com/our-story/architecture/' },
      ],
      estimated: 'Stage deck size (scaled from the roof area), row count and rake, exact audience bearing.',
    },
    {
      id: 'the-gorge', name: 'The Gorge Amphitheatre', city: 'George', region: 'WA', kind: 'amphitheatre', template: 'amphi',
      setting: 'outdoor', capacity: 27500, lat: 47.1010, lon: -119.9957, elevationM: 380, audienceFacing: 255, tz: 'America/Los_Angeles',
      season: [5, 6, 7, 8, 9], showHours: ['16:00', '02:00'],
      stage: { W: 24, D: 16, H: 2, trim: 15 }, led: { wallW: 22, wallH: 9 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { rows: 55, rowDepth: 1.8, rise: 0.38, fan: 110, r0: 16, lawn: true, crowdN: 4000 },
      notes: 'Terraced lawn above the Columbia River; the sun sets behind the stage. Home of Bass Canyon.',
      confidence: 'partial',
      facts: [
        { k: 'Capacity', v: '27,500, reserved seats and lawn', src: 'https://en.wikipedia.org/wiki/The_Gorge_Amphitheatre' },
        { k: 'Stage (2010)', v: 'Rebuilt lower, darker and more compact on a Mountain Productions SuperMega truss roof', src: 'https://www.guerrillacandy.com/2010/05/08/the-gorge-gets-a-new-stage/' },
      ],
      estimated: 'All dimensions and the audience bearing.',
    },

    /* ---------- Festival stages ---------- */
    {
      id: 'edc-kineticfield', name: 'EDC Las Vegas: kineticFIELD', city: 'Las Vegas', region: 'NV', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 60000, lat: 36.2719, lon: -115.0106, elevationM: 600, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [5], showHours: ['19:00', '05:30'],
      stage: { W: 146, D: 30, H: 3, trim: 27.5 }, led: { wallW: 60, wallH: 18 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 170, crowdDepth: 130, fohZ: 70 },
      notes: 'Main stage on the Las Vegas Motor Speedway infield. Redesigned every year; the width and height follow the published figures, the rest is a generic stage at that scale. Sets run until sunrise.',
      confidence: 'partial',
      facts: [
        { k: 'Size (2015)', v: '480 ft wide, 100 ft tall (146 × 30.5 m)', src: 'https://www.everfest.com/magazine/the-15-best-festival-stages-of-the-2015-season' },
        { k: 'Rig (2015)', v: '1,000 lighting fixtures, 40 lasers, 22 pyro units, 15 confetti cannons', src: 'https://www.everfest.com/magazine/the-15-best-festival-stages-of-the-2015-season' },
        { k: 'Crowd (2015)', v: '60,000+ at this stage', src: 'https://www.everfest.com/magazine/the-15-best-festival-stages-of-the-2015-season' },
        { k: 'Structure (2013)', v: '480 ft wide, 335 tons of scaffolding, 2,000+ fixtures', src: 'https://plsn.com/?p=247262' },
      ],
      estimated: 'Stage depth, LED wall sizes, set pieces. The app draws at most 64 fixtures.',
    },
    {
      id: 'edc-circuitgrounds', name: 'EDC Las Vegas: circuitGROUNDS', city: 'Las Vegas', region: 'NV', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 36.2700, lon: -115.0130, elevationM: 600, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [5], showHours: ['19:00', '05:30'],
      stage: { W: 40, D: 18, H: 2.5, trim: 18 }, led: { wallW: 36, wallH: 14 }, rig: { count: 56, program: 'cross', visual: 'tunnel', lasers: 'scan' },
      room: { crowdN: 4000, crowdW: 95, crowdDepth: 75, fohZ: 45 },
      notes: 'LED-heavy techno and house stage. Generic proportions, not the current design.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'coachella-sahara', name: 'Coachella: Sahara', city: 'Indio', region: 'CA', kind: 'festival', template: 'arch',
      setting: 'tent', capacity: 25000, lat: 33.6823, lon: -116.2376, elevationM: 0, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [4], showHours: ['12:00', '00:00'],
      stage: { W: 36, D: 14, H: 2, trim: 18 }, led: { wallW: 32, wallH: 12 }, rig: { count: 64, program: 'audience', visual: 'plasma', lasers: 'fan' },
      room: { w: 122, l: 125, h: 30, ribs: 16, crowdN: 5000 },
      notes: 'Electronic tent at the Empire Polo Club. The tent follows the 2024 structure; the stage inside is generic.',
      confidence: 'partial',
      facts: [
        { k: 'Tent (2024)', v: '400 × 410 ft (122 × 125 m), nearly 100 ft (30 m) tall, 16 steel ribs', src: 'https://plsn.com/?p=373724' },
        { k: 'Lighting (2024)', v: '956 Elation fixtures, including 120 DARTZ 360, 159 Smarty MAX, 320 SixPar 200', src: 'https://www.elationlighting.com/blogs/news/1300-elation-lights-dazzle-coachella-2024' },
      ],
      estimated: 'Stage and LED sizes (the 2024 stage was a wing-shaped video wall). The app draws at most 64 fixtures.',
    },
    {
      id: 'ultra-main', name: 'Ultra Miami: Main Stage', city: 'Miami', region: 'FL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 55000, lat: 25.7753, lon: -80.1857, elevationM: 2, audienceFacing: null, tz: 'America/New_York',
      season: [3], showHours: ['12:00', '00:00'],
      stage: { W: 60, D: 26, H: 3, trim: 26 }, led: { wallW: 46, wallH: 16 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 120, crowdDepth: 90, fohZ: 50 },
      notes: 'Bayfront Park main stage. Generic proportions, not the current design.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'ultra-resistance', name: 'Ultra Miami: Resistance Megastructure', city: 'Miami', region: 'FL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 20000, lat: 25.7770, lon: -80.1862, elevationM: 2, audienceFacing: null, tz: 'America/New_York',
      season: [3], showHours: ['12:00', '00:00'],
      stage: { W: 36, D: 18, H: 2.5, trim: 20 }, led: { wallW: 26, wallH: 10 }, rig: { count: 56, program: 'cross', visual: 'tunnel', lasers: 'scan' },
      room: { crowdN: 3500, crowdW: 80, crowdDepth: 60, fohZ: 38 },
      notes: 'Techno stage built as a large truss structure. Generic proportions.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'ef-ranch-arena', name: 'Electric Forest: Ranch Arena', city: 'Rothbury', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 43.4970, lon: -86.3530, elevationM: 220, audienceFacing: null, tz: 'America/Detroit',
      season: [6], showHours: ['14:00', '02:00'],
      stage: { W: 36, D: 18, H: 2.5, trim: 18 }, led: { wallW: 28, wallH: 11 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4000, crowdW: 90, crowdDepth: 80, fohZ: 45 },
      notes: 'Main field stage at the Double JJ Ranch.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'ef-sherwood-court', name: 'Electric Forest: Sherwood Court', city: 'Rothbury', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 12000, lat: 43.4990, lon: -86.3490, elevationM: 220, audienceFacing: null, tz: 'America/Detroit',
      season: [6], showHours: ['14:00', '02:00'],
      stage: { W: 24, D: 14, H: 2, trim: 13 }, led: { wallW: 18, wallH: 8 }, rig: { count: 32, program: 'audience', visual: 'tunnel', lasers: 'fan' },
      room: { crowdN: 2500, crowdW: 50, crowdDepth: 45, fohZ: 30, trees: true },
      notes: 'Stage in a clearing inside the Sherwood Forest woods.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'lolla-perrys', name: "Lollapalooza: Perry's", city: 'Chicago', region: 'IL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 41.8740, lon: -87.6200, elevationM: 180, audienceFacing: null, tz: 'America/Chicago',
      season: [8], showHours: ['12:00', '22:00'],
      stage: { W: 40, D: 18, H: 2.5, trim: 18 }, led: { wallW: 30, wallH: 12 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4000, crowdW: 100, crowdDepth: 90, fohZ: 50 },
      notes: 'Electronic stage in Grant Park. 10 pm curfew, so the headliner plays at dusk.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'movement-detroit', name: 'Movement Detroit: Movement Stage', city: 'Detroit', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 15000, lat: 42.3275, lon: -83.0446, elevationM: 180, audienceFacing: null, tz: 'America/Detroit',
      season: [5], showHours: ['12:00', '00:00'],
      stage: { W: 24, D: 14, H: 2, trim: 14 }, led: { wallW: 20, wallH: 8 }, rig: { count: 36, program: 'wave', visual: 'tunnel', lasers: 'sweep' },
      room: { crowdN: 3000, crowdW: 70, crowdDepth: 60, fohZ: 36 },
      notes: 'Main stage in Hart Plaza on the Detroit River.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'lost-lands', name: 'Lost Lands: Main Stage', city: 'Thornville', region: 'OH', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 50000, lat: 39.9050, lon: -82.4180, elevationM: 300, audienceFacing: null, tz: 'America/New_York',
      season: [9], showHours: ['14:00', '02:00'],
      stage: { W: 64, D: 26, H: 3, trim: 26 }, led: { wallW: 44, wallH: 16 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 120, crowdDepth: 100, fohZ: 55 },
      notes: 'Bass festival at Legend Valley. Generic stage at that scale, not the themed set pieces.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'portola-warehouse', name: 'Portola: The Warehouse', city: 'San Francisco', region: 'CA', kind: 'festival', template: 'warehouse',
      setting: 'indoor', capacity: 10000, lat: 37.7550, lon: -122.3800, elevationM: 3, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [9], showHours: ['12:00', '22:00'],
      stage: { W: 20, D: 10, H: 1.8, trim: 12 }, led: { wallW: 20, wallH: 8 }, rig: { count: 48, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 60, l: 120, ceil: 16, crowdN: 4000 },
      notes: 'Indoor stage in a cargo shed at Pier 80.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'crssd-city-steps', name: 'CRSSD: City Steps', city: 'San Diego', region: 'CA', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 15000, lat: 32.7215, lon: -117.1725, elevationM: 5, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [3, 9], showHours: ['12:00', '22:00'],
      stage: { W: 24, D: 14, H: 2, trim: 13 }, led: { wallW: 18, wallH: 8 }, rig: { count: 32, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 3000, crowdW: 60, crowdDepth: 60, fohZ: 35 },
      notes: 'Main stage at Waterfront Park by the bay.',
      confidence: 'estimated', facts: [],
    },
    {
      id: 'hard-summer', name: 'HARD Summer: Main Stage', city: 'Inglewood', region: 'CA', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 33.9500, lon: -118.3400, elevationM: 30, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [8], showHours: ['14:00', '23:00'],
      stage: { W: 56, D: 24, H: 3, trim: 24 }, led: { wallW: 40, wallH: 15 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4500, crowdW: 110, crowdDepth: 90, fohZ: 50 },
      notes: 'Main stage at Hollywood Park. Generic proportions.',
      confidence: 'estimated', facts: [],
    },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = VENUES;
  else root.STAGE_VENUES = VENUES;
})(this);
