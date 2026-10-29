// The normal ending's art (SAT-R decompilation, src/game/sa1/ui/extra_stage_results.c CreateCongratulationsAnimation,
// staff_credits.c and collect_chaos_emeralds_msg.c, checked in the USA ROM): the sky the congratulations play
// over, the staff credits' list, the font its lines are written in and the logos' rows, and the fill tiles the
// credits and the closing message put behind them.

import { readColors } from './colors.js';
import { skyLayer, findTrueEnding } from './ending.js';
import { findUiGraphics } from './hud.js';

// [animation, variant] by the name the ending draws them by: the staff credits' company logos (740) and the
// copyright line (741 variant 1), which come after the true ending too
export const CREDITS_SPRITES = { logo0: [740, 0], logo1: [740, 1], logo2: [740, 2], logo3: [740, 3], copyright: [741, 1] };
// and the rest of the normal ending's, as Sonic's entries in the congratulations' per-character tables have
// them (gUnknown_0868B3D8 to gUnknown_0868B4A8, USA 0x086842D4 to 0x086843A4)
export const NORMAL_ENDING_SPRITES = {
  // Sonic falling (B3D8), caught by the Tornado and pulled up (B418, B428, B438), riding its wing (B448) and
  // leaping off it toward the screen (B458, B468, B478)
  fallSonic: [85, 0], caughtSonic0: [86, 0], caughtSonic1: [86, 1], pulledSonic: [87, 0], rideSonic: [88, 0],
  leapSonic0: [89, 0], leapSonic1: [89, 1], leapSonic2: [96, 0, 737],
  // Tails in the Tornado's cockpit (B3F8, 805 variant 1) and looking round (B408), and the Tornado (736)
  pilotTails: [805, 1], pilotTailsLook: [190, 0], tornado: [736, 0],
  // the close-up of Sonic and Tails (B3E8) and Sonic's thumbs-up (B4A8). The close-up loads all 256 sprite
  // colours (palette 146) every frame it shows, and the thumbs-up only the first 64 of them, so it and Sonic
  // leaping toward the screen show in the close-up's
  closeUp: [737, 0], thumbsUp: [738, 0, 737],
  // the wind's streaks while Sonic falls (776), the Flickies (788), the four clouds (790–793) and the three
  // congratulation lines (785)
  streak: [776, 0], flicky: [788, 0],
  // the four load their colours into the same palette row as they are made, cloud2's (palette 182) first and
  // cloud3's (181) last, so cloud2 shows in cloud3's
  cloud0: [790, 0], cloud1: [791, 0], cloud2: [792, 0, 793], cloud3: [793, 0],
  // and from the close-up on, which loads all 256 sprite colours each frame (palette 146), in its colours
  cloud0Late: [790, 0, 737], cloud1Late: [791, 0, 737], cloud2Late: [792, 0, 737], cloud3Late: [793, 0, 737],
  congrats0: [785, 0], congrats1: [785, 1], congrats2: [785, 2],
  ...CREDITS_SPRITES,
  // the closing message: "Hey, go collect all the Chaos Emeralds!" in the save's language (gUnknown_0868B654 and
  // gUnknown_0868B658, USA 0x08684550: 787 in Japanese, 784 in English, both variant 0), and Eggman with an
  // emerald (739, two parts)
  emeraldTextJapanese: [787, 0], emeraldText: [784, 0], emeraldEggman0: [739, 0], emeraldEggman1: [739, 1],
};

const ENTRY = 32, ENTRIES = 334;   // CreditsString: length, palette, y offset, 25 letters and a 0, 3 padding
// the UI graphics the credits load (sub_805E1E8): the 8 × 16 font, uiGfx 59's and 60's palettes in OBJ
// palette rows 15 and 14, and UIGFX_CHAR_SELECT_BLACK_BOX_2's tile on BG1; the closing message's BG0 tile is
// uiGfx 43's first
const UI = 28, FONT = 0, NAMES = 59, HEADINGS = 60, BLACK_BOX = 45, MESSAGE = 43;
const FONT_TILES = 236, GLYPHS = FONT_TILES / 2;

/** The staff credits' list, found by its first line: CreditsString { 10, 0, 0, "CREATED BY" } at entry 20. */
export function findCredits(rom) {
  const text = [...'CREATED BY'].map(c => c.charCodeAt(0));
  for (let at = 20 * ENTRY; at + ENTRY <= rom.size; at += 4) {
    if (rom.u8(at) !== 10 || rom.u8(at + 1) !== 0 || rom.u8(at + 2) !== 0) continue;
    if (text.every((c, i) => rom.u8(at + 3 + i) === c) && rom.u8(at + 3 - 20 * ENTRY) === 0x20) return at - 20 * ENTRY;
  }
  return null;
}

/**
 * The normal ending's art, as endingrender.js draws it: the scenes `congrats` (CreateCongratulationsAnimation's
 * sky on BG0), `credits` (BG1's black tiles) and `message` (the closing message's BG0, where the version's
 * palette for it is known), each { palette, layers: { back: { cnt, image } } }; `glyphs` (the font's 118 letters
 * as 8 × 16 images in palette rows 14 and 15: glyphs[row - 14][code]); and for credits.js `lines` (each
 * { length, palette, dy, text } as the list has it) and `logoRows` (gUnknown_086886A0: the list's row each
 * company logo comes at). Null when the sky or the list isn't found.
 */
export function normalEndingArt(rom, offsets) {
  const skyAt = offsets.trueEnding ?? findTrueEnding(rom);
  const listAt = offsets.credits ?? findCredits(rom);
  const ui = offsets.uiGraphics ?? findUiGraphics(rom);
  if (skyAt === null || listAt === null || ui === null) return null;
  const entry = i => ({ tiles: rom.requirePtr(ui + i * UI, `UI graphics ${i}`), palette: rom.requirePtr(ui + i * UI + 4, `UI palette ${i}`) });
  const lines = Array.from({ length: ENTRIES }, (_, i) => {
    const at = listAt + i * ENTRY;
    return { length: rom.u8(at), palette: rom.u8(at + 1), dy: (rom.u8(at + 2) << 24) >> 24, text: Array.from({ length: 25 }, (_, k) => rom.u8(at + 3 + k)) };
  });
  // the logos' rows come right before the list: four u32s (22, 79, 139, 322), then two more 322s
  const logoRows = Array.from({ length: 4 }, (_, i) => rom.u16(listAt - 24 + i * 4));
  const font = entry(FONT).tiles;
  const glyphs = [HEADINGS, NAMES].map(id => {
    const palette = readColors(rom, entry(id).palette, 16);
    return Array.from({ length: GLYPHS }, (_, g) => tiles4(rom, font + g * 64, 1, 2, palette));
  });
  const sky = skyLayer(rom, skyAt, SKY_CNT);
  const filled = (tileAt, colorsAt, cnt) => {
    const palette = readColors(rom, colorsAt, 16);
    return { palette, layers: { back: { cnt, image: tiled(tiles4(rom, tileAt, 1, 1, palette, true)) } } };
  };
  return {
    congrats: { palette: sky.palette, layers: { back: sky.layer } },
    credits: filled(entry(BLACK_BOX).tiles, entry(BLACK_BOX).palette, CREDITS_CNT),
    message: offsets.emeraldMessage === undefined ? null : filled(entry(MESSAGE).tiles, offsets.emeraldMessage, MESSAGE_CNT),
    glyphs, lines, logoRows,
  };
}
// CreateCongratulationsAnimation's BG0: 256 colours, character base 1, screen base 29, 256 × 512; the credits'
// BG1 and the message's BG0, 256 × 256 at priority 3
export const SKY_CNT = 0x9D86;
const CREDITS_CNT = 0x1907, MESSAGE_CNT = 0x1D03;

// a 256 × 256 background of one tile
function tiled(tile) {
  const img = new ImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x += 8) img.data.set(tile.data.subarray((y & 7) * 32, (y & 7) * 32 + 32), (y * 256 + x) * 4);
  return img;
}

// `wide × high` 4bpp tiles from `at` in 1D order as an image; colour 0 is clear, or the palette's colour 0
// where `opaque` (a background's tile over the backdrop)
function tiles4(rom, at, wide, high, palette, opaque = false) {
  const img = new ImageData(wide * 8, high * 8);
  for (let t = 0; t < wide * high; t++) {
    const tx = (t % wide) * 8, ty = Math.floor(t / wide) * 8;
    for (let p = 0; p < 64; p++) {
      const byte = rom.u8(at + t * 32 + (p >> 1)), c = p & 1 ? byte >> 4 : byte & 15;
      if (!c && !opaque) continue;
      const o = ((ty + (p >> 3)) * img.width + tx + (p & 7)) * 4;
      [img.data[o], img.data[o + 1], img.data[o + 2]] = palette[c];
      img.data[o + 3] = 255;
    }
  }
  return img;
}
