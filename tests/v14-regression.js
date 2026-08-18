const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
function expect(ok, msg) { if (!ok) throw new Error(msg); }

const index = read('public/index.html');
const css = read('public/css/style.css');
const game = read('public/js/game.js');
const server = read('server.js');
const configText = read('public/js/config.js');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(configText, sandbox);
const C = sandbox.window.GAME_CONFIG;

expect(C.build.includes('v1.4'), 'build label is not v1.4');
expect(C.quizQuestions.length === 8, `expected 8 quiz questions, got ${C.quizQuestions.length}`);
expect(index.includes('1/7'), 'home HUD does not advertise 1/7');
expect(index.includes('QUESTION 1 / 8') && index.includes('UNDERSTANDING 0 / 16'), 'quiz placeholders are stale');
expect(index.includes('?v=1.4.0'), 'cache-busting asset version missing');
expect(css.includes('overflow-y: auto') && css.includes('#online-screen.active, #start-screen.active'), 'setup overlay scrolling fix missing');
expect(css.includes('.crisis-track.home-track'), 'seven-step home track CSS missing');
expect(game.includes("const labels = ['Sofa'"), 'seven-item home track implementation missing');
expect(game.includes("start:[-8.3,0,-6.7]") && game.includes("start:[-11.7,0,6.9]"), 'new furniture staging positions missing');
expect(game.includes('pickupHalo') && game.includes('MOVE ${def.label}'), 'active furniture visual cue missing');
expect(game.includes('Ingredient prep is untimed in v1.4'), 'relaxed kitchen logic missing');
expect(!game.includes('function startDinnerUrgency('), 'old ingredient urgency function still active');
expect(!game.includes('HURRY — ${active.toUpperCase()} IS NEEDED SOON.'), 'old ingredient countdown warning still active');
expect(server.includes("'Cache-Control': 'no-store, max-age=0, must-revalidate'"), 'Railway stale-asset cache protection missing');

for (const file of ['server.js','public/js/config.js','public/js/net.js','public/js/game.js','public/js/mobile.js']) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
}

console.log('V1.4 REGRESSION TEST PASSED');
