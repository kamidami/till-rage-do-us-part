const { spawn } = require('child_process');
const path = require('path');

const port = 3217;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
});

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function post(pathname, body) {
  const r = await fetch(base + pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 204) return { ok: true };
  return r.json();
}

async function openSSE(url) {
  const res = await fetch(url, { headers: { Accept: 'text/event-stream' } });
  if (!res.ok) throw new Error(`SSE failed ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const queue = [];
  let waiter = null;
  let running = true;

  (async () => {
    while (running) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
        let event = 'message', data = null;
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data = JSON.parse(line.slice(5).trim());
        }
        if (data !== null) {
          const item = { event, data };
          if (waiter) { const w = waiter; waiter = null; w(item); }
          else queue.push(item);
        }
      }
    }
  })().catch(() => {});

  return {
    async next(targetEvent, timeout = 2000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const item = queue.shift() || await new Promise((resolve, reject) => {
          const t = setTimeout(() => { if (waiter === resolve) waiter = null; reject(new Error(`Timeout waiting for ${targetEvent}`)); }, Math.max(50, deadline - Date.now()));
          waiter = (x) => { clearTimeout(t); resolve(x); };
        });
        if (item.event === targetEvent) return item.data;
      }
      throw new Error(`Timeout waiting for ${targetEvent}`);
    },
    close() { running = false; reader.cancel().catch(() => {}); }
  };
}

(async () => {
  let hostSSE, guestSSE;
  try {
    await wait(450);
    const health = await fetch(base + '/healthz').then(r => r.json());
    if (!health.ok) throw new Error('Health check failed');

    const created = await post('/api/rooms/create', { name: 'Kami' });
    if (!created.ok || !created.code || !created.token) throw new Error('Create failed');
    hostSSE = await openSSE(`${base}/api/rooms/${created.code}/events?token=${encodeURIComponent(created.token)}`);
    await hostSSE.next('room:state');

    const joined = await post('/api/rooms/join', { name: 'Partner', code: created.code });
    if (!joined.ok || joined.playerIndex !== 1) throw new Error('Join failed');
    guestSSE = await openSSE(`${base}/api/rooms/${created.code}/events?token=${encodeURIComponent(joined.token)}`);
    await guestSSE.next('room:state');
    const state = await hostSSE.next('room:state');
    if (!state.players[1] || state.players[1].name !== 'Partner') throw new Error('Room state did not sync');

    const startPromise = guestSSE.next('game:start');
    const started = await post(`/api/rooms/${created.code}/start`, { token: created.token, route: 'kitchen' });
    if (!started.ok) throw new Error('Start failed');
    const start = await startPromise;
    if (start.route !== 'kitchen') throw new Error('Start route mismatch');

    const inputPromise = hostSSE.next('player:input');
    await post(`/api/rooms/${created.code}/input`, { token: joined.token, code: 'KeyW', down: true });
    const input = await inputPromise;
    if (input.code !== 'KeyW' || input.down !== true) throw new Error('Input relay mismatch');

    const snapPromise = guestSSE.next('game:snapshot');
    await post(`/api/rooms/${created.code}/snapshot`, { token: created.token, snapshot: { tick: 7, players: [{ p: [1, 0, 2] }] } });
    const snap = await snapPromise;
    if (snap.tick !== 7) throw new Error('Snapshot relay mismatch');

    const flowH = hostSSE.next('game:flow');
    const flowG = guestSSE.next('game:flow');
    await post(`/api/rooms/${created.code}/flow`, { token: created.token, action: 'advanceStory' });
    const [fh, fg] = await Promise.all([flowH, flowG]);
    if (fh.action !== 'advanceStory' || fg.action !== 'advanceStory') throw new Error('Flow relay mismatch');

    console.log('MULTIPLAYER SMOKE TEST PASSED');
  } catch (err) {
    console.error(err.stack || err);
    process.exitCode = 1;
  } finally {
    hostSSE?.close(); guestSSE?.close();
    server.kill('SIGTERM');
    setTimeout(() => process.exit(process.exitCode || 0), 120);
  }
})();
