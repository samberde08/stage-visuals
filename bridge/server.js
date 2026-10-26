#!/usr/bin/env node
'use strict';
// Stage Visuals bridge: receives sACN and Art-Net from a lighting console over UDP,
// serves the visualizer page, and streams the merged DMX to it over a WebSocket.
//
//   node bridge/server.js [--port 8080] [--host 127.0.0.1] [--universes 1-4]
//                         [--iface 192.168.1.20] [--artnet-offset 1] [--no-artnet]

const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseSacn, parseArtnet, sacnMulticastGroup, Merger, SACN_PORT, ARTNET_PORT } = require('./dmx');
const ws = require('./ws');

function parseArgs(argv) {
  const opts = { port: 8080, host: '127.0.0.1', universes: [1, 2, 3, 4], iface: undefined, artnetOffset: 1, artnet: true, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--port') opts.port = parseInt(next(), 10);
    else if (a === '--host') opts.host = next();
    else if (a === '--iface') opts.iface = next();
    else if (a === '--artnet-offset') opts.artnetOffset = parseInt(next(), 10);
    else if (a === '--no-artnet') opts.artnet = false;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--universes') opts.universes = parseRange(next());
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 7).join('\n')); process.exit(0); }
    else throw new Error(`Unknown option ${a}`);
  }
  return opts;
}

function parseRange(s) {
  const out = [];
  for (const part of String(s).split(',')) {
    const [a, b] = part.split('-').map((n) => parseInt(n, 10));
    for (let u = a; u <= (b || a); u++) if (u >= 1 && u <= 63999) out.push(u);
  }
  return out;
}

const PAGE = path.join(__dirname, '..', 'app', 'stage.html');
// The visualizer source is a body fragment (the same file is published as a claude.ai artifact),
// so the bridge wraps it in a document and flags that live DMX is available.
function renderPage() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>:root{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}</style>' +
    '<script>window.STAGE_BRIDGE={version:1}</script></head><body>' +
    fs.readFileSync(PAGE, 'utf8') + '</body></html>';
}

function start(opts) {
  const log = opts.quiet ? () => {} : (...a) => console.log(...a);
  const merger = new Merger();
  const clients = new Set();
  const sockets = [];
  const dirty = new Set();
  const seen = new Set();

  function onPacket(pkt) {
    if (!pkt || !merger.accept(pkt)) return;
    dirty.add(pkt.universe);
    const k = `${pkt.proto}:${pkt.source}:${pkt.universe}`;
    if (!seen.has(k)) { seen.add(k); log(`Receiving ${pkt.proto} universe ${pkt.universe} from "${pkt.source}" (priority ${pkt.priority})`); }
  }

  const sacn = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sacn.on('message', (msg) => onPacket(parseSacn(msg)));
  sacn.on('error', (e) => log(`sACN socket error: ${e.message}`));
  sacn.bind(SACN_PORT, () => {
    for (const u of opts.universes) {
      try { sacn.addMembership(sacnMulticastGroup(u), opts.iface); }
      catch (e) { log(`Could not join multicast for universe ${u} (${e.message}); unicast sACN still works.`); }
    }
    log(`sACN: listening on UDP ${SACN_PORT}, multicast universes ${opts.universes.join(', ')}`);
  });
  sockets.push(sacn);

  if (opts.artnet) {
    const art = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    art.on('message', (msg) => onPacket(parseArtnet(msg, opts.artnetOffset)));
    art.on('error', (e) => log(`Art-Net socket error: ${e.message} (another Art-Net app may be using port ${ARTNET_PORT}; try --no-artnet)`));
    art.bind(ARTNET_PORT, () => { try { art.setBroadcast(true); } catch (_) { /* not needed to receive */ } log(`Art-Net: listening on UDP ${ARTNET_PORT} (port-address 0 = universe ${opts.artnetOffset})`); });
    sockets.push(art);
  }

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(renderPage());
    } else if (url === '/status.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ sources: merger.status(), clients: clients.size }));
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  });
  server.on('upgrade', (req, socket) => {
    if (req.url !== '/dmx') { socket.destroy(); return; }
    const c = ws.upgrade(req, socket);
    if (!c) return;
    clients.add(c);
    socket.on('close', () => clients.delete(c));
    c.sendText(JSON.stringify({ sources: merger.status() }));
    for (const [u, data] of merger.frames()) c.sendBinary(frame(u, data));
  });
  server.listen(opts.port, opts.host, () => log(`Visualizer: http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${server.address().port}`));

  // Push changed universes at ~44 Hz, the DMX refresh rate most consoles use.
  const push = setInterval(() => {
    if (!dirty.size) return;
    const frames = merger.frames();
    for (const u of dirty) {
      const data = frames.get(u);
      if (!data) continue;
      const msg = frame(u, data);
      for (const c of clients) c.sendBinary(msg);
    }
    dirty.clear();
  }, 23);
  const status = setInterval(() => {
    const msg = JSON.stringify({ sources: merger.status() });
    for (const c of clients) c.sendText(msg);
  }, 1000);

  return {
    server,
    merger,
    close() {
      clearInterval(push); clearInterval(status);
      for (const c of clients) c.close();
      sockets.forEach((s) => s.close());
      return new Promise((r) => server.close(r));
    },
  };
}

function frame(universe, data) {
  const buf = Buffer.alloc(2 + 512);
  buf.writeUInt16BE(universe, 0);
  Buffer.from(data.buffer, data.byteOffset, 512).copy(buf, 2);
  return buf;
}

if (require.main === module) start(parseArgs(process.argv.slice(2)));

module.exports = { start, parseArgs, parseRange };
