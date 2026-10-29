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
      setting: 'open-air', capacity: 4500, lat: 40.711074, lon: -73.925066, elevationM: 10, audienceFacing: 60, tz: 'America/New_York',
      // The real site in 3D from USGS lidar (app/venues3d/brooklyn-mirage/, built by tools/venue3d/build_pack.py).
      pack: 'brooklyn-mirage',
      // The real site in 3D from USGS lidar (app/venues3d/brooklyn-mirage/, built by tools/venue3d/build_pack.py).
      season: [5, 6, 7, 8, 9, 10], showHours: ['18:00', '04:00'],
      stage: { W: 30.5, D: 15.2, H: 1.5, trim: 12 }, led: { wallW: 61, wallH: 9.1, pitch: 5.9 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 72, l: 85, ceil: 0, roof: { w: 30.5, d: 15.2 }, crowdN: 3500 },
      scenery: {
        hdri: 'quarry_01', dusk: 'blouberg_sunrise_2', night: null, ground: 'asphalt',
        basis: 'East Williamsburg warehouses around the site; Lower Manhattan and Midtown towers at their real heights and map bearings.',
        features: [
          { type: 'blocks', n: 70, r0: 70, r1: 230, h: [8, 22], windows: 0.25 },
          { type: 'skyline', name: 'Lower Manhattan', bearing: 258, dist: 7200, width: 1500, towers: [541, 329, 298, 290, 265, 250, 230, 200], fill: 30, fillH: [80, 200] },
          { type: 'skyline', name: 'Midtown Manhattan', bearing: 292, dist: 8500, width: 3500, towers: [472, 443, 435, 427, 426, 387, 366, 319, 319, 300], fill: 60, fillH: [100, 250] },
          { type: 'glow', bearing: 280, strength: 1.2 },
        ],
      },
      notes: 'Demo venue, modelled on the 2022 redesign: a 200 ft LED wall behind the stage, a space-frame stage roof and no columns on the dancefloor. The 2025 redesign never opened. Sources disagree on 2026: Pollstar reported a reopening in the original open-air layout, Wikipedia a new Pacha venue on the site.',
      confidence: 'sourced',
      facts: [
        { k: '3D site', v: 'The open-air courtyard of the Avant Gardner complex on Stewart Avenue, between the warehouses the lidar measures. Which end the stage was at is estimated.', src: 'https://registry.opendata.aws/usgs-lidar/' },
        { k: 'LED wall (2022)', v: '200 ft long × 30 ft high (61 × 9.1 m), over 1,000 panels, 15K wide', src: 'https://edm.com/news/brooklyn-mirage-summer-2022-redesign-schedule/' },
        { k: 'Stage roof (2022)', v: 'Modular space frame over 100 ft wide and 50 ft deep (30.5 × 15.2 m)', src: 'https://edm.com/news/brooklyn-mirage-summer-2022-redesign-schedule/' },
        { k: 'Dancefloor', v: '4,500-person open-air dancefloor; the 2022 redesign removed the columns from it', src: 'https://news.pollstar.com/2026/01/07/brooklyn-mirage-purchased-by-pacha-parent-company/' },
        { k: 'Ownership (2026)', v: 'Bought by FIVE Holdings (Pacha) for $110 million', src: 'https://news.pollstar.com/2026/01/07/brooklyn-mirage-purchased-by-pacha-parent-company/' },
        { k: 'Status (2026)', v: 'Outdoor Mirage closed; a new Pacha venue opened on the site in June 2026', src: 'https://en.wikipedia.org/wiki/Avant_Gardner' },
      ],
      estimated: 'Overall site size, deck height, truss trim, LED pixel pitch. Stage orientation (audience direction).',
    },
    {
      id: 'knockdown-center', name: 'Knockdown Center', city: 'Queens', region: 'NY', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3200, lat: 40.7153, lon: -73.9218, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['22:00', '06:00'],
      stage: { W: 12, D: 6, H: 1.2, trim: 8 }, led: { wallW: 12, wallH: 5 }, rig: { count: 28, program: 'wave', visual: 'tunnel', lasers: 'sweep' },
      room: { w: 30, l: 62, ceil: 12, crowdN: 2400, interior: { walls: 'brick', ceiling: 'beams', columns: 'steel', bars: [{ side: 'left', len: 12 }] } },
      notes: 'Main Space of a former door factory in Maspeth.',
      confidence: 'partial',
      facts: [
        { k: 'Main Space', v: '20,000 sq ft former factory floor of a 1903 glass works, later the Manhattan Door factory; original beams and surfaces kept', src: 'https://knockdown.center/?p=10449' },
        { k: 'Room', v: 'Brick walls, lots of wooden and iron beams, open rafters, a reflective floor', src: 'https://www.l-acoustics.com/press-releases/l-acoustics-delivers-knockout-concert-sound-at-knockdown-center/' },
        { k: 'Rig', v: '7 lighting trusses and 16 pipes span the room, about 175 fixtures; L-Acoustics K2 mains with K3 delays down the hall', src: 'https://timeless.mydigitalpublication.com/article/Venue/4864145/832495/article.html' },
        { k: 'Main Space', v: '20,000 sq ft (1,860 m²) inside a 50,000 sq ft building', src: 'https://fohonline.com/articles/venue-focus/knockdown-center/' },
        { k: 'Capacity', v: '3,200 in the Main Space', src: 'https://fohonline.com/articles/venue-focus/knockdown-center/' },
        { k: 'PA', v: 'L-Acoustics: 14 K2 left-right, K3 delays, KS21 subs', src: 'https://fohonline.com/articles/venue-focus/knockdown-center/' },
      ],
      estimated: 'Room proportions (30 × 62 m matches the floor area), ceiling height, stage and LED sizes. Interior: Exact room width, length and ceiling height; bar position.',
    },
    {
      id: 'elsewhere-hall', name: 'Elsewhere (Hall)', city: 'Brooklyn', region: 'NY', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 800, lat: 40.7096, lon: -73.9230, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['22:00', '05:00'],
      stage: { W: 10, D: 4, H: 1.0, trim: 5 }, led: { wallW: 8, wallH: 3.5 }, rig: { count: 14, program: 'cross', visual: 'bars', lasers: 'sweep' },
      room: { w: 18, l: 25, ceil: 7.3, crowdN: 600, interior: { walls: 'black', stageWall: 'black', ceiling: 'trusses', mosaic: true, columns: false, bars: [{ side: 'back', len: 9.1 }] } },
      notes: 'Main room of the Bushwick multi-room club.',
      confidence: 'partial', facts: [
        { k: 'Room', v: '4,250 to 5,000 sq ft, 24 ft (7.3 m) ceiling, 675 to 750 standing', src: 'https://thevendry.com/venue/39896/elsewhere-brooklyn-ny/space/5638' },
        { k: 'Stage', v: 'Removable 30 x 16 ft modular stage; behind it a large mosaic whose panels light up and change colour', src: 'https://www.brooklynvegan.com/first-look-at-popguns-new-bushwick-venue-elsewhere-which-opens-this-fall/' },
        { k: 'Bar', v: 'Full bar, 30 ft long', src: 'https://web.elsewhere.club/pages/private-events' },
      ],
      estimated: 'Interior: Room proportions, bar position (modelled on the rear wall), ceiling structure.',
    },
    {
      id: 'echostage', name: 'Echostage', city: 'Washington', region: 'DC', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3000, lat: 38.9206, lon: -76.9737, elevationM: 15, audienceFacing: null, tz: 'America/New_York',
      season: null, showHours: ['21:00', '03:00'],
      stage: { W: 11, D: 6, H: 1.5, trim: 9 }, led: { wallW: 18, wallH: 7 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 45, l: 62, ceil: 14, crowdN: 2400, interior: { walls: 'black', stageWall: 'black', ceiling: 'trusses', columns: false, balconies: [{ side: 'back', y: 4.5, d: 9, booths: true }], bars: [{ side: 'left', len: 18 }, { side: 'right', len: 18 }] } },
      notes: 'Dancefloor built for 3,000 with a VIP mezzanine overlooking it. DJ Mag Top 100 Clubs 2026: #6.',
      confidence: 'partial',
      facts: [
        { k: 'Room', v: 'More than 30,000 sq ft former warehouse, about 3,000 capacity', src: 'https://djmag.com/top100clubs/2024/3/Echostage' },
        { k: 'Mezzanine', v: 'Upstairs VIP mezzanine with bottle-service tables', src: 'https://www.timeout.com/washington-dc/music-nightlife/echostage' },
        { k: 'Capacity', v: '3,000-person dancefloor', src: DJMAG_ECHO },
        { k: 'Stage', v: '36 ft (11 m) wide', src: DJMAG_ECHO },
        { k: '2025 refit', v: 'Seven LED walls, 200+ lighting fixtures, 16 30 W lasers, L-Acoustics L2', src: DJMAG_ECHO },
      ],
      estimated: 'Room size, ceiling height, stage depth, LED wall sizes. The app draws one wall and at most 64 fixtures. Interior: Room proportions and ceiling height; bar positions.',
    },
    {
      id: 'club-space', name: 'Club Space (Terrace)', city: 'Miami', region: 'FL', kind: 'club', template: 'club',
      setting: 'open-air', capacity: 1500, lat: 25.7836, lon: -80.1931, elevationM: 2, audienceFacing: 180, tz: 'America/New_York',
      season: null, showHours: ['23:00', '12:00'],
      stage: { W: 6, D: 3, H: 0.9, trim: 4.5 }, led: { wallW: 6, wallH: 3 }, rig: { count: 12, program: 'ballyhoo', visual: 'bars', lasers: 'sweep' },
      room: { w: 28, l: 32, ceil: 0, crowdN: 1100 },
      scenery: {
        hdri: 'quarry_01', dusk: 'blouberg_sunrise_2', night: null, ground: 'concrete',
        basis: 'Downtown Miami: Miami Worldcenter next door, Brickell towers to the south and Biscayne Bay to the east, from maps.',
        features: [
          { type: 'blocks', n: 50, r0: 45, r1: 220, h: [20, 110], windows: 0.8 },
          { type: 'skyline', name: 'Miami Worldcenter', bearing: 160, dist: 330, width: 300, towers: [213, 190, 180] },
          { type: 'skyline', name: 'Brickell and downtown', bearing: 185, dist: 2800, width: 2000, towers: [265, 240, 233, 210, 208, 200, 191, 180], fill: 40, fillH: [100, 200] },
          { type: 'water', name: 'Biscayne Bay', bearing: 95, spread: 110, r0: 380, r1: 450 },
          { type: 'trees', kind: 'palm', n: 12, r0: 25, r1: 60 },
          { type: 'glow', bearing: 185, strength: 0.8 },
        ],
      },
      notes: 'Rooftop terrace known for sets running past sunrise, a good test for time of day.',
      confidence: 'partial',
      facts: [{ k: 'Capacity', v: '2,000 for the whole club', src: 'https://djmag.com/top100clubs/2024/30/club-space' }],
      estimated: 'Terrace size and share of capacity, stage and LED sizes. Stage orientation (audience direction).',
    },
    {
      id: 'exchange-la', name: 'Exchange LA', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 1500, lat: 34.0469, lon: -118.2513, elevationM: 90, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 9, D: 4, H: 1.2, trim: 7 }, led: { wallW: 10, wallH: 4 }, rig: { count: 20, program: 'cross', visual: 'tunnel', lasers: 'sweep' },
      room: { w: 22.6, l: 27.4, ceil: 12.2, crowdN: 1000, interior: { walls: 'deco', pilasters: 4.5, ceiling: 'vault', vaultRise: 2.5, chandeliers: 3, floor: 'wood', columns: false, balconies: [{ side: 'back', y: 5, d: 4.5 }, { side: 'left', y: 5, d: 3, len: 14 }, { side: 'right', y: 5, d: 3, len: 14 }], bars: [{ side: 'back', len: 10 }] } },
      notes: 'Former Pacific Stock Exchange trading floor with balconies. Check current operating status before a pitch.',
      confidence: 'partial', facts: [
        { k: 'Trading floor', v: '90 x 74 ft with a ceiling about 40 ft up, originally balconied', src: 'https://bigorangelandmarks.blogspot.com/2009/01/no-205-los-angeles-stock-exchange.html' },
        { k: 'Ceiling', v: 'Hand-painted vaulted ceiling about 40 ft above a wood floor', src: 'https://dailytrojan.com/2011/02/16/exchange-l-a-splashes-onto-downtown-club-scene/' },
        { k: 'Details', v: 'Original crown moulding and frosted-glass art deco chandeliers; a mezzanine above the trading floor and a VIP loft over both', src: 'https://www.bizbash.com/event-decor/exchange-la-four-story-event-space-and-nightspot-in-the-former-stock-exchange-building-downtown' },
        { k: 'Building', v: '1931 Los Angeles Stock Exchange, Classical Moderne by Samuel Lunden', src: 'https://www.laconservancy.org/locations/los-angeles-stock-exchange-building' },
        { k: 'Sound', v: 'Funktion-One, with a line array hung from the ceiling; LED wall behind the DJ', src: 'https://djmag.com/top100clubs/2022/11/Exchange-LA' },
      ],
      estimated: 'Interior: Which way the room runs (the 90 ft side is modelled as its length), balcony depths, chandelier count and size, the painted ceiling pattern (drawn in the spirit of the original, not copied).',
    },
    {
      id: 'academy-la', name: 'Academy LA', city: 'Los Angeles', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 1500, lat: 34.1017, lon: -118.3247, elevationM: 110, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '03:00'],
      stage: { W: 10, D: 4, H: 1.2, trim: 6 }, led: { wallW: 10, wallH: 4 }, rig: { count: 20, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 20.7, l: 53.6, ceil: 7.9, crowdN: 900, interior: { walls: 'black', stageWall: 'black', columns: false, ledCeiling: { rows: 7, w: 14 }, ledWalls: { len: 30, h: 2.4 }, balconies: [{ side: 'back', y: 3.6, d: 5 }], bars: [{ side: 'right', len: 10 }] } },
      notes: 'Hollywood club on Vine.',
      confidence: 'partial', facts: [
        { k: 'Main floor', v: '176 ft long x 68 ft wide (11,968 sq ft), 26 ft ceiling', src: 'https://thevendry.com/venue/142162/academy-la-los-angeles-ca/space/17359' },
        { k: 'Video', v: 'Rows of LED panels across the ceiling with moving heads between them; video continues down the back wall and along the side walls', src: 'https://www.lsionline.com/news/elation-gets-immersive-in-hollywood-s-academy' },
        { k: 'Upper level', v: 'VIP area upstairs', src: 'https://djmag.com/top100clubs/2023/31/Academy-LA' },
      ],
      estimated: 'Interior: Lengths of the side-wall video, VIP level depth, bar position.',
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
      room: { w: 20, l: 34, ceil: 6, crowdN: 450, interior: { walls: 'black', stageWall: 'wood', ceiling: 'beams', bars: [{ side: 'left', len: 9 }] } },
      notes: 'Intimate Hollywood house and techno club.',
      confidence: 'partial', facts: [
        { k: 'Room', v: '8,000 sq ft; about 500 to 650 standing', src: 'https://www.timeout.com/los-angeles/clubs/sound-nightclub' },
        { k: 'Design', v: 'By iCrave: raw industrial with baroque accents, a black-box room for projection mapping, salvaged crates and redwood', src: 'https://mc2-audio.co.uk/its-the-la-sound/' },
        { k: 'Sound', v: 'Funktion-One mid-highs flown in the four corners, F221 subs on the floor', src: 'https://www.fast-and-wide.com/faw-news/4482-the-sound-of-sound' },
      ],
      estimated: 'Interior: Room proportions and ceiling; where the reclaimed wood is used.',
    },
    {
      id: 'xs-las-vegas', name: 'XS Nightclub', city: 'Las Vegas', region: 'NV', kind: 'club', template: 'club',
      setting: 'open-air', capacity: 4000, lat: 36.1293, lon: -115.1650, elevationM: 620, audienceFacing: 300, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:30', '04:00'],
      stage: { W: 10, D: 5, H: 1.5, trim: 6 }, led: { wallW: 12, wallH: 5 }, rig: { count: 28, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { w: 40, l: 50, ceil: 0, crowdN: 2000 },
      scenery: {
        hdri: 'quarry_01', dusk: 'kiara_1_dawn', night: null, ground: 'concrete',
        basis: 'Encore\'s curved tower wraps the pool deck; the north and south Strip towers and the mountains around the valley are at real heights and bearings.',
        features: [
          { type: 'skyline', name: 'Encore and Wynn towers', bearing: 230, dist: 150, width: 250, towers: [192, 187] },
          { type: 'skyline', name: 'North Strip', bearing: 10, dist: 2000, width: 1500, towers: [350, 224, 200], bright: 2.5 },
          { type: 'skyline', name: 'Center Strip', bearing: 195, dist: 2500, width: 3000, towers: [196, 184, 183, 175, 170, 160, 150], fill: 15, fillH: [60, 150], bright: 2.5 },
          { type: 'mountains', name: 'Spring Mountains', bearing: 265, spread: 70, dist: 45000, height: 2700, color: 0x8f8170 },
          { type: 'mountains', name: 'Frenchman Mountain', bearing: 90, spread: 25, dist: 13000, height: 600, color: 0x7a6250 },
          { type: 'mountains', name: 'Sheep Range', bearing: 0, spread: 60, dist: 40000, height: 2000, color: 0x8a7560 },
          { type: 'trees', kind: 'palm', n: 24, r0: 22, r1: 70 },
          { type: 'glow', bearing: 195, strength: 1.4 },
        ],
      },
      notes: 'Indoor club that opens onto a pool deck at Encore; modelled as the open-air pool side.',
      confidence: 'estimated', facts: [],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'smartbar', name: 'Smartbar', city: 'Chicago', region: 'IL', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 400, lat: 41.9497, lon: -87.6589, elevationM: 180, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 4, D: 2.5, H: 0.6, trim: 2.8 }, led: { wallW: 4, wallH: 2 }, rig: { count: 8, program: 'cross', visual: 'text', lasers: 'off' },
      room: { w: 12, l: 18, ceil: 3.6, crowdN: 260, interior: { walls: 'black', stageWall: 'black', mirrorballs: 4, bars: [{ side: 'right', len: 7 }] } },
      notes: 'Low-ceiling basement club under Metro.',
      confidence: 'partial', facts: [
        { k: 'Room', v: 'Basement club under Metro, opened 1982, about 400 standing', src: 'https://www.cvent.com/venues/chicago/bar-club/smart-bar/venue-be7b0112-dd98-48b3-b60f-6ff3cfe04bc7' },
        { k: '2015 refit', v: 'Bigger booth, restored dance floor, new lighting, four mirror balls, Funktion-One at the rear', src: 'https://www.timeout.com/chicago/blog/smart-bar-will-celebrate-new-renovations-with-a-series-of-shows' },
      ],
      estimated: 'Interior: Dimensions, ceiling height and bar position.',
    },
    {
      id: 'radius-chicago', name: 'Radius', city: 'Chicago', region: 'IL', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 4000, lat: 41.8530, lon: -87.6440, elevationM: 180, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 16, D: 7, H: 1.5, trim: 10 }, led: { wallW: 18, wallH: 7 }, rig: { count: 40, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 42, l: 70, ceil: 13, crowdN: 2600, interior: { walls: 'concrete', stageWall: 'black', ceiling: 'trusses', columns: 'steel', balconies: [{ side: 'back', y: 4.5, d: 8 }], bars: [{ side: 'left', len: 14 }, { side: 'right', len: 14 }] } },
      notes: 'Large warehouse venue in Pilsen.',
      confidence: 'partial', facts: [
        { k: 'Building', v: 'Former steel factory, about 55,000 sq ft; main room up to 4,000 (2,500 with the partition wall in)', src: 'https://blockclubchicago.org/2019/12/12/radius-a-massive-new-music-venue-in-former-factory-will-open-in-pilsen-next-year/' },
        { k: 'Layout', v: 'Open floor with a mezzanine VIP level and under-balcony areas, nine bars across the venue; d&b KSL line arrays', src: 'https://www.mixonline.com/live-sound/db-audiotechnik-ksl-loudspeaker-radius-chicago' },
      ],
      estimated: 'Interior: Room proportions and ceiling height; which walls the bars and mezzanine are on.',
    },
    {
      id: 'the-midway-sf', name: 'The Midway', city: 'San Francisco', region: 'CA', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 2000, lat: 37.7509, lon: -122.3861, elevationM: 5, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 10.7, D: 6.7, H: 1.14, trim: 6.5 }, led: { wallW: 14, wallH: 5 }, rig: { count: 28, program: 'wave', visual: 'plasma', lasers: 'sweep' },
      room: { w: 31.4, l: 34.1, ceil: 9, crowdN: 1300, interior: { walls: 'concrete', stageWall: 'black', ceiling: 'beams', columns: false, ledColumns: true, bars: [{ side: 'left', len: 10 }] } },
      notes: 'Dogpatch warehouse arts and nightlife complex.',
      confidence: 'partial', facts: [
        { k: 'RiDE room', v: '112 x 103 ft (about 12,000 sq ft), 1,500 standing; open vaulted ceiling with exposed beams, concrete floor', src: 'https://thevendry.com/venue/47558/the-midway-san-francisco-ca/space/7334' },
        { k: 'Stage', v: '35 ft wide x 22 ft deep x 45 in high; FOH 55 ft out; main LED 31 x 13 ft with LED columns either side', src: 'https://corporate.themidwaysf.com/documents/the-midway-tech-rider-v01.pdf' },
      ],
      estimated: 'Interior: Ceiling height, bar position.',
    },
    {
      id: 'public-works-sf', name: 'Public Works', city: 'San Francisco', region: 'CA', kind: 'club', template: 'club',
      setting: 'indoor', capacity: 700, lat: 37.7689, lon: -122.4196, elevationM: 20, audienceFacing: null, tz: 'America/Los_Angeles',
      season: null, showHours: ['22:00', '04:00'],
      stage: { W: 7, D: 3, H: 0.8, trim: 4.5 }, led: { wallW: 6, wallH: 3 }, rig: { count: 12, program: 'cross', visual: 'bars', lasers: 'sweep' },
      room: { w: 16, l: 24, ceil: 7, crowdN: 450, interior: { walls: 'whitebrick', stageWall: 'black', ceiling: 'skylights', floor: 'wood', balconies: [{ side: 'back', y: 3.4, d: 4 }], bars: [{ side: 'left', len: 7 }] } },
      notes: 'Mission District club.',
      confidence: 'partial', facts: [
        { k: 'Main room', v: 'Over 3,500 sq ft across two floors; sprung hardwood dance floor; skylights', src: 'https://tagvenue.com/us/rooms/san-francisco/62142/public-works-sf/main-room' },
        { k: 'Balcony', v: 'Balcony above the room facing the DJ, holding the sound booth', src: 'https://www.technoairlines.com/club/public-works-san-francisco' },
      ],
      estimated: 'Interior: Dimensions, ceiling height, wall finish, bar position.',
    },
    {
      id: 'concourse-project', name: 'Concourse Project', city: 'Austin', region: 'TX', kind: 'club', template: 'warehouse',
      setting: 'indoor', capacity: 3000, lat: 30.3337, lon: -97.6807, elevationM: 190, audienceFacing: null, tz: 'America/Chicago',
      season: null, showHours: ['21:00', '04:00'],
      stage: { W: 14, D: 6, H: 1.2, trim: 9 }, led: { wallW: 16, wallH: 6 }, rig: { count: 36, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 30, l: 50, ceil: 10, crowdN: 2000, interior: { walls: 'concrete', stageWall: 'black', ceiling: 'trusses', columns: false, bars: [{ side: 'right', len: 12 }] } },
      notes: 'Warehouse club with an outdoor area. DJ Mag Top 100 Clubs 2026: #31.',
      confidence: 'partial', facts: [
        { k: 'Building', v: '18,000 sq ft warehouse by Austin-Bergstrom airport, opened 2021; modern industrial, bare-bones', src: 'https://kutx.org/?p=302785' },
        { k: 'Ranking', v: 'DJ Mag Top 100 Clubs 2026: #31', src: 'https://djmag.com/top100clubs/2026/31/concourse-project' }],
      estimated: 'Interior: Dimensions, ceiling height, bars.',
    },

    /* ---------- Amphitheatres ---------- */
    {
      id: 'red-rocks', name: 'Red Rocks Amphitheatre', city: 'Morrison', region: 'CO', kind: 'amphitheatre', template: 'amphi',
      setting: 'outdoor', capacity: 9525, lat: 39.6654, lon: -105.2057, elevationM: 1966, audienceFacing: 77, tz: 'America/Denver',
      // The real site in 3D, built from USGS lidar by tools/venue3d/build_pack.py (app/venues3d/red-rocks/).
      pack: 'red-rocks',
      season: [4, 5, 6, 7, 8, 9, 10], showHours: ['18:00', '23:00'],
      stage: { W: 28, D: 18, H: 1.5, trim: 12.2 }, led: { wallW: 6.25, wallH: 4.4, pitch: 8 }, rig: { count: 40, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { rows: 69, rowDepth: 1.215, rise: 0.445, fan: 48, r0: 12, rocks: { left: 91, right: 61 }, pa: 'lcr', crowdN: 4500 },
      scenery: {
        hdri: 'quarry_01', dusk: 'kiara_1_dawn', night: 'dikhololo_night', ground: 'rock',
        basis: 'The audience looks east over the plains to Denver, 24 km away and 330 m lower; the foothills rise behind the rows. Denver\'s tallest towers are at their real heights.',
        features: [
          { type: 'skyline', name: 'Downtown Denver', bearing: 62, dist: 24000, ground: 1609, width: 2500, towers: [218, 216, 213, 195, 183, 172, 166, 155], fill: 30, fillH: [60, 140] },
          { type: 'glow', bearing: 62, strength: 1.5 },
          { type: 'mountains', name: 'Foothills and Mount Morrison', bearing: 270, spread: 150, dist: 3000, height: 450, color: 0x4a4030 },
          { type: 'trees', kind: 'pine', n: 120, r0: 150, r1: 380 },
        ],
      },
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
        { k: '3D site (lidar)', v: 'Ground, rocks and about 1,600 trees from USGS 3DEP lidar (2020). Measured from it: stage roof 34 × 22 m, top 14.4 m above the pit; rows 1.215 m deep rising 30.7 m over 69 rows; audience faces 77°', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage deck size (scaled from the roof area); the exact curve of the rows (fitted to the lidar, which is too sparse to show each step).',
    },
    {
      id: 'the-gorge', name: 'The Gorge Amphitheatre', city: 'George', region: 'WA', kind: 'amphitheatre', template: 'amphi',
      setting: 'outdoor', capacity: 27500, lat: 47.101315, lon: -119.995898, elevationM: 380, audienceFacing: 300, tz: 'America/Los_Angeles',
      // The real site in 3D from USGS lidar (app/venues3d/the-gorge/, built by tools/venue3d/build_pack.py).
      pack: 'the-gorge',
      // The real site in 3D from USGS lidar (app/venues3d/the-gorge/, built by tools/venue3d/build_pack.py).
      season: [5, 6, 7, 8, 9], showHours: ['16:00', '02:00'],
      stage: { W: 24, D: 16, H: 2, trim: 15 }, led: { wallW: 22, wallH: 9 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { rows: 55, rowDepth: 1.8, rise: 0.38, fan: 110, r0: 16, lawn: true, crowdN: 4000 },
      scenery: {
        hdri: 'quarry_01', dusk: 'kiara_1_dawn', night: null, ground: 'dirt',
        basis: 'The stage backs onto the Columbia River gorge: the river below and the basalt cliffs of the far bank, from maps.',
        features: [
          { type: 'water', name: 'Columbia River', bearing: 255, spread: 100, r0: 330, r1: 440 },
          { type: 'mountains', name: 'Far rim of the gorge', bearing: 255, spread: 130, dist: 3000, height: 70, color: 0x8a7255 },
          { type: 'mountains', name: 'Columbia Plateau', bearing: 75, spread: 200, dist: 15000, height: 120, color: 0x8a7a5a },
        ],
      },
      notes: 'Terraced lawn above the Columbia River; the sun sets behind the stage. Home of Bass Canyon.',
      confidence: 'partial',
      facts: [
        { k: '3D site', v: 'Stage at the foot of the lawn bowl on the lip of the gorge, the audience on the real slope looking west-north-west over the stage to the Columbia River (the sun sets behind the stage). The lawn is the lidar ground as measured; only the stage pad is levelled.', src: 'https://registry.opendata.aws/usgs-lidar/' },
        { k: 'Capacity', v: '27,500, reserved seats and lawn', src: 'https://en.wikipedia.org/wiki/The_Gorge_Amphitheatre' },
        { k: 'Stage (2010)', v: 'Rebuilt lower, darker and more compact on a Mountain Productions SuperMega truss roof', src: 'https://www.guerrillacandy.com/2010/05/08/the-gorge-gets-a-new-stage/' },
      ],
      estimated: 'All dimensions and the audience bearing.',
    },

    /* ---------- Festival stages ---------- */
    {
      id: 'edc-kineticfield', name: 'EDC Las Vegas: kineticFIELD', city: 'Las Vegas', region: 'NV', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 60000, lat: 36.274146, lon: -115.007814, elevationM: 600, audienceFacing: 44, tz: 'America/Los_Angeles',
      // The real site in 3D from USGS lidar (app/venues3d/edc-kineticfield/, built by tools/venue3d/build_pack.py).
      pack: 'edc-kineticfield',
      // The real site in 3D from USGS lidar (app/venues3d/edc-kineticfield/, built by tools/venue3d/build_pack.py).
      season: [5], showHours: ['19:00', '05:30'],
      stage: { W: 146, D: 30, H: 3, trim: 27.5 }, led: { wallW: 60, wallH: 18 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 170, crowdDepth: 130, fohZ: 70 },
      scenery: {
        hdri: 'quarry_01', dusk: 'kiara_1_dawn', night: null, ground: 'dirt',
        basis: 'Las Vegas Motor Speedway in the desert north-east of the city: mountains on every side and the Strip 22 km to the south-west, at real heights and bearings.',
        features: [
          { type: 'mountains', name: 'Sheep Range', bearing: 350, spread: 60, dist: 30000, height: 2300, color: 0x8a7560 },
          { type: 'mountains', name: 'Las Vegas Range', bearing: 60, spread: 70, dist: 9000, height: 1000, color: 0x7d6650 },
          { type: 'mountains', name: 'Frenchman Mountain', bearing: 185, spread: 30, dist: 16000, height: 650, color: 0x7a6250 },
          { type: 'mountains', name: 'Spring Mountains', bearing: 245, spread: 50, dist: 50000, height: 2900, color: 0x8f8170 },
          { type: 'skyline', name: 'Las Vegas Strip', bearing: 222, dist: 22000, width: 6000, towers: [350, 224, 200, 196, 192, 187, 184, 183, 175], fill: 25, fillH: [80, 160], bright: 4 },
          { type: 'glow', bearing: 222, strength: 2 },
          { type: 'stand', name: 'Speedway grandstand', bearing: 270, dist: 300, length: 600, height: 35 },
        ],
      },
      notes: 'Main stage on the Las Vegas Motor Speedway infield. Redesigned every year; the width and height follow the published figures, the rest is a generic stage at that scale. Sets run until sunrise.',
      confidence: 'partial',
      facts: [
        { k: '3D site', v: 'Stage placed in the infield at the Turn 3-4 end of the Las Vegas Motor Speedway oval (jeffgluck.com: kineticFIELD is built between Turns 3 and 4), the audience looking north-east along the oval’s long axis. The oval is measured; the stage itself is temporary and not in the lidar, so its exact spot and facing are estimated.', src: 'https://registry.opendata.aws/usgs-lidar/' },
        { k: 'Size (2015)', v: '480 ft wide, 100 ft tall (146 × 30.5 m)', src: 'https://www.everfest.com/magazine/the-15-best-festival-stages-of-the-2015-season' },
        { k: 'Rig (2015)', v: '1,000 lighting fixtures, 40 lasers, 22 pyro units, 15 confetti cannons', src: 'https://www.everfest.com/magazine/the-15-best-festival-stages-of-the-2015-season' },
        { k: 'Crowd (2015)', v: '60,000+ at this stage', src: 'https://www.everfest.com/magazine/the-15-best-festival-stages-of-the-2015-season' },
        { k: 'Structure (2013)', v: '480 ft wide, 335 tons of scaffolding, 2,000+ fixtures', src: 'https://plsn.com/?p=247262' },
      ],
      estimated: 'Stage depth, LED wall sizes, set pieces. The app draws at most 64 fixtures. Stage orientation (audience direction).',
    },
    {
      id: 'edc-circuitgrounds', name: 'EDC Las Vegas: circuitGROUNDS', city: 'Las Vegas', region: 'NV', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 36.269744, lon: -115.011826, elevationM: 600, audienceFacing: 204, tz: 'America/Los_Angeles',
      // The real site in 3D from USGS lidar (app/venues3d/edc-circuitgrounds/, built by tools/venue3d/build_pack.py).
      pack: 'edc-circuitgrounds',
      // The real site in 3D from USGS lidar (app/venues3d/edc-circuitgrounds/, built by tools/venue3d/build_pack.py).
      season: [5], showHours: ['19:00', '05:30'],
      stage: { W: 40, D: 18, H: 2.5, trim: 18 }, led: { wallW: 36, wallH: 14 }, rig: { count: 56, program: 'cross', visual: 'tunnel', lasers: 'scan' },
      room: { crowdN: 4000, crowdW: 95, crowdDepth: 75, fohZ: 45 },
      scenery: {
        hdri: 'quarry_01', dusk: 'kiara_1_dawn', night: null, ground: 'dirt',
        basis: 'Las Vegas Motor Speedway in the desert north-east of the city: mountains on every side and the Strip 22 km to the south-west, at real heights and bearings.',
        features: [
          { type: 'mountains', name: 'Sheep Range', bearing: 350, spread: 60, dist: 30000, height: 2300, color: 0x8a7560 },
          { type: 'mountains', name: 'Las Vegas Range', bearing: 60, spread: 70, dist: 9000, height: 1000, color: 0x7d6650 },
          { type: 'mountains', name: 'Frenchman Mountain', bearing: 185, spread: 30, dist: 16000, height: 650, color: 0x7a6250 },
          { type: 'mountains', name: 'Spring Mountains', bearing: 245, spread: 50, dist: 50000, height: 2900, color: 0x8f8170 },
          { type: 'skyline', name: 'Las Vegas Strip', bearing: 222, dist: 22000, width: 6000, towers: [350, 224, 200, 196, 192, 187, 184, 183, 175], fill: 25, fillH: [80, 160], bright: 4 },
          { type: 'glow', bearing: 222, strength: 2 },
          { type: 'stand', name: 'Speedway grandstand', bearing: 270, dist: 300, length: 600, height: 35 },
        ],
      },
      notes: 'LED-heavy techno and house stage. Generic proportions, not the current design.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'Stage placed in the infield tucked into Turn 2 at the south-west end of the oval (jeffgluck.com), the audience looking out towards the turn. Exact spot and facing estimated.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'coachella-sahara', name: 'Coachella: Sahara', city: 'Indio', region: 'CA', kind: 'festival', template: 'arch',
      setting: 'tent', capacity: 25000, lat: 33.680054, lon: -116.235981, elevationM: 0, audienceFacing: 160, tz: 'America/Los_Angeles',
      // The real site in 3D from USGS lidar (app/venues3d/coachella-sahara/, built by tools/venue3d/build_pack.py).
      pack: 'coachella-sahara',
      // The real site in 3D from USGS lidar (app/venues3d/coachella-sahara/, built by tools/venue3d/build_pack.py).
      season: [4], showHours: ['12:00', '00:00'],
      stage: { W: 36, D: 14, H: 2, trim: 18 }, led: { wallW: 32, wallH: 12 }, rig: { count: 64, program: 'audience', visual: 'plasma', lasers: 'fan' },
      room: { w: 122, l: 125, h: 30, ribs: 16, crowdN: 5000 },
      scenery: {
        hdri: 'quarry_01', dusk: 'kiara_1_dawn', night: null, ground: 'grass',
        basis: 'Empire Polo Club: San Jacinto and Santa Rosa mountains to the west and south, the Little San Bernardinos to the north-east, palms around the fields.',
        features: [
          { type: 'mountains', name: 'San Jacinto Mountains', bearing: 285, spread: 40, dist: 45000, height: 3200, color: 0x8c7d6c },
          { type: 'mountains', name: 'Santa Rosa Mountains', bearing: 215, spread: 60, dist: 25000, height: 2400, color: 0x8a7663 },
          { type: 'mountains', name: 'Little San Bernardino Mountains', bearing: 40, spread: 80, dist: 18000, height: 1100, color: 0x8f7d68 },
          { type: 'trees', kind: 'palm', n: 60, r0: 140, r1: 300 },
        ],
      },
      notes: 'Electronic tent at the Empire Polo Club. The tent follows the 2024 structure; the stage inside is generic.',
      confidence: 'partial',
      facts: [
        { k: '3D site', v: 'Sahara on the polo fields in the south part of the Empire Polo Club, where it moved in 2024 (between Avenue 51 and Polo Road, per the Desert Sun). Exact spot and the way the tent opens are estimated.', src: 'https://registry.opendata.aws/usgs-lidar/' },
        { k: 'Tent (2024)', v: '400 × 410 ft (122 × 125 m), nearly 100 ft (30 m) tall, 16 steel ribs', src: 'https://plsn.com/?p=373724' },
        { k: 'Lighting (2024)', v: '956 Elation fixtures, including 120 DARTZ 360, 159 Smarty MAX, 320 SixPar 200', src: 'https://www.elationlighting.com/blogs/news/1300-elation-lights-dazzle-coachella-2024' },
      ],
      estimated: 'Stage and LED sizes (the 2024 stage was a wing-shaped video wall). The app draws at most 64 fixtures. Stage orientation (audience direction).',
    },
    {
      id: 'ultra-main', name: 'Ultra Miami: Main Stage', city: 'Miami', region: 'FL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 55000, lat: 25.773056, lon: -80.186299, elevationM: 2, audienceFacing: 180, tz: 'America/New_York',
      // The real site in 3D from USGS lidar (app/venues3d/ultra-main/, built by tools/venue3d/build_pack.py).
      pack: 'ultra-main',
      // The real site in 3D from USGS lidar (app/venues3d/ultra-main/, built by tools/venue3d/build_pack.py).
      season: [3], showHours: ['12:00', '00:00'],
      stage: { W: 60, D: 26, H: 3, trim: 26 }, led: { wallW: 46, wallH: 16 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 120, crowdDepth: 90, fohZ: 50 },
      scenery: {
        hdri: 'quarry_01', dusk: 'blouberg_sunrise_2', night: null, ground: 'grass',
        basis: 'Bayfront Park: downtown Miami\'s towers along Biscayne Boulevard to the west, Brickell to the south, the bay to the east.',
        features: [
          { type: 'skyline', name: 'Downtown Miami along Biscayne Boulevard', bearing: 270, dist: 450, width: 900, towers: [233, 210, 200, 198, 192, 191, 180, 170, 160, 150], fill: 20, fillH: [80, 160] },
          { type: 'skyline', name: 'Brickell', bearing: 200, dist: 2200, width: 1500, towers: [265, 240, 220, 210, 200], fill: 25, fillH: [100, 200] },
          { type: 'water', name: 'Biscayne Bay', bearing: 90, spread: 150, r0: 180, r1: 450 },
          { type: 'trees', kind: 'palm', n: 50, r0: 70, r1: 200 },
          { type: 'glow', bearing: 270, strength: 1 },
        ],
      },
      notes: 'Bayfront Park main stage. Generic proportions, not the current design.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'Main Stage placed on the open lawn at the south end of Bayfront Park, the audience looking south with Biscayne Bay on their left and the Biscayne Boulevard towers on their right. Position and facing estimated; the official site map is an image we could not read.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'ultra-resistance', name: 'Ultra Miami: Resistance Megastructure', city: 'Miami', region: 'FL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 20000, lat: 25.776559, lon: -80.186200, elevationM: 2, audienceFacing: 315, tz: 'America/New_York',
      // The real site in 3D from USGS lidar (app/venues3d/ultra-resistance/, built by tools/venue3d/build_pack.py).
      pack: 'ultra-resistance',
      // The real site in 3D from USGS lidar (app/venues3d/ultra-resistance/, built by tools/venue3d/build_pack.py).
      season: [3], showHours: ['12:00', '00:00'],
      stage: { W: 36, D: 18, H: 2.5, trim: 20 }, led: { wallW: 26, wallH: 10 }, rig: { count: 56, program: 'cross', visual: 'tunnel', lasers: 'scan' },
      room: { crowdN: 3500, crowdW: 80, crowdDepth: 60, fohZ: 38 },
      scenery: {
        hdri: 'quarry_01', dusk: 'blouberg_sunrise_2', night: null, ground: 'grass',
        basis: 'Bayfront Park: downtown Miami\'s towers along Biscayne Boulevard to the west, Brickell to the south, the bay to the east.',
        features: [
          { type: 'skyline', name: 'Downtown Miami along Biscayne Boulevard', bearing: 270, dist: 450, width: 900, towers: [233, 210, 200, 198, 192, 191, 180, 170, 160, 150], fill: 20, fillH: [80, 160] },
          { type: 'skyline', name: 'Brickell', bearing: 200, dist: 2200, width: 1500, towers: [265, 240, 220, 210, 200], fill: 25, fillH: [100, 200] },
          { type: 'water', name: 'Biscayne Bay', bearing: 90, spread: 150, r0: 180, r1: 450 },
          { type: 'trees', kind: 'palm', n: 50, r0: 70, r1: 200 },
          { type: 'glow', bearing: 270, strength: 1 },
        ],
      },
      notes: 'Techno stage built as a large truss structure. Generic proportions.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'Resistance placed on the lawn north of the Pepper Fountain, the audience looking north-west. Position and facing estimated; sources only say Resistance sits deeper inside Bayfront Park.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'ef-ranch-arena', name: 'Electric Forest: Ranch Arena', city: 'Rothbury', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 43.499347, lon: -86.346232, elevationM: 220, audienceFacing: 0, tz: 'America/Detroit',
      // The real site in 3D from USGS lidar (app/venues3d/ef-ranch-arena/, built by tools/venue3d/build_pack.py).
      pack: 'ef-ranch-arena',
      // The real site in 3D from USGS lidar (app/venues3d/ef-ranch-arena/, built by tools/venue3d/build_pack.py).
      season: [6], showHours: ['14:00', '02:00'],
      stage: { W: 36, D: 18, H: 2.5, trim: 18 }, led: { wallW: 28, wallH: 11 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4000, crowdW: 90, crowdDepth: 80, fohZ: 45 },
      scenery: {
        hdri: 'forest_slope', dusk: 'spruit_sunrise', night: 'moonless_golf', ground: 'grass',
        basis: 'Double JJ Ranch: an open field ringed by pine and hardwood forest.',
        features: [
          { type: 'trees', kind: 'pine', n: 450, r0: 60, r1: 380 },
          { type: 'trees', kind: 'broad', n: 160, r0: 60, r1: 300 },
        ],
      },
      notes: 'Main field stage at the Double JJ Ranch.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'The open arena of the Double JJ ranch that gives Ranch Arena its name, measured in the lidar; the stage is placed at its north end. Facing estimated.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'ef-sherwood-court', name: 'Electric Forest: Sherwood Court', city: 'Rothbury', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 12000, lat: 43.501414, lon: -86.349514, elevationM: 220, audienceFacing: 300, tz: 'America/Detroit',
      // The real site in 3D from USGS lidar (app/venues3d/ef-sherwood-court/, built by tools/venue3d/build_pack.py).
      pack: 'ef-sherwood-court',
      // The real site in 3D from USGS lidar (app/venues3d/ef-sherwood-court/, built by tools/venue3d/build_pack.py).
      season: [6], showHours: ['14:00', '02:00'],
      stage: { W: 24, D: 14, H: 2, trim: 13 }, led: { wallW: 18, wallH: 8 }, rig: { count: 32, program: 'audience', visual: 'tunnel', lasers: 'fan' },
      room: { crowdN: 2500, crowdW: 50, crowdDepth: 45, fohZ: 30, trees: true },
      scenery: {
        hdri: 'forest_slope', dusk: 'spruit_sunrise', night: 'moonless_golf', ground: 'dirt',
        basis: 'Sherwood Forest: a clearing in dense woods, with coloured lights strung through the trees.',
        features: [
          { type: 'trees', kind: 'pine', n: 450, r0: 60, r1: 380 },
          { type: 'trees', kind: 'broad', n: 160, r0: 60, r1: 300 },
          { type: 'treelights', n: 1200, r1: 160 },
        ],
      },
      notes: 'Stage in a clearing inside the Sherwood Forest woods.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'A clearing in the woods on the far side of Sherwood Forest from Ranch Arena (oceanacountypress.com). The exact clearing and facing are estimated.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'lolla-perrys', name: "Lollapalooza: Perry's", city: 'Chicago', region: 'IL', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 41.870137, lon: -87.619517, elevationM: 180, audienceFacing: 180, tz: 'America/Chicago',
      // The real site in 3D from USGS lidar (app/venues3d/lolla-perrys/, built by tools/venue3d/build_pack.py).
      pack: 'lolla-perrys',
      // The real site in 3D from USGS lidar (app/venues3d/lolla-perrys/, built by tools/venue3d/build_pack.py).
      season: [8], showHours: ['12:00', '22:00'],
      stage: { W: 40, D: 18, H: 2.5, trim: 18 }, led: { wallW: 30, wallH: 12 }, rig: { count: 48, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4000, crowdW: 100, crowdDepth: 90, fohZ: 50 },
      scenery: {
        hdri: 'quarry_01', dusk: 'blouberg_sunrise_2', night: null, ground: 'grass',
        basis: 'Grant Park: the Loop and Streeterville towers to the north and west at their real heights, Lake Michigan to the east.',
        features: [
          { type: 'skyline', name: 'The Loop', bearing: 330, dist: 1800, width: 2500, towers: [442, 346, 307, 303, 293, 259, 249, 241, 221], fill: 50, fillH: [90, 220] },
          { type: 'skyline', name: 'Streeterville', bearing: 355, dist: 3200, width: 1500, towers: [423, 363, 344, 265, 262, 257], fill: 25, fillH: [90, 200] },
          { type: 'water', name: 'Lake Michigan', bearing: 90, spread: 140, r0: 350, r1: 450 },
          { type: 'trees', kind: 'broad', n: 80, r0: 90, r1: 250 },
          { type: 'glow', bearing: 330, strength: 1.2 },
        ],
      },
      notes: 'Electronic stage in Grant Park. 10 pm curfew, so the headliner plays at dusk.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'Placed at the south end of Hutchinson Field in Grant Park, the audience looking south. Position and facing estimated; Perry’s has moved over the years and the current map is an image we could not read.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'movement-detroit', name: 'Movement Detroit: Movement Stage', city: 'Detroit', region: 'MI', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 15000, lat: 42.327647, lon: -83.042960, elevationM: 180, audienceFacing: 150, tz: 'America/Detroit',
      // The real site in 3D from USGS lidar (app/venues3d/movement-detroit/, built by tools/venue3d/build_pack.py).
      pack: 'movement-detroit',
      // The real site in 3D from USGS lidar (app/venues3d/movement-detroit/, built by tools/venue3d/build_pack.py).
      season: [5], showHours: ['12:00', '00:00'],
      stage: { W: 24, D: 14, H: 2, trim: 14 }, led: { wallW: 20, wallH: 8 }, rig: { count: 36, program: 'wave', visual: 'tunnel', lasers: 'sweep' },
      room: { crowdN: 3000, crowdW: 70, crowdDepth: 60, fohZ: 36 },
      scenery: {
        hdri: 'quarry_01', dusk: 'blouberg_sunrise_2', night: null, ground: 'concrete',
        basis: 'Hart Plaza: the Renaissance Center to the east, downtown to the north, the Detroit River and Windsor across it to the south.',
        features: [
          { type: 'skyline', name: 'Renaissance Center', bearing: 70, dist: 700, width: 300, towers: [221, 159, 159, 159, 159, 120, 120] },
          { type: 'skyline', name: 'Downtown Detroit', bearing: 340, dist: 600, width: 900, towers: [189, 172, 151, 145, 130, 120, 110], fill: 25, fillH: [40, 110] },
          { type: 'water', name: 'Detroit River', bearing: 160, spread: 140, r0: 120, r1: 450 },
          { type: 'skyline', name: 'Windsor', bearing: 165, dist: 1300, width: 2000, towers: [100, 90, 80], fill: 15, fillH: [20, 70] },
          { type: 'glow', bearing: 340, strength: 0.8 },
        ],
      },
      notes: 'Main stage in Hart Plaza on the Detroit River.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'Movement Stage in Hart Plaza’s sunken amphitheater (movementfestival.com), the crowd on the real tiers and floor of the bowl, looking south-south-east towards the river. Position in the bowl and facing estimated from the lidar.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'lost-lands', name: 'Lost Lands: Main Stage', city: 'Thornville', region: 'OH', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 50000, lat: 39.938497, lon: -82.402218, elevationM: 300, audienceFacing: 95, tz: 'America/New_York',
      // The real site in 3D from USGS lidar (app/venues3d/lost-lands/, built by tools/venue3d/build_pack.py).
      pack: 'lost-lands',
      // The real site in 3D from USGS lidar (app/venues3d/lost-lands/, built by tools/venue3d/build_pack.py).
      season: [9], showHours: ['14:00', '02:00'],
      stage: { W: 64, D: 26, H: 3, trim: 26 }, led: { wallW: 44, wallH: 16 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 5000, crowdW: 120, crowdDepth: 100, fohZ: 55 },
      scenery: {
        hdri: 'quarry_01', dusk: 'spruit_sunrise', night: 'moonless_golf', ground: 'grass',
        basis: 'Legend Valley: rolling farmland hills and hardwood woods.',
        features: [
          { type: 'trees', kind: 'broad', n: 300, r0: 150, r1: 420 },
          { type: 'trees', kind: 'pine', n: 80, r0: 150, r1: 420 },
          { type: 'mountains', name: 'Rolling hills', bearing: 0, spread: 360, dist: 2500, height: 70, color: 0x3c4a2c },
        ],
      },
      notes: 'Bass festival at Legend Valley. Generic stage at that scale, not the themed set pieces.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'Legend Valley (latlong.net coordinates). The main stage is placed at the foot of the long east-facing slope, the crowd on the real slope looking east. Position and facing estimated; the festival map is an image we could not read.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'portola-warehouse', name: 'Portola: The Warehouse', city: 'San Francisco', region: 'CA', kind: 'festival', template: 'warehouse',
      setting: 'indoor', capacity: 10000, lat: 37.7550, lon: -122.3800, elevationM: 3, audienceFacing: null, tz: 'America/Los_Angeles',
      season: [9], showHours: ['12:00', '22:00'],
      stage: { W: 20, D: 10, H: 1.8, trim: 12 }, led: { wallW: 20, wallH: 8 }, rig: { count: 48, program: 'wave', visual: 'tunnel', lasers: 'fan' },
      room: { w: 60, l: 120, ceil: 16, crowdN: 4000, interior: { walls: 'concrete', stageWall: 'black', ceiling: 'trusses', columns: false, bars: [{ side: 'left', len: 20 }] } },
      notes: 'Indoor stage in a cargo shed at Pier 80.',
      confidence: 'partial', facts: [
        { k: 'Building', v: 'Pier 80 shed retrofitted for the festival, said to hold up to 18,000; listed as the largest clear-span warehouse in the city', src: 'https://thevendry.com/venue/261819/pier-80-shed-a-san-francisco-ca/space/209930' },
      ],
      estimated: 'Interior: Which part of the shed the stage uses, roof height, bars.',
    },
    {
      id: 'crssd-city-steps', name: 'CRSSD: City Steps', city: 'San Diego', region: 'CA', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 15000, lat: 32.722084, lon: -117.172660, elevationM: 5, audienceFacing: 90, tz: 'America/Los_Angeles',
      // The real site in 3D from USGS lidar (app/venues3d/crssd-city-steps/, built by tools/venue3d/build_pack.py).
      pack: 'crssd-city-steps',
      // The real site in 3D from USGS lidar (app/venues3d/crssd-city-steps/, built by tools/venue3d/build_pack.py).
      season: [3, 9], showHours: ['12:00', '22:00'],
      stage: { W: 24, D: 14, H: 2, trim: 13 }, led: { wallW: 18, wallH: 8 }, rig: { count: 32, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 3000, crowdW: 60, crowdDepth: 60, fohZ: 35 },
      scenery: {
        hdri: 'quarry_01', dusk: 'venice_sunset', night: null, ground: 'grass',
        basis: 'Waterfront Park: San Diego Bay to the west with Point Loma beyond, the County Administration Center next door and the downtown towers to the south-east.',
        features: [
          { type: 'water', name: 'San Diego Bay', bearing: 270, spread: 150, r0: 120, r1: 450 },
          { type: 'skyline', name: 'Downtown San Diego', bearing: 150, dist: 1200, width: 1800, towers: [152, 152, 150, 145, 140, 135, 125], fill: 35, fillH: [50, 130] },
          { type: 'skyline', name: 'County Administration Center', bearing: 90, dist: 140, width: 120, towers: [50], color: 0xc9b99a },
          { type: 'mountains', name: 'Point Loma', bearing: 240, spread: 50, dist: 6000, height: 120, color: 0x5d5a48 },
          { type: 'trees', kind: 'palm', n: 30, r0: 50, r1: 160 },
          { type: 'glow', bearing: 150, strength: 0.8 },
        ],
      },
      notes: 'Main stage at Waterfront Park by the bay.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'City Steps stage on the Waterfront Park lawn right next to the County Administration Building (edmtunes.com), the audience looking east towards the building with the bay behind them. Facing estimated.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
    {
      id: 'hard-summer', name: 'HARD Summer: Main Stage', city: 'Inglewood', region: 'CA', kind: 'festival', template: 'festival',
      setting: 'outdoor', capacity: 40000, lat: 33.952066, lon: -118.334369, elevationM: 30, audienceFacing: 0, tz: 'America/Los_Angeles',
      // The real site in 3D from USGS lidar (app/venues3d/hard-summer/, built by tools/venue3d/build_pack.py).
      pack: 'hard-summer',
      season: [8], showHours: ['14:00', '23:00'],
      stage: { W: 56, D: 24, H: 3, trim: 24 }, led: { wallW: 40, wallH: 15 }, rig: { count: 64, program: 'fan', visual: 'plasma', lasers: 'fan' },
      room: { crowdN: 4500, crowdW: 110, crowdDepth: 90, fohZ: 50 },
      scenery: {
        hdri: 'quarry_01', dusk: 'kiara_1_dawn', night: null, ground: 'asphalt',
        basis: 'Hollywood Park, Inglewood: SoFi Stadium next door, downtown LA 15 km to the north-east, the San Gabriel Mountains and Hollywood Hills beyond.',
        features: [
          { type: 'stand', name: 'SoFi Stadium', bearing: 0, dist: 380, length: 300, height: 45 },
          { type: 'skyline', name: 'Downtown Los Angeles', bearing: 45, dist: 15000, width: 2500, towers: [335, 310, 262, 255, 229, 220], fill: 25, fillH: [100, 200] },
          { type: 'mountains', name: 'San Gabriel Mountains', bearing: 30, spread: 60, dist: 45000, height: 2500, color: 0x7f7a74 },
          { type: 'mountains', name: 'Hollywood Hills', bearing: 340, spread: 50, dist: 12000, height: 400, color: 0x6b6450 },
          { type: 'trees', kind: 'palm', n: 40, r0: 80, r1: 250 },
          { type: 'glow', bearing: 45, strength: 1 },
        ],
      },
      notes: 'Main stage at Hollywood Park. Generic proportions.',
      confidence: 'estimated', facts: [
        { k: '3D site', v: 'Hollywood Park beside SoFi Stadium and its lake (edmidentity.com). The stage is placed on the open ground east of the stadium; exact spot and facing estimated.', src: 'https://registry.opendata.aws/usgs-lidar/' },
      ],
      estimated: 'Stage orientation (audience direction) and all sizes.',
    },
  ];

  /* Photos of the real places, freely licensed on Wikimedia Commons. `file` is the Commons file name (its page names
   * the photographer and licence), `view` what it shows: 'show' (during an event), 'site' (the place, no show on) or
   * 'outside' (the building the venue is in). Venues with no freely licensed photo are left out. */
  const PHOTOS = {
    'red-rocks': { file: 'Red_Rocks_Amphitheater.JPG', view: 'site' },
    'the-gorge': { file: 'Gorge_Amphitheatre.jpg', view: 'site' },
    'brooklyn-mirage': { file: 'Glass_Animals_-_Brooklyn_Mirage_2022_07.jpg', view: 'show' },
    'knockdown-center': { file: 'Alice_Longyu_Gao_Knockdown_Center_2024.jpg', view: 'show' },
    'echostage': { file: 'Echostage_Washington,_D.C._1.jpg', view: 'site' },
    'club-space': { file: 'Club_Space_in_Downtown_Miami.jpg', view: 'outside' },
    'exchange-la': { file: 'Los_Angeles_Stock_Exchange_Building.jpg', view: 'outside' },
    'xs-las-vegas': { file: 'Encore,_Las_Vegas_Strip.jpg', view: 'outside' },
    'smartbar': { file: 'TheMetroChicagoJI1.jpg', view: 'outside' },
    'edc-kineticfield': { file: 'Electric_Daisy_Carnival_2011_-_Main_Stage.jpg', view: 'show' },
    'edc-circuitgrounds': { file: 'Electric_Daisy_Carnival_2011.jpg', view: 'show' },
    'coachella-sahara': { file: 'Coachella_2014_Week_2_Day_2_-_Sahara_Tent.jpg', view: 'show' },
    'ultra-main': { file: 'Panoramic_View_of_Bayfront_Park_during_the_2013_Ultra_Music_Festival_in_Miami,_Florida.jpg', view: 'show' },
    'ultra-resistance': { file: 'Panoramic_View_of_Bayfront_Park_during_the_2013_Ultra_Music_Festival_in_Miami,_Florida.jpg', view: 'show' },
    'ef-ranch-arena': { file: 'Electric_Forest_(29357092918).jpg', view: 'show' },
    'ef-sherwood-court': { file: 'Electric_Forest_(29357092918).jpg', view: 'show' },
    'lolla-perrys': { file: 'Lollapalooza_2015.JPG', view: 'show' },
    'movement-detroit': { file: 'Hart_Plaza_Detroit.jpg', view: 'site' },
    'crssd-city-steps': { file: 'Waterfront_Park,_San_Diego_County_Administration_Center_1.jpg', view: 'site' },
  };
  VENUES.forEach((v) => { if (PHOTOS[v.id]) v.photo = PHOTOS[v.id]; });

  if (typeof module !== 'undefined' && module.exports) module.exports = VENUES;
  else root.STAGE_VENUES = VENUES;
})(this);
