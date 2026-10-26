'use strict';
// A minimal server-side WebSocket (RFC 6455): handshake, outgoing frames, close handling.
// The bridge only pushes data to the browser, so incoming messages are ignored apart from close and ping.

const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function encodeFrame(payload, opcode) {
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([head, payload]);
}

class Client {
  constructor(socket) {
    this.socket = socket;
    this.open = true;
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => { this.open = false; });
    socket.on('error', () => { this.open = false; });
  }

  _onData(d) {
    const opcode = d[0] & 0x0f;
    if (opcode === 0x8) { this.close(); return; }
    if (opcode === 0x9) this._write(encodeFrame(Buffer.alloc(0), 0xa)); // pong
  }

  _write(buf) {
    if (!this.open) return;
    // Drop frames for slow clients rather than letting memory grow; DMX is resent continuously.
    if (this.socket.writableLength > 1 << 20) return;
    this.socket.write(buf);
  }

  sendText(str) { this._write(encodeFrame(Buffer.from(str, 'utf8'), 0x1)); }
  sendBinary(buf) { this._write(encodeFrame(buf, 0x2)); }

  close() {
    if (!this.open) return;
    this.open = false;
    try { this.socket.end(encodeFrame(Buffer.alloc(0), 0x8)); } catch (_) { /* already gone */ }
  }
}

// Completes the upgrade for an http 'upgrade' event and returns a Client, or null if the request is not a WebSocket.
function upgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
    '', '',
  ].join('\r\n'));
  socket.setNoDelay(true);
  return new Client(socket);
}

module.exports = { upgrade, encodeFrame, acceptKey };
