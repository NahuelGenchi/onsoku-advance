// Turns a Sonic Advance ROM into everything the engine draws: Sonic's animations, the dust effects,
// a Neo Green Hill platform strip and the zone's background. Runs entirely in the browser.

import { Rom } from './rom.js';
import { identify } from './identify.js';
import { locateTables } from './locate.js';
import { spriteTables, animationFrames, animationPalette, renderFrame } from './sprites.js';
import { tilemapHeader, drawStageRegion, renderPlainMap } from './tilemaps.js';
import { readColors } from './colors.js';

// [animation id, variant] in the sprite tables, as the ROM's character state table maps them for Sonic
export const SONIC_ANIMATIONS = {
  idle: [0, 0], bored: [1, 0], lookUp: [2, 0], lookUpEnd: [2, 1], crouch: [3, 0], crouchEnd: [3, 1],
  walk: [4, 0], run: [5, 0], turn: [6, 0], brakeTurn: [7, 0], spin: [8, 0], brake: [9, 0],
  spinDash: [18, 0], spinDashRev: [18, 1], airDash: [49, 0], instaShield: [50, 0],
  spinAttack: [51, 0], somersault: [52, 0], slide: [53, 0], slideEnd: [53, 1], backflip: [55, 0],
};
export const EFFECT_ANIMATIONS = {
  brakeDust: [748, 0], dashDust: [746, 0], dashDustBig: [747, 0], instaShieldFlash: [50, 1],
};

// Neo Green Hill Zone act 1 in the tilemap table: front decorations, terrain, background
const NGH = { decorations: 0, terrain: 1, background: 2 };
// the flat grass-and-checker end zone (metatile columns 127–135, rows 9–13) wraps seamlessly
const PLATFORM = { column: 127, columns: 9, row: 9, rows: 5 };

/**
 * Identifies and decodes `buffer`. `onProgress(message)` reports each stage.
 * @returns {Promise<object>} { info, sprites: { atlas, frames, anims }, stage: { platform, groundY, background }, physics }
 */
export async function extractAssets(buffer, onProgress = () => {}) {
  const rom = new Rom(buffer);
  onProgress('Checking the ROM…');
  const id = await identify(rom);
  onProgress(id.known ? `Found ${id.known.name}.` : 'Unrecognized version, searching for the data…');
  const offsets = locateTables(rom, id.known);

  onProgress('Decoding Sonic…');
  const sprites = extractSprites(rom, spriteTables(rom, offsets.spriteTables));
  onProgress('Decoding Neo Green Hill…');
  const stage = extractStage(rom, offsets.tilemaps);
  // nine release speeds, then the nine of the alternate table right after them: a charge past 8.0
  // indexes into those in the original, so both are read
  const spinDashSpeeds = Array.from({ length: 18 }, (_, i) => rom.s16(offsets.spinDashSpeeds + i * 2) / 256);

  return {
    info: { ...id.header, region: id.region, sha1: id.sha1, version: id.known?.name ?? null, offsets },
    sprites, stage, physics: { spinDashSpeeds },
  };
}

function extractSprites(rom, tables) {
  const basePalette = animationPalette(rom, tables, SONIC_ANIMATIONS.idle[0]);
  const images = [], byKey = new Map(), anims = {};
  for (const [name, [anim, variant]] of Object.entries({ ...SONIC_ANIMATIONS, ...EFFECT_ANIMATIONS })) {
    const script = animationFrames(rom, tables, anim, variant, basePalette);
    const frames = script.frames.map(f => {
      if (f.frame < 0) return [-1, f.delay];
      // identical frames (same layout, tiles and palette) share one atlas entry
      const key = `${anim}:${f.frame}:${f.tilesAt}:${f.palette.slice(64, 80).join()}`;
      if (!byKey.has(key)) {
        const { img, layout } = renderFrame(rom, tables, anim, f.frame, f.tilesAt, f.palette, f.eightBpp);
        byKey.set(key, images.length);
        images.push({ img, anchorX: layout.anchorX, anchorY: layout.anchorY });
      }
      return [byKey.get(key), f.delay];
    });
    anims[name] = { frames, loop: script.loop };
  }
  const { canvas, rects } = packAtlas(images);
  return { atlas: canvas, frames: rects, anims };
}

// shelf packing with a 1px gap; rects are [x, y, w, h, anchorX, anchorY]
function packAtlas(images, width = 512) {
  let x = 0, y = 0, shelf = 0;
  const rects = images.map(({ img, anchorX, anchorY }) => {
    if (x + img.width > width) { x = 0; y += shelf + 1; shelf = 0; }
    const rect = [x, y, img.width, img.height, anchorX, anchorY];
    x += img.width + 1; shelf = Math.max(shelf, img.height);
    return rect;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = y + shelf;
  const g = canvas.getContext('2d');
  images.forEach(({ img }, i) => g.putImageData(img, rects[i][0], rects[i][1]));
  return { canvas, rects };
}

function extractStage(rom, tilemapsAt) {
  const decorations = tilemapHeader(rom, tilemapsAt, NGH.decorations);
  const terrain = tilemapHeader(rom, tilemapsAt, NGH.terrain);
  const background = tilemapHeader(rom, tilemapsAt, NGH.background);
  if (terrain.xTiles !== 12 || terrain.metatileMap === null || decorations.palette === null) {
    throw new Error('Neo Green Hill Zone data is not where this version keeps it.');
  }
  const palette = readColors(rom, decorations.palette, 256);

  const w = PLATFORM.columns * terrain.xTiles * 8, h = PLATFORM.rows * terrain.yTiles * 8;
  const back = drawStageRegion(new ImageData(w, h), rom, decorations, palette, PLATFORM.column, PLATFORM.row, PLATFORM.columns, PLATFORM.rows);
  const front = drawStageRegion(new ImageData(w, h), rom, terrain, palette, PLATFORM.column, PLATFORM.row, PLATFORM.columns, PLATFORM.rows);
  const platform = document.createElement('canvas');
  platform.width = w; platform.height = h;
  const g = platform.getContext('2d');
  g.drawImage(toCanvas(back), 0, 0); g.drawImage(toCanvas(front), 0, 0);

  return { platform, groundY: groundLine(front), background: toCanvas(renderPlainMap(rom, background, palette)) };
}

// the walkable surface: the first row where at least 90% of the strip is solid (grass tips stick up above it)
function groundLine(img) {
  for (let y = 0; y < img.height; y++) {
    let solid = 0;
    for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]) solid++;
    if (solid >= img.width * 0.9) return y;
  }
  throw new Error('Could not find the ground in the Neo Green Hill platform.');
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
