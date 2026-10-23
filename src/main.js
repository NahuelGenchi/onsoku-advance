// Game page: choose a ROM, extract its assets in the browser, then play.

import { createRomPicker } from './ui/rom-picker.js';
import { extractAssets } from './rom/extract.js';
import { createInput } from './engine/input.js';
import { createGame } from './engine/game.js';
import { SCREEN_W, SCREEN_H } from './engine/constants.js';

const picker = document.getElementById('picker');
const stage = document.getElementById('stage');
const screen = document.getElementById('screen');
const help = document.getElementById('help');
const stats = document.getElementById('stats');
const debug = new URLSearchParams(location.search).has('debug');

const input = createInput();
input.bindTouch(document.getElementById('touch'));
let game = null, statsTimer = 0;

createRomPicker(picker, {
  heading: 'Play in your browser',
  intro: 'Choose your Sonic Advance ROM. Its graphics are decoded on this device and the game starts right away.',
  async onRom(buffer, name, setStatus) {
    const assets = await extractAssets(buffer, setStatus);
    setStatus('');
    start(assets);
  },
});

function start(assets) {
  game?.stop();
  game = createGame(screen, assets, input);
  picker.hidden = true;
  stage.hidden = false;
  fitScreen();
  game.start();
  screen.focus();
  clearInterval(statsTimer);
  statsTimer = setInterval(showStats, 100);
  if (debug) globalThis.onsoku = { game, assets, input };
}

document.getElementById('change-rom').addEventListener('click', () => {
  game?.stop();
  clearInterval(statsTimer);
  stage.hidden = true;
  picker.hidden = false;
});

addEventListener('keydown', e => {
  if (e.code === 'KeyH' && !stage.hidden && !e.repeat) help.hidden = !help.hidden;
  // C shows the terrain collision over the stage, for checking it against the art
  if (e.code === 'KeyC' && game && !stage.hidden && !e.repeat) game.state.showCollision = !game.state.showCollision;
});

function showStats() {
  const { player } = game.state;
  const speed = Math.abs(player.air ? player.xsp : player.gsp);
  stats.textContent = `speed ${speed.toFixed(2)} · ${player.state} · ${player.anim.name}`;
}

// largest whole-number scale that fits, so every pixel stays square and sharp
function fitScreen() {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const fit = Math.min(vw / SCREEN_W, vh / SCREEN_H);
  const scale = fit >= 1 ? Math.floor(fit) : Math.max(fit, 0.25);
  screen.style.width = `${SCREEN_W * scale}px`;
  screen.style.height = `${SCREEN_H * scale}px`;
}
addEventListener('resize', fitScreen);
new ResizeObserver(fitScreen).observe(document.documentElement);
