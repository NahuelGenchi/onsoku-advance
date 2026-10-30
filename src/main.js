// Game page: the player's ROMs, each read in the browser as it is chosen (rom-setup.js), then the game's start
// (the logos and the intro) and the act, with its special stage between two runs of it. With ?debug Play starts
// the act straight away, and with ?special the special stage, as if Sonic had just left act 1 on its special spring.

import './engine/cpucanvas.js';
import { createRomSetup } from './ui/rom-setup.js';
import { SA1_ROM, RUSH_ROM, SA2_ROM } from './ui/rom-store.js';
import { acceptRoms } from './ui/rom-types.js';
import { extractAssets } from './rom/extract.js';
import { isSonicAdvance, RomError } from './rom/identify.js';
import { Rom } from './rom/rom.js';
import { createFrontEnd } from './front/front.js';
import { extractRush, isRush } from './rom/rush.js';
import { openSa2, isSa2 } from './rom/sa2.js';
import { readBoostArt } from './rom/sa2boost.js';
import { trickArt } from './rom/sa2tricks.js';
import { createInput, connectedPads } from './engine/input.js';
import { createGame, specialSpringStart } from './engine/game.js';
import { createSpecialStageRun } from './special/run.js';
import { createNormalEnding } from './engine/normalending.js';
import { createSound } from './sound/audio.js';
import { SCREEN_W, SCREEN_H, VIEW_MAX_W, VIEW_MAX_H } from './engine/constants.js';
import { THE_MOON, ALL_EMERALDS } from './engine/unlock.js';
import { openSave } from './engine/save.js';
import { levelInfo } from './rom/levels.js';
import { startMultiplayer, DEFAULT_SEED, DEFAULT_CHAO_PLACE } from './multiplayer.js';
import { openAchievements } from './achievements/store.js';
import { createUnlockPopup } from './achievements/popup.js';
import { createAchievementsPanel } from './achievements/panel.js';
import { holdClocks } from './engine/clock.js';
import { createSheet } from './ui/sheet.js';
import { createControlsView } from './ui/controls-view.js';
import { createAssetsSheetView } from './ui/assets-view.js';

const picker = document.getElementById('picker');
const stage = document.getElementById('stage');
const screen = document.getElementById('screen');
const stats = document.getElementById('stats');
const wideButton = document.getElementById('wide');
const rushButton = document.getElementById('rush');
const boostButton = document.getElementById('boost-mode');
const tricksButton = document.getElementById('tricks');
const romFile = document.getElementById('rom-file');
const romStatus = document.getElementById('rom-status');
const soundButton = document.getElementById('sound');
const settingsButton = document.getElementById('settings-open');
const touch = document.getElementById('touch');
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
// `?character=` plays as Sonic (0, the default), Tails (1) or Knuckles (2), until the character select is built; the
// multiplayer stage is everyone as Sonic
const character = multiplayer ? 0 : Math.min(2, Math.max(0, Number(params.get('character') ?? 0) | 0));
const screens = document.getElementById('screens');
stage.classList.toggle('debug', debug);   // the panel shows the player's speed and state then

const input = createInput();
input.bindTouch(touch);
const sound = createSound();

// an extra's switch in the settings, with the line under it: what it does, or the ROM it still needs (`needs`), for
// which it opens the file list
function showSetting(button, on, needs = null) {
  button.setAttribute('aria-checked', String(on));
  const hint = button.querySelector('.row-hint');
  hint.textContent = needs ? `Needs your ${needs} ROM` : hint.dataset.hint;
  button.toggleAttribute('data-file', !!needs);
}

// The game's settings are behind a button in the top-left corner as on dreamports.net, and open as a sheet in the
// middle of the screen, over the game (sheet.js); on touch screens an Xbox controller's buttons are drawn around the
// game too. H, or View + Menu on a controller, opens and closes them as well.
const portrait = matchMedia('(pointer: coarse) and (orientation: portrait)');
const sheet = createSheet(stage, document.getElementById('sheet-wrap'), {
  onOpen() { settingsButton.setAttribute('aria-expanded', 'true'); holdGame(); },
  onClose() { settingsButton.setAttribute('aria-expanded', 'false'); holdGame(); if (!stage.hidden) screen.focus(); },
  canOpen: () => !stage.hidden,
  blocked(el) {
    if (el.closest('.rom')) setup.blocked(el);
    else romStatus.textContent = 'Your browser opens the file list only from the mouse or the keyboard. You can drop the ROM in Your ROMs instead.';
  },
});
const settingsView = document.getElementById('settings');
sheet.view('settings', { el: settingsView, show: () => { romStatus.textContent = ''; }, first: () => settingsView.querySelector('.resume') });
// while the settings are open the game waits: its clocks hold (clock.js), its sound stops where it is and what was
// held is let go, so it goes on from the same frame once they close. Its keys wait too, so the page's own work as
// they do on any page.
let holding = false, keysWere = false;
const running = () => !!(front || game || specialStage || round);
function holdGame() {
  const on = !stage.hidden && sheet.isOpen;
  if (on === holding) return;
  holding = on;
  holdClocks(on);
  sound.held = on;
  input.release();
  if (on) { keysWere = input.enabled; input.enabled = false; }
  else if (keysWere && running()) input.enabled = true;
}
// a finger opens them as it lifts: touches on the game's screen are cancelled, but in the settings, so iOS doesn't
// bring up its magnifier on one held down, and so don't click. The mouse and the keyboard click.
let tappedAt = -Infinity;
settingsButton.addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch') return;
  tappedAt = e.timeStamp;
  sheet.open();
});
settingsButton.addEventListener('click', e => { if (e.timeStamp - tappedAt > 800) sheet.open(); });
stage.addEventListener('touchstart', e => { if (!sheet.isOpen) e.preventDefault(); }, { passive: false });
// the drawn buttons step aside while a controller is connected, looked for each frame as browsers don't all say
// when one comes (and show one only once a button on it is pressed); the settings button stays
// (from the first frame, once the page is set up: a controller the browser already shows needs fitScreen)
requestAnimationFrame(function watchPads() {
  const on = connectedPads().length > 0;
  if (on !== touch.hidden) { touch.hidden = on; fitScreen(); }
  requestAnimationFrame(watchPads);
});

// how solid the drawn buttons are, set in the settings' Button opacity: 20 to 100 %, 60 at first. The settings
// button and the buttons that cover the game are a step fainter (app.css).
const OPACITY_KEY = 'onsoku.touchOpacity', opacitySlider = document.getElementById('button-opacity');
const OPACITY_MIN = Number(opacitySlider.min), OPACITY_MAX = Number(opacitySlider.max);
function showOpacity(value) {
  opacitySlider.value = String(value);
  stage.style.setProperty('--t-opacity', String(value / 100));
}
try {
  const kept = Number(localStorage.getItem(OPACITY_KEY) ?? NaN);
  if (kept >= OPACITY_MIN && kept <= OPACITY_MAX) opacitySlider.value = String(kept);
} catch { /* storage blocked: the default stands */ }
showOpacity(Number(opacitySlider.value));
function setOpacity(value) {
  showOpacity(value);
  try { localStorage.setItem(OPACITY_KEY, String(value)); } catch { /* not remembered */ }
}
opacitySlider.addEventListener('input', () => setOpacity(Number(opacitySlider.value)));
// a finger anywhere along it moves it, where iOS only moves a slider by its knob
opacitySlider.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
const slideTo = e => {
  const r = opacitySlider.getBoundingClientRect(), at = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  setOpacity(OPACITY_MIN + Math.round(at * (OPACITY_MAX - OPACITY_MIN) / 5) * 5);
};
opacitySlider.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  opacitySlider.setPointerCapture(e.pointerId);
  slideTo(e);
});
opacitySlider.addEventListener('pointermove', e => { if (e.pointerType === 'touch' && opacitySlider.hasPointerCapture(e.pointerId)) slideTo(e); });

// the achievements, kept in this browser and, on dreamports.net, on the player's profile (store.js): each new one
// shows its popup over the game, and so does the game's status once it changes (Beaten, Mastered); the settings show
// how many are earned and open the list of them
const achievements = openAchievements();
const unlockPopup = createUnlockPopup(stage, screen, () => sound);
const achievementsButton = document.getElementById('achievements-open');
const achievementsPanel = createAchievementsPanel(sheet, achievements, achievementsButton);
achievements.onUnlock(a => {
  unlockPopup.show(a);
  achievementsPanel.refresh();
});
// those the profile has from other devices are counted and listed as they come, without a popup
achievements.onProfile(() => achievementsPanel.refresh());
const STATUS_POPUPS = {
  beaten: { title: 'Game Beaten', said: 'Sonic Advance beaten' },
  mastered: { title: 'Game Mastered', said: 'Sonic Advance mastered' },
};
// after the achievements the same moment earns (an act's results earn several at once); not for a status the
// profile brings
achievements.onStatus((status, fromProfile) => {
  if (!fromProfile && STATUS_POPUPS[status]) queueMicrotask(() => unlockPopup.show(STATUS_POPUPS[status]));
});
// a game counts for them when it starts from the game's start (or is a multiplayer round, which only the level pick
// reaches): not from ?debug, ?special or another act's ?level
let counts = false;
const achieve = id => { if (counts) achievements.unlock(id); };
achievementsButton.addEventListener('click', () => sheet.go('achievements'));

// every key and every controller button, and what each does
createControlsView(sheet);
document.getElementById('controls-open').addEventListener('click', () => sheet.go('controls'));

// the sound, also M on a keyboard
function showSound() { showSetting(soundButton, !sound.muted); }
soundButton.addEventListener('click', () => { sound.muted = !sound.muted; showSound(); });
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
wideButton.addEventListener('click', () => setWide(!wide));

// An extra turned on in the game without its ROM asks for the ROM there, and is turned on once it is read.
let asked = null;
function ask(slot, accept, then) {
  asked = { slot, then };
  acceptRoms(romFile, accept);
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
  showSetting(rushButton, rush, rushArt ? null : 'Sonic Rush');
}
function useRush(buffer) {
  rushArt = extractRush(buffer);
  sound.loadRush(rushArt.sound);
  return rushArt.code;
}
rushButton.addEventListener('click', () => setRush(!rush));

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
  showSetting(boostButton, boostMode, boostArt ? null : 'Sonic Advance 2');
}
boostButton.addEventListener('click', () => setBoostMode(!boostMode));
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
  showSetting(tricksButton, tricks, tricksArt ? null : 'Sonic Advance 2');
}
tricksButton.addEventListener('click', () => setTricks(!tricks));
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
  intro: 'Your ROMs stay on this device.',
  slots: [
    {
      key: 'sa1', store: SA1_ROM, title: 'Sonic Advance', required: true,
      accept: '.gba,.agb,.bin', claims: isSonicAdvance,
      async read(buffer, progress) {
        if (buffer.byteLength > MAX_GBA_BYTES) throw new RomError('This file is too large to be a Game Boy Advance ROM.');
        const assets = await extractAssets(buffer, progress, { level: firstLevel, character });
        sa1 = { buffer, assets };
        quitToStart();   // another Sonic Advance ROM: the game being played ends, and Play starts the new one's
        return `${assets.info.region} · ${assets.info.version ? 'tested version' : 'untested version'}`;
      },
      unload() {
        sa1 = null;
        quitToStart();   // the game being played went with it
      },
      extras: [{ label: 'Widescreen view', hint: 'See more of the stage', key: 'V', get: () => wide, set: setWide }],
    },
    {
      key: 'sa2', store: SA2_ROM, title: 'Sonic Advance 2', required: false,
      accept: '.gba,.agb,.bin', claims: isSa2,
      read(buffer) {
        const code = useSa2(buffer);
        showBoostMode();
        showTricks();
        return region(code);
      },
      unload() { boostArt = tricksArt = null; showBoostMode(); showTricks(); },
      extras: [
        { label: 'Boost Mode', hint: 'Keep running at top speed', key: 'B', get: () => boostMode, set: setBoostMode, auto: true },
        { label: 'Mid-air tricks', hint: 'Flips and dives in the air', keys: 'with E or I (RB on a controller)', key: 'T', get: () => tricks, set: setTricks, auto: true },
      ],
    },
    {
      key: 'rush', store: RUSH_ROM, title: 'Sonic Rush', required: false,
      accept: '.nds', claims: isRush,
      read(buffer) {
        const code = useRush(buffer);
        showRush();
        return region(code);
      },
      unload() { rushArt = null; showRush(); },
      extras: [{ label: 'Rush boost', hint: 'A burst of speed', keys: 'with Shift or L (X on a controller)', key: 'R', get: () => rush, set: setRush, auto: true }],
    },
  ],
  onChange: () => queueMicrotask(showRomCount),   // once the page is set up
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

// the game being played, ended from the settings: back to the start screen, where Play starts a new one
function quitToStart() {
  if (stage.hidden) return;
  stopAll();
  sheet.close({ now: true });
  stage.hidden = true;
  picker.hidden = false;
  scrollTo(0, 0);
  setup.focus();
}

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
  stage.classList.toggle('multi', multi);   // its players play with keyboards and controllers
  sheet.close({ now: true });
  counts = !debug && !specialTest && (assets.first === 0 || multi);
  if (multi) { startRound(assets); return; }
  const leaving = specialTest && specialSpringStart(assets, { emeralds: save.chaosEmeralds, continues });
  if (leaving) { enterSpecialStage(assets, leaving); return; }
  if (debug) { play(assets); return; }
  front = createFrontEnd(screen, rom, assets.info.offsets, input, sound, save, () => { front = null; play(assets); });
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
    achieve,
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
  const assets = sa1.assets.first === 0 ? sa1.assets : await extractAssets(sa1.buffer, () => {}, { level: 0, character });
  start(sa1.buffer, assets);
}

// the last act decoded is over: the next zone's acts, decoded from the ROM now, played on with the score, the
// lives and the random numbers carried over (GameStageStart). Past the zones this game has, the screen stays.
async function nextZone({ level, ...carry }) {
  continues = carry.continues ?? continues;
  // past X Zone the Moon Zone opens for Sonic with all seven Chaos Emeralds (unlock.js; the ROM also wants every
  // character to have cleared X Zone, which waits for the character select); otherwise the normal ending comes
  if (level === THE_MOON && (character !== 0 || save.chaosEmeralds !== ALL_EMERALDS)) { queueMicrotask(() => endGame(playing, 'congratulations')); return; }
  const from = game;
  let assets;
  try {
    assets = await extractAssets(sa1.buffer, () => {}, { level, character });
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
  specialStage = createSpecialStageRun(screen, rom, assets.info.offsets, input, sound, { ...handover, btnConfig: save.btnConfig, achieve }, back => {
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
  round = startMultiplayer({ container: screens, assets, count: players, sound, seed, chaoPlace, language: save.uiLanguage, btnConfig: save.btnConfig, achieve });
  fitScreen();
  clearInterval(statsTimer);
  if (debug) globalThis.onsoku = { round, assets, sound };
}

// Your ROMs, in the settings: the start screen's rows (rom-setup.js), lent to them while they show, how many of the
// ROMs are in and a place to drop one
const romsView = sheet.view('roms', {
  title: 'Your ROMs',
  show: () => setup.lend({ list: romsView.el.querySelector('.roms-list'), foot: romsView.el.querySelector('.roms-foot'), note: romsView.el.querySelector('.play-note'), drop: romsView.el.querySelector('.drop') }),
  hide: () => setup.lend(null),
  first: () => romsView.el.querySelector('[data-back]'),
});
romsView.body.innerHTML = `
  <div class="split">
    <aside class="side sheet-rise">
      <div class="sum"><p class="sum-num"><b></b><span></span></p><span class="cells" aria-hidden="true"></span></div>
      <p class="side-note">Your ROMs stay on this device.</p>
      <div class="setup roms-foot"></div>
      <div class="drop"><svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h1v5H3zM1 2h1v1H1zM5 2h1v1H5zM2 3h1v1H2zM4 3h1v1H4zM0 5h1v1H0zM6 5h1v1H6zM0 6h7v1H0z"/></svg>Drop a ROM anywhere here<small>It goes to its own game</small></div>
    </aside>
    <section class="main"><div class="setup roms-list sheet-rise"></div><p class="play-note" aria-live="polite"></p></section>
  </div>`;
function showRomCount() {
  const { ready, all } = setup.count();
  document.getElementById('roms-count').textContent = `${ready} of ${all} in`;
  romsView.el.querySelector('.sum-num b').textContent = ready;
  romsView.el.querySelector('.sum-num span').textContent = `/${all} ROMs in`;
  romsView.el.querySelector('.sum .cells').innerHTML = Array.from({ length: all }, (_, i) => `<i${i < ready ? ' class="on"' : ''}></i>`).join('');
}
showRomCount();
document.getElementById('change-rom').addEventListener('click', () => sheet.go('roms'));
// the asset viewer shows what was decoded for the act being played, or the first one before it starts; with a
// modifier, the link opens it on its own page
createAssetsSheetView(sheet, () => playing ?? sa1?.assets);
document.getElementById('assets-open').addEventListener('click', e => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !sa1) return;
  e.preventDefault();
  sheet.go('assets');
});

addEventListener('keydown', e => {
  if (e.code === 'KeyH' && !stage.hidden && !e.repeat) { if (sheet.isOpen) sheet.close(); else sheet.open(); }
  // C shows the terrain collision over the stage, for checking it against the art
  if (e.code === 'KeyC' && game && !stage.hidden && !e.repeat) game.state.showCollision = !game.state.showCollision;
  if (e.code === 'KeyM' && !stage.hidden && !e.repeat) { sound.muted = !sound.muted; showSound(); }
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

// the largest scale that is a whole number of the screen's own pixels, so every pixel of the game stays square
// and sharp; a tiny window shrinks it instead
function pixelScale(fit) {
  const dpr = devicePixelRatio || 1;
  return fit * dpr >= 1 ? Math.floor(fit * dpr) / dpr : Math.max(fit, 0.25);
}
// the room the game has: the whole window, or on a touch screen held upright what's between the settings button
// and the drawn buttons below the game, with how much is left under it (`below`)
function gameRoom() {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  if (!portrait.matches || stage.hidden || round || touch.hidden) return { vw, vh, below: 0 };
  const top = parseFloat(getComputedStyle(stage).paddingTop) || 0;
  const bottom = touch.querySelector('.shoulders').getBoundingClientRect().top - 16;
  return { vw, vh: Math.max(SCREEN_H, bottom - top), below: Math.max(0, vh - bottom) };
}
// the original screen at the largest sharp scale it fits at; the widescreen view then fills what the room has
// around it at that scale, up to its largest size, in the game's start as in the act
function fitScreen() {
  const { vw, vh, below } = gameRoom();
  stage.style.paddingBottom = below ? `${below}px` : '';   // so the game is in the middle of its room
  const scale = pixelScale(Math.min(vw / SCREEN_W, vh / SCREEN_H));
  const size = (room, min, max) => (wide ? Math.max(min, Math.min(max, Math.floor(room / scale) & ~1)) : min);
  const w = size(vw, SCREEN_W, VIEW_MAX_W), h = size(vh, SCREEN_H, VIEW_MAX_H);
  front?.setView(w, h);
  specialStage?.setView(w, h);
  game?.setView(w, h);
  screen.style.width = `${w * scale}px`;
  screen.style.height = `${h * scale}px`;
  if (round) fitScreens();
  showSetting(wideButton, wide);
  markCovers();
}
// on a screen too wide or too square for the buttons to fit beside the game, those that cover part of it are
// more see-through
function markCovers() {
  const view = screen.getBoundingClientRect();
  const covers = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left < view.right && r.right > view.left && r.top < view.bottom && r.bottom > view.top;
  };
  for (const group of touch.children) group.classList.toggle('covers', covers(group));
}
// the players' screens, side by side or one above the other, whichever fits them larger; four in two rows
function fitScreens() {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, gap = 8;
  const layouts = players === 2 ? [[2, 1], [1, 2]] : [[2, 2], [players, 1]];
  let best = null;
  for (const [cols, rows] of layouts) {
    const scale = pixelScale(Math.min((vw - gap * (cols - 1)) / (cols * SCREEN_W), (vh - gap * (rows - 1)) / (rows * SCREEN_H)));
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
