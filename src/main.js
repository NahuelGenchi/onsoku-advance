// Game page: choose a ROM, extract its assets in the browser, then play.

import { createRomPicker } from './ui/rom-picker.js';
import { loadRememberedRom, rememberRom, RUSH_ROM, SA2_ROM } from './ui/rom-store.js';
import { extractAssets } from './rom/extract.js';
import { extractRush } from './rom/rush.js';
import { openSa2 } from './rom/sa2.js';
import { trickArt } from './rom/sa2tricks.js';
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
const rushButton = document.getElementById('rush');
const rushStatus = document.getElementById('rush-status');
const rushFile = document.getElementById('rush-file');
const tricksButton = document.getElementById('tricks');
const sa2Status = document.getElementById('sa2-status');
const sa2File = document.getElementById('sa2-file');
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

// Sonic Advance 2's mid-air tricks, an extra on top of the original game: off unless chosen, like the Rush boost.
// Their sprites and sounds come from the player's own Sonic Advance 2 ROM, asked for the first time they are
// turned on and then kept in this browser like the Sonic Advance ROM.
const TRICKS_KEY = 'onsoku.sa2Tricks';
let tricks = false, tricksArt = null;
try { tricks = localStorage.getItem(TRICKS_KEY) === '1'; } catch { /* storage blocked: the default stands */ }
function setTricks(on) {
  if (on && !tricksArt) { sa2File.click(); return; }   // turned on once the ROM is read
  tricks = on;
  try { localStorage.setItem(TRICKS_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  showTricks();
}
function showTricks() {
  game?.setSa2Tricks(tricks, tricksArt);
  tricksButton.textContent = `SA2 tricks: ${tricks ? 'on' : 'off'}`;
  tricksButton.setAttribute('aria-pressed', String(tricks));
}
// what the extras from Sonic Advance 2 read from its ROM, and its sound engine's tables
function useSa2(buffer) {
  const sa2 = openSa2(buffer);
  tricksArt = trickArt(sa2);
  sound.loadSa2(sa2.sound);
}
tricksButton.addEventListener('click', () => { setTricks(!tricks); screen.focus(); });
sa2File.addEventListener('change', async () => {
  const file = sa2File.files[0];
  sa2File.value = '';
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    useSa2(buffer);
    sa2Status.textContent = '';
    await rememberRom(file.name, buffer, SA2_ROM);
    setTricks(true);
  } catch (error) {
    sa2Status.textContent = error.message || String(error);
  }
  screen.focus();
});
// with the setting on from an earlier visit, the remembered Sonic Advance 2 ROM; without it the setting goes off
(async () => {
  const saved = await loadRememberedRom(SA2_ROM);
  try { if (saved) useSa2(saved.buffer); } catch { /* not usable any more: asked for again */ }
  if (tricks && !tricksArt) setTricks(false);
  showTricks();
})();
showTricks();

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
  showRush();
  showTricks();
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
  if (e.code === 'KeyR' && !stage.hidden && !e.repeat) setRush(!rush);
  if (e.code === 'KeyT' && !stage.hidden && !e.repeat) setTricks(!tricks);
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
