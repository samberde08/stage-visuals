#!/usr/bin/env node
'use strict';
// Sends a moving-light show over sACN so the bridge can be tested without a real console.
// Drives fixtures patched with the generic 16ch spot profile from universe 1, address 1.
//
//   node tools/fake-console.js [--fixtures 32] [--target 127.0.0.1] [--multicast] [--artnet]

const dgram = require('dgram');
const crypto = require('crypto');
const { buildSacn, buildArtnet, sacnMulticastGroup, SACN_PORT, ARTNET_PORT } = require('../bridge/dmx');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const fixtures = parseInt(opt('--fixtures', '32'), 10);
const target = opt('--target', '127.0.0.1');
const multicast = args.includes('--multicast');
const artnet = args.includes('--artnet');
const FOOTPRINT = 16;

const sock = dgram.createSocket('udp4');
const cid = crypto.randomBytes(16);
const universes = Math.ceil((fixtures * FOOTPRINT) / 512);
const frames = Array.from({ length: universes }, () => new Uint8Array(512));
let seq = 0;

function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}

function fill(t) {
  for (let i = 0; i < fixtures; i++) {
    const a = i * FOOTPRINT, f = frames[Math.floor(a / 512)], o = a % 512;
    const u = fixtures > 1 ? i / (fixtures - 1) : 0.5;
    // Pan stays near centre (pointing straight down) and swings; tilt fans out across the rig.
    const pan = 0.5 + 0.08 * Math.sin(t * 0.7 + i * 0.5);
    const tilt = 0.5 + (u - 0.5) * 0.25 * Math.sin(t * 0.9);
    const pan16 = Math.round(pan * 65535), tilt16 = Math.round(tilt * 65535);
    f[o] = pan16 >> 8; f[o + 1] = pan16 & 255;
    f[o + 2] = tilt16 >> 8; f[o + 3] = tilt16 & 255;
    const chase = (((t * 0.8 - u) % 1) + 1) % 1;
    f[o + 4] = Math.round(255 * (0.15 + 0.85 * Math.pow(1 - chase, 3)));
    f[o + 5] = 0; // shutter open
    const [r, g, b] = hsv((u * 0.6 + t * 0.05) % 1, 1, 1);
    f[o + 6] = Math.round(r * 255); f[o + 7] = Math.round(g * 255); f[o + 8] = Math.round(b * 255);
    f[o + 9] = 0;
    f[o + 10] = Math.round(60 + 60 * (0.5 + 0.5 * Math.sin(t * 0.5)));
  }
}

const t0 = Date.now();
setInterval(() => {
  fill((Date.now() - t0) / 1000);
  seq = (seq + 1) & 255;
  frames.forEach((data, k) => {
    const universe = k + 1;
    if (artnet) {
      sock.send(buildArtnet({ portAddress: universe - 1, data, sequence: seq }), ARTNET_PORT, target);
    } else {
      const pkt = buildSacn({ universe, data, source: 'Fake console', sequence: seq, cid });
      sock.send(pkt, SACN_PORT, multicast ? sacnMulticastGroup(universe) : target);
    }
  });
}, 23);
console.log(`Sending ${artnet ? 'Art-Net' : 'sACN'} for ${fixtures} fixtures on ${universes} universe(s) to ${multicast ? 'multicast' : target}. Ctrl+C to stop.`);
