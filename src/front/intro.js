// The intro (SAT-R decompilation, src/game/sa1/ui/intro_animation.c), after the logos. A Chaos Emerald falls
// down a backdrop of green streaks, slowing, with two rings of sparkles turning around it, while the backdrop
// fades in; Dr. Eggman rises into view under it, it drops into his hands and he grins, and two spotlights
// sweep across him. Then Sonic, Tails, Knuckles and Amy each get 414 frames: their silhouette over a picture
// of their own, a white flash to the character, their name's letters sliding in one at a time, and a fade to
// white. After Amy the title screen starts, without its music's start; A, B or Start at any point go to it
// with its music.

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { createUiTask, uiGfxStackInit, loadUiGfx, createFade, fadeStep, fadeShow } from './ui.js';
import { createSpotlightBeam, div } from './spotlight.js';
import { SINE } from '../engine/trig.js';
import { KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';

const SKIP = KEY.A | KEY.B | KEY.START;
const UIGFX_OPTIONS = 0x80;
const ANIM_SILHOUETTES = 769, ANIM_EMERALD = 774, ANIM_SPARKLE = 775;
const EMERALD_X = 120, EMERALD_Y = -36;
const CHARACTER_FRAMES = 414;
const s16 = v => (v << 16) >> 16, u16 = v => v & 0xFFFF;

// The intro's graphics, as offsets from its first colours (gUnknown_086A5D34 in the European ROM the
// decompilation is of): the first scene's colours and the streaks behind it, Dr. Eggman, Eggman grinning, his
// hands, then the backdrop behind every character, its colours (a row per character) and each character's
// picture. The sizes are the original's.
const GFX = {
  streaksPalette: 0x0, streaksTiles: 0x200, streaksMap: 0x3100,
  eggmanTiles: 0x3B00, eggmanMap: 0x6340, grinTiles: 0x6E00, grinMap: 0x97C0, handsTiles: 0xA280, handsMap: 0xB6C0,
  backdropPalettes: 0xBD80, backdropTiles: 0xBF80, backdropMap: 0xC4C0,
  characters: [
    { tiles: 0xCEC0, tilesSize: 0x1E00, map: 0xECC0 },
    { tiles: 0xF6C0, tilesSize: 0x1B80, map: 0x11240 },
    { tiles: 0x11C40, tilesSize: 0x1880, map: 0x134C0 },
    { tiles: 0x13EC0, tilesSize: 0x1840, map: 0x15700 },
  ],
};
// The intro's tables (gUnknown_0868B27C on): where each character's letters stop, then their letters as
// { anim, variant, vram }, then each character's two animations, the silhouette's flash and the character.
const TABLES = { stops: 0x0, letters: [[0x10, 6], [0x58, 6], [0xA0, 9], [0x10C, 4]], characterAnims: 0x13C };

/**
 * CreateIntroAnimation. `ctx` has the engine, the sprite tables (`sprites`, rom/sprites.js), the ROM offsets of
 * the intro's graphics (`introGraphics`) and tables (`introTables`), and `title(playMusic)`.
 */
export function createIntro(ctx) {
  const e = ctx.engine;
  e.destroyTasks();
  e.clearQueues();
  createUiTask(e);
  uiGfxStackInit(e);
  e.dispCnt = 0x1040;
  e.bgCnt[0] = 0x9D86; e.bgCnt[1] = 0x1B8B; e.bgCnt[2] = 0x9880;
  e.bgScroll.fill(0, 0, 6);
  // for the widescreen view: Eggman and his hands once, nothing past their pictures (their maps' last 16
  // columns, and their rows past the pictures, are left over), and the streaks going on down for ever, their
  // first and last columns carried on out to the sides
  e.wideLayers = [
    { x: { once: true, box: [0, 240] }, y: { once: true, box: [0, 280] } },
    { x: { once: true, box: [0, 240], edge: true } },
    { x: { once: true, box: [0, 240] }, y: { once: true, box: [0, 216] } },
    null,
  ];

  const emerald = introSprite(ctx, { qUnk38: -36 << 8, qUnk3C: -36 << 8, qUnk40: 0x240 }, {
    graphics: { src: 0, dest: 0x10020, size: 0, anim: ANIM_EMERALD }, x: EMERALD_X, y: EMERALD_Y, oamFlags: 3 << 6, frameFlags: 0x1000,
  });
  const taskC = e.createTask(emeraldTask, emerald, 0x2120);
  updateSprite(e, ctx.sprites, emerald.s);
  createSparkles(ctx, sparkleOuterTask, 0x6800, i => ({ unk30: 0x2F - i * 6, dest: 0x103E0 + i * 0x80, variant: 0, oamFlags: 0 }));

  const intro = {
    ctx, fade: createFade(0, 1, 2, 0, 0x80, 1), taskC, beams: [null, null], characters: [null, null, null, null],
    unk4C: 0, unk4E: 1, unk50: 0, unk52: 0,
  };
  e.createTask(introFall, intro, 0x2100, 0, () => {});
  fadeStep(e, intro.fade);
  e.playSong(SONG.INTRO);
}

// IntroSprite: a sprite and its counters
function introSprite(ctx, fields, sprite) {
  return { ctx, unk30: 0, unk32: 0, unk34: 0, qUnk38: 0, qUnk3C: 0, qUnk40: 0, ...fields, s: createSprite(sprite) };
}

// the eight sparkles of a ring, a task each from `priority` up in steps of 2
function createSparkles(ctx, main, priority, of) {
  const e = ctx.engine;
  for (let i = 0; i < 8; i++) {
    const { unk30, dest, variant, oamFlags } = of(i);
    const spr = introSprite(ctx, { unk30, unk32: i, unk34: unk30, qUnk38: -36 << 8, qUnk3C: -36 << 8, qUnk40: 0x240 }, {
      graphics: { src: 0, dest, size: 0, anim: ANIM_SPARKLE }, variant, x: EMERALD_X + div(SINE[i << 6], 650), y: EMERALD_Y,
      oamFlags, frameFlags: 0x1000,
    });
    e.createTask(main, spr, priority | (i * 2));
    updateSprite(e, ctx.sprites, spr.s);
  }
}

// loads one of the intro's pictures into a layer (sub_80528AC)
function load(ctx, layer, what, { tiles, tilesSize, map, mapSize = 0x800, palette = 0, paletteSize = 0 }) {
  const at = ctx.introGraphics;
  loadUiGfx(ctx.engine, {
    uiGfxID: UIGFX_OPTIONS, tiles: at + tiles, tilesSize, layout: at + map, layoutSize: mapSize,
    palette: at + palette, paletteSize, unk28: 0, unk29: layer, unk2A: what,
  });
}

// sub_8063E8C: what the fall adds on its first frames: the second ring of sparkles, then the streaks, Eggman
// and his hands, one a frame, and Eggman grinning 310 frames in
function fallStep(ctx, n) {
  const e = ctx.engine;
  if (n === 0) createSparkles(ctx, sparkleInnerTask, 0x6801, i => ({ unk30: i * 6, dest: 0x10BE0 + i * 0x80, variant: 1, oamFlags: 0x180 }));
  else if (n === 1) {
    e.dispCnt = 0x1240;
    load(ctx, 1, 0x15, { tiles: GFX.streaksTiles, tilesSize: 0x2F00, map: GFX.streaksMap, palette: GFX.streaksPalette, paletteSize: 0x200 });
  } else if (n === 2) {
    e.dispCnt = 0x1340;
    load(ctx, 0, 0x11, { tiles: GFX.eggmanTiles, tilesSize: 0x2840, map: GFX.eggmanMap, mapSize: 0x8C0 });
  } else if (n === 3) {
    e.dispCnt = 0x1740;
    load(ctx, 2, 0x11, { tiles: GFX.handsTiles, tilesSize: 0x1440, map: GFX.handsMap, mapSize: 0x6C0 });
  } else if (n === 310) load(ctx, 0, 0x11, { tiles: GFX.grinTiles, tilesSize: 0x2840, map: GFX.grinMap, mapSize: 0x8C0 });
}

// sub_8063B8C and the next three: a character's background. The backdrop goes behind, with the character's
// row of its colours (Sonic's loads all 16 rows, which the others' pictures use too), and the picture in front;
// the original names each picture's own colours too, but doesn't load them.
function loadCharacter(ctx, k) {
  const e = ctx.engine, c = GFX.characters[k];
  uiGfxStackInit(e);
  load(ctx, 1, k === 0 ? 0x15 : 0x14, {
    tiles: GFX.backdropTiles, tilesSize: 0x540, map: GFX.backdropMap,
    palette: GFX.backdropPalettes + k * 0x20, paletteSize: k === 0 ? 0x200 : 0x20,
  });
  load(ctx, 0, 0x11, { tiles: c.tiles, tilesSize: c.tilesSize, map: c.map });
}

// Task_80640C8: the fall, 321 frames. Eggman's and his hands' 32 colours fade in from black from frame 152 on,
// he rises 2 lines a frame from frame 182 until he is 100 lines up (his hands following once he is past 80),
// and the streaks scroll 10 lines a frame.
function introFall(t) {
  const intro = t.data, { ctx } = intro, e = ctx.engine;
  intro.taskC.data.unk30 = u16(intro.unk4C);
  if (e.pressed & SKIP) { t.main = toTitleWithMusic; return; }
  if (intro.unk4C > 0x97) {
    const k = Math.min(((intro.unk4C - 0x98) << 15) >>> 16, 40);
    for (let i = 0; i < 32; i++) {
      const c = e.rom.u16(ctx.introGraphics + GFX.streaksPalette + i * 2);
      const r = div((c & 0x1F) * k, 40) & 0x1F, g = div(((c >> 5) & 0x1F) * k, 40) & 0x1F, b = div(((c >> 10) & 0x1F) * k, 40) & 0x1F;
      e.bgPalette[i] = r | (g << 5) | (b << 10);
      e.flags |= 0x1;
    }
  }
  if (intro.unk4C > 0xB5) {
    e.bgScroll[1] = Math.min(s16(e.bgScroll[1] + 2), 100);
    if (e.bgScroll[1] > 80) e.bgScroll[5] = e.bgScroll[1] - 0x50;
  }
  e.bgScroll[3] += 10;
  fallStep(ctx, u16(intro.unk4C));
  if (intro.unk4C > 0x13F) { intro.unk4C = 0; t.main = introSpotlights; }
  else fadeStep(e, intro.fade);
  intro.unk4C = s16(intro.unk4C + 1);
}

// sub_8064244: the sparkles go, a pair every 4 frames; from frame 60 the screen darkens a little; the
// spotlights come on at frame 225 and sweep across Eggman, the rest darker, and at frame 506 Sonic's turn
// starts
function introSpotlights(t) {
  const intro = t.data, { ctx } = intro, e = ctx.engine;
  const n = intro.unk4C >>> 0;
  if (e.pressed & SKIP) { t.main = toTitleWithMusic; return; }
  if (n < 0x60) e.destroyTasks(0x6800, (n >> 2) + 0x6802);
  if (n === 0x3C) { intro.fade = createFade(0, 1, 1, 0, 0x40, 1); fadeShow(e, intro.fade); }
  e.bgScroll[3] += 10;
  intro.unk4C = s16(intro.unk4C + 1);
  if (intro.unk4C >= 506) {
    e.destroyTask(intro.taskC); intro.taskC = null;
    e.bgScroll[2] = 0; e.bgScroll[3] = 0;
    intro.unk50 = 0x4000; intro.unk52 = 0; intro.unk4C = 0;
    for (let i = 0; i < 2; i++) { e.destroyTask(intro.beams[i]); intro.beams[i] = null; }
    e.bldCnt = 0; e.bldY = 0;
    e.dispCnt = 0x1340;
    e.bgCnt[0] = 0x1D86; e.bgCnt[1] = 0x1883;
    // for the widescreen view: each picture once, its edges carried on, and the backdrop's too (its map's last
    // 16 columns are left over)
    e.wideLayers = [
      { x: { once: true, edge: true }, y: { once: true, edge: true } },
      { x: { once: true, box: [0, 240], edge: true }, y: { once: true, edge: true } },
      null, null,
    ];
    createCharacter(ctx, intro, 0);
    t.main = characterTurn;
    return;
  }
  if (intro.unk4C > 0xE0) {
    if (intro.unk4C === 0xE1) {
      for (let i = 0; i < 2; i++) {
        intro.beams[i] = createSpotlightBeam(e);
        Object.assign(intro.beams[i].data, { unk6: 120, unk8: 250, unk0: 0, unk2: 0, unk4: 0, bg: 2 + i, unkB: 6 });
      }
      e.dispCnt |= 0x6000;
      e.winRegs[4] = 0x1F1F; e.winRegs[5] = 0x3F;
      e.bldCnt = 0x3FDF; e.bldY = 8;
      return;
    }
    const k = intro.unk4C - 0xE1;
    for (let i = 0; i < 2; i++) {
      const beam = intro.beams[i].data;
      beam.unk0 = s16((0x18 - (k % 25)) * 6 + i * 0x370);
      if (k <= 0x3F && k % 6 === 0) beam.unkB = (beam.unkB + 1) & 0xFF;
    }
  } else if (n >= 30 && n < 120) fadeStep(e, intro.fade);
}

// Each character's turn: how their picture scrolls (8.8 a frame), and where it starts for the next
// character
const TURNS = [
  { dx: -0x20, dy: 0x20 },
  { dx: 0x20, dy: -0x20 },
  { dx: 0, dy: 0x20 },
  { dx: -0x20, dy: -0x20 },
];
const STARTS = [[0x4000, 0], [0xE000, 0x6000], [0xE000, 0x1000], [0x3000, 0x5000]];

// sub_80645E4, sub_80648D4, sub_8064BB4 and sub_8064E84: a character's turn. Frame 1 loads its background;
// the screen is black until frame 30, white for 12 frames, then fades back in over 32, and from frame 353 it
// fades to white; at frame 414 the next character's turn starts, or after Amy's the title screen.
function characterTurn(t) {
  const intro = t.data, { ctx } = intro, e = ctx.engine;
  const k = intro.characters.findIndex(c => c), turn = TURNS[k];
  intro.characters[k].data.unkB4 = u16(intro.unk4C);
  intro.unk50 = u16(intro.unk50 + turn.dx); intro.unk52 = u16(intro.unk52 + turn.dy);
  e.bgScroll[0] = intro.unk50 >> 8; e.bgScroll[1] = intro.unk52 >> 8;
  if (e.pressed & SKIP) { t.main = toTitleWithMusic; return; }
  const n = intro.unk4C >>> 0;
  if (n < 30) {
    if (n === 1) loadCharacter(ctx, k);
    if (k === 0) intro.fade = createFade(0, 1, 2, 0, 0, 1);
    fadeShow(e, intro.fade);
  } else if (n < 42) { intro.fade = createFade(0, 1, 8, 0, 0x100, 1); fadeShow(e, intro.fade); }
  else if (n < 0x16A) fadeStep(e, intro.fade);
  intro.unk4C = s16(intro.unk4C + 1);
  if (intro.unk4C >= CHARACTER_FRAMES) {
    if (k === 3) { t.main = toTitleSilent; fadeStep(e, intro.fade); return; }
    e.destroyTasks(0x6820, 0x6821);
    e.destroyTask(intro.characters[k]); intro.characters[k] = null;
    [intro.unk50, intro.unk52] = STARTS[k + 1];
    intro.unk4C = 0;
    intro.fade = createFade(0, 1, 2, 0, 0, 1);
    fadeShow(e, intro.fade);
    createCharacter(ctx, intro, k + 1);
  } else if (intro.unk4C > 0x160) {
    if (intro.unk4C === 0x161) Object.assign(intro.fade, { unk4: 4, unk6: 0, unk8: 0x180 });
    fadeStep(e, intro.fade);
  }
}

// Each character's sprites: its task's priority, its sprites' tiles (only the first is ever drawn), where it
// stands and its order, and its letters' flags. When they are made, Sonic's and Amy's sprites are all
// animated and Tails's and Knuckles's first only, which is drawn too, as is Amy's; Tails's letters are drawn
// then too. Knuckles's and Amy's letters keep the colours loaded before them.
const CHARACTERS = [
  { priority: 0x2210, dests: [0x11440, 0x14000], x: 0xB4, y: 0x82, oamFlags: 0x3C0, letterFlags: 0x80, animateAll: true },
  { priority: 0x2280, dests: [0x10400, 0x11980, 0x13280], x: 48, y: 108, oamFlags: 0x300, letterFlags: 0x80, draw: true, drawLetters: true },
  { priority: 0x2230, dests: [0x10080, 0x11980, 0x13280], x: 48, y: 130, oamFlags: 0x3C0, letterFlags: 0x40080, draw: true },
  { priority: 0x2230, dests: [0x11440, 0x16400], x: 180, y: 108, oamFlags: 0x180, letterFlags: 0x40080, animateAll: true, draw: true },
];
const RENDER = [renderSonic, renderTails, renderKnuckles, renderAmy];
const LETTER_ENDS = [0x161, 353, 353, 0x161];

function createCharacter(ctx, intro, k) {
  const e = ctx.engine, c = CHARACTERS[k], rom = e.rom, tables = ctx.introTables;
  const data = { ctx, k, unkB4: 0, sprites: [] };
  intro.characters[k] = e.createTask(RENDER[k], data, c.priority);
  c.dests.forEach((dest, i) => {
    const s = createSprite({ graphics: { src: 0, dest, size: 0, anim: ANIM_SILHOUETTES }, variant: k, x: c.x, y: c.y, oamFlags: c.oamFlags, frameFlags: 0x80 });
    data.sprites.push(s);
    if (c.animateAll || i === 0) updateSprite(e, ctx.sprites, s);
    if (i === 0 && c.draw) displaySprite(e, ctx.sprites, s);
  });
  const [at, count] = TABLES.letters[k];
  const stopX = rom.s16(tables + TABLES.stops + k * 4);
  for (let i = 0; i < count; i++) {
    const entry = tables + at + i * 12;
    const letter = introSprite(ctx, { unk34: i, qUnk3C: stopX + 0x118, k }, {
      graphics: { src: 0, dest: rom.u32(entry + 8) - 0x06000000, size: 0, anim: rom.u32(entry) & 0xFFFF },
      variant: rom.u32(entry + 4) & 0xFF, x: 280, y: 70, oamFlags: 0x180, frameFlags: c.letterFlags,
    });
    letter.s.wideFrom = stopX + 0x108;   // its x when it first shows, for the widescreen view (engine.js)
    e.createTask(letterTask, letter, 0x6820);
    updateSprite(e, ctx.sprites, letter.s);
    if (c.drawLetters) displaySprite(e, ctx.sprites, letter.s);
  }
}

// a character's two animations from the tables, which take over from the silhouette one after the other
function characterAnim(ctx, k, second) {
  const at = ctx.introTables + TABLES.characterAnims + k * 8 + (second ? 4 : 0);
  return [ctx.engine.rom.u16(at), ctx.engine.rom.u16(at + 2)];
}
function setAnim(ctx, s, k, second) {
  s.prevVariant = 0xFF;
  [s.graphics.anim, s.variant] = characterAnim(ctx, k, second);
}

// Task_RenderSonic: the silhouette until frame 30, then Sonic's first animation, from frame 190 his second;
// he is semi-transparent, so the fades leave him alone, until frame 354, and the fade to white covers him too
function renderSonic(t) {
  const d = t.data, { ctx } = d, e = ctx.engine, n = s16(d.unkB4), s = d.sprites[0];
  if (n === 0x1E) { setAnim(ctx, s, 0, false); updateSprite(e, ctx.sprites, s); }
  if (n > 0) {
    if (n > 0x161) { s.frameFlags = 0; updateSprite(e, ctx.sprites, s); }
    else if (n > 0xBD) { if (n === 0xBE) setAnim(ctx, s, 0, true); updateSprite(e, ctx.sprites, s); }
    displaySprite(e, ctx.sprites, s);
  }
}

// Task_IntroRenderTails: as Sonic's, but the silhouette animates until frame 30, when its tiles move
function renderTails(t) {
  const d = t.data, { ctx } = d, e = ctx.engine, n = s16(d.unkB4), s = d.sprites[0];
  if (n === 0x1E) { s.graphics.dest = 0x10080; setAnim(ctx, s, 1, false); updateSprite(e, ctx.sprites, s); }
  if (n >= 0) {
    if (n <= 0x1D) updateSprite(e, ctx.sprites, s);
    if (n > 0x161) { s.frameFlags = 0; updateSprite(e, ctx.sprites, s); }
    else if (n > 0xBD) { if (n === 0xBE) setAnim(ctx, s, 1, true); updateSprite(e, ctx.sprites, s); }
    displaySprite(e, ctx.sprites, s);
  }
}

// Task_IntroRenderKnuckles: his second animation from frame 235, and animated every frame
function renderKnuckles(t) {
  const d = t.data, { ctx } = d, e = ctx.engine, n = s16(d.unkB4), s = d.sprites[0];
  s.graphics.dest = 0x10080;
  if (n === 0x1E) setAnim(ctx, s, 2, false);
  if (n >= 0) {
    if (n > 0x161) { s.frameFlags = 0; updateSprite(e, ctx.sprites, s); }
    else if (n === 0xEB) setAnim(ctx, s, 2, true);
    updateSprite(e, ctx.sprites, s);
    displaySprite(e, ctx.sprites, s);
  }
}

// Task_IntroRenderAmy: her second animation from frame 165, and nothing after frame 410
function renderAmy(t) {
  const d = t.data, { ctx } = d, e = ctx.engine, n = s16(d.unkB4), s = d.sprites[0];
  if (n > 410) return;
  if (d.unkB4 === 0x161) s.frameFlags = 0;
  if (n === 0x1E) { setAnim(ctx, s, 3, false); updateSprite(e, ctx.sprites, s); }
  if (n >= 0) {
    if (n > 353) { s.frameFlags = 0; updateSprite(e, ctx.sprites, s); }
    else if (n > 164) { if (n === 165) setAnim(ctx, s, 3, true); updateSprite(e, ctx.sprites, s); }
    displaySprite(e, ctx.sprites, s);
  }
}

// Task_806562C, sub_80656A4, sub_806571C and sub_8065794: from frame 91 the letters slide in from the right
// 16 pixels a frame, each 15 frames after the one before, to where the name stops
function letterTask(t) {
  const l = t.data, { ctx, k } = l, e = ctx.engine;
  l.unk30 = u16(l.unk30 + 1);
  let n = s16(l.unk30);
  if (k === 3 && n > 410) return;
  if (l.unk30 === LETTER_ENDS[k]) l.s.frameFlags = 0;
  if (n <= 90) return;
  n -= 90;
  if (l.unk34 * 15 < n) {
    const stop = e.rom.s16(ctx.introTables + TABLES.stops + k * 4);
    l.qUnk3C -= 0x10;
    if (l.qUnk3C < stop) l.qUnk3C = stop;
    l.s.x = s16(l.qUnk3C);
    l.s.y = e.rom.s16(ctx.introTables + TABLES.stops + k * 4 + 2);
    updateSprite(e, ctx.sprites, l.s);
    displaySprite(e, ctx.sprites, l.s);
  }
}

// Task_IntroChaosEmeraldUpdate: falls at 2.25 lines a frame, slowing to a stop by frame 90; from frame 234
// on it falls at 1.25, into Eggman's hands and on to line 180
function emeraldTask(t) {
  const m = t.data, { ctx } = m, e = ctx.engine, n = s16(m.unk30);
  if (n < 90 || n > 233) m.qUnk3C += m.qUnk40;
  if (n < 90) { m.qUnk40 -= 6; if (m.qUnk40 < 0) m.qUnk40 = 0; }
  if (n === 233) m.qUnk40 = 0x140;
  if (m.qUnk3C > 180 << 8) m.qUnk3C = 180 << 8;
  m.s.y = s16(m.qUnk3C >> 8);
  updateSprite(e, ctx.sprites, m.s);
  displaySprite(e, ctx.sprites, m.s);
}

// Task_8065058 and Task_806515C: a sparkle falls with the emerald, and every 47 frames starts again from the
// emerald's height and drifts up, circling it; the outer ring's sparkles stop at line 180, the inner's at 212.
// Every other one is drawn behind the emerald.
function sparkleTask(t, inner) {
  const p = t.data, { ctx } = p, e = ctx.engine, s = p.s;
  p.unk30 = u16(p.unk30 + 1);
  const n = s16(p.unk30);
  if (n < 90 || n >= 234) p.qUnk3C += p.qUnk40;
  if (n < 90) { p.qUnk40 -= 6; if (p.qUnk40 < 0) p.qUnk40 = 0; }
  if (n === 0xE9) p.qUnk40 = 0x140;
  const bottom = (inner ? 212 : 180) << 8;
  if (p.qUnk3C > bottom) p.qUnk3C = bottom;
  if (p.unk34 === 0) { s.prevVariant = 0xFF; p.unk34 = 0x2F; p.qUnk38 = p.qUnk3C; }
  p.qUnk38 -= div(SINE[inner ? p.unk34 * 6 : (0x100 - p.unk34 * 6) & 0xFF], 24);
  const swing = div(SINE[(p.unk34 * 12 + (n << 5)) & 0x3FF], 650);
  s.x = s16(inner ? 120 - swing : swing + 120);
  s.y = s16(p.qUnk38 >> 8);
  p.unk34 -= 1;
  s.oamFlags = p.unk32 & 1 ? 0 : 6 << 6;
  updateSprite(e, ctx.sprites, s);
  displaySprite(e, ctx.sprites, s);
}
const sparkleOuterTask = t => sparkleTask(t, false);
const sparkleInnerTask = t => sparkleTask(t, true);

// IntroOpenTitlescreenSilent and IntroOpenTitlescreenPlayMusic
function toTitle(t, playMusic) {
  const { ctx } = t.data, e = ctx.engine;
  e.destroyTasks();
  e.clearQueues();
  if (playMusic) e.stopSong(SONG.INTRO);
  e.bgScroll.fill(0);
  ctx.title(playMusic);
}
const toTitleSilent = t => toTitle(t, false);
const toTitleWithMusic = t => toTitle(t, true);
