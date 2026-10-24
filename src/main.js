// Game page: choose a ROM, extract its assets in the browser, then play.

import { createRomPicker } from './ui/rom-picker.js';
import { extractAssets } from './rom/extract.js';
import { createInput } from './engine/input.js';
import { createGame } from './engine/game.js';
import { createSound } from './sound/audio.js';
import { SCREEN_W, SCREEN_H, VIEW_MAX_W, VIEW_MAX_H } from './engine/constants.js';

const picker = document.getElementById('picker');
const stage = document.getElementById('stage');
const screen = document.getElementById('screen');
const help = document.getElementById('help');
const stats = document.getElementById('stats');
const wideButton = document.getElementById('wide');
const debug = new URLSearchParams(location.search).has('debug');

const input = createInput();
input.bindTouch(document.getElementById('touch'));
const sound = createSound();
let game = null, statsTimer = 0;

// the widescreen view: off unless chosen, as the original screen is what the game is checked against
const WIDE_KEY = 'onsoku.widescreen';
let wide = false;
try { wide = localStorage.getItem(WIDE_KEY) === '1'; } catch { /* storage blocked: the default stands */ }
function setWide(on) {
  wide = on;
  try { localStorage.setItem(WIDE_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  fitScreen();
}
wideButton.addEventListener('click', () => { setWide(!wide); screen.focus(); });

createRomPicker(picker, {
  heading: 'Play in your browser',
  intro: 'Choose your Sonic Advance ROM. Its graphics are decoded on this device and the game starts right away.',
  async onRom(buffer, name, setStatus) {
    const assets = await extractAssets(buffer, setStatus);
    setStatus('');
    sound.load(buffer, assets.sound).catch(err => console.warn('No sound:', err));
    start(assets);
  },
});

function start(assets) {
  game?.stop();
  game = createGame(screen, assets, input, sound);
  picker.hidden = true;
  stage.hidden = false;
  fitScreen();
  game.start();
  screen.focus();
  clearInterval(statsTimer);
  statsTimer = setInterval(showStats, 100);
  if (debug) globalThis.onsoku = { game, assets, input, sound };
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
  if (e.code === 'KeyM' && !stage.hidden && !e.repeat) sound.muted = !sound.muted;
  if (e.code === 'KeyV' && !stage.hidden && !e.repeat) setWide(!wide);
});

function showStats() {
  const { player } = game.state;
  const speed = Math.abs(player.air ? player.xsp : player.gsp);
  stats.textContent = `speed ${speed.toFixed(2)} · ${player.state} · ${player.anim.name}`;
}

// largest whole-number scale the original screen fits at, so every pixel stays square and sharp; the
// widescreen view then fills what the window has around it at that scale, up to its largest size
function fitScreen() {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const fit = Math.min(vw / SCREEN_W, vh / SCREEN_H);
  const scale = fit >= 1 ? Math.floor(fit) : Math.max(fit, 0.25);
  const size = (room, min, max) => (wide ? Math.max(min, Math.min(max, Math.floor(room / scale) & ~1)) : min);
  const w = size(vw, SCREEN_W, VIEW_MAX_W), h = size(vh, SCREEN_H, VIEW_MAX_H);
  game?.setView(w, h);
  screen.style.width = `${w * scale}px`;
  screen.style.height = `${h * scale}px`;
  wideButton.textContent = `Widescreen: ${wide ? 'on' : 'off'}`;
  wideButton.setAttribute('aria-pressed', String(wide));
}
addEventListener('resize', fitScreen);
new ResizeObserver(fitScreen).observe(document.documentElement);
