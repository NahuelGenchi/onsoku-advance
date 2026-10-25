// The stage HUD's graphics, from the UI graphics table (SAT-R decompilation, src/game/sa1/stage/stage_ui.c
// and ui_rendering.c). Each 28-byte entry is a tiles pointer, a palette pointer, then five words: tiles per
// glyph, OAM size, OAM shape, and the width and height in tiles. Tiles are 4bpp, the low nibble the left
// pixel, colour 0 transparent.

import { readColors } from './colors.js';

const ENTRY = 28;
const FONT = 0, FACE_SONIC = 1, HUD_RING = 5;
// the HUD's glyphs are the font's '0'–'9' and ':' (tiles 32–53), then the same in red (tiles 224–245)
const WHITE_DIGITS = 32, RED_DIGITS = 224, GLYPHS_PER_SET = 11;

const words = (rom, at) => [0, 1, 2, 3, 4].map(i => rom.u32(at + 8 + i * 4));
const same = (a, b) => a.every((v, i) => v === b[i]);

/** The UI graphics table: an entry {2, 0, 2, 1, 2} (the 8 × 16 font) whose entry 5 is {16, 2, 0, 4, 4}. */
export function findUiGraphics(rom) {
  for (let at = 0; at + ENTRY * 6 <= rom.size; at += 4) {
    if (!rom.isPointer(rom.u32(at)) || !rom.isPointer(rom.u32(at + 4))) continue;
    if (same(words(rom, at), [2, 0, 2, 1, 2]) && same(words(rom, at + HUD_RING * ENTRY), [16, 2, 0, 4, 4])) return at;
  }
  return null;
}

// draws `wide × high` tiles from `tilesAt` (row-major, like 1D OBJ mapping) into `img` at (x, y)
function drawTiles(rom, img, x, y, tilesAt, wide, high, palette) {
  for (let t = 0; t < wide * high; t++) {
    const tx = x + (t % wide) * 8, ty = y + Math.floor(t / wide) * 8;
    for (let p = 0; p < 64; p++) {
      const byte = rom.u8(tilesAt + t * 32 + (p >> 1));
      const c = p & 1 ? byte >> 4 : byte & 15;
      if (!c) continue;
      const o = ((ty + (p >> 3)) * img.width + tx + (p & 7)) * 4;
      [img.data[o], img.data[o + 1], img.data[o + 2]] = palette[c];
      img.data[o + 3] = 255;
    }
  }
}

/**
 * The HUD's images on one sheet: { image, glyphs, ring, face }. glyphs[0–10] are white '0'–'9' and ':',
 * glyphs[11–21] the red ones; each rect is [x, y, w, h] on the sheet. The digits and the ring use the font's
 * palette (the HUD loads it into OBJ palette 6), the face its own (the same as Sonic's). The face shares its
 * palette with Sonic's sprite, so in the colours `facePalette` another sprite loads there (Super Sonic's, in the
 * Moon Zone) the sheet has it again as `faceSuper`.
 */
export function hudGraphics(rom, tableAt, facePalette = null) {
  const entry = i => ({
    tiles: rom.requirePtr(tableAt + i * ENTRY, `UI graphics ${i}`),
    palette: readColors(rom, rom.requirePtr(tableAt + i * ENTRY + 4, `UI palette ${i}`), 16),
  });
  const font = entry(FONT), ring = entry(HUD_RING), face = entry(FACE_SONIC);
  const image = new ImageData(2 * GLYPHS_PER_SET * 8 + 32 + 32, 32);
  const glyphs = [];
  for (let g = 0; g < 2 * GLYPHS_PER_SET; g++) {
    const tile = (g < GLYPHS_PER_SET ? WHITE_DIGITS + 2 * g : RED_DIGITS + 2 * (g - GLYPHS_PER_SET));
    drawTiles(rom, image, g * 8, 0, font.tiles + tile * 32, 1, 2, font.palette);
    glyphs.push([g * 8, 0, 8, 16]);
  }
  const ringX = 2 * GLYPHS_PER_SET * 8, faceX = ringX + 32;
  drawTiles(rom, image, ringX, 0, ring.tiles, 4, 4, font.palette);
  drawTiles(rom, image, faceX, 0, face.tiles, 2, 2, face.palette);
  if (facePalette) drawTiles(rom, image, faceX + 16, 0, face.tiles, 2, 2, facePalette);
  return { image, glyphs, ring: [ringX, 0, 32, 32], face: [faceX, 0, 16, 16], ...(facePalette && { faceSuper: [faceX + 16, 0, 16, 16] }) };
}
