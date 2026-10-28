// The extra stage, the Moon Zone (SAT-R decompilation, src/game/sa1/stage.c CreateGameStage and
// stage/player_super_sonic.c, checked in the USA ROM): Super Sonic against the Super Egg Robo over the ground
// the stage scrolls under them. It runs as act 1 does, from one task list at the original's priorities, with
// its own player, its boss, the robot's display effects and no rings to collect but the ones its capsules
// spill. The title card is act 1's without an act number; as it ends, the HUD comes up and a WARNING sign
// flashes, and on the WARNING's 128th frame the robot starts to move. Super Sonic starts with 50 rings, which
// run down by one a second; at none he dies, and the stage starts over, or with his last life the game over
// comes (gameover.js), as it does in the acts. Beating the robot fades the screen
// to white and goes on to the true ending (trueending.js), which ends where the staff credits start
// (`onCredits`).

import { TICK_MS, SCREEN_W, SCREEN_H } from './constants.js';
import { createClock } from './clock.js';
import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { createCamera, updateCamera, viewOf } from './camera.js';
import { createTerrain } from './terrain.js';
import { createTasks, makeSprite, animate } from './objects.js';
import { createScatter } from './scatter.js';
import { createHud, updateHud } from './hud.js';
import { createTitleCard, runTitleCard } from './titlecard.js';
import { createGameOver, runGameOver } from './gameover.js';
import { createExtraRenderer } from './extrarender.js';
import { createTrueEnding } from './trueending.js';
import { createEndingRenderer } from './endingrender.js';
import { SINE } from './trig.js';
import {
  createSuperSonic, superSonicTask, groundScroll, resetSparkles, START_RINGS, IGNORE_INPUT,
  KEY_A, KEY_B, KEY_RIGHT, KEY_LEFT, KEY_UP, KEY_DOWN,
} from './supersonic.js';
import { createSuperEggRobo, BOSS } from './eggrobo.js';
import { SONG } from '../sound/songs.js';
import { createPauseMenu, PAUSE_PRIORITY } from './pause.js';
import { openSave, saveActCleared, saveMoonCleared, WRITE_FRAMES } from './save.js';

const START_LIVES = 3;
const MAX_BRAKE_DUST = 20;     // CreateBrakingDustEffect's pool
const MAX_RING_SPARKLES = 8;
const PLAYER = 0x3000, BRAKE_DUST = 0x4001, WARNING = 0x2101, HUD = 0x2180, GAME_OVER = 0x2000;
const DARKEN = 0x3FFF;   // BLDCNT as the game over's fade sets it: the brightness decrease on everything
const SCATTER_GRAVITY = 7;     // the scattered rings' fall on the extra stage (InitPlayerHitRingsScatter)
// the display registers as StageInit_Zone7Act2 leaves them: BG0 to BG2 and the sprites on
const DISPCNT = 0x1F41;
const SUPER_EGG_ROBO = 31;     // the robot's entity kind
// CreateExtraStageResults writes the save game with interrupts off. mGBA 0.10.5 goes on showing the last frame
// meanwhile, 14 frames without the HBlank interrupt (the write's, WRITE_FRAMES, only when the save has changed
// since it was last written) and one with it back on, then the ending's white screen for two before its first
// frame runs.
const SAVE_FRAMES = 16;
const SINE8 = a => SINE[a & 1023] >> 6;   // SIN_24_8

const SILENT = {
  play() {}, playOn() {}, playStageMusic() {}, oneUp() {}, stop() {}, playerState() {}, stopAll() {}, pause() {}, continueAll() {},
};

/**
 * The Moon Zone, with the same interface as createGame (game.js). On the true ending's 30th frame
 * `stageResults({ rings, courseTime, level })` puts up the results' tally (#69's), and `onCredits()` is called
 * on the frame the staff credits take over from the ending. `save`, `startLevel`, `continues`, `carry` and
 * `onTitle()` are createGame's: the save, which the robot's defeat and the game over write, the level the game was
 * started on, the continues the game has, what the game carries over from X Zone (GameStageStart keeps the score,
 * the lives and the random numbers; without it, the course select's start: no score, three lives, the random
 * numbers from 0), and what a game over without a continue does once it is done.
 */
export function createExtraStage(canvas, assets, input, sound = SILENT, { stageResults, onCredits = () => {}, save = openSave(null), startLevel = 0, continues = 0, carry = null, onTitle = () => {} } = {}) {
  const difficulty = save.difficultyLevel;
  const { anims } = assets.sprites;
  const stage = assets.stage, terrain = createTerrain(stage.collision);
  const bodyAnims = { roboBody: stage.extra.body.anim };
  const tasks = createTasks();
  const scatter = createScatter(anims, { gravity: SCATTER_GRAVITY, floorX: groundScroll });
  scatter.reset();
  const render = createExtraRenderer(canvas, assets);
  let renderEnding = null, shown = null;   // what the last frame showed, which the screen holds during the save
  // The HUD's face shares its sprite palette row with Super Sonic, whose animations load his colours there; the
  // one he dies in is Sonic's own death (21), which loads Sonic's on the frame after he dies, when it is first
  // drawn, so the face shows them from then on
  const withFace = s => (player.death ? s : { ...s, hud: { sprites: s.hud.sprites.map(h => (h[0] === 'face' ? ['faceSuper', h[1], h[2]] : h)) } });
  const drawFrame = () => {
    if (!state.ending) { render(withFace(state)); return; }
    // the screen keeps the frame before; with the HBlank interrupt off BG1's lines from 91 down don't scroll
    if (state.saving > 1) { render(withFace({ ...state, ...shown, hblank: state.saving === 2 })); return; }
    renderEnding ??= createEndingRenderer(render.parts, stage.extra.ending);
    renderEnding(state.ending.state);
  };
  const freshDisplay = () => ({ dispcnt: DISPCNT, winIn: 0, winOut: 0, bldCnt: 0, bldY: 0, win0: null, win0Lines: null });
  const player = createSuperSonic(stage.spawn);
  const state = {
    tick: 0, player, terrain, cam: createCamera(player, terrain), view: null, sprites: [], windows: [], body: null,
    scrollX: 0,            // how much further than the camera the ground has scrolled (RenderMetatileLayers)
    ringCount: START_RINGS, lives: carry?.lives ?? START_LIVES, score: carry?.score ?? 0, courseTime: 0,
    actStart: true,        // STAGE_FLAG__ACT_START: the title card, a death or the robot's defeat stop the clock
    hud: createHud(), card: null, display: freshDisplay(), seed: carry?.seed ?? 0, ended: false,
    ending: null,          // the true ending, once the robot is beaten
    saving: 0,             // the frames the save game still takes before it
    continues,             // gUnknown_0300543C: a game over uses one to go on
    gameOver: null,        // the game over (gameover.js) once Super Sonic has lost his last life
    noPause: true,         // STAGE_FLAG__DISABLE_PAUSE_MENU: Start opens no pause menu
    pauseGame: false,      // FLAGS_PAUSE_GAME, which the pause menu sets (pause.js)
    paused: false,         // the game is paused (FLAGS_800): only the pause menu's task runs (step)
    pauseSign: null,       // the pause menu's sign on the frames it shows it; only drawing reads it
  };
  let viewW = SCREEN_W, viewH = SCREEN_H;
  state.view = viewOf(state.cam, viewW, viewH);
  let restart = null, toTitle = false, loading = false, cardPad = [], brakeDust = MAX_BRAKE_DUST, spawned = false;
  // the frames the game over's save still takes (WRITE_FRAMES), in which nothing else runs and the screen keeps
  // its frame, and what comes after it
  let saving = 0, afterSave = null;
  let startHeld = false, startPressed = false;   // Start as the last frame read it, and pressed this frame
  const sparkles = new Set();
  const random = () => (state.seed = (Math.imul(state.seed, 0x196225) + 0x3C6EF35F) >>> 0);

  // a sprite in this frame's list, as game.js's; a sprite in OBJ window mode makes the OBJ window instead
  function draw(s, x, y, affine = null, { window = false, screen = false } = {}) {
    if (s.frame < 0) return;
    (window ? state.windows : state.sprites).push({ frame: s.frame, x, y, flipX: s.flipX, flipY: s.flipY, affine, order: s.order, prio: s.prio, screen });
  }

  // what Super Sonic and the robot see of the stage
  const w = {
    terrain, anims, bodyAnims, random, draw,
    get player() { return player; },
    get tick() { return state.tick; },
    cam: { x: 0, y: 0 },
    get display() { return state.display; },
    priority: PLAYER,
    robo: null,
    input() {
      return (input.jump ? KEY_A : 0) | (input.attack ? KEY_B : 0) | (input.right ? KEY_RIGHT : 0) | (input.left ? KEY_LEFT : 0)
        | (input.up ? KEY_UP : 0) | (input.down ? KEY_DOWN : 0);
    },
    play: song => sound.play(song),
    stop: song => sound.stop(song),
    add: (task, priority) => tasks.add(task, priority),
    get rings() { return state.ringCount; },
    set rings(n) { state.ringCount = n; },
    get actStart() { return state.actStart; },
    get bossDown() { return !!w.robo && (w.robo.flags & 0x80) !== 0; },
    // the camera's limits, which it uses from the next frame; the original's maxX is the screen's right edge
    camLimits(minY, maxX, shiftX, shiftY) {
      Object.assign(state.cam, { minY, maxX: maxX - SCREEN_W, shiftX, shiftY });
    },
    died() { state.cam.locked = true; state.actStart = true; },
    // HandleLifeLost: a life less. With lives left the stage starts over, and the original destroys every task,
    // so nothing after Super Sonic's runs this frame. The last one brings the game over, with the stage and the
    // robot running on behind it; a continue left is used for it. CreateGameOverScreen clears the blending and
    // the windows the robot's effects use.
    lifeLost() {
      state.noPause = true;
      state.lives = (state.lives - 1) & 0xFF;
      if (state.lives !== 0) { restart = restartStage; tasks.stop(); return; }
      state.actStart = true;
      state.gameOver = createGameOver(assets.gameOver, state.continues > 0);
      if (state.continues > 0) state.continues--;
      Object.assign(state.display, { bldCnt: 0, bldY: 0, win0: null });
      sound.play(assets.gameOver.song);
      tasks.add(gameOverTask, GAME_OVER);
    },
    stopClock() { state.actStart = true; },
    // INCREMENT_SCORE_A: every 50000 points a life
    addScore(n) {
      const before = state.score;
      state.score += n;
      if (Math.trunc(state.score / 50000) !== Math.trunc(before / 50000)) state.lives = Math.min(state.lives + 1, 255);
    },
    body(sprite, sx, sy, rotation) { state.body = { frame: sprite.frame, sx, sy, rotation }; },
    scatterRings(x, y, n) { scatter.launchCapsule(x, y, n, player.layer, random); },
    brakeDust(x, y, dx) { if (brakeDust > 0) { brakeDust--; tasks.add(dust(x, y, dx), BRAKE_DUST); } },
    // the fade has reached white: TasksDestroyAll, and the true ending takes over (CreateExtraStageResults), with
    // the Moon cleared in the save, which is written; the stage results it puts up count the rings into the
    // save's ring bank (CreateStageResults). Without its art (a ROM version where it isn't found) the credits
    // come straight on.
    defeated() {
      tasks.stop();
      state.ended = true;
      saveMoonCleared(save);
      const written = save.write();
      if (!stage.extra.ending) { onCredits(); return; }
      const results = r => { saveActCleared(save, { ...r, startLevel }); stageResults?.(r); };
      state.ending = createTrueEnding(anims, sound, { rings: state.ringCount, courseTime: state.courseTime, stageResults: results, onCredits });
      state.saving = written ? SAVE_FRAMES : SAVE_FRAMES - WRITE_FRAMES;
    },
  };

  // CreateBrakingDustEffect: a cloud of dust that stays where it was kicked up, drifting left
  function dust(x, y, dx) {
    const r = random();
    const s = makeSprite('brakeDust', { flipX: (r & 0x400) !== 0, flipY: (r & 0x800) !== 0, order: 8, prio: 2 });
    return {
      run() {
        if (animate(s, anims)) { brakeDust++; return false; }
        draw(s, x, y);
        x += dx;
        return true;
      },
    };
  }

  // a ring taken (CreateCollectRingEffect and INCREMENT_RINGS, which gives no life on the extra stage): its
  // sparkle and sound, as act 1's
  function addRing({ x, y }) {
    state.ringCount = (state.ringCount + 1) & 0xFFFF;
    if (sparkles.size >= MAX_RING_SPARKLES) return;
    const odd = state.ringCount & 1;
    sound.playOn(odd ? 2 : 1, SONG.RING, 128, odd ? -64 : 64);
    const s = { anim: makeAnimator(), frame: -1, flipX: false, flipY: false, order: 15, prio: 2 };
    setAnim(s.anim, 'ringSparkle');
    sparkles.add(s);
    tasks.add({
      run() {
        if (s.anim.done) return false;
        if (s.anim.i < 0) sound.play(SONG.RING);
        if (tickAnim(s.anim, anims)) sparkles.delete(s);
        s.frame = frameOf(s.anim, anims);
        draw(s, x, y);
        return true;
      },
    });
  }

  // sub_804A5D8 and Task_804A71C: the WARNING sign's four pieces in the middle of the screen, flashing by
  // squashing every 32 frames for 192 frames; the first lets the robot go on its 128th
  function warning(piece) {
    const s = makeSprite(`warning${piece}`, { order: 0, prio: 0 });
    let count = 0;
    return {
      run() {
        if (count >= 0xC0) return false;
        if (count === 0x80 && piece === 0 && w.robo) w.robo.flags &= ~0x400000;
        const v = (count & 0x1F) << 11;
        let sx = 256, sy = 256;
        if (v !== 0 && v < 0x4000) sy = SINE8(v >> 6);
        else if (v >= 0xE000) {
          const k = SINE8((((v - 0xE000) << 1) >> 6) & 1023);
          sx = k + 256; sy = 256 - k;
        }
        animate(s, anims);
        draw(s, 120, 80, { rotation: 0, scaleX: sx || 2, scaleY: sy || 2, double: true }, { screen: true });
        count++;
        return true;
      },
    };
  }

  const hudTask = {
    run() {
      if (updateHud(state.hud, { ...state, stageTime: state.tick })) sound.play(SONG.TIMER);
      return true;
    },
  };
  function startCard() { state.card = createTitleCard(assets.titleCard); state.actStart = true; state.noPause = true; state.hud.sprites = []; }

  // the stage starts over after a lost life with 50 rings; its music starts again at once and loading takes the
  // whole next frame
  function restartStage() {
    state.gameOver = null;
    // a fresh Super Sonic (CreatePlayer), into the object his task and the camera hold; his getters only read
    // these fields, so only the fields are copied (Object.assign would try to set the getters)
    const fresh = createSuperSonic(stage.spawn);
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(fresh))) if ('value' in d) player[k] = d.value;
    state.cam = createCamera(player, terrain);
    state.view = viewOf(state.cam, viewW, viewH);
    tasks.reset(); scatter.reset(); sparkles.clear(); resetSparkles();
    Object.assign(state, { ringCount: START_RINGS, courseTime: 0, sprites: [], windows: [], body: null, display: freshDisplay() });
    w.robo = null; spawned = false; brakeDust = MAX_BRAKE_DUST;
    startCard();
    sound.playStageMusic(stage.music);
    loading = true;
  }

  // ApplyGameStageSettingsAndStart, after a continue: three lives, no score, and the stage from its start, its
  // stage clock from 0 too
  function continueStage() {
    state.lives = START_LIVES; state.score = 0; state.tick = 0;
    restartStage();
  }

  // the game over's tasks, as one (gameover.js), reading this frame's A and B; once it is done the original
  // writes the save, then destroys every task, and the stage starts over with the continue or the game goes
  // back to its start
  const gameOverTask = {
    run() {
      const a = input.jumpPressed, b = input.attackPressed;
      input.jumpPressed = false; input.attackPressed = false; input.boostPressed = false;
      const go = state.gameOver, end = runGameOver(go, sound, a, b);
      if (end) {
        const after = end === 'continue' ? () => { restart = continueStage; } : () => { toTitle = true; };
        if (save.write()) { saving = WRITE_FRAMES; afterSave = after; } else after();
        tasks.stop();
      }
      // its fade writes the brightness decrease every frame, before the robot's task, which can write over it
      // (the end of a laser clears BLDCNT, and that frame isn't darkened)
      else if (go.fade.on || go.black) Object.assign(state.display, { bldCnt: DARKEN, bldY: go.bldY });
      return true;
    },
  };

  // the stage's tasks in CreateGameStage's order
  const STAGE_TASKS = [
    // the camera, with the limits Super Sonic set on the last frame; the ground's scroll follows it
    [0x0F00, () => {
      updateCamera(state.cam, player);
      w.cam = { x: Math.floor(state.cam.x), y: Math.floor(state.cam.y) };
      state.view = viewOf(state.cam, viewW, viewH);
      state.scrollX = groundScroll(w.cam.x, state.tick) - w.cam.x;
    }],
    // the entities manager makes the robot from its map entity; it runs from the next frame, its parts from this
    [0x2000, () => {
      if (spawned) return;
      spawned = true;
      const e = stage.enemies.find(en => en.kind === SUPER_EGG_ROBO);
      if (e) tasks.add(createSuperEggRobo(e, w, difficulty), BOSS);
    }],
    [0x2001, () => {
      for (const ring of scatter.update(player, state.view, terrain, state.tick)) addRing(ring);
      const dropped = scatter.visible();
      for (const r of dropped.list) draw({ frame: dropped.frame, flipX: false, flipY: false, order: 20, prio: 2 }, r.x, r.y);
    }],
    // the title card, as act 1's; as it ends Super Sonic takes the controls, and the HUD and the WARNING sign
    // come up from the next frame
    [0x2100, () => {
      if (state.card === null) return;
      const pad = ['left', 'right', 'up', 'down'].filter(k => input[k]);
      const pressed = input.jumpPressed || input.attackPressed || pad.some(k => !cardPad.includes(k));
      cardPad = pad;
      input.jumpPressed = false; input.attackPressed = false; input.boostPressed = false;
      if (runTitleCard(state.card, pressed)) return;
      state.card = null; state.actStart = false; state.noPause = false;
      player.moveState &= ~IGNORE_INPUT;
      state.hud = createHud();
      tasks.add(hudTask, HUD);
      for (let i = 0; i < 4; i++) tasks.add(warning(i), WARNING);
    }],
    [PLAYER, null],
    [0x4000, () => { sound.playerState(false, false, !player.dead); }],
    // the stage clock; Start opens the pause menu (pause.js) from when the title card ends until a life is lost
    [0xFF00, () => {
      if (!state.noPause && startPressed) tasks.add(createPauseMenu({ state, anims, sound, startPressed: () => startPressed }), PAUSE_PRIORITY);
      if (!state.actStart) state.courseTime++;
      state.tick++;
    }],
  ];
  const playerTask = superSonicTask(player, w);
  for (const [priority, run] of STAGE_TASKS) {
    // Super Sonic's task has ended at the game over
    tasks.add(run ? { run: () => { run(); return true; } } : { run: () => state.gameOver ? true : playerTask.run() }, priority, true);
  }
  startCard();

  function step() {
    input.poll?.();
    startPressed = input.start && !startHeld; startHeld = input.start;
    if (state.ending) {
      if (state.saving > 0) state.saving--;
      else state.ending.step();
      return;
    }
    if (saving > 0) {
      if (--saving > 0) return;
      afterSave();
      if (toTitle) { onTitle(); return; }
      if (restart) { const start = restart; restart = null; start(); }
      return;
    }
    if (state.ended || toTitle) return;
    if (loading) { loading = false; return; }
    shown = { tick: state.tick, view: state.view, scrollX: state.scrollX, sprites: state.sprites, windows: state.windows, body: state.body, hud: { sprites: state.hud.sprites }, display: { ...state.display } };
    // paused, the sprites stay as the last frame left them, and no task reads the buttons pressed
    const paused = state.paused;
    if (!paused) { state.sprites = []; state.windows = []; state.body = null; }
    state.pauseSign = null;
    tasks.run({}, -1, paused);
    if (paused) input.jumpPressed = input.attackPressed = input.boostPressed = input.trickPressed = false;
    state.paused = state.pauseGame;
    if (toTitle) { onTitle(); return; }
    if (restart) { const start = restart; restart = null; start(); }
  }

  // a frame is drawn once, after its step (clock.js)
  let frame = 0;
  const clock = createClock(TICK_MS, { snap: true });
  function loop(now) {
    let ran = false;
    for (let n = clock.steps(now); n > 0 && !toTitle; n--) { step(); ran = true; }
    if (toTitle) return;   // the game's start has the screen now
    if (ran && (!state.ended || state.ending)) drawFrame();
    frame = requestAnimationFrame(loop);
  }

  return {
    state, step, world: w,
    draw: drawFrame,
    setView(wd, ht) {
      if (wd === viewW && ht === viewH) return;
      viewW = wd; viewH = ht;
      state.view = viewOf(state.cam, wd, ht);
      render.resize(wd, ht);
    },
    setRushBoost() {},   // the boost is Sonic's; Super Sonic has his own dash
    setBoostMode() {}, setSa2Tricks() {},   // and so are Sonic Advance 2's extras
    start() {
      input.enabled = true; clock.reset(); frame = requestAnimationFrame(loop);
      sound.playStageMusic(stage.music);
    },
    stop() { input.enabled = false; input.release(); cancelAnimationFrame(frame); sound.stopAll(); },
  };
}

