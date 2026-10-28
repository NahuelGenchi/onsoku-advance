// The special stage's rings counter (SAT-R decompilation, src/game/sa1/stage/stage_ui.c: CreateSpecialStageUI,
// Task_SpecialStageUIMain and sub_8054068): at the top of the screen, a panel with the rings collected and, under
// them, the rings the stage asks for, each up to 999. The panel drops in from above over the first 30 frames, the
// collected count from frame 20 to 40 and the target from frame 15 to 35. A count of 0 blinks, 16 frames a plain 0
// and 16 a red one (twice as fast when both counts are 0, as they share the blink's frame count).

import { uiGfxStackInit, uiGraphics, loadUiGfx, drawUiText } from '../front/ui.js';

const UIGFX_FONT = 0, UIGFX_PANEL = 46;
// the font's '0'–'9' and ':' (tiles 32 on) and its red '0' (tiles 124 on), the panel; their slots
const FONT_DIGITS = 32, FONT_RED = 124;
const SLOT_DIGITS = 0, SLOT_PANEL = 3;
const DIGITS = 0x175E0, RED = 0x178A0, PANEL = 0x17BE0;   // VRAM_RESERVED_UI_DIGITS_E, _F and _G
const DIGIT = c => 0x20 + c;   // UI_DIGIT
const div = (a, b) => Math.trunc(a / b);

// the blinking 0's four glyphs, 8 frames each (gUnknown_0865F174: plain, red, red, plain) and the panel's one
// (gUnknown_0865F178), which the ROM keeps just before the font's tiles
const zeroText = ctx => uiGraphics(ctx.rom, ctx.offsets.uiGraphics, UIGFX_FONT).tiles - 8;

/**
 * CreateSpecialStageUI: the counter's task, and its graphics (sub_8054068), through the title card's UI task. The
 * original never sets the blink's frame count (unk48), so it starts at whatever the task's memory held:
 * `ctx.special.hudBlink` here, 0 if not given: at a stage's start the line the fall's last streak was on (the
 * random numbers place the streaks), and 0 after the checkpoint, in the recordings. A count past 31 shows its first
 * 0 from a byte past the four glyphs, and then goes on from its value modulo 32.
 */
export function createSpecialStageUi(ctx) {
  const e = ctx.engine;
  const ui = {
    ctx, digitsRings: [0, 0, 0], unk10: [0, 0, 0], unk40: 0, ringCount: 0,
    unk48: (ctx.special.hudBlink ?? 0) & 0xFFFF, unk4C: 0, zero: zeroText(ctx),
  };
  e.createTask(hudStep, ui, 0x1180);
  uiGfxStackInit(e);
  const load = (id, slot, from, dest, size, row, flags) => {
    const gfx = uiGraphics(ctx.rom, ctx.offsets.uiGraphics, id);
    loadUiGfx(e, {
      unk0: gfx.unk0, unk2B: slot, tiles: gfx.tiles + from, tilesSize: size, palette: gfx.palette, paletteSize: 32,
      unk28: row, vramC: dest, unk2A: flags,
    });
  };
  load(UIGFX_FONT, SLOT_DIGITS, FONT_RED * 32, RED, 6 * 32, 6, 0x9);
  load(UIGFX_FONT, SLOT_DIGITS, FONT_DIGITS * 32, DIGITS, 22 * 32, 6, 0xD);
  load(UIGFX_PANEL, SLOT_PANEL, 0, PANEL, 32 * 32, 10, 0xD);
}

// a count's three digits, 999 past it
function digitsOf(n, out) {
  if (n > 999) { out.fill(DIGIT(9)); return; }
  for (let i = 0; i < 3; i++) {
    const q = div(n, 10);
    out[2 - i] = DIGIT(n - q * 10);
    n = q;
  }
}

// where a count is as it drops in: from `from` lines down to `to`, over the 20 frames from frame `start`
const dropIn = (n, start, from, to) => n >= start && n < start + 20 ? div((n - start) << 6, 20) + from : n >= start + 20 ? to : from;

// Task_SpecialStageUIMain
function hudStep(t) {
  const ui = t.data, { ctx } = ui, e = ctx.engine, rom = ctx.rom;
  let r7 = ui.unk48 & 0xFF;
  const n = (ui.unk4C + 1) << 16 >> 16;
  ui.unk4C = n;
  const x = 90, targetX = 114;
  const o = { unk8: 24, unkA: x + 4, unkC: dropIn(n, 10, -70, -6), unkE: 1, unk10: SLOT_PANEL, unk12: 10, unk16: 1 };
  drawUiText(e, i => rom.u8(ui.zero + 4 + i), o, true);

  // a count: one digit, two or three; a 0 blinks, from the blinking 0's glyphs (four, 8 frames each; the frame
  // count can start anywhere up to 255 and read past them, see createSpecialStageUi)
  const count = (value, digits, left) => {
    if (value < 10) {
      o.unkA = left + 12;
      o.unkE = 1;
      if (value === 0) {
        const at = ui.zero + (r7 >> 3);
        r7 = ((r7 + 1) & 0xFF) % 32;
        ui.unk48 = r7;
        drawUiText(e, i => rom.u8(at + i), o, true);
      } else drawUiText(e, i => digits[2 + i], o, true);
    } else if (value < 100) {
      o.unkA = left + 8;
      o.unkE = 2;
      drawUiText(e, i => digits[1 + i], o, true);
    } else {
      o.unkA = left + 4;
      o.unkE = 3;
      drawUiText(e, i => digits[i], o, true);
    }
  };

  const collected = ctx.special.collected & 0xFFFF;
  digitsOf(collected, ui.digitsRings);
  ui.ringCount = collected;
  o.unkC = dropIn(n, 20, -64, 0);
  Object.assign(o, { unk12: 6, unk8: 16, unk10: SLOT_DIGITS, unk16: 1 });
  count(collected, ui.digitsRings, x);

  const target = ctx.special.target & 0xFFFF;
  digitsOf(target, ui.unk10);
  ui.ringCount = target;
  o.unkC = dropIn(n, 15, -52, 12);
  Object.assign(o, { unk12: 6, unk8: 16, unk10: SLOT_DIGITS, unk16: 1 });
  count(target, ui.unk10, targetX);
}
