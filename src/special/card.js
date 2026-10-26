// The special stage's title card (SAT-R decompilation, src/game/sa1/ui/game_2_0.c: sub_805C448 and its tasks),
// shown as the stage starts (with the stage fading in from black) and again at the checkpoint once it is passed,
// with the goal's target. For 256 frames: a band slides in from the right along the bottom of the screen and up
// to the top, a stripe of the target's picture scrolls past under it, and at the stage's start a word grows from a
// line into the middle of the screen. The target number is loaded into the stripe's picture on the second frame.
// When the card ends, the rings counter starts (ctx.hud).

import { createUiTask, uiGfxStackInit, uiGraphics, loadUiGfx, drawUiText, drawUiTextAffine, glyphs, createFade, fadeStep, fadeShow } from '../front/ui.js';

const OBJ_VRAM = 0x10000;
const CARD_FRAMES = 0xFF;
// the UI graphics the card uses: the word, the band, the stripe with a target of 1, 2 or 3 digits, the digits
const UIGFX_WORD = 50, UIGFX_BAND = 16, UIGFX_STRIPE = [47, 48, 49], UIGFX_DIGITS = 32;
// the slots they go in (Task_3006240's table, ui.js)
const SLOT_STRIPE = 2, SLOT_DIGITS = 3, SLOT_WORD = 4, SLOT_BAND = 8;
const PALETTE = 6;
// the band is eight blank glyphs; the stripe the picture's seven glyphs three times over, then a 0 and five more
// (gUnknown_08688638, copied onto the stack); the word five glyphs
const BAND = glyphs('        ');
const STRIPE = ' !"#$%& !"#$%& !"#$%&';
const WORD = glyphs(' !"#$');
const s16 = v => (v << 16) >> 16;
const div = (a, b) => Math.trunc(a / b);

// a text line's fields (GameOverB / Strc_8052C84), its other fields as the task's memory left them (unused)
const line = fields => ({ unk0: 0, unk2: 0, unk4: 0, unk6: 0, unk8: 0, unkA: 0, unkC: 0, unkE: 0, unk10: 0, unk12: 0, unk14: 0, unk16: 0, ...fields });

/**
 * sub_805C448: the card, `arg` 1 at the stage's start (with the word and the fade in) and 0 at the checkpoint.
 * The target shown is ctx.special.target as it is on the card's second frame.
 */
export function createTitleCard(ctx, arg) {
  const e = ctx.engine;
  createUiTask(e);
  uiGfxStackInit(e);
  const band = { ctx, unk18: 0, unk1A: 0, o: line({ unkA: 0xF0, unkC: 0x7E, unkE: 8, unk10: SLOT_BAND, unk12: PALETTE, unk16: 1, unk8: 0xA }) };
  const task10 = e.createTask(bandStep, band, 0x2120);
  const stripe = { ctx, unk18: 0, unk1A: 0, o: line({ unkA: 0x100, unkC: 0x80, unkE: 9, unk10: SLOT_STRIPE, unk12: PALETTE, unk16: 1, unk8: 0 }) };
  const task14 = e.createTask(stripeStep, stripe, 0x2120);
  let taskC = null;
  if (arg) {
    const word = { ctx, unk18: 0, unk1A: 0, o: line({ unk0: 0x100, unk2: 0, unk4: 0, unk6: 0, unkA: 0x39, unkC: 0x49, unkE: 5, unk10: SLOT_WORD, unk12: PALETTE, unk16: 1, unk8: 0 }) };
    taskC = e.createTask(wordStep, word, 0x2120);
  }
  const card = { ctx, unk18: 0, unk1A: arg, task10, task14, taskC, fade: createFade(0, 1, 2, 0, 0x60, 1) };
  e.createTask(cardStep, card, 0x2100);
  if (arg) fadeShow(e, card.fade);
}

// Task_805C594: hands its frame count to the pieces; at the stage's start, the fade in from black from frame 21 to
// 105; on the second frame, the target's graphics; after 256 frames, the end
function cardStep(t) {
  const card = t.data, { ctx } = card, e = ctx.engine;
  card.task10.data.unk18 = card.unk18;
  card.task14.data.unk18 = card.unk18;
  if (card.unk1A) {
    card.taskC.data.unk18 = card.unk18;
    if (card.unk18 < 106) {
      if (card.unk18 > 20) fadeStep(e, card.fade);
      else fadeShow(e, card.fade);
    }
  }
  if (++card.unk18 > CARD_FRAMES) {
    e.dispCnt &= ~0xE000;
    e.bldCnt = 0;
    e.bldY = 0;
    ctx.hud();
    e.destroyTask(card.task14);
    e.destroyTask(card.task10);
    if (card.unk1A) e.destroyTask(card.taskC);
    e.destroyTask(t);
    return;
  }
  if (card.unk18 === 2) loadTarget(ctx, ctx.special.target & 0xFFFF);
}

// a load of UI graphics `id` into sprite VRAM at `dest`, its layout into `slot`, and its colours into the card's
// palette; `from` bytes into its tiles
function load(ctx, id, slot, dest, size, from = 0) {
  const gfx = uiGraphics(ctx.rom, ctx.offsets.uiGraphics, id);
  loadUiGfx(ctx.engine, {
    unk0: gfx.unk0, unk2B: slot, tiles: gfx.tiles + from, tilesSize: size, palette: gfx.palette, paletteSize: 0x20,
    unk28: PALETTE, vramC: OBJ_VRAM + dest, unk2A: 0xD,
  });
}

// a digit of the target: its top two tiles at `top` and its bottom two at `bottom`, in the stripe's picture
function loadDigit(ctx, digit, top, bottom) {
  load(ctx, UIGFX_DIGITS, SLOT_DIGITS, top, 0x40, digit << 7);
  load(ctx, UIGFX_DIGITS, SLOT_DIGITS, bottom, 0x40, (digit << 7) + 0x40);
}

/**
 * sub_805BC94: the word, the band and the stripe (the picture for a target of `n`'s number of digits), then the
 * target's digits into the stripe's picture. A target of 100 or more leaves out its leading zeros, which none has.
 */
function loadTarget(ctx, n) {
  const digits = (div(n, 100) & 0xFF) !== 0 ? 3 : (div(n, 10) & 0xFF) !== 0 ? 2 : 1;
  load(ctx, UIGFX_WORD, SLOT_WORD, 0x5DA0, 0xA00);
  load(ctx, UIGFX_BAND, SLOT_BAND, 0x77A0, 0x200);
  load(ctx, UIGFX_STRIPE[digits - 1], SLOT_STRIPE, 0x67A0, 0xE00);
  if (digits === 3) {
    let leading = true;
    const hundreds = div(n, 100) & 0xFF;
    n = (n % 100) & 0xFFFF;
    if (hundreds !== 0) { leading = false; loadDigit(ctx, hundreds, 0x69E0, 0x6A60); }
    const tens = div(n, 10) & 0xFF;
    n = (n % 10) & 0xFFFF;
    if (tens !== 0 || !leading) { leading = false; loadDigit(ctx, tens, 0x6BA0, 0x6C20); }
    if ((n & 0xFF) !== 0 || !leading) loadDigit(ctx, n & 0xFF, 0x6BE0, 0x6C60);
  } else if (digits === 2) {
    loadDigit(ctx, div(n, 10) & 0xFF, 0x69E0, 0x6A60);
    loadDigit(ctx, (n % 10) & 0xFFFF, 0x6BA0, 0x6C20);
  } else loadDigit(ctx, n & 0xFF, 0x69E0, 0x6A60);
}

// Task_805C6B0: the band, sliding in from the right from frame 16 to 26, rising 8 lines a frame from frame 34 to
// the top, and from frame 246 sliding off to the left a glyph at a time
function bandStep(t) {
  const d = t.data, o = d.o;
  if (d.unk18 > 0xF5) {
    if (o.unkA < -0x20) {
      o.unkA = s16(o.unkA + 0x20);
      if (o.unkE !== 0) o.unkE = s16(o.unkE - 1);
    }
    o.unkA = s16(o.unkA - 0x1A);
  } else if (d.unk18 > 0x2D) o.unkC = 0x11;
  else if (d.unk18 > 0x21) o.unkC = s16(o.unkC - 8);
  else if (d.unk18 > 0x19) o.unkA = -0x10;
  else if (d.unk18 > 0xF) {
    o.unkA = s16(o.unkA - 0x1A);
    if (o.unkA < -0x10) o.unkA = -0x10;
  }
  drawUiText(d.ctx.engine, BAND, o);
}

// Task_805C740: the stripe, coming in from the right from frame 16 with the band and scrolling left 2 pixels a
// frame from frame 26, a glyph of the picture at a time; it rises with the band and leaves the same way
function stripeStep(t) {
  const d = t.data, o = d.o;
  const draw = () => drawUiText(d.ctx.engine, glyphs(STRIPE, d.unk1A), o);
  const scroll = () => {
    if (o.unkA < -0x1F) {
      o.unkA = s16(o.unkA + 0x20);
      d.unk1A = (d.unk1A + 1) % 7;
    }
  };
  if (d.unk18 > 0xF5) {
    o.unkA = s16(o.unkA - 0x1C);
    if (o.unkA < -0x1F) {
      if (o.unkE !== 0) o.unkE = s16(o.unkE - 1);
      o.unkA = s16(o.unkA + 0x20);
      d.unk1A = (d.unk1A + 1) % 7;
    }
    draw();
  } else if (d.unk18 > 0x2D) {
    o.unkC = 0x13;
    o.unkA = s16(o.unkA - 2);
    scroll();
    draw();
  } else if (d.unk18 > 0x21) {
    o.unkC = s16(o.unkC - 8);
    o.unkA = s16(o.unkA - 2);
    scroll();
    draw();
  } else if (d.unk18 > 0x19) {
    o.unkA = s16(o.unkA - 2);
    o.unkE = 9;
    scroll();
    draw();
  } else if (d.unk18 > 0xF) {
    o.unkA = s16(o.unkA - 0x1C);
    if (o.unkA <= 0xEF) {
      o.unkE = s16(9 - (o.unkA >> 5));
      scroll();
      draw();
    }
  }
}

// Task_805C83C: the word, from frame 34 growing from a line to its height (16 steps, as double-size scaled
// sprites, moving up as it grows), then still until frame 246, when it slides off to the left until it is past
// x -128
function wordStep(t) {
  const d = t.data, o = d.o, e = d.ctx.engine;
  if (d.unk18 > 0xF5) {
    o.unkC = 0x49;
    o.unkA = s16(o.unkA - 0x1C);
    if (o.unkA < -0x80) {
      o.unkE = 0;
      o.unkA = -0x80;
    } else drawUiText(e, WORD, o);
  } else if (d.unk18 > 0x2D) {
    o.unk2 = (o.unk2 + 0x10) & 0xFFFF;
    if (o.unk2 >= 0x100) {
      o.unk2 = 0x100;
      o.unkA = 0x39;
      o.unkC = 0x49;
      drawUiText(e, WORD, o);
    } else {
      o.unkA = 0x29;
      o.unkC = s16(0x54 - (o.unk2 >> 3));
      drawUiTextAffine(e, WORD, o);
    }
  } else if (d.unk18 > 0x21) {
    o.unkA = 0x29;
    o.unkC = s16(0x54 - (o.unk2 >> 3));
    o.unk2 = (o.unk2 + 0x10) & 0xFFFF;
    if (o.unk2 >= 0x100) o.unk2 = 0x100;
    drawUiTextAffine(e, WORD, o);
  }
}
