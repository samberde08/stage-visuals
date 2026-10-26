'use strict';
const test = require('node:test');
const assert = require('node:assert');
const dgram = require('dgram');
const net = require('net');
const crypto = require('crypto');
const { parseSacn, parseArtnet, buildSacn, buildArtnet, sacnMulticastGroup, Merger } = require('../bridge/dmx');
const { encodeFrame, acceptKey } = require('../bridge/ws');
const { start, parseRange } = require('../bridge/server');

const levels = () => { const d = new Uint8Array(512); for (let i = 0; i < 512; i++) d[i] = (i * 7) & 255; return d; };

test('sACN round trip keeps universe, levels, name and priority', () => {
  const data = levels();
  const pkt = parseSacn(buildSacn({ universe: 3, data, source: 'grandMA3 onPC', priority: 120, sequence: 9 }));
  assert.strictEqual(pkt.universe, 3);
  assert.strictEqual(pkt.source, 'grandMA3 onPC');
  assert.strictEqual(pkt.priority, 120);
  assert.strictEqual(pkt.sequence, 9);
  assert.deepStrictEqual(pkt.data, data);
});

test('sACN packet is 638 bytes with the E1.31 flags and lengths', () => {
  const buf = buildSacn({ universe: 1, data: new Uint8Array(512) });
  assert.strictEqual(buf.length, 638);
  assert.strictEqual(buf.readUInt16BE(16), 0x726e);
  assert.strictEqual(buf.readUInt16BE(38), 0x7258);
  assert.strictEqual(buf.readUInt16BE(115), 0x720b);
});

test('sACN with a non-zero start code or bad identifier is ignored', () => {
  const buf = buildSacn({ universe: 1, data: levels() });
  const alt = Buffer.from(buf); alt[125] = 0xdd;
  assert.strictEqual(parseSacn(alt), null);
  const bad = Buffer.from(buf); bad[5] = 0;
  assert.strictEqual(parseSacn(bad), null);
  assert.strictEqual(parseSacn(Buffer.alloc(20)), null);
});

test('short sACN frames are zero padded', () => {
  const buf = buildSacn({ universe: 1, data: levels() });
  buf.writeUInt16BE(1 + 24, 123);
  const pkt = parseSacn(buf.subarray(0, 126 + 24));
  assert.strictEqual(pkt.data[23], (23 * 7) & 255);
  assert.strictEqual(pkt.data[24], 0);
});

test('Art-Net round trip maps port-address 0 to universe 1', () => {
  const data = levels();
  const pkt = parseArtnet(buildArtnet({ portAddress: 0, data }));
  assert.strictEqual(pkt.universe, 1);
  assert.deepStrictEqual(pkt.data, data);
  assert.strictEqual(parseArtnet(buildArtnet({ portAddress: 0x0102, data }), 0).universe, 0x0102);
});

test('multicast group follows E1.31 addressing', () => {
  assert.strictEqual(sacnMulticastGroup(1), '239.255.0.1');
  assert.strictEqual(sacnMulticastGroup(258), '239.255.1.2');
});

test('merger: higher priority wins, then the source times out', () => {
  const m = new Merger(1000);
  const a = new Uint8Array(512).fill(10), b = new Uint8Array(512).fill(200);
  m.accept({ proto: 'sACN', cid: 'a', source: 'Backup', universe: 1, priority: 50, data: a }, 0);
  m.accept({ proto: 'sACN', cid: 'b', source: 'Main', universe: 1, priority: 100, data: b }, 10);
  assert.strictEqual(m.frames(20).get(1)[0], 200);
  m.accept({ proto: 'sACN', cid: 'a', source: 'Backup', universe: 1, priority: 50, data: a }, 1500);
  assert.strictEqual(m.frames(1500).get(1)[0], 10);
  m.accept({ proto: 'sACN', cid: 'a', source: 'Backup', universe: 1, priority: 50, data: a, terminated: true }, 1600);
  assert.strictEqual(m.frames(1600).size, 0);
});

test('preview packets are not shown', () => {
  const m = new Merger();
  assert.strictEqual(m.accept({ proto: 'sACN', source: 'x', universe: 1, priority: 100, data: new Uint8Array(512), preview: true }), false);
});

test('websocket helpers match RFC 6455', () => {
  assert.strictEqual(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  const f = encodeFrame(Buffer.alloc(514), 0x2);
  assert.strictEqual(f[0], 0x82);
  assert.strictEqual(f[1], 126);
  assert.strictEqual(f.readUInt16BE(2), 514);
  assert.strictEqual(f.length, 518);
});

test('parseRange expands universe lists', () => {
  assert.deepStrictEqual(parseRange('1-3,7'), [1, 2, 3, 7]);
});

test('bridge forwards unicast sACN to a websocket client', async () => {
  const bridge = start({ port: 0, host: '127.0.0.1', universes: [1], artnet: false, artnetOffset: 1, quiet: true });
  await new Promise((r) => bridge.server.once('listening', r));
  const port = bridge.server.address().port;

  const sock = net.connect(port, '127.0.0.1');
  const key = crypto.randomBytes(16).toString('base64');
  sock.write(`GET /dmx HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);

  const data = levels();
  const udp = dgram.createSocket('udp4');
  const timer = setInterval(() => udp.send(buildSacn({ universe: 1, data, source: 'Test desk' }), 5568, '127.0.0.1'), 20);

  const got = await new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const to = setTimeout(() => reject(new Error('no DMX frame received')), 3000);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const at = buf.indexOf('\r\n\r\n');
      if (at < 0) return;
      let p = at + 4;
      while (p + 2 <= buf.length) {
        const op = buf[p] & 0x0f; let len = buf[p + 1] & 0x7f, h = 2;
        if (len === 126) { len = buf.readUInt16BE(p + 2); h = 4; }
        if (p + h + len > buf.length) break;
        const payload = buf.subarray(p + h, p + h + len);
        if (op === 0x2) { clearTimeout(to); resolve(payload); return; }
        p += h + len;
      }
    });
  });
  clearInterval(timer); udp.close(); sock.destroy();
  assert.strictEqual(got.readUInt16BE(0), 1);
  assert.deepStrictEqual(new Uint8Array(got.subarray(2)), data);
  const st = bridge.merger.status();
  assert.strictEqual(st[0].name, 'Test desk');
  await bridge.close();
});

function clientFrame(payload, opcode, fin = true) {
  const key = crypto.randomBytes(4), len = payload.length;
  const head = len < 126 ? Buffer.from([0, 0x80 | len]) : Buffer.from([0, 0x80 | 126, len >> 8, len & 255]);
  head[0] = (fin ? 0x80 : 0) | opcode;
  const body = Buffer.from(payload); for (let i = 0; i < body.length; i++) body[i] ^= key[i & 3];
  return Buffer.concat([head, key, body]);
}
function wsConnect(port, path) {
  const sock = net.connect(port, '127.0.0.1');
  sock.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  return new Promise((resolve) => { let b = Buffer.alloc(0); const on = (d) => { b = Buffer.concat([b, d]); const at = b.indexOf('\r\n\r\n'); if (at >= 0) { sock.off('data', on); resolve({ sock, rest: b.subarray(at + 4) }); } }; sock.on('data', on); });
}

test('bridge relays a fragmented TouchDesigner JPEG frame to /video viewers', async () => {
  const bridge = start({ port: 0, host: '127.0.0.1', universes: [1], artnet: false, artnetOffset: 1, quiet: true });
  await new Promise((r) => bridge.server.once('listening', r));
  const port = bridge.server.address().port;
  const viewer = await wsConnect(port, '/video');
  const td = await wsConnect(port, '/');
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(300)]);
  const got = new Promise((resolve, reject) => {
    let buf = viewer.rest; const to = setTimeout(() => reject(new Error('no video frame')), 3000);
    const check = () => {
      if (buf.length < 4) return;
      let len = buf[1] & 0x7f, h = 2; if (len === 126) { len = buf.readUInt16BE(2); h = 4; }
      if (buf.length >= h + len) { clearTimeout(to); resolve({ op: buf[0] & 0x0f, data: buf.subarray(h, h + len) }); }
    };
    viewer.sock.on('data', (d) => { buf = Buffer.concat([buf, d]); check(); });
  });
  // Two fragments, split across TCP writes, plus a text message that must be ignored.
  td.sock.write(clientFrame(Buffer.from('hello'), 0x1));
  const a = clientFrame(jpeg.subarray(0, 100), 0x2, false), b = clientFrame(jpeg.subarray(100), 0x0, true);
  td.sock.write(a.subarray(0, 50)); setTimeout(() => td.sock.write(Buffer.concat([a.subarray(50), b])), 30);
  const f = await got;
  assert.strictEqual(f.op, 0x2);
  assert.deepStrictEqual(f.data, jpeg);
  viewer.sock.destroy(); td.sock.destroy();
  await bridge.close();
});
