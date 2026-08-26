/* Servidor sin dependencias: entrega los archivos y sincroniza una partida LAN por WebSocket. */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function send(socket, data) {
  if (socket.destroyed) return;
  const body = Buffer.from(JSON.stringify(data));
  let header;
  if (body.length < 126) header = Buffer.from([0x81, body.length]);
  else if (body.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(body.length, 2); }
  else return;
  socket.write(Buffer.concat([header, body]));
}

function leave(client) {
  if (!client.room) return;
  const room = rooms.get(client.room);
  if (room) {
    if (room.host === client) room.host = null;
    if (room.guest === client) room.guest = null;
    const other = room.host || room.guest;
    if (other) send(other.socket, { type: 'peerLeft' });
    if (!room.host && !room.guest) rooms.delete(client.room);
  }
  client.room = null; client.role = null;
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do { code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); } while (rooms.has(code));
  return code;
}

function handle(client, message) {
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'createRoom') {
    leave(client);
    const roomName = randomCode();
    rooms.set(roomName, { host: client, guest: null });
    client.room = roomName; client.role = 'host';
    return send(client.socket, { type: 'registered', role: 'host', room: roomName });
  }
  if (message.type === 'joinRoom') {
    const roomName = String(message.room || '').toUpperCase();
    const room = rooms.get(roomName);
    if (!room || !room.host) return send(client.socket, { type: 'error', message: 'La sala no existe o ya se cerró.' });
    if (room.guest) return send(client.socket, { type: 'error', message: 'La sala ya tiene dos jugadores.' });
    leave(client); room.guest = client; client.room = roomName; client.role = 'guest';
    send(client.socket, { type: 'registered', role: 'guest', room: roomName });
    return send(room.host.socket, { type: 'peer' });
  }
  const room = rooms.get(client.room);
  if (!room) return;
  if (message.type === 'start' && client.role === 'host' && room.guest) {
    send(room.host.socket, { type: 'start' }); send(room.guest.socket, { type: 'start' }); return;
  }
  if (message.type === 'state' && client.role === 'host' && room.guest) return send(room.guest.socket, { type: 'state', snapshot: message.snapshot });
  if (message.type === 'input' && client.role === 'guest' && room.host) return send(room.host.socket, { type: 'input', input: message.input });
}

const server = http.createServer((req, res) => {
  const requested = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('No encontrado'); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const client = { socket, room: null, role: null, buffer: Buffer.alloc(0) };
  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    while (client.buffer.length >= 2) {
      const opcode = client.buffer[0] & 0x0f;
      const masked = Boolean(client.buffer[1] & 0x80);
      let size = client.buffer[1] & 0x7f;
      let offset = 2;
      if (size === 126) {
        if (client.buffer.length < 4) return;
        size = client.buffer.readUInt16BE(2); offset = 4;
      }
      if (size === 127 || !masked || client.buffer.length < offset + 4 + size) return;
      const mask = client.buffer.subarray(offset, offset + 4), data = client.buffer.subarray(offset + 4, offset + 4 + size), decoded = Buffer.alloc(size);
      for (let i = 0; i < size; i++) decoded[i] = data[i] ^ mask[i % 4];
      client.buffer = client.buffer.subarray(offset + 4 + size);
      if (opcode === 8) { socket.end(); return; }
      if (opcode === 9) { socket.write(Buffer.from([0x8a, 0])); continue; }
      if (opcode === 1) try { handle(client, JSON.parse(decoded.toString('utf8'))); } catch {}
    }
  });
  socket.on('close', () => leave(client));
  socket.on('error', () => leave(client));
});

server.listen(port, '0.0.0.0', () => console.log(`Crónicas de Nova & Byte: http://localhost:${port}`));
