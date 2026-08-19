(() => {
  'use strict';
  // Small presentation-only layer. Gameplay stays authoritative in game.js.
  const pulseReadyAction = () => {
    document.querySelectorAll('.action-card.ready-action').forEach((card) => {
      card.style.setProperty('--ready-pulse', String((Date.now() % 1600) / 1600));
    });
  };
  setInterval(pulseReadyAction, 500);
})();
