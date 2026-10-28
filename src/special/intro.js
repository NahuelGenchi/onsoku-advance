// The fall into a special stage and the Chaos Emerald's scene (SAT-R decompilation,
// src/game/sa1/ui/special_stage_intro.c).
//
// The fall: 90 frames of the character dropping down the sky, past streaks of light, fading in from black and out
// again, then 150 frames of them over the clouds on their board, with a word blinking under them, before the stage.
// The emerald's scene: the clouds again, the Tornado and a cloud of its smoke flying in from the right, the
// character dropping in, then rising with the emerald from frame 162 on, with its music, and a fade to white
// into the results.

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { createUiTask, createUiSlots, uiGfxStackInit, loadUiGfx, createFade, fadeStep, fadeShow } from '../front/ui.js';
import { SONG } from '../sound/songs.js';

// the special stages' UI task is made in the same memory each time, and the acts between leave it alone, so its
// slots start as the last stage left them (front/ui.js); the title card's band reads its slot on its first frame,
// before loading it
export const uiSlots = createUiSlots();

const UIGFX_OPTIONS = 0x80;
const ANIM_STREAK = 776, ANIM_WORD = 0x32B, ANIM_SMOKE = 0x2E0, ANIM_SPARKLE = 0x2FD;
const ANIM_CLOUDS = [790, 791, 792, 793];
const FALL_FRAMES = 90, BOARD_FRAMES = 150;
const FADE_STEP = 0x150, EMERALD_FADE_STEP = 0x128;
// the special stage's tables (gUnknown_0868B584 on), as offsets from the first: each character's animation and
// variant falling, on the board, in the emerald's scene before and after it takes the emerald, the Tornado, and
// the emeralds, a row of characters per stage
const TABLES = { fall: 0x0, board: 0x10, waiting: 0x20, tornado: 0x30, emeralds: 0x40, holding: 0xB0 };
// the clouds picture: its colours, then its tiles and map (gUnknown_086BBC34, gUnknown_086BBE34, gUnknown_086BE7B4)
const CLOUDS = { palette: 0x0, tiles: 0x200, tilesSize: 0x2980, map: 0x2B80, mapSize: 0x1000 };
// the clouds that drift across the emerald's scene: y, x, x speed (Q8)
const DRIFT = [[50, 80, 0x80], [100, 40, 0x40], [120, 120, 0x100], [20, 160, 0x120]];
const OBJ_VRAM = 0x10000;
const Q = v => Math.trunc(v * 256), I = v => v >> 8;

// PSEUDO_RANDOM_32: the game's random numbers, one sequence the act's code shares
export function random(ctx) {
  ctx.game.seed = (Math.imul(ctx.game.seed, 0x196225) + 0x3C6EF35F) | 0;
  return ctx.game.seed;
}

// a character's animation and variant from one of the tables
function animOf(ctx, table, index) {
  const at = ctx.offsets.specialIntro + table + index * 4;
  return { anim: ctx.rom.u16(at), variant: ctx.rom.u16(at + 2) };
}

function sprite(ctx, dest, { anim, variant }, x, y, oamFlags, palId = 0) {
  return createSprite({ graphics: { src: 0, dest: OBJ_VRAM + dest, size: 0, anim }, variant, x, y, oamFlags, palId, frameFlags: 0x1000 });
}
const update = d => updateSprite(d.ctx.engine, d.ctx.sprites, d.s);
const display = d => displaySprite(d.ctx.engine, d.ctx.sprites, d.s);

// the clouds picture in layer 0 (sub_80528AC)
function loadClouds(ctx) {
  const at = ctx.offsets.specialClouds;
  loadUiGfx(ctx.engine, {
    uiGfxID: UIGFX_OPTIONS, tiles: at + CLOUDS.tiles, tilesSize: CLOUDS.tilesSize, layout: at + CLOUDS.map, layoutSize: CLOUDS.mapSize,
    palette: at + CLOUDS.palette, paletteSize: 0x200, unk28: 0, unk29: 0, unk2A: 0x15,
  });
}

// the screens' layer 0: the clouds picture, 296 lines down
function setUpLayers(e) {
  createUiTask(e, uiSlots);
  uiGfxStackInit(e);
  e.dispCnt = 0x1140;
  e.bgCnt[0] = 0x9D86;
  e.bgScroll[0] = 0; e.bgScroll[1] = 0x128;
}

/** CreateSpecialStageIntro: the fall, from the special spring. */
export function createSpecialStageIntro(ctx) {
  const e = ctx.engine, character = ctx.game.character;
  e.destroyTasks();
  e.clearQueues();
  setUpLayers(e);

  const fall = { ctx, unk30: 0, qUnk34: -Q(3.8125), qUnk38: Q(180), qUnk3C: -Q(1), qUnk40: Q(120) };
  fall.s = sprite(ctx, 0x20, animOf(ctx, TABLES.fall, character), 120, 180, 6 << 6, 1);
  const fallTask = e.createTask(fallStep, fall, 0x2120);
  updateSprite(e, ctx.sprites, fall.s);

  // the streaks: one sprite shown at 16 places, each moving down 16 lines a frame and placed anew every 16 frames
  const streaks = { ctx, unk30: 0, xs: new Int32Array(16), ys: new Int32Array(16) };
  for (let i = 0; i < 16; i++) {
    streaks.ys[i] = random(ctx) % 40 - 20;
    streaks.xs[i] = random(ctx) % 220 + 20;
  }
  streaks.s = sprite(ctx, 0x820, { anim: ANIM_STREAK, variant: 0 }, 120, 80, 0);
  const streaksTask = e.createTask(streaksStep, streaks, 0x2120);
  updateSprite(e, ctx.sprites, streaks.s);

  const intro = { ctx, unk18: 0, fallTask, streaksTask, wordTask: null, fade: createFade(0, 1, 2, 0, FADE_STEP, 1) };
  e.createTask(introFall, intro, 0x2100);
  fadeShow(e, intro.fade);
  e.playSong(SONG.SPECIAL_STAGE_INTRO);
}

// Task_8068948: the fall's 90 frames. The fade in from black steps twice a frame, and the fade out starts 24 frames
// before the end (0x2000 / 0x150). The clouds picture is loaded on the first frame.
function introFall(t) {
  const intro = t.data, { ctx } = intro, e = ctx.engine, fall = intro.fallTask.data;
  const n = intro.unk18 + 1;
  fadeStep(e, intro.fade);
  uiGfxStackInit(e);
  if (n === 1) loadClouds(ctx);
  if (n > FALL_FRAMES) {
    intro.unk18 = 0;
    fall.unk30 = 0;
    e.bgScroll[1] = 0;
    intro.fade = createFade(0, 1, 2, 0, FADE_STEP, 1);
    const word = { ctx, unk30: 0, s: sprite(ctx, 0xC80, { anim: ANIM_WORD, variant: 0 }, 120, 120, 0) };
    intro.wordTask = e.createTask(wordStep, word, 0x2120);
    updateSprite(e, ctx.sprites, word.s);
    // the rings counter's task is later made in this memory, and its blink count is the last streak's line (hud.js)
    ctx.streaksLeft = intro.streaksTask.data.ys[15];
    e.destroyTask(intro.streaksTask);
    intro.fallTask.main = boardStep;
    t.main = introBoard;
    return;
  }
  if (n === FALL_FRAMES - Math.trunc(0x2000 / FADE_STEP)) intro.fade = createFade(0, 1, 1, 0, FADE_STEP, 1);
  fadeStep(e, intro.fade);
  intro.unk18 = n;
  fall.unk30 = n;
}

// Task_8068A78: the 150 frames over the clouds, then the stage
function introBoard(t) {
  const intro = t.data, { ctx } = intro, e = ctx.engine, fall = intro.fallTask.data;
  const n = intro.unk18 + 1;
  if (n > BOARD_FRAMES) {
    e.destroyTasks();
    e.clearQueues();
    ctx.stage();
    return;
  }
  if (n === BOARD_FRAMES - Math.trunc(0x2000 / FADE_STEP)) intro.fade = createFade(0, 1, 1, 0, FADE_STEP, 1);
  fadeStep(e, intro.fade);
  intro.unk18 = n;
  fall.unk30 = n;
}

// Task_SpecialStageIntroInit: the character falling 3.8125 lines a frame
function fallStep(t) {
  const d = t.data;
  d.qUnk38 -= Q(3.8125);
  d.s.x = I(d.qUnk40); d.s.y = I(d.qUnk38);
  update(d);
  display(d);
}

// Task_8068B10: on the board, from frame 41 over the clouds rising and falling back
function boardStep(t) {
  const d = t.data, n = d.unk30;
  if (n === 0) {
    const { anim, variant } = animOf(d.ctx, TABLES.board, d.ctx.game.character);
    d.s.graphics.anim = anim; d.s.variant = variant; d.s.prevVariant = 0xFF;
    d.qUnk34 -= Q(5);
    d.qUnk38 = Q(180);
    d.qUnk40 = Q(150);
  }
  if (n > 40) {
    d.qUnk40 += d.qUnk3C;
    d.qUnk34 += Q(0.25);
    d.qUnk38 += d.qUnk34;
    d.s.x = I(d.qUnk40); d.s.y = I(d.qUnk38);
    update(d);
    display(d);
  }
}

// Task_8068BB0
function streaksStep(t) {
  const d = t.data, { ctx } = d, e = ctx.engine;
  const n = ++d.unk30;
  d.s.prevVariant = 0xFF;
  updateSprite(e, ctx.sprites, d.s);
  for (let i = 0; i < 16; i++) {
    if ((n + i) & 0xF) d.ys[i] += 0x10;
    else {
      d.ys[i] = random(ctx) % 40 - 20;
      d.xs[i] = random(ctx) % 220 + 20;
    }
    d.s.x = (d.xs[i] << 16) >> 16; d.s.y = (d.ys[i] << 16) >> 16;
    displaySprite(e, ctx.sprites, d.s);
  }
}

// Task_8068CD4: shown for 30 frames out of 60
function wordStep(t) {
  const d = t.data;
  if (Math.trunc(++d.unk30 / 30) % 2 === 0) {
    update(d);
    display(d);
  }
}

/** sub_8068D0C: the Chaos Emerald's scene, after the stage is won; then the results. */
export function createEmeraldScene(ctx) {
  const e = ctx.engine, character = ctx.game.character;
  setUpLayers(e);

  const hero = { ctx, unk30: 0, qUnk34: 0x4A0, qUnk38: -Q(32), qUnk3C: 0, qUnk40: Q(170) };
  hero.s = sprite(ctx, 0x20, animOf(ctx, TABLES.waiting, character), 120, 180, 0x180);
  const heroTask = e.createTask(() => {}, hero, 0x2120);
  updateSprite(e, ctx.sprites, hero.s);

  const tornado = { ctx, unk30: 0, qUnk34: 0, qUnk38: Q(100), qUnk3C: -Q(1), qUnk40: Q(350) };
  tornado.s = sprite(ctx, 0x820, animOf(ctx, TABLES.tornado, character), 300, 100, 0x240);
  const tornadoTask = e.createTask(flyLeft, tornado, 0x2120);
  updateSprite(e, ctx.sprites, tornado.s);

  const smoke = { ctx, unk30: 0, qUnk34: 0, qUnk38: Q(100), qUnk3C: -Q(1), qUnk40: Q(350) };
  smoke.s = sprite(ctx, 0x12A0, { anim: ANIM_SMOKE, variant: 0 }, 350, 100, 0x300);
  const smokeTask = e.createTask(flyLeft, smoke, 0x2120);
  updateSprite(e, ctx.sprites, smoke.s);

  [0x6040, 0x6180, 0x6420, 0x7080].forEach((dest, i) => {
    const [y, x, dx] = DRIFT[i];
    const cloud = { ctx, x: Q(x), dx, y: Q(y), dy: 0 };
    cloud.s = sprite(ctx, dest, { anim: ANIM_CLOUDS[i], variant: 0 }, 180, 80, 27 << 6);
    e.createTask(cloudStep, cloud, 0x2120);
  });

  const scene = {
    ctx, unk1C: 0, heroTask, tornadoTask, smokeTask, emeraldTask: null, unk24: 0,
    fade: createFade(0, 1, 8, 0, EMERALD_FADE_STEP, 1),
  };
  e.createTask(emeraldSceneStart, scene, 0x2100);
  fadeStep(e, scene.fade);
  loadClouds(ctx);
}

// Task_80694E8: the fade in from white; the character drops in from frame 140, and from frame 162 on
// Task_8069100 runs the rest with the emerald's music
function emeraldSceneStart(t) {
  const scene = t.data, { ctx } = scene, e = ctx.engine, hero = scene.heroTask.data;
  const n = scene.unk1C + 1;
  fadeStep(e, scene.fade);
  if (n === 0x8C) scene.heroTask.main = dropIn;
  if (n > 0xA1) {
    e.playSong(SONG.CHAOS_EMERALD);
    scene.unk1C = 0;
    hero.unk30 = 0;
    scene.heroTask.main = holdEmerald;
    t.main = emeraldSceneRest;
    return;
  }
  scene.unk1C = n;
  hero.unk30 = n;
}

// Task_8069100: the emerald appears with a sparkle on the first frame; everything moves 10 lines down then, and
// from the eighth frame on back up a line a frame until the smoke is back at line 100; the fade to white starts on
// frame 273, and 11 frames after it ends come the results
function emeraldSceneRest(t) {
  const scene = t.data, { ctx } = scene, e = ctx.engine;
  const hero = scene.heroTask.data, tornado = scene.tornadoTask.data, smoke = scene.smokeTask.data;
  const n = scene.unk1C + 1;
  let emerald;
  if (n === 1) {
    const sparkle = { ctx, qUnk34: 0, qUnk38: hero.qUnk38 + Q(10), qUnk3C: -Q(1), qUnk40: hero.qUnk40 - Q(8) };
    sparkle.s = sprite(ctx, 0x3820, { anim: ANIM_SPARKLE, variant: 0 }, 120, 180, 0);
    e.createTask(sparkleStep, sparkle, 0x2120);
    updateSprite(e, ctx.sprites, sparkle.s);

    emerald = { ctx, unk30: 0, qUnk34: 0, qUnk38: hero.qUnk38, qUnk3C: -Q(1), qUnk40: hero.qUnk40 };
    emerald.s = sprite(ctx, 0xAA0, animOf(ctx, TABLES.emeralds, ctx.stageIndex * 4 + ctx.game.character), 120, 180, 0x180);
    scene.emeraldTask = e.createTask(flyLeft, emerald, 0x2120);
    updateSprite(e, ctx.sprites, emerald.s);
  } else emerald = scene.emeraldTask.data;
  if (n > 7 && smoke.qUnk38 >= Q(100)) {
    smoke.qUnk38 -= Q(1); tornado.qUnk38 -= Q(1); hero.qUnk38 -= Q(1); emerald.qUnk38 -= Q(1);
  }
  if (n === 1) {
    smoke.qUnk38 += 0xA00; tornado.qUnk38 += 0xA00; hero.qUnk38 += 0xA00; emerald.qUnk38 += 0xA00;
  }
  if (fadeStep(e, scene.fade) && scene.fade.unk4 === 4) {
    if (scene.unk24 > 10) {
      e.destroyTasks();
      e.clearQueues();
      ctx.results(1);
      return;
    }
    scene.unk24++;
  }
  if (n === 0x12C - Math.trunc(0x2000 / EMERALD_FADE_STEP)) scene.fade = createFade(0, 1, 4, 0, EMERALD_FADE_STEP, 1);
  scene.unk1C = n;
  hero.unk30 = n;
}

// Task_80693D0: holding the emerald, drifting left
function holdEmerald(t) {
  const d = t.data;
  if (d.unk30 === 0) {
    const { anim, variant } = animOf(d.ctx, TABLES.holding, d.ctx.game.character);
    d.s.graphics.anim = anim; d.s.variant = variant; d.s.prevVariant = 0xFF;
    d.qUnk38 += Q(16);
  }
  flyLeft(t);
}

// Task_8069550: dropping in, 0x4A0 a frame down to line 80
function dropIn(t) {
  const d = t.data;
  d.qUnk38 += 0x4A0;
  if (d.qUnk38 > Q(80)) d.qUnk38 = Q(80);
  d.s.x = I(d.qUnk40); d.s.y = I(d.qUnk38);
  update(d);
  display(d);
}

// Task_strc44_806959C: a line a frame to the left, stopping 100 past the screen's left edge
function flyLeft(t) {
  const d = t.data;
  d.qUnk40 -= Q(1);
  if (d.qUnk40 < -Q(100)) d.qUnk40 = -Q(100);
  d.s.x = I(d.qUnk40); d.s.y = I(d.qUnk38);
  update(d);
  display(d);
}

// Task_8069634: the sparkle, shown twice, flipped and not, until its animation ends
function sparkleStep(t) {
  const d = t.data;
  d.s.x = I(d.qUnk40); d.s.y = I(d.qUnk38);
  if (update(d) === 0) { d.ctx.engine.destroyTask(t); return; }
  d.s.frameFlags &= ~0x400;
  display(d);
  d.s.frameFlags |= 0x400;
  display(d);
}

// Task_8068360: a cloud drifting right, wrapping round from x 272 to −120
function cloudStep(t) {
  const d = t.data;
  d.x += d.dx;
  if (d.x > Q(272)) d.x = -Q(120);
  if (d.x < -Q(120)) d.x = Q(272);
  d.y += d.dy;
  if (d.y > Q(172)) d.y = -Q(16);
  if (d.y < -Q(16)) d.y = Q(172);
  d.s.x = I(d.x); d.s.y = I(d.y);
  update(d);
  display(d);
}
