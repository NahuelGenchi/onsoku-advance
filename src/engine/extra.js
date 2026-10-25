// The extra stage, the Moon Zone (SAT-R decompilation, src/game/sa1/stage.c CreateGameStage and
// stage/player_super_sonic.c, checked in the USA ROM): Super Sonic against the Super Egg Robo over the ground
// the stage scrolls under them. It runs as act 1 does, from one task list at the original's priorities, with
// its own player, its boss, the robot's display effects and no rings to collect but the ones its capsules
// spill. The title card is act 1's without an act number; as it ends, the HUD comes up and a WARNING sign
// flashes, and on the WARNING's 128th frame the robot starts to move. Super Sonic starts with 50 rings, which
// run down by one a second; at none he dies, and the stage starts over. Beating the robot fades the screen
// to white and goes on to the true ending (trueending.js), which ends where the staff credits start
// (`onCredits`).

import { TICK_MS, SCREEN_W, SCREEN_H } from './constants.js';
import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { createCamera, updateCamera, viewOf } from './camera.js';
import { createTerrain } from './terrain.js';
import { createTasks, makeSprite, animate } from './objects.js';
import { createScatter } from './scatter.js';
import { createHud, updateHud } from './hud.js';
import { createTitleCard, runTitleCard } from './titlecard.js';
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

const START_LIVES = 3;
const MAX_BRAKE_DUST = 20;     // CreateBrakingDustEffect's pool
const MAX_RING_SPARKLES = 8;
const PLAYER = 0x3000, BRAKE_DUST = 0x4001, WARNING = 0x2101, HUD = 0x2180;
const SCATTER_GRAVITY = 7;     // the scattered rings' fall on the extra stage (InitPlayerHitRingsScatter)
// the display registers as StageInit_Zone7Act2 leaves them: BG0 to BG2 and the sprites on
const DISPCNT = 0x1F41;
const SUPER_EGG_ROBO = 31;     // the robot's entity kind
// CreateExtraStageResults writes the save game with interrupts off. mGBA 0.10.5 goes on showing the last frame
// meanwhile, 14 frames without the HBlank interrupt and one with it back on, then the ending's white screen for
// two before its first frame runs.
const SAVE_FRAMES = 16;
const SINE8 = a => SINE[a & 1023] >> 6;   // SIN_24_8

const SILENT = {
  play() {}, playOn() {}, playStageMusic() {}, oneUp() {}, stop() {}, playerState() {}, stopAll() {},
};

/**
 * The Moon Zone, with the same interface as createGame (game.js). On the true ending's 30th frame
 * `stageResults({ rings, courseTime, level })` puts up the results' tally (#69's), and `onCredits()` is called
 * on the frame the staff credits take over from the ending.
 */
export function createExtraStage(canvas, assets, input, sound = SILENT, { stageResults, onCredits = () => {}, difficulty = 0 } = {}) {
  const { anims } = assets.sprites;
  const stage = assets.stage, terrain = createTerrain(stage.collision);
  const bodyAnims = { roboBody: stage.extra.body.anim };
  const tasks = createTasks();
  const scatter = createScatter(anims, { gravity: SCATTER_GRAVITY, floorX: groundScroll });
  scatter.reset();
  const render = createExtraRenderer(canvas, assets);
  let renderEnding = null, shown = null;   // what the last frame showed, which the screen holds during the save
  const drawFrame = () => {
    if (!state.ending) { render(state); return; }
    // the screen keeps the frame before; with the HBlank interrupt off BG1's lines from 91 down don't scroll
    if (state.saving > 1) { render({ ...state, ...shown, hblank: state.saving === 2 }); return; }
    renderEnding ??= createEndingRenderer(render.parts, stage.extra.ending);
    renderEnding(state.ending.state);
  };
  const freshDisplay = () => ({ dispcnt: DISPCNT, winIn: 0, winOut: 0, bldCnt: 0, bldY: 0, win0: null, win0Lines: null });
  const player = createSuperSonic(stage.spawn);
  const state = {
    tick: 0, player, terrain, cam: createCamera(player, terrain), view: null, sprites: [], windows: [], body: null,
    scrollX: 0,            // how much further than the camera the ground has scrolled (RenderMetatileLayers)
    ringCount: START_RINGS, lives: START_LIVES, score: 0, courseTime: 0,
    actStart: true,        // STAGE_FLAG__ACT_START: the title card, a death or the robot's defeat stop the clock
    hud: createHud(), card: null, display: freshDisplay(), seed: 0, ended: false,
    ending: null,          // the true ending, once the robot is beaten
    saving: 0,             // the frames the save game still takes before it
  };
  let viewW = SCREEN_W, viewH = SCREEN_H;
  state.view = viewOf(state.cam, viewW, viewH);
  let restart = false, loading = false, cardPad = [], brakeDust = MAX_BRAKE_DUST, spawned = false;
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
    lifeLost() { restart = true; tasks.stop(); },
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
    // the fade has reached white: TasksDestroyAll, and the true ending takes over (CreateExtraStageResults);
    // without its art (a ROM version where it isn't found) the credits come straight on
    defeated() {
      tasks.stop();
      state.ended = true;
      if (!stage.extra.ending) { onCredits(); return; }
      state.ending = createTrueEnding(anims, sound, { rings: state.ringCount, courseTime: state.courseTime, stageResults, onCredits });
      state.saving = SAVE_FRAMES;
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
      // Super Sonic's colours in the face
      state.hud.sprites = state.hud.sprites.map(s => (s[0] === 'face' ? ['faceSuper', s[1], s[2]] : s));
      return true;
    },
  };
  function startCard() { state.card = createTitleCard(assets.titleCard); state.actStart = true; state.hud.sprites = []; }

  // HandleLifeLost: a life less, and the stage starts over with 50 rings; its music starts again at once and
  // loading takes the whole next frame
  function restartStage() {
    if (state.lives > 0) state.lives--;
    Object.assign(player, createSuperSonic(stage.spawn));
    state.cam = createCamera(player, terrain);
    state.view = viewOf(state.cam, viewW, viewH);
    tasks.reset(); scatter.reset(); sparkles.clear(); resetSparkles();
    Object.assign(state, { ringCount: START_RINGS, courseTime: 0, sprites: [], windows: [], body: null, display: freshDisplay() });
    w.robo = null; spawned = false; brakeDust = MAX_BRAKE_DUST;
    startCard();
    sound.playStageMusic(stage.music);
    loading = true;
  }

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
      state.card = null; state.actStart = false;
      player.moveState &= ~IGNORE_INPUT;
      state.hud = createHud();
      tasks.add(hudTask, HUD);
      for (let i = 0; i < 4; i++) tasks.add(warning(i), WARNING);
    }],
    [PLAYER, null],
    [0x4000, () => { sound.playerState(false, false, !player.dead); }],
    [0xFF00, () => { if (!state.actStart) state.courseTime++; state.tick++; }],
  ];
  const playerTask = superSonicTask(player, w);
  for (const [priority, run] of STAGE_TASKS) {
    tasks.add(run ? { run: () => { run(); return true; } } : { run: () => playerTask.run() }, priority, true);
  }
  startCard();

  function step() {
    input.poll?.();
    if (state.ending) {
      if (state.saving > 0) state.saving--;
      else state.ending.step();
      return;
    }
    if (state.ended) return;
    if (loading) { loading = false; return; }
    shown = { tick: state.tick, view: state.view, scrollX: state.scrollX, sprites: state.sprites, windows: state.windows, body: state.body, hud: { sprites: state.hud.sprites }, display: { ...state.display } };
    state.sprites = []; state.windows = []; state.body = null;
    tasks.run({});
    if (restart) { restart = false; restartStage(); }
  }

  let frame = 0, last = 0, pending = 0;
  function loop(now) {
    pending += Math.min(100, now - last);
    last = now;
    while (pending >= TICK_MS) { step(); pending -= TICK_MS; }
    if (!state.ended || state.ending) drawFrame();
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
    start() {
      input.enabled = true; last = performance.now(); pending = 0; frame = requestAnimationFrame(loop);
      sound.playStageMusic(stage.music);
    },
    stop() { input.enabled = false; input.release(); cancelAnimationFrame(frame); sound.stopAll(); },
  };
}

