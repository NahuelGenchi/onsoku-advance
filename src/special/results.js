// The special stage's results (SAT-R decompilation, src/game/sa1/ui/game_2_1.c: sub_805D048, sub_805C994,
// sub_805C900, sub_805D4F0 and their tasks), after the stage is lost or after the Chaos Emerald's scene. The score
// is given at once (100 a ring, 10000 for the emerald), and a continue for each one the stage gave and for an
// emerald won again. On the screen, over the cleared layers: a band and a stripe saying how it went, the seven
// emeralds sliding in under the band from frame 50, and the total (from frame 40), the emerald bonus (46) and the rings
// (52), each a label growing from a line with its number beside it. From frame 170 the rings and the bonus count
// down into the total, 100 points a frame, with a tick every 4 frames and a chime when the count ends, which
// brings in the continues won, if any. The screen lasts 616 frames more than the count; in its last 70 everything
// slides off to the left, and then the act starts again.

import { createUiTask, uiGfxStackInit, uiGraphics, loadUiGfx, drawUiText, drawUiTextAffine, glyphs } from '../front/ui.js';
import { SINE } from '../engine/trig.js';
import { SONG } from '../sound/songs.js';

const OBJ_VRAM = 0x10000;
const EMERALD_BONUS = 10000, LIFE_EVERY = 50000;
// the frame the count starts on, and the last frame past the count's length before the act
const COUNT_FROM = 0xAA, END_AFTER = 615;
// the UI graphics: the band, the stripe after a win (then the character's name), after a loss, the labels and the
// continues' digits, the emeralds, the emeralds' colours, the font
const UIGFX_BAND = 16, UIGFX_WON = 51, UIGFX_NAME = 11, UIGFX_LOST = 53, UIGFX_LABELS = 52, UIGFX_EMERALDS = 54;
const UIGFX_EMERALD_COLOURS = [56, 57, 58], UIGFX_FONT = 0;
// the slots (ui.js)
const SLOT_STRIPE = 2, SLOT_LABELS = 3, SLOT_EMERALDS = 4, SLOT_COLOURS = 5, SLOT_DIGITS = 6, SLOT_BAND = 8;
// the band's eight blank glyphs, the stripe's ten glyphs three times over, and the labels' glyphs in slot 3
const BAND = glyphs('        ');
const STRIPE = ' !"#$%&\'() !"#$%&\'() !"#$%&\'()';
const RINGS = glyphs(' !"'), BONUS = glyphs('#$%'), TOTAL = glyphs('&\'('), CONTINUES = glyphs(')*+');
const s16 = v => (v << 16) >> 16;
const div = (a, b) => Math.trunc(a / b);

// a text line's fields (GameOverB / Strc_8052C84), those a task doesn't set as its memory left them (unused)
const line = fields => ({ unk0: 0, unk2: 0, unk4: 0, unk6: 0, unk8: 0, unkA: 0, unkC: 0, unkE: 0, unk10: 0, unk12: 0, unk14: 0, unk16: 1, ...fields });
const scaled = fields => line({ unk0: 0x100, unk2: 0, unk4: 0, unkA: 0x39, unkC: 0x39, unkE: 3, unk10: SLOT_LABELS, unk12: 0xE, ...fields });

/**
 * sub_805D048: the results, `arg` 1 after the emerald's scene and 0 otherwise (which picks the stripe's picture;
 * the emerald itself is won by having the stage's target, ctx.special.collected >= ctx.special.target). Updates
 * ctx.game: the emerald's bit in `emeralds`, `score`, `lives` (one more for each 50000 points passed) and
 * `continues` (gUnknown_0300543C, the continues the player has).
 */
export function createResults(ctx, arg) {
  const e = ctx.engine, { game, special } = ctx;
  createUiTask(e);
  e.bgScroll.fill(0);

  let won = 0, bonus = 0, had = 0;
  if ((special.collected & 0xFFFF) >= (special.target & 0xFFFF)) {
    e.playSong(SONG.SPECIAL_STAGE_WIN);
    won = 1;
    bonus = EMERALD_BONUS;
    if ((game.emeralds >> ctx.stageIndex) & 1) had = 1;
    else game.emeralds = (game.emeralds | (1 << ctx.stageIndex)) & 0xFF;
  } else e.playSong(SONG.SPECIAL_STAGE_LOSE);
  const emeralds = game.emeralds & 0xFF, rings = special.collected & 0xFFFF;
  const continues = (special.extra + had) & 0xFF;
  game.continues = ((game.continues + continues) << 24) >> 24;
  // INCREMENT_SCORE_A, a life without the 1-up jingle; the original also checks that the game is single player,
  // which it always is here
  const before = game.score;
  game.score += bonus + rings * 100;
  if (div(game.score, LIFE_EVERY) !== div(before, LIFE_EVERY)) game.lives = (game.lives + 1) & 0xFF;
  // how many frames the count takes: the larger of the rings and the bonus's hundreds
  const count = bonus > rings * 100 ? div(bonus, 100) & 0xFFFF : rings;
  uiGfxStackInit(e);

  const piece = (step, o) => e.createTask(step, {
    ctx, o, unk18: bonus, unk1C: 0, unk20: 0, unk22: count, unk24: 0, unk26: rings, unk28: won, unk29: emeralds,
    unk2A: continues, unk2B: new Uint8Array(7),
  }, 0x2120);
  const task1C = piece(bandStep, line({ unkA: 0xF0, unkC: 0x7E, unkE: 8, unk10: SLOT_BAND, unk12: 0xE, unk8: 0xA }));
  const task18 = piece(stripeStep, line({ unkA: 0x100, unkC: 0x80, unkE: 9, unk10: SLOT_STRIPE, unk12: 0xF, unk8: 0 }));
  const taskC = piece(continuesStep, scaled({ unk6: 0, unkC: 0x49, unk8: 0x18 }));
  const task24 = piece(totalStep, scaled({ unk6: 1, unk8: 0x10 }));
  const task10 = piece(bonusStep, scaled({ unk6: 2, unk8: 8 }));
  const task14 = piece(ringsStep, scaled({ unk6: 3, unk8: 0 }));
  const task20 = piece(emeraldsStep, line({ unkA: 0, unkC: 0x29, unkE: 1, unk10: SLOT_EMERALDS, unk12: 0xD, unk8: 0 }));
  e.createTask(resultsStep, { ctx, unk28: 0, unk2A: count, task1C, task18, taskC, task24, task10, task14, task20 }, 0x2100);

  // every layer's map cleared in the next V-blank (gBgSprites_Unknown1 and 2)
  for (const fill of e.mapFill) { fill.value = 0; fill.rect.set([0, 0, 0xFF, 0x20]); }
  loadGraphics(ctx, arg);
}

// sub_805C994: the graphics, and the sprites' colours rows 9 to 15
function loadGraphics(ctx, arg) {
  const load = (id, slot, dest, size, paletteSize, row, flags = 0xD, from = 0) => {
    const gfx = uiGraphics(ctx.rom, ctx.offsets.uiGraphics, id);
    loadUiGfx(ctx.engine, {
      unk0: gfx.unk0, unk2B: slot, tiles: gfx.tiles + from, tilesSize: size, palette: gfx.palette, paletteSize,
      unk28: row, vramC: OBJ_VRAM + dest, unk2A: flags,
    });
  };
  load(UIGFX_BAND, SLOT_BAND, 0x77A0, 0x200, 0x20, 14);
  if (arg) {
    // the stripe after the emerald: the character's name (six of its colours), then the rest of the picture
    load(UIGFX_WON, SLOT_STRIPE, 0x69A0, 0xE00, 0x20, 15);
    load(UIGFX_NAME + ctx.game.character, SLOT_STRIPE, 0x63A0, 0x600, 0xC, 15);
  } else load(UIGFX_LOST, SLOT_STRIPE, 0x63A0, 0x1400, 0x20, 15);
  load(UIGFX_LABELS, SLOT_LABELS, 0x52A0, 0x1100, 0x20, 14);
  load(UIGFX_EMERALDS, SLOT_EMERALDS, 0x4CA0, 0x600, 0x20, 13);
  // the emeralds' other colours only
  UIGFX_EMERALD_COLOURS.forEach((id, i) => load(id, SLOT_COLOURS, 0x4CA0, 0x20, 0x20, 12 - i, 0xC));
  load(UIGFX_FONT, SLOT_DIGITS, 0x4A20, 0x280, 0x20, 9, 0xD, 0x400);
}

// sub_805D4F0: hands its frame count to the pieces, counts the rings and the bonus into the total from frame 170,
// one a frame, and plays the count's sounds; then the act again
function resultsStep(t) {
  const m = t.data, { ctx } = m, e = ctx.engine;
  const pieces = [m.task1C, m.task18, m.taskC, m.task24, m.task10, m.task14, m.task20].map(p => p.data);
  const [, , continues, total, bonus, rings] = pieces;
  for (const p of pieces) p.unk20 = m.unk28 & 0xFFFF;
  if (m.unk28 > COUNT_FROM - 1) {
    if (rings.unk26 !== 0) {
      rings.unk26 = (rings.unk26 - 1) & 0xFFFF;
      total.unk1C += 100;
    }
    if (bonus.unk18 !== 0) {
      bonus.unk18 -= 100;
      total.unk1C += 100;
    }
  }
  m.unk28 = s16(m.unk28 + 1);
  if (m.unk2A + END_AFTER < m.unk28) {
    // the original then moves the act's checkpoint and starts the act (CreateGameStage), which ctx.back hands on
    e.destroyTasks();
    e.clearQueues();
    ctx.back();
    return;
  }
  if (m.unk28 === m.unk2A + COUNT_FROM) e.playSong(continues.unk2A !== 0 ? SONG.RESULT_CONTINUE : SONG.RESULT_COUNTER_DONE);
  if (m.unk28 > COUNT_FROM && m.unk28 < m.unk2A + COUNT_FROM && m.unk28 % 4 === 0) e.playSong(SONG.RESULT_COUNTER);
}

// Task_805D684: the band, as the title card's (card.js) but rising 6 lines a frame from frame 34 to the top, and
// leaving in the screen's last 70 frames
function bandStep(t) {
  const d = t.data, o = d.o, n = s16(d.unk20);
  if (n > d.unk22 + 0x221) {
    if (o.unkA < -32) {
      o.unkA = s16(o.unkA + 32);
      if (o.unkE !== 0) o.unkE = s16(o.unkE - 1);
    }
    o.unkA = s16(o.unkA - 0x1A);
  } else if (n > 0x31) o.unkC = 0x11;
  else if (n > 0x21) o.unkC = s16(o.unkC - 6);
  else if (n > 0x19) o.unkA = -0x10;
  else if (n > 0xF) {
    o.unkA = s16(o.unkA - 0x1A);
    if (o.unkA < -0x10) o.unkA = -0x10;
  }
  drawUiText(d.ctx.engine, BAND, o);
}

// Task_805D720: the stripe, as the title card's, ten glyphs round
function stripeStep(t) {
  const d = t.data, o = d.o, n = s16(d.unk20);
  const draw = () => drawUiText(d.ctx.engine, glyphs(STRIPE, d.unk24), o);
  const scroll = () => {
    if (o.unkA < -0x1F) {
      o.unkA = s16(o.unkA + 0x20);
      d.unk24 = (d.unk24 + 1) % 10;
    }
  };
  if (n > d.unk22 + 0x221) {
    o.unkA = s16(o.unkA - 0x1C);
    if (o.unkA < -0x1F) {
      if (o.unkE !== 0) o.unkE = s16(o.unkE - 1);
      o.unkA = s16(o.unkA + 0x20);
      d.unk24 = (d.unk24 + 1) % 10;
    }
    draw();
  } else if (n > 49) {
    o.unkC = 0x13;
    o.unkA = s16(o.unkA - 2);
    scroll();
    draw();
  } else if (n > 33) {
    o.unkC = s16(o.unkC - 6);
    o.unkA = s16(o.unkA - 2);
    scroll();
    draw();
  } else if (n > 0x19) {
    o.unkA = s16(o.unkA - 2);
    o.unkE = 9;
    scroll();
    draw();
  } else if (n > 0xF) {
    o.unkA = s16(o.unkA - 0x1C);
    if (o.unkA < 0xF0) {
      o.unkE = s16(9 - (o.unkA >> 5));
      scroll();
      draw();
    }
  }
}

// sub_805C900: a number in seven digits (leading zeros as blanks): the rings' points (0), the bonus (1), the total
// (2) or the continues (3, whose digits other than 0 are 11 glyphs on, in the labels' picture)
function digitsOf(d, which) {
  let n = which === 0 ? d.unk26 * 100 : which === 1 ? d.unk18 : which === 2 ? d.unk1C : d.unk2A;
  for (let i = 6; i >= 0; i--) {
    const q = div(n, 10), c = n - q * 10 + 0x20;
    d.unk2B[i] = c;
    if (n !== q * 10 && which === 3) d.unk2B[i] = c + 0xB;
    n = q;
  }
  let first = 0;
  while (first < 7 && d.unk2B[first] === 0x20) first++;
  return first;
}

// a label growing from a line to its height in 8 steps from frame `grow` + 1, then still at (0x29, y); in the
// screen's last 70 frames it slides off to the left until it is past x -128. `number` draws the number beside it.
function label(d, text, grow, y, number) {
  const o = d.o, n = s16(d.unk20), e = d.ctx.engine;
  if (n > d.unk22 + 0x221) {
    o.unkC = y;
    o.unkA = s16(o.unkA - 0x1C);
    if (o.unkA < -0x80) {
      o.unkE = 0;
      o.unkA = -0x80;
    } else drawUiText(e, text, o);
    number(d);
  } else if (n > grow + 6) {
    o.unk2 = (o.unk2 + 0x20) & 0xFFFF;
    if (o.unk2 >= 0x100) {
      o.unk2 = 0x100;
      o.unkA = 0x29;
      o.unkC = y;
      drawUiText(e, text, o);
    } else {
      o.unkA = 0x19;
      o.unkC = s16(y + 10 - (o.unk2 >> 4));
      drawUiTextAffine(e, text, o);
    }
    number(d);
  } else if (n > grow) {
    o.unkA = 0x19;
    o.unkC = s16(y + 10 - (o.unk2 >> 4));
    o.unk2 = (o.unk2 + 0x20) & 0xFFFF;
    if (o.unk2 >= 0x100) o.unk2 = 0x100;
    drawUiTextAffine(e, text, o);
    number(d);
  }
}

// how far a number has slid to the left in the screen's last 70 frames, 28 pixels a frame
const slide = d => d.unk20 > d.unk22 + 545 ? s16((d.unk20 - 545 - d.unk22) * 0x1C) : 0;

// sub_805DE0C, sub_805DBF0 and sub_805D9E4: a number in the font's digits (slot 6, palette 9), right-aligned
// against x 195 on line `y`, or a blank where it is 0; growing from a line with its label
function number(d, which, value, y) {
  if (d.unk20 > d.unk22 + 558) return;
  const o = d.o, e = d.ctx.engine, keepX = o.unkA, keepY = o.unkC;
  const left = slide(d);
  o.unk10 = SLOT_DIGITS;
  o.unk12 = 9;
  const first = digitsOf(d, which), digits = i => d.unk2B[first + i];
  if (o.unk2 === 0x100) {
    o.unkC = y;
    if (value(d) !== 0) {
      o.unkE = 7 - first;
      o.unkA = s16(195 - left - o.unkE * 8);
      drawUiText(e, digits, o);
    } else {
      o.unkE = 1;
      o.unkA = s16(0xBB - left);
      drawUiText(e, glyphs(' '), o);
    }
  } else {
    o.unkC = s16(y + 13 - (o.unk2 >> 4) - div(o.unk2, 25));
    if (value(d) !== 0) {
      o.unkE = 7 - first;
      o.unkA = (6 - o.unkE) * 8 + 0x8F;
      drawUiTextAffine(e, digits, o);
    } else {
      o.unkE = 1;
      o.unkA = 0xB7;
      drawUiTextAffine(e, glyphs(' '), o);
    }
  }
  o.unkA = keepX;
  o.unkC = keepY;
}

// sub_805D81C: the continues' number, its one digit in the labels' picture, at x 179 on line 0x7E
function continuesNumber(d) {
  if (d.unk20 > d.unk22 + 558) return;
  const o = d.o, e = d.ctx.engine, keepX = o.unkA, keepY = o.unkC;
  const left = slide(d);
  const first = digitsOf(d, 3), digits = i => d.unk2B[first + i];
  if (o.unk2 === 0x100) {
    o.unkC = 0x7E;
    o.unkE = 1;
    o.unkA = s16(179 - left);
    drawUiText(e, digits, o);
  } else {
    o.unkC = s16(143 - (o.unk2 >> 4) - div(o.unk2, 25));
    o.unkE = 1;
    o.unkA = 0xA3;
    drawUiTextAffine(e, digits, o);
  }
  o.unkA = keepX;
  o.unkC = keepY;
}

// the labels' fields, set each frame before they are drawn
function labelLine(o) {
  o.unkE = 3;
  o.unk10 = SLOT_LABELS;
  o.unk12 = 0xE;
}

// Task_805DF2C: the rings, on line 0x49
function ringsStep(t) {
  const d = t.data;
  labelLine(d.o);
  label(d, RINGS, 0x33, 0x49, d => number(d, 0, d => d.unk26, 0x46));
}

// Task_805DD10: the emerald bonus, on line 0x5B, once the emerald is won
function bonusStep(t) {
  const d = t.data;
  if (!d.unk28) return;
  labelLine(d.o);
  label(d, BONUS, 0x2D, 0x5B, d => number(d, 1, d => d.unk18, 0x58));
}

// Task_805DB04: the total, on line 0x6D
function totalStep(t) {
  const d = t.data;
  labelLine(d.o);
  label(d, TOTAL, 0x27, 0x6D, d => number(d, 2, d => d.unk1C, 0x6A));
}

// Task_805D8EC: the continues, on line 0x81, from when the count ends, if there are any
function continuesStep(t) {
  const d = t.data, n = s16(d.unk20);
  if (d.unk2A === 0 || n < d.unk22 + COUNT_FROM) return;
  labelLine(d.o);
  label(d, CONTINUES, 0x21, 0x81, continuesNumber);
}

// sub_805E018: the seven emeralds on line 0x29, each a glyph in the emeralds' picture (two shapes, in turn), in
// its colours if the save has it and grey if not; from frame 50 they slide in from the right one after the other,
// 5 frames apart, slowing down, and 70 frames before the end they slide off to the left
function emeraldsStep(t) {
  const d = t.data, o = d.o, e = d.ctx.engine, n = d.unk20;
  const draw = i => {
    if ((d.unk29 >> i) & 1) {
      o.unk12 = 0xD - (i >> 1);
      drawUiText(e, glyphs(i & 1 ? '!' : ' '), o);
    } else {
      o.unk12 = 0xB;
      drawUiText(e, glyphs('"'), o);
    }
  };
  if (n > d.unk22 + 545) {
    const left = (((n - 545 - d.unk22) & 0xFFFF) * 0x1C << 16) >> 16;
    for (let i = 0; i < 7; i++) {
      o.unkA = s16((i << 5) - (left - 5));
      if ((i << 5) - (left - 5) > -0x20) draw(i);
    }
  } else if (n > 0x86) {
    for (let i = 0; i < 7; i++) {
      o.unkA = (i << 5) + 5;
      draw(i);
    }
  } else if (n > 0x31) {
    for (let i = 0; i < 7; i++) {
      let k = (n - 0x31) & 0xFFFF;
      if (k < i * 5) continue;
      k -= i * 5;
      if (k > 50) k = 50;
      o.unkA = s16((i << 5) + (div(SINE[256], 80) + 5) - div(SINE[k * 5], 80));
      draw(i);
    }
  }
}
