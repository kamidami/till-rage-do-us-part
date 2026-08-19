(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let soundOn = true;

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch (_) {}
  }

  function syncFullscreenLabel() {
    const el = $('fullscreen-btn');
    if (!el) return;
    el.innerHTML = document.fullscreenElement ? '↙ <span>EXIT FULLSCREEN</span>' : '⛶ <span>FULLSCREEN</span>';
  }

  $('fullscreen-btn')?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreenLabel);

  $('sound-btn')?.addEventListener('click', () => {
    soundOn = !soundOn;
    window.GAME_SOUND_ENABLED = soundOn;
    $('sound-btn').innerHTML = soundOn ? '♪ <span>SOUND ON</span>' : '∅ <span>SOUND OFF</span>';
  });
  window.GAME_SOUND_ENABLED = true;

  // Keep the main menu feeling like a game: Escape exits fullscreen, F11 alternative remains browser-native.
  window.addEventListener('keydown', e => {
    if (e.code === 'F10') toggleFullscreen();
  });
})();
