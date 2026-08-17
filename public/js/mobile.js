(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const coarse = window.matchMedia('(pointer: coarse)');
  const narrow = window.matchMedia('(max-width: 900px)');
  const isMobileish = () => coarse.matches || narrow.matches;

  const held = new Set();
  const movementCodes = ['KeyW','KeyA','KeyS','KeyD'];

  function fire(code, down) {
    if (!code) return;
    if (down && held.has(code)) return;
    if (!down && !held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code,
      key: code,
      bubbles: true,
      cancelable: true
    }));
  }

  function tap(code, duration = 85) {
    fire(code, true);
    window.setTimeout(() => fire(code, false), duration);
  }

  function releaseMovement() {
    for (const code of movementCodes) fire(code, false);
  }

  function setupJoystick() {
    const stick = $('mobile-stick');
    const knob = $('mobile-stick-knob');
    if (!stick || !knob) return;
    let pointer = null;

    function update(e) {
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2 - 5;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const max = Math.min(rect.width, rect.height) * 0.27;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx *= max / len; dy *= max / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / max, ny = dy / max;
      const threshold = 0.26;
      const next = new Set();
      if (ny < -threshold) next.add('KeyW');
      if (ny > threshold) next.add('KeyS');
      if (nx < -threshold) next.add('KeyA');
      if (nx > threshold) next.add('KeyD');
      for (const code of movementCodes) fire(code, next.has(code));
    }

    stick.addEventListener('pointerdown', (e) => {
      if (!isMobileish()) return;
      pointer = e.pointerId;
      stick.setPointerCapture?.(e.pointerId);
      update(e);
      e.preventDefault();
    }, { passive: false });
    stick.addEventListener('pointermove', (e) => {
      if (pointer !== e.pointerId) return;
      update(e);
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      if (pointer !== null && e.pointerId !== undefined && e.pointerId !== pointer) return;
      pointer = null;
      knob.style.transform = 'translate(0px, 0px)';
      releaseMovement();
      e.preventDefault?.();
    };
    stick.addEventListener('pointerup', end, { passive: false });
    stick.addEventListener('pointercancel', end, { passive: false });
    stick.addEventListener('lostpointercapture', () => { pointer = null; knob.style.transform='translate(0px,0px)'; releaseMovement(); });
  }

  function bindHoldButton(el, code) {
    if (!el) return;
    let pointer = null;
    el.addEventListener('pointerdown', (e) => {
      pointer = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('pressed');
      fire(code, true);
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      if (pointer !== null && e.pointerId !== undefined && e.pointerId !== pointer) return;
      pointer = null;
      el.classList.remove('pressed');
      fire(code, false);
      e.preventDefault?.();
    };
    el.addEventListener('pointerup', end, { passive: false });
    el.addEventListener('pointercancel', end, { passive: false });
    el.addEventListener('lostpointercapture', () => { pointer = null; el.classList.remove('pressed'); fire(code,false); });
  }

  function setupQuizPad() {
    document.querySelectorAll('#mobile-quiz-pad button').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        tap(btn.dataset.key, 90);
        e.preventDefault();
      }, { passive: false });
    });
  }

  function syncQuizLabels() {
    const optionEls = [...document.querySelectorAll('#quiz-options .quiz-option')];
    document.querySelectorAll('#mobile-quiz-pad button').forEach((btn, i) => {
      const span = btn.querySelector('span');
      const option = optionEls[i];
      if (!span || !option) return;
      const text = option.textContent.replace(/^\s*[1-4][.)]?\s*/, '').trim();
      span.textContent = text || `Option ${i+1}`;
    });
  }

  function setupFullscreen() {
    document.addEventListener('dblclick', (e) => {
      if (!isMobileish() || e.target.closest('button,input')) return;
      document.documentElement.requestFullscreen?.().catch(() => {});
    });
  }

  function updateUi() {
    const controls = $('mobile-controls');
    const rotate = $('rotate-phone');
    if (!controls) return;
    const onlineStarted = !!(window.NET?.online && window.NET?.started);
    const hudVisible = !$('hud')?.classList.contains('hidden');
    const quizVisible = $('quiz-screen')?.classList.contains('active');
    const overlayVisible = [...document.querySelectorAll('.overlay.active')].some(el => el.id !== 'quiz-screen');
    const showGameControls = isMobileish() && onlineStarted && hudVisible && !quizVisible && !overlayVisible;
    controls.classList.toggle('hidden', !showGameControls);
    document.body.classList.toggle('mobile-playing', showGameControls);

    if (!showGameControls) releaseMovement();

    const isHer = window.NET?.online && window.NET?.playerIndex === 1;
    $('mobile-bonk-btn')?.classList.toggle('hidden', !isHer);

    const actionTextId = window.NET?.online && window.NET.playerIndex === 1 ? 'p2-action-text' : 'p1-action-text';
    const task = $(actionTextId)?.textContent?.trim();
    if ($('mobile-action-label')) $('mobile-action-label').textContent = task && task.length < 34 ? task : 'Interact / task';

    const portraitGameplay = showGameControls && window.matchMedia('(orientation: portrait)').matches;
    if (rotate) rotate.classList.toggle('hidden', !portraitGameplay);

    const quizPad = $('mobile-quiz-pad');
    if (quizPad) quizPad.classList.toggle('mobile-visible', isMobileish() && onlineStarted && quizVisible);
    if (quizVisible) syncQuizLabels();
  }

  setupJoystick();
  bindHoldButton($('mobile-action-btn'), 'KeyE');
  bindHoldButton($('mobile-bonk-btn'), 'KeyF');
  setupQuizPad();
  setupFullscreen();

  window.addEventListener('blur', () => { releaseMovement(); fire('KeyE',false); fire('KeyF',false); });
  window.addEventListener('orientationchange', () => setTimeout(updateUi, 180));
  coarse.addEventListener?.('change', updateUi);
  narrow.addEventListener?.('change', updateUi);
  setInterval(updateUi, 220);
  updateUi();
})();
