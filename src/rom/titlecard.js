// The title card's graphics (SAT-R decompilation, src/game/sa1/stage/stage_ui_z.c: LoadStageIntroGraphics), from
// the UI graphics table (hud.js) and the card's own tables. Each piece of the card is a row of sprites of one
// size; a glyph is the run of tiles one sprite shows (1D OBJ mapping), and each piece's text says which glyph
// each of its sprites shows, as the glyph number + 32.

import { readColors } from './colors.js';

const ENTRY = 28;
const FONT = 0, ZIGZAG = 6, CHAR_NAMES = 10, ACT = 15, BAR = 16, ZONE_JP = 17, ZONE_NAME = 19;
const TILE = 32;

// The card's tables (gUnknown_08688378 on): per level, the Japanese name's tile count (0x00) and first tile
// (0x0E); the character name's text (0x1C); per level, the zone name's graphics (0x20); then the other pieces'
// texts (0x34 to 0x6C), which are the same in every version and find the tables.
const LEVEL_JP_TILES = 0x00, LEVEL_JP_FIRST = 0x0E, LEVEL_ZONE_NAME = 0x20, TEXTS_AT = 0x34;
const TEXTS = [32, 32, 33, 0, 32, 33, 34, 35, 36, 37, 0, 0, 32, 32, 32, 32, 32, 32, 32, 32, 0, 0, 0, 0,
  32, 33, 34, 35, 0, 0, 0, 0, ...[0, 1, 2].flatMap(() => [32, 33, 34, 35, 36, 37, 38]), 0, 0, 0];
const TEXT = { name: [0x1C, 4], zigzag: [0x34, 3], act: [0x38, 6], bar: [0x40, 8], zoneJp: [0x4C, 4], zone: [0x54, 22] };
// the zone's name is copied onto the stack with five zeros after it (Task_8055B18)
const ZONE_PADDING = 5;

/** The card's tables, found by the pieces' texts. */
export function findTitleCard(rom) {
  for (let at = TEXTS_AT; at + TEXTS.length <= rom.size; at++) {
    if (TEXTS.every((b, i) => rom.u8(at + i) === b)) return at - TEXTS_AT;
  }
  return null;
}

// paints `count` 4bpp tiles of `tiles` from tile `first`, `wide` to a row, at (x, y); colour 0 is transparent
function paint(img, x, y, tiles, first, wide, high, palette) {
  for (let t = 0; t < wide * high; t++) {
    const tx = x + (t % wide) * 8, ty = y + Math.floor(t / wide) * 8, at = (first + t) * TILE;
    for (let p = 0; p < 64; p++) {
      const byte = tiles[at + (p >> 1)] ?? 0;
      const c = p & 1 ? byte >> 4 : byte & 15;
      if (!c) continue;
      const o = ((ty + (p >> 3)) * img.width + tx + (p & 7)) * 4;
      [img.data[o], img.data[o + 1], img.data[o + 2]] = palette[c];
      img.data[o + 3] = 255;
    }
  }
}

/**
 * The card for `level` (0 is Neo Green Hill act 1) and Sonic: { image, slots, text, act }. Each slot has the OAM
 * shape and size of its sprites, their width and height in pixels, and its glyphs' [x, y] on the sheet; text
 * maps each piece to its glyph numbers. `act` is false past Cosmic Angel act 2 (level 11), where Task_8055904 draws
 * no act number.
 */
export function titleCardGraphics(rom, uiAt, cardAt, level = 0, character = 0) {
  const entry = i => {
    const at = uiAt + i * ENTRY, w = k => rom.u32(at + 8 + k * 4);
    return { tiles: rom.requirePtr(at, `UI graphics ${i}`), palette: rom.requirePtr(at + 4, `UI palette ${i}`),
      perGlyph: w(0), size: w(1), shape: w(2), wide: w(3), high: w(4) };
  };
  const bytes = (at, n) => rom.bytes.subarray(at, at + n);

  // what LoadStageIntroGraphics puts in each piece's VRAM
  const zigzag = entry(ZIGZAG + character), names = entry(CHAR_NAMES), bar = entry(BAR), jp = entry(ZONE_JP), act = entry(ACT);
  const zone = entry(ZONE_NAME + rom.u8(cardAt + LEVEL_ZONE_NAME + level));
  // the Japanese name: its tiles right-aligned in 12, blank tiles (73) before them, then four more (8 to 11),
  // and tile 8 again over the first
  const jpTiles = new Uint8Array(16 * TILE), jpCount = rom.u8(cardAt + LEVEL_JP_TILES + level);
  const jpTile = (t, n, to) => jpTiles.set(bytes(jp.tiles + t * TILE, n * TILE), to * TILE);
  jpTile(73, 12 - jpCount, 0);
  jpTile(8, 4, 12);
  jpTile(rom.u8(cardAt + LEVEL_JP_FIRST + level), jpCount, 12 - jpCount);
  jpTile(8, 1, 0);
  // the act number: "ACT" and the act's digit after it
  const actTiles = new Uint8Array(12 * TILE);
  actTiles.set(bytes(act.tiles, 8 * TILE), 0);
  actTiles.set(bytes(act.tiles + 8 * TILE + (level & 1) * 4 * TILE, 4 * TILE), 8 * TILE);

  // [tiles, tile count, layout, palette]: the zigzag and the name use OBJ palette 15, where the name's colours
  // are loaded last; the rest use palette 6, which holds the HUD font's colours by the time the card shows
  const palette15 = readColors(rom, names.palette, 16), palette6 = readColors(rom, entry(FONT).palette, 16);
  const pieces = {
    zigzag: [bytes(zigzag.tiles, 32 * TILE), 32, zigzag, palette15],
    name: [bytes(names.tiles + character * 64 * TILE, 64 * TILE), 64, names, palette15],
    bar: [bytes(bar.tiles, 16 * TILE), 16, bar, palette6],
    zoneJp: [jpTiles, 16, { perGlyph: 4, size: 1, shape: 1, wide: 4, high: 1 }, palette6],
    act: [actTiles, 12, act, palette6],
    zone: [bytes(zone.tiles, 56 * TILE), 56, { perGlyph: 8, size: 2, shape: 1, wide: 4, high: 2 }, palette6],
  };

  // one row of glyphs per piece on the sheet
  const rows = Object.values(pieces).map(([, count, l]) => ({ n: count / l.perGlyph, w: l.wide * 8, h: l.high * 8 }));
  const image = new ImageData(Math.max(...rows.map(r => r.n * r.w)), rows.reduce((s, r) => s + r.h, 0));
  const slots = {};
  let y = 0;
  for (const [name, [tiles, count, l, palette]] of Object.entries(pieces)) {
    const glyphs = [];
    for (let g = 0; g < count / l.perGlyph; g++) {
      paint(image, g * l.wide * 8, y, tiles, g * l.perGlyph, l.wide, l.high, palette);
      glyphs.push([g * l.wide * 8, y]);
    }
    slots[name] = { shape: l.shape, size: l.size, w: l.wide * 8, h: l.high * 8, glyphs };
    y += l.high * 8;
  }

  const text = {};
  for (const [name, [at, n]] of Object.entries(TEXT)) {
    text[name] = [...bytes(cardAt + at, n)].map(c => c - 32);
  }
  text.zone.push(...Array(ZONE_PADDING).fill(-32));
  return { image, slots, text, act: level <= 11 };
}
