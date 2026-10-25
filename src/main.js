// Game page: choose a ROM, extract its assets in the browser, then play.

import { createRomPicker } from './ui/rom-picker.js';
import { loadRememberedRom, rememberRom, RUSH_ROM } from './ui/rom-store.js';
import { extractAssets } from './rom/extract.js';
import { extractRush } from './rom/rush.js';
import { createInput } from './engine/input.js';
import { createGame } from './engine/game.js';
import { createSound } from './sound/audio.js';
import { SCREEN_W, SCREEN_H, VIEW_MAX_W, VIEW_MAX_H } from './engine/constants.js';
import { levelInfo } from './rom/levels.js';
import { startMultiplayer, DEFAULT_SEED, DEFAULT_CHAO_PLACE } from './multiplayer.js';

const picker = document.getElementById('picker');
const stage = document.getElementById('stage');
const screen = document.getElementById('screen');
const help = document.getElementById('help');
const stats = document.getElementById('stats');
const wideButton = document.getElementById('wide');
const rushButton = document.getElementById('rush');
const rushStatus = document.getElementById('rush-status');
const rushFile = document.getElementById('rush-file');
const params = new URLSearchParams(location.search);
const debug = params.has('debug');
// `?level=N` starts the level the ROM's tables number N (6 is Ice Mountain Zone act 1) instead of the first
const firstLevel = Number(params.get('level') ?? 0) | 0;
// a multiplayer stage (`?level=14`) is played by `&players=N` players, 2 to 4 (2 if not given), each on their
// own screen; `&seed=` and `&chao=` set what the link hands the GBAs as the round starts (the shared random
// number and the Chao's place, 0–7)
const multiplayer = (() => { try { return levelInfo(firstLevel).multiplayer ?? false; } catch { return false; } })();
const players = multiplayer ? Math.min(4, Math.max(2, Number(params.get('players') ?? 2) | 0)) : 1;
const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : DEFAULT_SEED;
const chaoPlace = params.has('chao') ? (Number(params.get('chao')) | 0) & 7 : DEFAULT_CHAO_PLACE;
const screens = document.getElementById('screens');

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

// Sonic Rush's boost, an extra on top of the original game: off unless chosen, like the widescreen view. Its
// effects and sound come from the player's own Sonic Rush ROM, asked for the first time it is turned on and
// then kept in this browser like the Sonic Advance ROM.
const RUSH_KEY = 'onsoku.rushBoost';
let rush = false, rushArt = null;
try { rush = localStorage.getItem(RUSH_KEY) === '1'; } catch { /* storage blocked: the default stands */ }
function setRush(on) {
  if (on && !rushArt) { rushFile.click(); return; }   // turned on once the ROM is read
  rush = on;
  try { localStorage.setItem(RUSH_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  showRush();
}
function showRush() {
  game?.setRushBoost(rush, rushArt);
  rushButton.textContent = `Rush boost: ${rush ? 'on' : 'off'}`;
  rushButton.setAttribute('aria-pressed', String(rush));
}
function useRush(buffer) {
  rushArt = extractRush(buffer);
  sound.loadRush(rushArt.sound);
}
rushButton.addEventListener('click', () => { setRush(!rush); screen.focus(); });
rushFile.addEventListener('change', async () => {
  const file = rushFile.files[0];
  rushFile.value = '';
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    useRush(buffer);
    rushStatus.textContent = '';
    await rememberRom(file.name, buffer, RUSH_ROM);
    setRush(true);
  } catch (error) {
    rushStatus.textContent = error.message || String(error);
  }
  screen.focus();
});
// with the setting on from an earlier visit, the remembered Sonic Rush ROM; without it the setting goes off
(async () => {
  const saved = await loadRememberedRom(RUSH_ROM);
  try { if (saved) useRush(saved.buffer); } catch { /* not usable any more: asked for again */ }
  if (rush && !rushArt) setRush(false);
  showRush();
})();
showRush();

createRomPicker(picker, {
  heading: 'Play in your browser',
  intro: 'Choose your Sonic Advance ROM. Its graphics are decoded on this device and the game starts right away.',
  async onRom(buffer, name, setStatus) {
    romBuffer = buffer;
    const assets = await extractAssets(buffer, setStatus, { level: firstLevel });
    setStatus('');
    sound.load(buffer, assets.sound, players).catch(err => console.warn('No sound:', err));
    start(assets);
  },
});

let romBuffer = null;
/**
 * Decodes level `level` from the ROM already chosen and starts it: the way on to another act (the end of an
 * act's flow, issue #69, calls it with the next level).
 */
async function playLevel(level) {
  start(await extractAssets(romBuffer, () => {}, { level }));
}

function start(assets) {
  game?.stop();
  round?.stop();
  picker.hidden = true;
  stage.hidden = false;
  wideButton.disabled = rushButton.disabled = !!assets.stage.multiplayerSpawns;
  if (assets.stage.multiplayerSpawns) { startRound(assets); return; }
  game = createGame(screen, assets, input, sound);
  fitScreen();
  showRush();
  game.start();
  screen.focus();
  clearInterval(statsTimer);
  statsTimer = setInterval(showStats, 100);
  if (debug) globalThis.onsoku = { game, assets, input, sound, playLevel };
}

// the multiplayer stage's round, on a screen for each player
let round = null;
function startRound(assets) {
  game = null;
  screen.hidden = true;
  screens.hidden = false;
  round = startMultiplayer({ container: screens, assets, count: players, sound, seed, chaoPlace });
  fitScreen();
  clearInterval(statsTimer);
  if (debug) globalThis.onsoku = { round, assets, sound, playLevel };
}

document.getElementById('change-rom').addEventListener('click', () => {
  game?.stop();
  round?.stop(); round = null;
  clearInterval(statsTimer);
  stage.hidden = true;
  picker.hidden = false;
});

addEventListener('keydown', e => {
  if (e.code === 'KeyH' && !stage.hidden && !e.repeat) help.hidden = !help.hidden;
  // C shows the terrain collision over the stage, for checking it against the art
  if (e.code === 'KeyC' && game && !stage.hidden && !e.repeat) game.state.showCollision = !game.state.showCollision;
  if (e.code === 'KeyM' && !stage.hidden && !e.repeat) sound.muted = !sound.muted;
  // the widescreen view and the Rush boost are single-player options
  if (e.code === 'KeyV' && game && !stage.hidden && !e.repeat) setWide(!wide);
  if (e.code === 'KeyR' && game && !stage.hidden && !e.repeat) setRush(!rush);
});

function showStats() {
  if (!game) return;
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
  if (round) fitScreens();
  wideButton.textContent = `Widescreen: ${wide ? 'on' : 'off'}`;
  wideButton.setAttribute('aria-pressed', String(wide));
}
// the players' screens, side by side or one above the other, whichever fits them larger; four in two rows
function fitScreens() {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, gap = 8;
  const layouts = players === 2 ? [[2, 1], [1, 2]] : [[2, 2], [players, 1]];
  let best = null;
  for (const [cols, rows] of layouts) {
    const fit = Math.min((vw - gap * (cols - 1)) / (cols * SCREEN_W), (vh - gap * (rows - 1)) / (rows * SCREEN_H));
    const scale = fit >= 1 ? Math.floor(fit) : Math.max(fit, 0.25);
    if (!best || scale > best.scale) best = { cols, scale };
  }
  screens.style.gridTemplateColumns = `repeat(${best.cols}, auto)`;
  for (const c of screens.children) {
    c.style.width = `${SCREEN_W * best.scale}px`;
    c.style.height = `${SCREEN_H * best.scale}px`;
  }
}
addEventListener('resize', fitScreen);
new ResizeObserver(fitScreen).observe(document.documentElement);
