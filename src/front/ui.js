// What Sonic Advance's screens share for their pictures and fades (SAT-R decompilation,
// src/game/sa1/stage/ui_rendering.c and stage_ui.c). A screen loads a picture's tiles and map into a layer, and
// its colours, through a stack of 16 graphics-queue entries kept in a task of its own; it starts the stack over
// before each set of loads. The fades darken or brighten the screen through the blend registers, inside a
// window that covers all of it.

const UI_TASK_PRIORITY = 0x1800, UI_GFX_SLOTS = 16;
const s16 = v => (v << 16) >> 16;

/** sub_80535FC: the task holding the stack, unless there is one. */
export function createUiTask(e) {
  if (e.uiTask) return;
  const ui = { first: null, gfx: Array.from({ length: UI_GFX_SLOTS }, () => ({ next: null, graphics: { src: 0, dest: 0, size: 0 } })) };
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
 * sub_80528AC, for a layer: `gfx` = { tiles, tilesSize, layout, layoutSize, palette, paletteSize (bytes, ROM
 * offsets), unk28 (the first palette row), unk29 (the layer), unk2A (what to load: 1 the tiles, 0x10 the map,
 * 4 the colours), uiGfxID }. The tiles go to the layer's character block, a tile in unless uiGfxID has 0x80, and
 * the map to its screen block.
 */
export function loadUiGfx(e, gfx) {
  if (gfx.unk2A & 0x8) throw new Error('sub_80528AC: sprite graphics are not ported.');
  const cnt = e.bgCnt[gfx.unk29];
  const vram = ((cnt >> 2) & 3) * 0x4000 + (gfx.uiGfxID & 0x80 ? 0 : 32);
  const layout = (cnt & 0x1F00) << 3;
  const queue = (src, dest, size) => {
    const g = uiGfxStackPop(e);
    if (!g) return;
    g.src = src; g.dest = dest; g.size = size & 0xFFFF;
    e.queueGraphics(g);
  };
  if (gfx.unk2A & 0x1) queue(gfx.tiles, vram, gfx.tilesSize);
  if (gfx.unk2A & 0x10) queue(gfx.layout, layout, gfx.layoutSize);
  if (gfx.unk2A & 0x4) {
    for (let i = 0; i < gfx.paletteSize >> 1; i++) e.bgPalette[(gfx.unk28 * 16 + i) & 0xFF] = e.rom.u16(gfx.palette + i * 2);
    e.flags |= 0x1;
  }
}

/**
 * A fade (StrcUi_805423C): `unk0` frames to wait, `unk2` which window (1 or 0), `unk4` the direction (bits 1 and
 * 4 brighten or darken towards the end, the others away from it; 4 and 8 darken, the others brighten),
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
