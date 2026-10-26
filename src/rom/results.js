// The act's results screen's graphics (SAT-R decompilation, src/game/sa1/ui/stage_results.c: sub_8056FE4 and
// CreateStageResults), from the UI graphics table (hud.js) and the title card's tables (titlecard.js), which
// its texts follow. Like the title card's, each piece is a row of sprites of one size, a glyph is the run of
// tiles one sprite shows, and each text says which glyph each sprite shows, as the glyph number + 32.

import { readColors } from './colors.js';
import { paint } from './titlecard.js';

const ENTRY = 28, TILE = 32;
const FONT = 0, RESULT_SONIC = 11, BAR = 16, RESULT_TEXT = 34;
// the scrolling line: the character's name (UI 11 on), then "GOT THROUGH ACT 1" (UI 34), whose tiles for
// the other acts follow
const NAME_TILES = 48, TEXT_TILES = 80, NAME_COLORS = 6;
const X_ZONE = 12, THE_MOON = 13;
const textTiles = level => (level === THE_MOON ? 0xF0 : level === X_ZONE ? 0xA0 : level & 1 ? 0x50 : 0);
// the font's letters it uses, in the order sub_8056FE4 puts them in VRAM: [first tile, tiles]; R S T U,
// M N O, B, E, G, I and the blank
const LETTERS = [[100, 8], [90, 6], [68, 2], [74, 2], [78, 2], [82, 2], [146, 2]];
// the HUD's white digits, which the bonuses' figures use
const DIGITS = 32;
// the texts, after the title card's tables (gUnknown_08688404 on): the two labels, the band's and the line's
const TEXT = { ring: [0x8C, 11], time: [0x97, 11], band: [0xA4, 12], line: [0xB0, 25] };

/**
 * The results' graphics for `level` and the character: { image, slots, text }. Each slot has the OAM shape
 * and size of its sprites, their width and height in pixels, and its glyphs' [x, y] on the sheet; text maps
 * each text to its glyph numbers.
 */
export function resultsGraphics(rom, uiAt, cardAt, level = 0, character = 0) {
  const entry = i => {
    const at = uiAt + i * ENTRY, w = k => rom.u32(at + 8 + k * 4);
    return { tiles: rom.requirePtr(at, `UI graphics ${i}`), palette: rom.requirePtr(at + 4, `UI palette ${i}`),
      perGlyph: w(0), size: w(1), shape: w(2), wide: w(3), high: w(4) };
  };
  const bytes = (at, n) => rom.bytes.subarray(at, at + n);

  const font = entry(FONT), bar = entry(BAR), name = entry(RESULT_SONIC + character), text = entry(RESULT_TEXT);
  // OBJ palette 6 ends with the font's colours, palette 12 has the line's with the name's first six over them
  const palette6 = readColors(rom, font.palette, 16);
  const palette12 = readColors(rom, text.palette, 16);
  readColors(rom, name.palette, NAME_COLORS).forEach((c, i) => { palette12[i] = c; });
  const line = new Uint8Array((NAME_TILES + TEXT_TILES) * TILE);
  line.set(bytes(name.tiles, NAME_TILES * TILE), 0);
  line.set(bytes(text.tiles + textTiles(level) * TILE, TEXT_TILES * TILE), NAME_TILES * TILE);
  const letters = new Uint8Array(24 * TILE);
  let to = 0;
  for (const [first, n] of LETTERS) { letters.set(bytes(font.tiles + first * TILE, n * TILE), to); to += n * TILE; }

  // [tiles, tile count, layout, palette]
  const pieces = {
    band: [bytes(bar.tiles, 16 * TILE), 16, bar, palette6],
    line: [line, NAME_TILES + TEXT_TILES, name, palette12],
    letters: [letters, 24, font, palette6],
    digits: [bytes(font.tiles + DIGITS * TILE, 20 * TILE), 20, font, palette6],
  };
  const rows = Object.values(pieces).map(([, count, l]) => ({ n: count / l.perGlyph, w: l.wide * 8, h: l.high * 8 }));
  const image = new ImageData(Math.max(...rows.map(r => r.n * r.w)), rows.reduce((s, r) => s + r.h, 0));
  const slots = {};
  let y = 0;
  for (const [key, [tiles, count, l, palette]] of Object.entries(pieces)) {
    const glyphs = [];
    for (let g = 0; g < count / l.perGlyph; g++) {
      paint(image, g * l.wide * 8, y, tiles, g * l.perGlyph, l.wide, l.high, palette);
      glyphs.push([g * l.wide * 8, y]);
    }
    slots[key] = { shape: l.shape, size: l.size, w: l.wide * 8, h: l.high * 8, glyphs };
    y += l.high * 8;
  }
  const texts = {};
  for (const [key, [at, n]] of Object.entries(TEXT)) texts[key] = [...bytes(cardAt + at, n)].map(c => c - 32);
  return { image, slots, text: texts };
}
