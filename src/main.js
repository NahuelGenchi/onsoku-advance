// Game page: the player's ROMs, each read in the browser as it is chosen (rom-setup.js), then the game's start
// (the logos and the intro) and the act, with its special stage between two runs of it. With ?debug Play starts
// the act straight away, and with ?special the special stage, as if Sonic had just left act 1 on its special spring.

import './engine/cpucanvas.js';
import { createRomSetup } from './ui/rom-setup.js';
import { SA1_ROM, RUSH_ROM, SA2_ROM } from './ui/rom-store.js';
import { extractAssets } from './rom/extract.js';
import { isSonicAdvance, RomError } from './rom/identify.js';
import { Rom } from './rom/rom.js';
import { createFrontEnd } from './front/front.js';
import { extractRush, isRush } from './rom/rush.js';
import { openSa2, isSa2 } from './rom/sa2.js';
import { readBoostArt } from './rom/sa2boost.js';
import { trickArt } from './rom/sa2tricks.js';
import { createInput } from './engine/input.js';
import { createGame, specialSpringStart } from './engine/game.js';
import { createSpecialStageRun } from './special/run.js';
import { createSound } from './sound/audio.js';
import { SCREEN_W, SCREEN_H, VIEW_MAX_W, VIEW_MAX_H } from './engine/constants.js';
import { THE_MOON, ALL_EMERALDS } from './engine/unlock.js';

const picker = document.getElementById('picker');
const stage = document.getElementById('stage');
const screen = document.getElementById('screen');
const help = document.getElementById('help');
const stats = document.getElementById('stats');
const wideButton = document.getElementById('wide');
const rushButton = document.getElementById('rush');
const boostButton = document.getElementById('boost-mode');
const tricksButton = document.getElementById('tricks');
const romFile = document.getElementById('rom-file');
const romStatus = document.getElementById('rom-status');
const params = new URLSearchParams(location.search);
const debug = params.has('debug'), specialTest = params.has('special');
// `?level=N` starts the level the ROM's tables number N (2 is Secret Base Zone act 1) instead of the first
const firstLevel = Number(params.get('level') ?? 0) | 0;

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

// An extra turned on in the game without its ROM asks for the ROM there, and is turned on once it is read.
let asked = null;
function ask(slot, accept, then) {
  asked = { slot, then };
  romFile.accept = accept;
  romFile.click();
}
romFile.addEventListener('change', async () => {
  const files = [...romFile.files], wanted = asked;
  romFile.value = '';
  asked = null;
  if (!files.length || !wanted) return;
  const [{ key, error }] = await setup.add(files, wanted.slot, { auto: false });
  romStatus.textContent = error ?? (key === wanted.slot ? '' : 'That ROM went to its own game; this extra needs another.');
  if (!error && key === wanted.slot) wanted.then(true);
  screen.focus();
});

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
// effects and sound come from the player's own Sonic Rush ROM.
const RUSH_KEY = 'onsoku.rushBoost';
let rush = false, rushArt = null;
try { rush = localStorage.getItem(RUSH_KEY) === '1'; } catch { /* storage blocked: the default stands */ }
function setRush(on) {
  if (on && !rushArt) { ask('rush', '.nds', setRush); return; }   // turned on once the ROM is read
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
  return rushArt.code;
}
rushButton.addEventListener('click', () => { setRush(!rush); screen.focus(); });

// Sonic Advance 2's Boost Mode, another extra: off unless chosen. Its afterimages, particles and sound come from
// the player's own Sonic Advance 2 ROM.
const BOOST_KEY = 'onsoku.boostMode';
let boostMode = false, boostArt = null;
try { boostMode = localStorage.getItem(BOOST_KEY) === '1'; } catch { /* storage blocked: the default stands */ }
function setBoostMode(on) {
  if (on && !boostArt) { ask('sa2', '.gba', setBoostMode); return; }   // turned on once the ROM is read
  boostMode = on;
  try { localStorage.setItem(BOOST_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  showBoostMode();
}
function showBoostMode() {
  game?.setBoostMode(boostMode, boostArt);
  boostButton.textContent = `Boost Mode: ${boostMode ? 'on' : 'off'}`;
  boostButton.setAttribute('aria-pressed', String(boostMode));
}
boostButton.addEventListener('click', () => { setBoostMode(!boostMode); screen.focus(); });
// Sonic Advance 2's mid-air tricks, an extra on top of the original game: off unless chosen, like the Rush boost.
// Their sprites and sounds come from the player's own Sonic Advance 2 ROM too.
const TRICKS_KEY = 'onsoku.sa2Tricks';
let tricks = false, tricksArt = null;
try { tricks = localStorage.getItem(TRICKS_KEY) === '1'; } catch { /* storage blocked: the default stands */ }
function setTricks(on) {
  if (on && !tricksArt) { ask('sa2', '.gba', setTricks); return; }   // turned on once the ROM is read
  tricks = on;
  try { localStorage.setItem(TRICKS_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  showTricks();
}
function showTricks() {
  game?.setSa2Tricks(tricks, tricksArt);
  tricksButton.textContent = `SA2 tricks: ${tricks ? 'on' : 'off'}`;
  tricksButton.setAttribute('aria-pressed', String(tricks));
}
tricksButton.addEventListener('click', () => { setTricks(!tricks); screen.focus(); });
// what the extras from Sonic Advance 2 read from its ROM, and its sound engine's tables
function useSa2(buffer) {
  const sa2 = openSa2(buffer), boost = readBoostArt(sa2), trick = trickArt(sa2);
  boostArt = boost;
  tricksArt = trick;
  sound.loadSa2(sa2.sound);
  return sa2.code;
}

// the Sonic Advance ROM and what the extractor read from it, once it is chosen
let sa1 = null;
const REGIONS = { E: 'USA', J: 'Japan', P: 'Europe' };
const region = code => REGIONS[code[3]] ?? code;
const MAX_GBA_BYTES = 32 * 1024 * 1024;   // largest Game Boy Advance cartridge

const setup = createRomSetup(picker, {
  heading: 'Play in your browser',
  intro: 'Add your ROMs and everything is ready before the game starts: Sonic Advance to play, Sonic Advance 2 and Sonic Rush for the extras they bring. Drop them anywhere on this page, or choose each one below.',
  slots: [
    {
      key: 'sa1', store: SA1_ROM, title: 'Sonic Advance', platform: 'Game Boy Advance', icon: 'gba', color: '#4f86ff',
      required: true, role: 'The game itself: Neo Green Hill Zone act 1, the intro, the music and the sound.',
      accept: '.gba,.agb,.bin', kind: '.gba', claims: isSonicAdvance,
      async read(buffer, progress) {
        if (buffer.byteLength > MAX_GBA_BYTES) throw new RomError('This file is too large to be a Game Boy Advance ROM.');
        const assets = await extractAssets(buffer, progress, { level: firstLevel });
        sa1 = { buffer, assets };
        return `${assets.info.region} · ${assets.info.version ? 'tested version' : 'untested version'}`;
      },
      unload() { sa1 = null; },
      extras: [{ label: 'Widescreen view', name: 'the widescreen view', hint: 'More of the game around the original screen · V', get: () => wide, set: setWide }],
    },
    {
      key: 'sa2', store: SA2_ROM, title: 'Sonic Advance 2', platform: 'Game Boy Advance', icon: 'gba', color: '#ff8a3d',
      required: false, role: 'Its Boost Mode with the afterimages, and its mid-air tricks, on top of the original game.',
      accept: '.gba,.agb,.bin', kind: '.gba', claims: isSa2,
      read: buffer => region(useSa2(buffer)),
      unload() { boostArt = tricksArt = null; },
      extras: [
        { label: 'Boost Mode', name: 'Boost Mode', hint: 'Keep running at top speed · B', get: () => boostMode, set: setBoostMode, auto: true },
        { label: 'Mid-air tricks', name: 'the mid-air tricks', hint: 'E or RB in the air · T', get: () => tricks, set: setTricks, auto: true },
      ],
    },
    {
      key: 'rush', store: RUSH_ROM, title: 'Sonic Rush', platform: 'Nintendo DS', icon: 'nds', color: '#b77dff',
      required: false, role: 'Its boost, with the flames and the sound, on top of the original game.',
      accept: '.nds', kind: '.nds', claims: isRush,
      read: buffer => region(useRush(buffer)),
      unload() { rushArt = null; },
      extras: [{ label: 'Rush boost', name: 'the Rush boost', hint: 'Shift, L or X on a controller · R', get: () => rush, set: setRush, auto: true }],
    },
  ],
  onPlay() {
    sound.load(sa1.buffer, sa1.assets.sound).catch(err => console.warn('No sound:', err));
    start(sa1.buffer, sa1.assets);
  },
});
// a setting left on from an earlier visit goes off when its ROM isn't kept any more
setup.restored.then(() => {
  if (rush && !rushArt) setRush(false);
  if (boostMode && !boostArt) setBoostMode(false);
  if (tricks && !tricksArt) setTricks(false);
  setup.refresh();
});
showRush();
showBoostMode();
showTricks();

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

// the act, after the game's start, again from what the special stage hands back (`resume`), or the next zone's
// first act with what the game carries over (`carry`)
function play(assets, resume = null, carry = null) {
  game = createGame(screen, assets, input, sound, {
    resume, carry, emeralds, continues, levelPick: assets.first !== 0 && assets.first === firstLevel && !carry,
    onSpecialStage: handover => enterSpecialStage(assets, handover),
    onNextZone: next => nextZone(next),
    // a game over without a continue goes back to the start of the game, the SEGA logo
    onTitle: () => queueMicrotask(restartGame),
  });
  fitScreen();
  showRush();
  showBoostMode();
  showTricks();
  game.start();
  screen.focus();
  clearInterval(statsTimer);
  statsTimer = setInterval(showStats, 100);
  if (debug) globalThis.onsoku = { game, assets, input, sound, nextZone };
}

// back to the start of the game, the SEGA logo, with no continues and act 1's art (read again if another
// act's is loaded)
async function restartGame() {
  continues = 0;
  const assets = sa1.assets.first === 0 ? sa1.assets : await extractAssets(sa1.buffer, () => {}, { level: 0 });
  start(sa1.buffer, assets);
}

// the last act decoded is over: the next zone's acts, decoded from the ROM now, played on with the score, the
// lives and the random numbers carried over (GameStageStart). Past the zones this game has, the screen stays.
async function nextZone({ level, ...carry }) {
  continues = carry.continues ?? continues;
  // past X Zone the Moon Zone opens with all seven Chaos Emeralds (unlock.js; the ROM also wants every
  // character to have cleared X Zone, and only Sonic is in this game); otherwise the normal ending comes, which
  // isn't built yet, and the screen keeps the results' last frame
  if (level === THE_MOON && emeralds !== ALL_EMERALDS) return;
  const from = game;
  let assets;
  try {
    assets = await extractAssets(sa1.buffer, () => {}, { level });
  } catch (err) {
    console.warn(err);
    return;
  }
  if (game !== from) return;   // the player left the game meanwhile
  game.stop();
  play(assets, null, carry);
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
  setup.refresh();
  setup.focus();
});

addEventListener('keydown', e => {
  if (e.code === 'KeyH' && !stage.hidden && !e.repeat) help.hidden = !help.hidden;
  // C shows the terrain collision over the stage, for checking it against the art
  if (e.code === 'KeyC' && game && !stage.hidden && !e.repeat) game.state.showCollision = !game.state.showCollision;
  if (e.code === 'KeyM' && !stage.hidden && !e.repeat) sound.muted = !sound.muted;
  if (e.code === 'KeyV' && !stage.hidden && !e.repeat) setWide(!wide);
  if (e.code === 'KeyR' && !stage.hidden && !e.repeat) setRush(!rush);
  if (e.code === 'KeyB' && !stage.hidden && !e.repeat) setBoostMode(!boostMode);
  if (e.code === 'KeyT' && !stage.hidden && !e.repeat) setTricks(!tricks);
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
