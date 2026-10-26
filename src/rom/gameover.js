// The continue screen's graphics and tables (SAT-R decompilation, src/game/sa1/ui/game_over.c: sub_8055C50 and
// Task_805676C), from the UI graphics table (hud.js) and the title card's tables (titlecard.js). The words GAME
// OVER and CONTINUE? are sprite animation 715 (extract.js).

import { readColors } from './colors.js';

const ENTRY = 28, TILE = 32;
const FONT = 0, TIMER_DIGITS = 32, OK = 33, BLACK_BOX = 45;
// after the card's texts: the countdown's ten voices, 9 down to 0 (gUnknown_086883E4), then the band's text
const VOICES = 0x6C;

/**
 * The countdown's digits, the OK and the band's box on one sheet: { image, digits, ok, box, voices, palette }.
 * digits[n] is the [x, y] of digit n (16 × 16), ok and box those of the 32 × 32 OK and box. They are drawn in
 * OBJ palette 6, where animation 715 keeps the HUD font's colours; `palette` is the colours the three loads
 * put there on the frame the screen is made, which the HUD shows for that frame (the timer digits' and the
 * box's palette, a little different from the font's).
 */
export function gameOverGraphics(rom, uiAt, cardAt) {
  const entry = i => ({
    tiles: rom.requirePtr(uiAt + i * ENTRY, `UI graphics ${i}`),
    palette: readColors(rom, rom.requirePtr(uiAt + i * ENTRY + 4, `UI palette ${i}`), 16),
  });
  const font = entry(FONT).palette, digits = entry(TIMER_DIGITS), ok = entry(OK), box = entry(BLACK_BOX);
  const image = new ImageData(10 * 16 + 32 + 32, 32);
  // `wide` × `high` tiles in a row (1D OBJ mapping), colour 0 transparent
  const paint = (x, tiles, wide, high) => {
    for (let t = 0; t < wide * high; t++) {
      const tx = x + (t % wide) * 8, ty = Math.floor(t / wide) * 8;
      for (let p = 0; p < 64; p++) {
        const byte = rom.u8(tiles + t * TILE + (p >> 1)), c = p & 1 ? byte >> 4 : byte & 15;
        if (!c) continue;
        const o = ((ty + (p >> 3)) * image.width + tx + (p & 7)) * 4;
        [image.data[o], image.data[o + 1], image.data[o + 2]] = font[c];
        image.data[o + 3] = 255;
      }
    }
  };
  for (let n = 0; n < 10; n++) paint(n * 16, digits.tiles + n * 4 * TILE, 2, 2);
  paint(160, ok.tiles, 4, 4);
  paint(192, box.tiles, 4, 4);
  return {
    image, digits: Array.from({ length: 10 }, (_, n) => [n * 16, 0]), ok: [160, 0], box: [192, 0],
    voices: Array.from({ length: 10 }, (_, i) => rom.u16(cardAt + VOICES + i * 2)),
    palette: box.palette,
  };
}
