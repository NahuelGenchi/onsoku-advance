// Game page: choose a ROM, extract its assets in the browser, then the game's start (the logos and the intro)
// and the act, with its special stage between two runs of it. With ?debug the act starts straight away, and
// with ?special the special stage does, as if Sonic had just left act 1 on its special spring.

import './engine/cpucanvas.js';
import { createRomPicker } from './ui/rom-picker.js';
import { loadRememberedRom, rememberRom, RUSH_ROM, SA2_ROM } from './ui/rom-store.js';
import { extractAssets } from './rom/extract.js';
import { Rom } from './rom/rom.js';
import { createFrontEnd } from './front/front.js';
import { extractRush } from './rom/rush.js';
import { openSa2 } from './rom/sa2.js';
import { readBoostArt } from './rom/sa2boost.js';
import { createInput } from './engine/input.js';
import { createGame, specialSpringStart } from './engine/game.js';
import { createSpecialStageRun } from './special/run.js';
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
const boostButton = document.getElementById('boost-mode');
const boostStatus = document.getElementById('boost-status');
const sa2File = document.getElementById('sa2-file');
const params = new URLSearchParams(location.search);
const debug = params.has('debug'), specialTest = params.has('special');

const input = createInput();
input.bindTouch(document.getElementById('touch'));
const sound = createSound();
let game = null, front = null, specialStage = null, rom = null, statsTimer = 0;

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

// the Chaos Emeralds won, a bit per special stage: the save's record of them, kept in this browser; and the
// continues the special stages have given, kept for this visit
const EMERALDS_KEY = 'onsoku.emeralds';
let emeralds = 0, continues = 0;
try { emeralds = Number(localStorage.getItem(EMERALDS_KEY)) & 0x7F; } catch { /* storage blocked: none yet */ }
function keepEmeralds(won) {
  emeralds = won;
  try { localStorage.setItem(EMERALDS_KEY, String(won)); } catch { /* kept for this visit only */ }
}

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

// Sonic Advance 2's Boost Mode, another extra: off unless chosen. Its afterimages, particles and sound come from
// the player's own Sonic Advance 2 ROM, asked for the first time it is turned on and then kept in this browser.
const BOOST_KEY = 'onsoku.boostMode';
let boostMode = false, boostArt = null;
try { boostMode = localStorage.getItem(BOOST_KEY) === '1'; } catch { /* storage blocked: the default stands */ }
function setBoostMode(on) {
  if (on && !boostArt) { sa2File.click(); return; }   // turned on once the ROM is read
  boostMode = on;
  try { localStorage.setItem(BOOST_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  showBoostMode();
}
function showBoostMode() {
  game?.setBoostMode(boostMode, boostArt);
  boostButton.textContent = `Boost Mode: ${boostMode ? 'on' : 'off'}`;
  boostButton.setAttribute('aria-pressed', String(boostMode));
}
function useSa2(buffer) {
  const sa2 = openSa2(buffer);
  boostArt = readBoostArt(sa2);
  sound.loadSa2(sa2.sound);
}
boostButton.addEventListener('click', () => { setBoostMode(!boostMode); screen.focus(); });
sa2File.addEventListener('change', async () => {
  const file = sa2File.files[0];
  sa2File.value = '';
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    useSa2(buffer);
    boostStatus.textContent = '';
    await rememberRom(file.name, buffer, SA2_ROM);
    setBoostMode(true);
  } catch (error) {
    boostStatus.textContent = error.message || String(error);
  }
  screen.focus();
});
// with the setting on from an earlier visit, the remembered Sonic Advance 2 ROM; without it the setting goes off
(async () => {
  const saved = await loadRememberedRom(SA2_ROM);
  try { if (saved) useSa2(saved.buffer); } catch { /* not usable any more: asked for again */ }
  if (boostMode && !boostArt) setBoostMode(false);
  showBoostMode();
})();
showBoostMode();

createRomPicker(picker, {
  heading: 'Play in your browser',
  intro: 'Choose your Sonic Advance ROM. Its graphics are decoded on this device and the game starts right away.',
  async onRom(buffer, name, setStatus) {
    const assets = await extractAssets(buffer, setStatus);
    setStatus('');
    sound.load(buffer, assets.sound).catch(err => console.warn('No sound:', err));
    start(buffer, assets);
  },
});

function stopAll() {
  front?.stop(); front = null;
  specialStage?.stop(); specialStage = null;
  game?.stop(); game = null;
  clearInterval(statsTimer);
}

function start(buffer, assets) {
  stopAll();
  rom = new Rom(buffer);
  picker.hidden = true;
  stage.hidden = false;
  const leaving = specialTest && specialSpringStart(assets, { emeralds, continues });
  if (leaving) { enterSpecialStage(assets, leaving); return; }
  if (debug) { play(assets); return; }
  front = createFrontEnd(screen, rom, assets.info.offsets, input, sound, () => { front = null; play(assets); });
  fitScreen();
  screen.focus();
}

// the act, after the game's start, or again from what the special stage hands back (`resume`)
function play(assets, resume = null) {
  game = createGame(screen, assets, input, sound, {
    resume, emeralds, continues, onSpecialStage: handover => enterSpecialStage(assets, handover),
  });
  fitScreen();
  showRush();
  showBoostMode();
  game.start();
  screen.focus();
  clearInterval(statsTimer);
  statsTimer = setInterval(showStats, 100);
  if (debug) globalThis.onsoku = { game, assets, input, sound };
}

// a special spring sent Sonic out of the act: the special stage on the same screen, then the act again from
// what it hands back, with the Chaos Emeralds and the continues it leaves kept
function enterSpecialStage(assets, handover) {
  game?.stop(); game = null;
  specialStage = createSpecialStageRun(screen, rom, assets.info.offsets, input, sound, handover, back => {
    specialStage = null;
    keepEmeralds(back.emeralds);
    continues = back.continues;
    play(assets, back);
  });
  fitScreen();
  screen.focus();
  if (debug) globalThis.onsoku = { special: specialStage, assets, input, sound };
}

document.getElementById('change-rom').addEventListener('click', () => {
  stopAll();
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
  if (e.code === 'KeyB' && !stage.hidden && !e.repeat) setBoostMode(!boostMode);
});

function showStats() {
  if (!game) { stats.textContent = specialStage ? 'special stage' : ''; return; }
  const { player } = game.state;
  const speed = Math.abs(player.air ? player.xsp : player.gsp);
  stats.textContent = `speed ${speed.toFixed(2)} · ${player.state} · ${player.anim.name}`;
}

// largest whole-number scale the original screen fits at, so every pixel stays square and sharp; the
// widescreen view then fills what the window has around it at that scale, up to its largest size, in the
// game's start as in the act
function fitScreen() {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const fit = Math.min(vw / SCREEN_W, vh / SCREEN_H);
  const scale = fit >= 1 ? Math.floor(fit) : Math.max(fit, 0.25);
  const size = (room, min, max) => (wide ? Math.max(min, Math.min(max, Math.floor(room / scale) & ~1)) : min);
  const w = size(vw, SCREEN_W, VIEW_MAX_W), h = size(vh, SCREEN_H, VIEW_MAX_H);
  front?.setView(w, h);
  specialStage?.setView(w, h);
  game?.setView(w, h);
  screen.style.width = `${w * scale}px`;
  screen.style.height = `${h * scale}px`;
  wideButton.textContent = `Widescreen: ${wide ? 'on' : 'off'}`;
  wideButton.setAttribute('aria-pressed', String(wide));
}
addEventListener('resize', fitScreen);
new ResizeObserver(fitScreen).observe(document.documentElement);
