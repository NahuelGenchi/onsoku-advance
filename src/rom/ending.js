// The true ending's art (SAT-R decompilation, src/game/sa1/ui/extra_stage_results.c: CreateExtraStageResults
// and sub_80677C4, checked in the USA ROM): the night scene's three backgrounds, the sky's, and the sprites the
// cutscene shows. The four backgrounds are 256-colour text backgrounds, each a 256-colour palette, its tiles and
// its map one after the other, and the four follow each other in the ROM: the sky, then the night scene's front
// (BG2), back (BG0) and middle (BG1). The night scene's three palettes are the same.

import { readColors, bgr555ToRgb } from './colors.js';
import { animationFrames, renderFrame } from './sprites.js';

// [animation, variant] by the name the ending draws them by
export const ENDING_SPRITES = {
  // the twinkles over the night scene (731), the sparkle that crosses the sky (732), Tails in the Tornado's
  // cockpit (805 variant 1) and turning his head (191), the Tornado from the side and then from the front
  // (736, 735), the four clouds (790–793) and "A few days later" (783, or 786 in Japanese)
  twinkle: [731, 0], skySparkle: [732, 0], tailsFace: [805, 1], tailsTurn: [191, 0], tailsTurned: [191, 1],
  tornadoSide: [736, 0], tornadoFront: [735, 0],
  // (the four clouds share a sprite palette row, and the last of them loads 790's colours over 792's)
  cloudXS: [790, 0], cloudS: [791, 0], cloudM: [792, 0, 790], cloudL: [793, 0],
  fewDaysLater: [783, 0], fewDaysLaterJapanese: [786, 0],
  // the last pictures (733, 734) and the three congratulation lines over the last (785)
  artA0: [733, 0], artA1: [733, 1], artB0: [734, 0], artB1: [734, 1],
  congrats0: [785, 0], congrats1: [785, 1], congrats2: [785, 2],
};

// the sepia picture (734 variant 0) whose colours Task_8067C24 turns into the next picture's, in eight steps
const SEPIA = [734, 0];
const BLEND_FROM = 143, BLEND_TO = 144;   // the two sprite palettes (gUiPaletteSoundTestBox3 and 4)

// the backgrounds' sizes, from the sky's palette on
const PALETTE = 0x200;
const BLOCKS = { sky: [0x2980, 0x1000], front: [0x57C0, 0xA00], back: [0x1EC0, 0xA00], middle: [0x3540, 0xA00] };
// where sub_80528AC puts each one's tiles and map in VRAM: the background's character and screen base, from
// the BGxCNT values CreateExtraStageResults and sub_8067928 set
const NIGHT = { back: [0x8583, 'back'], middle: [0x9E86, 'middle'], front: [0x9B89, 'front'] };
const SKY_CNT = 0x9B83;
const PICTURES_CLEAR = 0xA00;   // the bytes of the sky's map gBgSprites_Unknown2's request fills with 0

/**
 * Finds the sky's palette for ROM versions without a known offset: the code that loads it holds the addresses of
 * its tiles, its palette and its map one after the other.
 */
export function findTrueEnding(rom) {
  for (let at = 0; at + 12 <= rom.size; at += 4) {
    const tiles = rom.ptr(at), palette = rom.ptr(at + 4), map = rom.ptr(at + 8);
    if (palette !== null && tiles === palette + PALETTE && map === tiles + BLOCKS.sky[0]) return palette;
  }
  return null;
}

/**
 * The true ending's art, from the sky's palette at `at`: `night`, `sky` and `pictures` (the background left behind
 * the last pictures), each { palette, layers }, a layer
 * being { cnt, image } (256 px wide, its whole map, transparent where its colour 0 is), and `blend`, the sepia
 * picture's frame in each of Task_8067C24's nine steps of colour, { img, anchorX, anchorY }.
 */
export function trueEndingArt(rom, tables, at) {
  const blocks = {};
  let p = at;
  for (const [name, [tiles, map]] of Object.entries(BLOCKS)) {
    blocks[name] = { palette: p, tiles: p + PALETTE, tilesSize: tiles, map: p + PALETTE + tiles, mapSize: map };
    p += PALETTE + tiles + map;
  }
  // VRAM as the loads leave it: the night scene's three backgrounds, then the sky over the back one's
  const vram = new Uint8Array(0x10000);
  const load = (cnt, b) => {
    vram.set(rom.bytes.subarray(b.tiles, b.tiles + b.tilesSize), ((cnt >> 2) & 3) * 0x4000);
    vram.set(rom.bytes.subarray(b.map, b.map + b.mapSize), ((cnt >> 8) & 31) * 0x800);
  };
  for (const [cnt, name] of Object.values(NIGHT)) load(cnt, blocks[name]);
  const nightPalette = readColors(rom, blocks.front.palette, 256);
  const night = { palette: nightPalette, layers: Object.fromEntries(Object.entries(NIGHT).map(([name, [cnt]]) => [name, { cnt, image: textBackground(vram, cnt, nightPalette) }])) };
  load(SKY_CNT, blocks.sky);
  const skyPalette = readColors(rom, blocks.sky.palette, 256);
  const sky = { palette: skyPalette, layers: { back: { cnt: SKY_CNT, image: textBackground(vram, SKY_CNT, skyPalette) } } };
  // as the pictures come on, Task_80679E4 has the sky's map cleared from its top, 20 × 64 map entries
  const screen = ((SKY_CNT >> 8) & 31) * 0x800;
  vram.fill(0, screen, screen + PICTURES_CLEAR);
  const pictures = { palette: skyPalette, layers: { back: { cnt: SKY_CNT, image: textBackground(vram, SKY_CNT, skyPalette) } } };
  return { night, sky, pictures, blend: blendFrames(rom, tables) };
}

/**
 * The sky on its own, from the art at `at`, as BGxCNT `cnt` shows it: what CreateCongratulationsAnimation loads
 * on BG0 (`gfx`, uiGfxID UIGFX_OPTIONS: its tiles at the character base's start). { palette, layer: { cnt, image } }.
 */
export function skyLayer(rom, at, cnt) {
  const [tilesSize, mapSize] = BLOCKS.sky, tiles = at + PALETTE, map = tiles + tilesSize;
  const vram = new Uint8Array(0x10000);
  vram.set(rom.bytes.subarray(tiles, tiles + tilesSize), ((cnt >> 2) & 3) * 0x4000);
  vram.set(rom.bytes.subarray(map, map + mapSize), ((cnt >> 8) & 31) * 0x800);
  const palette = readColors(rom, at, 256);
  return { palette, layer: { cnt, image: textBackground(vram, cnt, palette) } };
}

// a 256-colour text background 256 px wide, as many map rows as its size has, read from VRAM
function textBackground(vram, cnt, palette) {
  const chars = ((cnt >> 2) & 3) * 0x4000, screen = ((cnt >> 8) & 31) * 0x800, rows = (cnt >> 14) & 2 ? 64 : 32;
  const img = new ImageData(256, rows * 8), d = img.data;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < 32; tx++) {
      const e = vram[(screen + (ty * 32 + tx) * 2) & 0xFFFF] | (vram[(screen + (ty * 32 + tx) * 2 + 1) & 0xFFFF] << 8);
      const tile = chars + (e & 0x3FF) * 64, hf = e & 0x400, vf = e & 0x800;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const c = vram[(tile + (vf ? 7 - y : y) * 8 + (hf ? 7 - x : x)) & 0xFFFF];
          if (!c) continue;
          const k = ((ty * 8 + y) * 256 + tx * 8 + x) * 4, rgb = palette[c];
          d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255;
        }
      }
    }
  }
  return img;
}

// Task_8067C24's colours for step t (0–8) between the two palettes: each channel of colours 2–15 moves t
// eighths of the way, rounded toward the first
function blendFrames(rom, tables) {
  const from = Array.from({ length: 16 }, (_, i) => rom.u16(tables.palettes + BLEND_FROM * 32 + i * 2));
  const to = Array.from({ length: 16 }, (_, i) => rom.u16(tables.palettes + BLEND_TO * 32 + i * 2));
  const script = animationFrames(rom, tables, ...SEPIA, new Array(256).fill([255, 0, 255])), f = script.frames[0];
  const insert = 224;   // its palette load puts them in sprite palette row 14
  return Array.from({ length: 9 }, (_, t) => {
    const palette = f.palette.slice();
    for (let i = 2; i < 16; i++) {
      let c = 0;
      for (const shift of [0, 5, 10]) {
        const a = (from[i] >> shift) & 31, b = (to[i] >> shift) & 31;
        c |= ((a > b ? a - ((t * (a - b)) >> 3) : a + ((t * (b - a)) >> 3)) & 31) << shift;
      }
      palette[insert + i] = bgr555ToRgb(c);
    }
    const { img, layout } = renderFrame(rom, tables, SEPIA[0], f.frame, f.tilesAt, palette, f.eightBpp);
    return { img, anchorX: layout.anchorX, anchorY: layout.anchorY };
  });
}
