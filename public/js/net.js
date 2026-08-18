(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  const NET = {
    online: true,
    isHost: false,
    playerIndex: null,
    roomCode: null,
    roomToken: null,
    roomState: null,
    started: false,
    connected: false,
    route: 'full',
    events: null,
    snapshotTimer: null,
    async post(path, payload = {}) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 204) return { ok: true };
      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid server response' }));
      if (!res.ok && data.ok !== false) data.ok = false;
      return data;
    },
    sendInput(code, down) {
      if (!this.online || this.isHost || !this.started || !this.roomCode || !this.roomToken) return;
      this.post(`/api/rooms/${this.roomCode}/input`, { token: this.roomToken, code, down: !!down }).catch(() => {});
    },
    sendFlow(action, data = null) {
      if (!this.online || !this.isHost || !this.started) return;
      this.post(`/api/rooms/${this.roomCode}/flow`, { token: this.roomToken, action, data }).catch(() => {});
    },
    sendFx(type, data = {}) {
      if (!this.online || !this.isHost || !this.started) return;
      this.post(`/api/rooms/${this.roomCode}/fx`, { token: this.roomToken, payload: { type, data } }).catch(() => {});
    }
  };
  window.NET = NET;

  function gameSyncReady(fn, tries = 100) {
    if (window.GameSync) return fn(window.GameSync);
    if (tries <= 0) return;
    setTimeout(() => gameSyncReady(fn, tries - 1), 50);
  }

  function setConnection(text, kind) {
    const el = $('connection-state');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('connecting', 'online', 'offline');
    el.classList.add(kind);
  }

  function setLobbyState(state) {
    NET.roomState = state;
    if (!state) return;
    $('room-code-display').textContent = state.code || NET.roomCode || '-----';
    const p1 = state.players?.[0], p2 = state.players?.[1];
    $('online-p1').textContent = p1?.name || 'Waiting…';
    $('online-p2').textContent = p2?.name || 'Waiting for partner…';
    $('online-p1-state').textContent = p1 ? '●' : '○';
    $('online-p2-state').textContent = p2 ? '●' : '○';
    if (NET.isHost) {
      $('host-start-controls').classList.remove('hidden');
      $('guest-waiting').classList.add('hidden');
      const start = $('online-start-btn');
      if (p2) {
        start.disabled = false;
        start.textContent = 'START THE CURSED DATE ♥';
        $('room-message').textContent = `${p2.name} joined. Choose a starting level and begin.`;
      } else {
        start.disabled = true;
        start.textContent = 'WAITING FOR PARTNER…';
        $('room-message').textContent = 'Send the room code to your partner.';
      }
    } else {
      $('host-start-controls').classList.add('hidden');
      $('guest-waiting').classList.remove('hidden');
      $('room-message').textContent = p1 ? `${p1.name} is the host. Waiting for them to start.` : 'Waiting for host…';
    }
  }

  function enterRoom(result) {
    NET.roomCode = result.code;
    NET.roomToken = result.token;
    NET.playerIndex = result.playerIndex;
    NET.isHost = result.playerIndex === 0;
    $('lobby-entry').classList.add('hidden');
    $('room-lobby').classList.remove('hidden');
    setLobbyState(result.state);
    connectEventStream();
  }

  function connectEventStream() {
    if (!NET.roomCode || !NET.roomToken) return;
    if (NET.events) NET.events.close();
    const es = new EventSource(`/api/rooms/${NET.roomCode}/events?token=${encodeURIComponent(NET.roomToken)}`);
    NET.events = es;
    es.onopen = () => {
      NET.connected = true;
      setConnection('● Private room connected', 'online');
      const badge = $('network-badge');
      badge?.classList.remove('warn', 'bad');
    };
    es.onerror = () => {
      NET.connected = false;
      setConnection('● Reconnecting to private room…', 'offline');
      const badge = $('network-badge');
      if (badge) { badge.classList.add('warn'); badge.textContent = 'RECONNECTING…'; }
    };
    const on = (event, handler) => es.addEventListener(event, (e) => {
      try { handler(JSON.parse(e.data)); } catch (err) { console.warn('network event parse failed', event, err); }
    });

    on('room:state', setLobbyState);
    on('room:closed', (payload) => { alert(payload?.reason || 'Room closed.'); window.location.reload(); });
    on('game:start', (payload) => {
      NET.started = true;
      $('online-screen').classList.remove('active');
      configureClientControls();
      gameSyncReady((game) => {
        game.startOnlineSession(payload);
        startSnapshotLoop();
      });
    });
    on('game:flow', ({ action, data }) => gameSyncReady((game) => game.runFlow(action, data)));
    on('player:input', ({ code, down }) => {
      if (NET.isHost) gameSyncReady((game) => game.handleRemoteInput(code, down));
    });
    on('game:snapshot', (snapshot) => {
      if (!NET.isHost) gameSyncReady((game) => game.applySnapshot(snapshot));
    });
    on('game:fx', (payload) => {
      if (!NET.isHost) gameSyncReady((game) => game.applyFx(payload));
    });
  }

  function configureClientControls() {
    const pill = document.querySelector('.controls-pill');
    if (pill) pill.textContent = 'MOVE: WASD / ARROWS  •  E: interact  •  HER: F = cute spank  •  PARTNER ONLINE';
    const p1kbd = document.querySelector('#p1-action-card kbd');
    const p2kbd = document.querySelector('#p2-action-card kbd');
    const p1q = document.querySelector('.p1-private span');
    const p2q = document.querySelector('.p2-private span');
    if (NET.isHost) {
      if (p1kbd) p1kbd.textContent = 'E';
      if (p2kbd) p2kbd.textContent = 'ONLINE';
      if (p1q) p1q.textContent = 'W = 1 · A = 2 · S = 3 · D = 4';
      if (p2q) p2q.textContent = 'Partner chooses on their laptop';
    } else {
      if (p1kbd) p1kbd.textContent = 'PARTNER';
      if (p2kbd) p2kbd.textContent = 'E';
      if (p1q) p1q.textContent = 'Partner chooses on their laptop';
      if (p2q) p2q.textContent = 'W = 1 · A = 2 · S = 3 · D = 4';
    }
    let badge = $('network-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'network-badge';
      badge.className = 'network-badge';
      document.body.appendChild(badge);
    }
    badge.textContent = `${NET.isHost ? 'HOST' : 'PARTNER'} · ROOM ${NET.roomCode}`;
  }

  function startSnapshotLoop() {
    clearInterval(NET.snapshotTimer);
    if (!NET.online || !NET.isHost || !NET.started) return;
    let busy = false;
    NET.snapshotTimer = setInterval(async () => {
      if (busy || !window.GameSync?.getSnapshot || !NET.connected) return;
      busy = true;
      try {
        await NET.post(`/api/rooms/${NET.roomCode}/snapshot`, {
          token: NET.roomToken,
          snapshot: window.GameSync.getSnapshot()
        });
      } catch (_) {} finally { busy = false; }
    }, 90);
  }

  async function leaveRoom() {
    if (NET.roomCode && NET.roomToken) {
      try { await NET.post(`/api/rooms/${NET.roomCode}/leave`, { token: NET.roomToken }); } catch (_) {}
    }
    NET.events?.close();
    NET.events = null;
    NET.roomCode = null; NET.roomToken = null; NET.playerIndex = null; NET.isHost = false; NET.started = false;
    clearInterval(NET.snapshotTimer);
    $('room-lobby').classList.add('hidden');
    $('lobby-entry').classList.remove('hidden');
  }

  function readOnlineProfile() {
    return {
      skin: $('online-skin')?.value || 'warm',
      outfit: $('online-outfit')?.value || 'casual',
      dupatta: !!$('online-dupatta')?.checked,
      sunflower: $('online-sunflower') ? !!$('online-sunflower').checked : true
    };
  }

  function wireUI() {
    $('online-screen')?.classList.add('active');
    $('start-screen')?.classList.remove('active');
    setConnection('● Game server ready', 'online');

    $('create-room-btn')?.addEventListener('click', async () => {
      setConnection('● Creating private room…', 'connecting');
      const result = await NET.post('/api/rooms/create', { name: $('online-name').value.trim() || 'You', profile: readOnlineProfile() }).catch(() => ({ ok: false, error: 'Server unreachable' }));
      if (!result?.ok) return setConnection(`● ${result?.error || 'Could not create room'}`, 'offline');
      enterRoom(result);
    });

    $('join-room-btn')?.addEventListener('click', async () => {
      const code = $('room-code-input').value.trim().toUpperCase();
      if (!code) return setConnection('● Enter the room code first', 'offline');
      setConnection('● Joining private room…', 'connecting');
      const result = await NET.post('/api/rooms/join', { name: $('online-name').value.trim() || 'Her', code, profile: readOnlineProfile() }).catch(() => ({ ok: false, error: 'Server unreachable' }));
      if (!result?.ok) return setConnection(`● ${result?.error || 'Could not join room'}`, 'offline');
      enterRoom(result);
    });

    $('room-code-input')?.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
    $('copy-room-btn')?.addEventListener('click', async () => {
      if (!NET.roomCode) return;
      try {
        await navigator.clipboard.writeText(NET.roomCode);
        $('copy-room-btn').textContent = 'COPIED ✓';
        setTimeout(() => { if ($('copy-room-btn')) $('copy-room-btn').textContent = 'COPY CODE'; }, 1200);
      } catch (_) { $('room-message').textContent = `Room code: ${NET.roomCode}`; }
    });
    document.querySelectorAll('.net-route-btn').forEach(btn => btn.addEventListener('click', () => {
      if (!NET.isHost) return;
      NET.route = btn.dataset.route || 'full';
      document.querySelectorAll('.net-route-btn').forEach(b => b.classList.toggle('active', b === btn));
    }));
    $('online-start-btn')?.addEventListener('click', async () => {
      if (!NET.isHost || !NET.roomState?.players?.[1]) return;
      const result = await NET.post(`/api/rooms/${NET.roomCode}/start`, { token: NET.roomToken, route: NET.route });
      if (!result?.ok) $('room-message').textContent = result?.error || 'Could not start.';
    });
    $('leave-room-btn')?.addEventListener('click', leaveRoom);
    $('local-mode-btn')?.addEventListener('click', () => {
      NET.online = false; NET.started = false; clearInterval(NET.snapshotTimer); NET.events?.close();
      $('online-screen').classList.remove('active'); $('start-screen').classList.add('active');
    });
  }

  wireUI();
})();
