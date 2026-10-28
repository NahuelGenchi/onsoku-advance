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
import { createNormalEnding } from './engine/normalending.js';
import { createSound } from './sound/audio.js';
import { SCREEN_W, SCREEN_H, VIEW_MAX_W, VIEW_MAX_H } from './engine/constants.js';
import { THE_MOON, ALL_EMERALDS } from './engine/unlock.js';
import { openSave } from './engine/save.js';
import { levelInfo } from './rom/levels.js';
import { startMultiplayer, DEFAULT_SEED, DEFAULT_CHAO_PLACE } from './multiplayer.js';

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
let game = null, front = null, specialStage = null, round = null, rom = null, statsTimer = 0;

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

// the save (save.js), read as the GBA is switched on and kept in this browser, which the game changes and writes
// as it goes; the continues the special stages have given, kept for this visit; and the level the game was
// started on, the course select's (gMultiplayerCurrentLevel: the level pick's, or 0 from the start)
const save = openSave();
let continues = 0, startLevel = 0;

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
  heading: 'Insert cartridge',
  intro: 'Add or drop your ROMs. They never leave this device.',
  slots: [
    {
      key: 'sa1', store: SA1_ROM, title: 'Sonic Advance', platform: 'Game Boy Advance', required: true,
      accept: '.gba,.agb,.bin', claims: isSonicAdvance,
      async read(buffer, progress) {
        if (buffer.byteLength > MAX_GBA_BYTES) throw new RomError('This file is too large to be a Game Boy Advance ROM.');
        const assets = await extractAssets(buffer, progress, { level: firstLevel });
        sa1 = { buffer, assets };
        return `${assets.info.region} · ${assets.info.version ? 'tested version' : 'untested version'}`;
      },
      unload() { sa1 = null; },
      extras: [{ label: 'Widescreen view', hint: 'See more of the stage', key: 'V', get: () => wide, set: setWide }],
    },
    {
      key: 'sa2', store: SA2_ROM, title: 'Sonic Advance 2', platform: 'Game Boy Advance', required: false,
      accept: '.gba,.agb,.bin', claims: isSa2,
      read: buffer => region(useSa2(buffer)),
      unload() { boostArt = tricksArt = null; },
      extras: [
        { label: 'Boost Mode', hint: 'Keep running at top speed', key: 'B', get: () => boostMode, set: setBoostMode, auto: true },
        { label: 'Mid-air tricks', hint: 'E or RB in the air', key: 'T', get: () => tricks, set: setTricks, auto: true },
      ],
    },
    {
      key: 'rush', store: RUSH_ROM, title: 'Sonic Rush', platform: 'Nintendo DS', required: false,
      accept: '.nds', claims: isRush,
      read: buffer => region(useRush(buffer)),
      unload() { rushArt = null; },
      extras: [{ label: 'Rush boost', hint: 'Shift, L or X on a controller', key: 'R', get: () => rush, set: setRush, auto: true }],
    },
  ],
  onPlay() {
    sound.load(sa1.buffer, sa1.assets.sound, players).catch(err => console.warn('No sound:', err));
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
  round?.stop(); round = null;
  clearInterval(statsTimer);
}

function start(buffer, assets) {
  stopAll();
  rom = new Rom(buffer);
  picker.hidden = true;
  stage.hidden = false;
  // the extras are single-player options
  const multi = !!assets.stage.multiplayerSpawns;
  wideButton.disabled = rushButton.disabled = boostButton.disabled = tricksButton.disabled = multi;
  if (multi) { startRound(assets); return; }
  const leaving = specialTest && specialSpringStart(assets, { emeralds: save.chaosEmeralds, continues });
  if (leaving) { enterSpecialStage(assets, leaving); return; }
  if (debug) { play(assets); return; }
  front = createFrontEnd(screen, rom, assets.info.offsets, input, sound, () => { front = null; play(assets); });
  fitScreen();
  screen.focus();
}

// the act, after the game's start, again from what the special stage hands back (`resume`), or the next zone's
// first act with what the game carries over (`carry`)
function play(assets, resume = null, carry = null) {
  const levelPick = assets.first !== 0 && assets.first === firstLevel && !carry;
  if (!resume && !carry) startLevel = levelPick ? assets.first : 0;
  game = createGame(screen, assets, input, sound, {
    resume, carry, save, startLevel, continues, levelPick,
    onSpecialStage: handover => enterSpecialStage(assets, handover),
    onNextZone: next => nextZone(next),
    // a game over without a continue goes back to the start of the game, the SEGA logo
    onTitle: () => queueMicrotask(restartGame),
    // after the true ending, the staff credits; called from inside a step, so the game changes once that
    // frame is over
    onCredits: () => queueMicrotask(() => endGame(assets, 'credits')),
  });
  playing = assets;
  fitScreen();
  showRush();
  showBoostMode();
  showTricks();
  game.start();
  screen.focus();
  clearInterval(statsTimer);
  statsTimer = setInterval(showStats, 100);
  if (debug) globalThis.onsoku = { game, assets, input, sound, save, nextZone, endGame: from => endGame(assets, from) };
}

// the zone being played, whose art the ending after it reads
let playing = null;

// the ending after the last stage (normalending.js): without all seven Chaos Emeralds the congratulations after
// X Zone's results, with them the credits after the true ending; at its end the game starts over from the
// SEGA logo
function endGame(assets, from) {
  const { seed } = game.state;
  game.stop();
  game = createNormalEnding(screen, assets, input, sound, { from, emeralds: from === 'credits', seed, save, onEnd: () => queueMicrotask(restartGame) });
  fitScreen();
  game.start();
  if (debug) globalThis.onsoku = { game, assets, input, sound, save, nextZone, endGame: from => endGame(assets, from) };
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
  // character to have cleared X Zone, and only Sonic is in this game); otherwise the normal ending comes
  if (level === THE_MOON && save.chaosEmeralds !== ALL_EMERALDS) { queueMicrotask(() => endGame(playing, 'congratulations')); return; }
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
// what it hands back: the Chaos Emerald its results win goes into the save (written with the next act's results)
// and the continues it gives are kept
function enterSpecialStage(assets, handover) {
  game?.stop(); game = null;
  specialStage = createSpecialStageRun(screen, rom, assets.info.offsets, input, sound, handover, back => {
    specialStage = null;
    save.chaosEmeralds = back.emeralds;
    continues = back.continues;
    play(assets, back);
  });
  fitScreen();
  screen.focus();
  if (debug) globalThis.onsoku = { special: specialStage, assets, input, sound };
}

// the multiplayer stage's round, on a screen for each player
function startRound(assets) {
  game = null;
  screen.hidden = true;
  screens.hidden = false;
  round = startMultiplayer({ container: screens, assets, count: players, sound, seed, chaoPlace });
  fitScreen();
  clearInterval(statsTimer);
  if (debug) globalThis.onsoku = { round, assets, sound };
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
  // the widescreen view and the extras are single-player options
  if (e.code === 'KeyV' && !round && !stage.hidden && !e.repeat) setWide(!wide);
  if (e.code === 'KeyR' && !round && !stage.hidden && !e.repeat) setRush(!rush);
  if (e.code === 'KeyB' && !round && !stage.hidden && !e.repeat) setBoostMode(!boostMode);
  if (e.code === 'KeyT' && !round && !stage.hidden && !e.repeat) setTricks(!tricks);
});

function showStats() {
  if (!game) { stats.textContent = specialStage ? 'special stage' : ''; return; }
  const { player } = game.state;
  if (!player) { stats.textContent = ''; return; }
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
