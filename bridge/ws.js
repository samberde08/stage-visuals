'use strict';
// A minimal server-side WebSocket (RFC 6455): handshake, outgoing frames, and incoming (masked, possibly
// fragmented) messages. Browsers only receive; TouchDesigner sends video frames in.

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

const MAX_MESSAGE = 16 << 20;

class Client {
  constructor(socket) {
    this.socket = socket;
    this.open = true;
    this.onmessage = null; // (Buffer, isBinary) => void
    this._buf = Buffer.alloc(0);
    this._parts = [];
    this._partOp = 0;
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => { this.open = false; });
    socket.on('error', () => { this.open = false; });
  }

  _onData(d) {
    this._buf = this._buf.length ? Buffer.concat([this._buf, d]) : d;
    for (;;) {
      const b = this._buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, opcode = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, at = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); at = 10; }
      if (len > MAX_MESSAGE) { this.close(); return; }
      const need = at + (masked ? 4 : 0) + len;
      if (b.length < need) return;
      let payload = b.subarray(need - len, need);
      if (masked) {
        const key = b.subarray(at, at + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= key[i & 3];
      }
      this._buf = b.subarray(need);
      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this._write(encodeFrame(payload, 0xa)); continue; }
      if (opcode === 0xa) continue;
      if (opcode !== 0) { this._partOp = opcode; this._parts = []; }
      this._parts.push(payload);
      if (!fin) continue;
      const msg = this._parts.length === 1 ? this._parts[0] : Buffer.concat(this._parts);
      this._parts = [];
      if (this.onmessage) this.onmessage(msg, this._partOp === 0x2);
    }
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
