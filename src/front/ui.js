// What Sonic Advance's screens share for their pictures, their lines of text and their fades (SAT-R
// decompilation, src/game/sa1/stage/ui_rendering.c and stage_ui.c). A screen loads a picture's tiles and map into
// a layer, or a set of sprite glyphs into sprite VRAM, and its colours, through a stack of 16 graphics-queue
// entries kept in a task of its own; it starts the stack over before each set of loads. The task also keeps ten
// slots, one per set of glyphs, saying where a set's first tile is and how its glyphs are laid out; a line of text
// is a row of sprites, one per glyph of a slot. The fades darken or brighten the screen through the blend
// registers, inside a window that covers all of it.

import { SINE } from '../engine/trig.js';

const UI_TASK_PRIORITY = 0x1800, UI_GFX_SLOTS = 16, UI_GLYPH_SLOTS = 10;
const OBJ_VRAM = 0x10000;
// a glyph's character code: glyph 0 is ' ' (UI_DIGIT(0)), glyph 1 '!' and so on
const GLYPH_BASE = 0x20;
const UI_ENTRY = 28;
const s16 = v => (v << 16) >> 16;
const div = (a, b) => Math.trunc(a / b);   // the BIOS division the original calls (Div)

/**
 * sub_80535FC: the task holding the stack and the slots, unless there is one. The original never sets the slots
 * when it makes the task, so they hold whatever its memory held; here they start at 0, which draws what the
 * recordings show on the one frame they are read before being set (the stage's title card, sub_805C448).
 */
export function createUiTask(e) {
  if (e.uiTask) return;
  const ui = {
    first: null, gfx: Array.from({ length: UI_GFX_SLOTS }, () => ({ next: null, graphics: { src: 0, dest: 0, size: 0 } })),
    slots: Array.from({ length: UI_GLYPH_SLOTS }, () => ({ unk0: 0, unk4: 0, unk8: 0, unk9: 0, unkA: 0, unkB: 0 })),
  };
  e.uiTask = e.createTask(() => {}, ui, UI_TASK_PRIORITY, 0, () => { e.uiTask = null; });
  uiGfxStackInit(e);
}

/** UiGfxStackInit: the stack from its first entry again; the last entry's link is never set. */
export function uiGfxStackInit(e) {
  const ui = e.uiTask.data;
  for (let i = 0; i < UI_GFX_SLOTS - 1; i++) ui.gfx[i].next = ui.gfx[i + 1];
  ui.first = ui.gfx[0];
}

function uiGfxStackPop(e) {
  const ui = e.uiTask.data, cur = ui.first;
  if (!cur) return null;
  ui.first = cur.next;
  return cur.graphics;
}

/**
 * Entry `id` of the UI graphics table at `table` (gUiGraphics, offsets.uiGraphics): its tiles and colours (ROM
 * offsets), and in `unk0` how its glyphs are laid out, as sub_80528AC copies it into a slot: `unk4` tiles a glyph,
 * `unk8` the sprites' size, `unk9` their shape, `unkA` and `unkB` a glyph's width and height in tiles.
 */
export function uiGraphics(rom, table, id) {
  const at = table + id * UI_ENTRY;
  return {
    tiles: rom.requirePtr(at, `UI graphics ${id}`), palette: rom.requirePtr(at + 4, `UI palette ${id}`),
    unk0: { unk4: rom.s32(at + 8), unk8: rom.u32(at + 12) & 0xFF, unk9: rom.u32(at + 16) & 0xFF, unkA: rom.u32(at + 20) & 0xFF, unkB: rom.u32(at + 24) & 0xFF },
  };
}

/**
 * sub_80528AC: `gfx` = { tiles, tilesSize, layout, layoutSize, palette, paletteSize (bytes, ROM offsets), unk28
 * (the first palette row), unk2A (what to load: 1 the tiles, 0x10 the map, 4 the colours, and 8 for sprites),
 * unk2B (the slot), unk0 (the slot's layout, as uiGraphics gives it), and for a layer unk29 (the layer) and
 * uiGfxID, for sprites vramC (where the tiles go, a VRAM offset) }.
 * Every load sets slot unk2B's layout (a screen that doesn't use the slots may leave unk2B out). Sprite tiles go
 * to vramC and the colours to the sprites' palette, and the slot's first tile becomes vramC's. A layer's tiles go
 * to its character block, a tile in unless uiGfxID has 0x80, and its map to its screen block.
 */
export function loadUiGfx(e, gfx) {
  const queue = (src, dest, size) => {
    const g = uiGfxStackPop(e);
    if (!g) return;
    g.src = src; g.dest = dest; g.size = size & 0xFFFF;
    e.queueGraphics(g);
  };
  const slot = gfx.unk2B === undefined ? null : e.uiTask.data.slots[gfx.unk2B];
  if (slot) Object.assign(slot, gfx.unk0);
  if (gfx.unk2A & 0x8) {
    if (gfx.unk2A & 0x1) queue(gfx.tiles, gfx.vramC, gfx.tilesSize);
    if (gfx.unk2A & 0x4) {
      for (let i = 0; i < gfx.paletteSize >> 1; i++) e.objPalette[(gfx.unk28 * 16 + i) & 0xFF] = e.rom.u16(gfx.palette + i * 2);
      e.flags |= 0x2;
    }
    slot.unk0 = (gfx.vramC - OBJ_VRAM) >> 5;
    return;
  }
  const cnt = e.bgCnt[gfx.unk29];
  const vram = ((cnt >> 2) & 3) * 0x4000 + (gfx.uiGfxID & 0x80 ? 0 : 32);
  const layout = (cnt & 0x1F00) << 3;
  if (gfx.unk2A & 0x1) queue(gfx.tiles, vram, gfx.tilesSize);
  if (gfx.unk2A & 0x10) queue(gfx.layout, layout, gfx.layoutSize);
  if (gfx.unk2A & 0x4) {
    for (let i = 0; i < gfx.paletteSize >> 1; i++) e.bgPalette[(gfx.unk28 * 16 + i) & 0xFF] = e.rom.u16(gfx.palette + i * 2);
    e.flags |= 0x1;
  }
}

/** A line of text from a string: its character codes, 0 past its end as after a C string's last character. */
export const glyphs = (text, from = 0) => i => text.charCodeAt(from + i) || 0;

// one sprite of a line of text into OAM at `order`, and for the widescreen view where it really is; false once
// OAM is full
function putGlyph(e, o, order, a0, a1, a2, trueX, trueY) {
  const k = e.allocOam(order);
  if (k < 0) return false;
  e.oamMalloc[k * 4] = a0 & 0xFFFF; e.oamMalloc[k * 4 + 1] = a1 & 0xFFFF; e.oamMalloc[k * 4 + 2] = a2 & 0xFFFF;
  e.wideOam.push({ a: a0 & 0xFFFF, b: a1 & 0xFFFF, c: a2 & 0xFFFF, trueX, trueY, order, sprite: o, x: trueX });
  return true;
}

/**
 * sub_8052F78 (semi-transparent sprites) and, with `solid`, sub_80530CC: `o.unkE` glyphs of `text` (i => the i-th
 * character code) from slot `o.unk10`, side by side from (o.unkA, o.unkC), in palette `o.unk12` at OAM order
 * `o.unk8 >> 3`. `o` = { unk8, unkA, unkC, unkE, unk10, unk12, unk16 } (GameOverB).
 */
export function drawUiText(e, text, o, solid = false) {
  if (!o.unk16) throw new Error('sub_8052F78: rows of text (unk16 = 0) are not ported.');
  const slot = e.uiTask.data.slots[o.unk10];
  const step = slot.unkA * 8, order = (o.unk8 >> 3) & 0xFF;
  const a0 = (slot.unk9 << 14) + (o.unkC & 0xFF) + (solid ? 0 : 0x400);
  let a1 = (slot.unk8 << 14) + (o.unkA & 0x1FF);
  const a2 = (o.unk12 << 12) | (slot.unk0 & 0x3FF);
  for (let i = 0; i < s16(o.unkE); i++) {
    const c = (a2 + (text(i) - GLYPH_BASE) * slot.unk4) & 0xFFFF;
    if (!putGlyph(e, o, order, a0, a1, c, s16(o.unkA) + i * step, s16(o.unkC))) break;
    a1 = (a1 + step) & 0xFFFF;
  }
}

/**
 * sub_80047A0: affine parameters `index` of OAM for `angle` (0–1023) and the scales `sx` and `sy` (8.8), written
 * straight into the OAM buffer, where the V-blank's copy of the sprites leaves them.
 */
export function setUiAffine(e, angle, sx, sy, index) {
  const cos = SINE[angle + 256] >> 6, sin = SINE[angle] >> 6;
  const put = (k, v) => { e.oamBuffer[(index * 4 + k) * 4 + 3] = v & 0xFFFF; };
  let res = s16(div(0x10000, s16(sx)));
  put(0, (cos * res) >> 8);
  put(1, (sin * res) >> 8);
  res = s16(div(0x10000, s16(sy)));
  put(2, ((-SINE[angle] >> 6) * res) >> 8);
  put(3, (cos * res) >> 8);
}

/**
 * sub_8052C84: `o.unkE` glyphs of `text` from slot `o.unk10` as semi-transparent sprites, side by side from
 * (o.unkA, o.unkC), scaled by o.unk0 across and o.unk2 down (8.8) and turned by o.unk4 through affine parameters
 * o.unk6, as double-size sprites; unscaled and unturned, plain ones. `o` = Strc_8052C84.
 */
export function drawUiTextAffine(e, text, o) {
  const slot = e.uiTask.data.slots[o.unk10];
  let r8 = 0, r0 = 0;
  if ((o.unk4 & 0xFFFF) !== 0 || (o.unk0 & 0xFFFF) !== 0x100 || (o.unk2 & 0xFFFF) !== 0x100) {
    setUiAffine(e, o.unk4 & 0xFFFF, o.unk0, o.unk2, o.unk6 & 0xFFFF);
    r8 = o.unk6 & 0xFFFF;
    r0 = 3;
  }
  const order = (o.unk8 >> 3) & 0xFF;
  for (let i = 0; i < s16(o.unkE); i++) {
    const x = (((slot.unkA * i) << 3) + (o.unkA & 0xFFFF)) & 0x1FF;
    const a0 = (slot.unk9 << 14) | (o.unkC & 0xFF) | (r0 << 8) | 0x400;
    const a1 = (slot.unk8 << 14) | (r8 << 9) | x;
    const a2 = (o.unk12 << 12) + slot.unk0 + slot.unk4 * (text(i) - GLYPH_BASE);
    if (!putGlyph(e, o, order, a0, a1, a2, s16(o.unkA) + ((slot.unkA * i) << 3), s16(o.unkC))) break;
  }
}

/**
 * A fade (StrcUi_805423C): `unk0` frames to wait, `unk2` which window (1 or 0), `unk4` the direction (bits 1 and
 * 4 brighten or darken towards the end, the others away from it; 4 and 8 go to white, the others to black),
 * `unk6` how far it is (0 to 32 in 8.8), `unk8` its step a frame, `unkA` which layers it covers.
 */
export const createFade = (unk0, unk2, unk4, unk6, unk8, unkA) => ({ unk0, unk2, unk4, unk6, unk8, unkA });

// both fades: the window over the whole screen, and the blend set for how far the fade is
function applyFade(e, f, step) {
  e.dispCnt |= f.unk2 ? 0x4000 : 0x2000;
  if (f.unkA & 0x1) { e.bldCnt = 0x3F3F; e.bldAlpha = 16; }
  else if (step && f.unkA & 0x10) { e.bldCnt = 0x203F; e.bldAlpha = 0; }
  else if ((f.unkA & 0xFF) === 0) { e.bldCnt = 0x0F; e.bldAlpha = 0; }
  else if (step && f.unkA & 0x8) e.bldCnt = 0x3F3F;
  if (f.unk2) { e.winRegs[1] = 0x00F0; e.winRegs[3] = 0x00A0; e.winRegs[4] |= 0x3F00; }
  else { e.winRegs[0] = 0x00F0; e.winRegs[2] = 0x00A0; e.winRegs[4] |= 0x3F; }
  e.winRegs[5] |= 0x1F;
  e.bldCnt |= f.unk4 & 0xC ? 0x80 : 0xC0;
  let y = (f.unk4 & 5 ? f.unk6 >> 8 : 32 - (f.unk6 >> 8)) & 0xFFFF;
  if (y >= 32) y = 32;
  e.bldY = y >> 1;
}

/** sub_805423C: the fade as it is, then a step on (once it has waited); true once it has reached its end. */
export function fadeStep(e, f) {
  applyFade(e, f, true);
  const r2 = f.unk6 & 0xFFFF;
  if (f.unk0 !== 0) {
    f.unk0 = f.unk0 >= f.unk8 ? s16(f.unk0 - f.unk8) : 0;
    return false;
  }
  f.unk6 = s16(r2 + f.unk8);
  if (f.unk6 >= 0x2000) { f.unk6 = 0x2000; return true; }
  return false;
}

/** sub_80543A4: the fade as it is, without a step. */
export const fadeShow = (e, f) => applyFade(e, f, false);
