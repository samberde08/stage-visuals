'use strict';
// Parsers and builders for the two DMX-over-IP protocols the bridge accepts:
// sACN (ANSI E1.31) and Art-Net (ArtDmx). Kept free of I/O so they can be unit tested.

const ACN_ID = Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00]);
const ARTNET_ID = Buffer.from('Art-Net\0', 'ascii');
const SACN_PORT = 5568;
const ARTNET_PORT = 6454;

// Returns { proto, universe, data, source, priority, sequence, terminated } or null.
function parseSacn(buf) {
  if (buf.length < 126) return null;
  if (!buf.subarray(4, 16).equals(ACN_ID)) return null;
  if (buf.readUInt32BE(18) !== 0x00000004) return null; // root vector: E1.31 data
  if (buf.readUInt32BE(40) !== 0x00000002) return null; // framing vector: DMP
  if (buf[117] !== 0x02) return null; // DMP set property
  const count = buf.readUInt16BE(123);
  if (buf[125] !== 0x00) return null; // only the null start code carries levels
  const slots = Math.min(512, count - 1, buf.length - 126);
  if (slots < 0) return null;
  const data = new Uint8Array(512);
  data.set(buf.subarray(126, 126 + slots));
  const name = buf.subarray(44, 108);
  const end = name.indexOf(0);
  const options = buf[112];
  return {
    proto: 'sACN',
    universe: buf.readUInt16BE(113),
    data,
    source: name.subarray(0, end < 0 ? 64 : end).toString('utf8') || 'sACN source',
    cid: buf.subarray(22, 38).toString('hex'),
    priority: buf[108],
    sequence: buf[111],
    preview: !!(options & 0x80),
    terminated: !!(options & 0x40),
  };
}

// universeOffset maps the Art-Net port-address onto the bridge's 1-based universe numbers.
// Most consoles call Art-Net 0:0:0 "universe 1", so the default offset is 1.
function parseArtnet(buf, universeOffset = 1) {
  if (buf.length < 18) return null;
  if (!buf.subarray(0, 8).equals(ARTNET_ID)) return null;
  if (buf.readUInt16LE(8) !== 0x5000) return null; // OpDmx
  const len = Math.min(512, buf.readUInt16BE(16), buf.length - 18);
  const data = new Uint8Array(512);
  data.set(buf.subarray(18, 18 + len));
  const portAddress = ((buf[15] & 0x7f) << 8) | buf[14];
  return { proto: 'Art-Net', universe: portAddress + universeOffset, data, source: 'Art-Net', priority: 100, sequence: buf[12], preview: false, terminated: false };
}

function sacnMulticastGroup(universe) {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;
}

function buildSacn({ universe, data, source = 'Stage Visuals', priority = 100, sequence = 0, cid, terminated = false }) {
  const buf = Buffer.alloc(638);
  buf.writeUInt16BE(0x0010, 0);
  buf.writeUInt16BE(0x0000, 2);
  ACN_ID.copy(buf, 4);
  buf.writeUInt16BE(0x7000 | (638 - 16), 16);
  buf.writeUInt32BE(0x00000004, 18);
  (cid || Buffer.alloc(16, 0x5a)).copy(buf, 22);
  buf.writeUInt16BE(0x7000 | (638 - 38), 38);
  buf.writeUInt32BE(0x00000002, 40);
  buf.write(source.slice(0, 63), 44, 'utf8');
  buf[108] = priority;
  buf.writeUInt16BE(0, 109);
  buf[111] = sequence & 0xff;
  buf[112] = terminated ? 0x40 : 0;
  buf.writeUInt16BE(universe, 113);
  buf.writeUInt16BE(0x7000 | (638 - 115), 115);
  buf[117] = 0x02;
  buf[118] = 0xa1;
  buf.writeUInt16BE(0x0000, 119);
  buf.writeUInt16BE(0x0001, 121);
  buf.writeUInt16BE(513, 123);
  buf[125] = 0x00;
  Buffer.from(data.buffer, data.byteOffset, Math.min(512, data.length)).copy(buf, 126);
  return buf;
}

function buildArtnet({ portAddress, data, sequence = 0 }) {
  const buf = Buffer.alloc(18 + 512);
  ARTNET_ID.copy(buf, 0);
  buf.writeUInt16LE(0x5000, 8);
  buf.writeUInt16BE(14, 10);
  buf[12] = sequence & 0xff;
  buf[13] = 0;
  buf[14] = portAddress & 0xff;
  buf[15] = (portAddress >> 8) & 0x7f;
  buf.writeUInt16BE(512, 16);
  Buffer.from(data.buffer, data.byteOffset, Math.min(512, data.length)).copy(buf, 18);
  return buf;
}

// Per-universe source arbitration: the highest sACN priority wins, the most recent packet breaks ties.
// A source drops out after it goes quiet for `timeoutMs` (E1.31 network data loss is 2.5 s) or sends a terminate.
class Merger {
  constructor(timeoutMs = 2500) {
    this.timeoutMs = timeoutMs;
    this.sources = new Map(); // key -> { key, name, proto, universe, priority, data, last, count }
  }

  accept(pkt, now = Date.now()) {
    if (pkt.preview) return false;
    const key = `${pkt.proto}:${pkt.cid || pkt.source}:${pkt.universe}`;
    if (pkt.terminated) { this.sources.delete(key); return true; }
    const s = this.sources.get(key) || { key, name: pkt.source, proto: pkt.proto, universe: pkt.universe, count: 0, first: now };
    Object.assign(s, { priority: pkt.priority, data: pkt.data, last: now });
    s.count++;
    this.sources.set(key, s);
    return true;
  }

  prune(now = Date.now()) {
    for (const [k, s] of this.sources) if (now - s.last > this.timeoutMs) this.sources.delete(k);
  }

  // Map universe -> winning 512-byte frame.
  frames(now = Date.now()) {
    this.prune(now);
    const best = new Map();
    for (const s of this.sources.values()) {
      const b = best.get(s.universe);
      if (!b || s.priority > b.priority || (s.priority === b.priority && s.last > b.last)) best.set(s.universe, s);
    }
    const out = new Map();
    for (const [u, s] of best) out.set(u, s.data);
    return out;
  }

  status(now = Date.now()) {
    this.prune(now);
    return [...this.sources.values()].map((s) => ({
      name: s.name, proto: s.proto, universe: s.universe, priority: s.priority,
      pps: Math.round(s.count / Math.max(1, (now - s.first) / 1000)),
    }));
  }
}

module.exports = { parseSacn, parseArtnet, buildSacn, buildArtnet, sacnMulticastGroup, Merger, SACN_PORT, ARTNET_PORT };
