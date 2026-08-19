const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function noContent(res) { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); }
function cleanName(value, fallback) {
  const text = String(value || '').replace(/[<>]/g, '').trim().slice(0, 14);
  return text || fallback;
}
function cleanProfile(value) {
  const p = value && typeof value === 'object' ? value : {};
  const skins = new Set(['fair', 'warm', 'medium', 'brown', 'deep']);
  const outfits = new Set(['casual', 'kurta', 'salwar']);
  return {
    skin: skins.has(p.skin) ? p.skin : 'warm',
    outfit: outfits.has(p.outfit) ? p.outfit : 'casual',
    dupatta: !!p.dupatta,
    sunflower: p.sunflower !== false
  };
}
function token() { return crypto.randomBytes(18).toString('base64url'); }
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let tries = 0; tries < 200; tries += 1) {
    let code = '';
    for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
}
function roomState(room) {
  return {
    code: room.code,
    started: room.started,
    players: [
      room.host ? { name: room.host.name, profile: room.host.profile, connected: true, playerIndex: 0 } : null,
      room.guest ? { name: room.guest.name, profile: room.guest.profile, connected: true, playerIndex: 1 } : null
    ]
  };
}
function playerForToken(room, value) {
  if (!room || !value) return null;
  if (room.host?.token === value) return { ...room.host, index: 0, role: 'host' };
  if (room.guest?.token === value) return { ...room.guest, index: 1, role: 'guest' };
  return null;
}
function sseWrite(res, event, data) {
  if (!res || res.destroyed || res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function emitTo(room, target, event, data) {
  if (!room) return;
  if (target === 'all' || target === 'host') for (const res of room.streams.host) sseWrite(res, event, data);
  if (target === 'all' || target === 'guest') for (const res of room.streams.guest) sseWrite(res, event, data);
}
function emitRoomState(room) { emitTo(room, 'all', 'room:state', roomState(room)); }

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2_000_000) { reject(new Error('Payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function staticFile(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR)) return false;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store, max-age=0, must-revalidate'
    });
    fs.createReadStream(file).pipe(res);
    return true;
  } catch (_) { return false; }
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });

  if (req.method === 'POST' && url.pathname === '/api/rooms/create') {
    const body = await readJson(req);
    const code = makeCode();
    const hostToken = token();
    const room = {
      code,
      host: { name: cleanName(body.name, 'You'), profile: cleanProfile(body.profile), token: hostToken },
      guest: null,
      started: false,
      streams: { host: new Set(), guest: new Set() },
      createdAt: Date.now(), lastActivity: Date.now()
    };
    rooms.set(code, room);
    return json(res, 200, { ok: true, code, token: hostToken, playerIndex: 0, state: roomState(room) });
  }

  if (req.method === 'POST' && url.pathname === '/api/rooms/join') {
    const body = await readJson(req);
    const code = String(body.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return json(res, 404, { ok: false, error: 'Room not found. Check the code.' });
    if (room.started) return json(res, 409, { ok: false, error: 'This room already started.' });
    if (room.guest) return json(res, 409, { ok: false, error: 'This room already has two players.' });
    const guestToken = token();
    room.guest = { name: cleanName(body.name, 'Her'), profile: cleanProfile(body.profile), token: guestToken };
    room.lastActivity = Date.now();
    emitRoomState(room);
    return json(res, 200, { ok: true, code, token: guestToken, playerIndex: 1, state: roomState(room) });
  }

  const eventMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{5})\/events$/);
  if (req.method === 'GET' && eventMatch) {
    const room = rooms.get(eventMatch[1]);
    const who = playerForToken(room, url.searchParams.get('token'));
    if (!room || !who) return json(res, 403, { ok: false, error: 'Invalid room session.' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    const set = who.role === 'host' ? room.streams.host : room.streams.guest;
    set.add(res);
    sseWrite(res, 'room:state', roomState(room));
    const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15000);
    req.on('close', () => { clearInterval(keepAlive); set.delete(res); });
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{5})\/(start|flow|input|snapshot|fx|leave)$/);
  if (req.method === 'POST' && actionMatch) {
    const code = actionMatch[1], action = actionMatch[2];
    const room = rooms.get(code);
    if (!room) return json(res, 404, { ok: false, error: 'Room not found.' });
    const body = await readJson(req);
    const who = playerForToken(room, body.token);
    if (!who) return json(res, 403, { ok: false, error: 'Invalid room session.' });
    room.lastActivity = Date.now();

    if (action === 'start') {
      if (who.role !== 'host') return json(res, 403, { ok: false, error: 'Only the host can start.' });
      if (!room.guest) return json(res, 409, { ok: false, error: 'Wait for your partner to join.' });
      room.started = true;
      const route = ['full', 'kitchen', 'rain', 'quiz'].includes(body.route) ? body.route : 'full';
      emitTo(room, 'all', 'game:start', { names: [room.host.name, room.guest.name], profiles: [room.host.profile, room.guest.profile], route, startedAt: Date.now() });
      return json(res, 200, { ok: true });
    }
    if (action === 'flow') {
      if (who.role !== 'host' || !room.started) return json(res, 403, { ok: false });
      emitTo(room, 'all', 'game:flow', { action: String(body.action || ''), data: body.data || null });
      return noContent(res);
    }
    if (action === 'input') {
      if (who.role !== 'guest' || !room.started) return json(res, 403, { ok: false });
      const allowed = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyE', 'KeyF']);
      if (allowed.has(body.code)) emitTo(room, 'host', 'player:input', { code: body.code, down: !!body.down });
      return noContent(res);
    }
    if (action === 'snapshot') {
      if (who.role !== 'host' || !room.started) return json(res, 403, { ok: false });
      emitTo(room, 'guest', 'game:snapshot', body.snapshot || {});
      return noContent(res);
    }
    if (action === 'fx') {
      if (who.role !== 'host' || !room.started) return json(res, 403, { ok: false });
      emitTo(room, 'guest', 'game:fx', body.payload || {});
      return noContent(res);
    }
    if (action === 'leave') {
      if (who.role === 'host') {
        emitTo(room, 'guest', 'room:closed', { reason: 'The host left the room.' });
        rooms.delete(code);
      } else {
        room.guest = null;
        room.started = false;
        emitRoomState(room);
      }
      return noContent(res);
    }
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
      const handled = await api(req, res, url);
      if (handled === false && !res.writableEnded) json(res, 404, { ok: false, error: 'Not found' });
      return;
    }
    if (!staticFile(req, res, url)) json(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    console.error(err);
    if (!res.writableEnded) json(res, 500, { ok: false, error: 'Server error' });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 2 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Till Rage online server: http://0.0.0.0:${PORT}`));
