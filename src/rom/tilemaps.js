// Decodes stage layers: 4bpp tilesets, 12 × 12-tile metatiles and plain background maps.
// Formats as documented by the SAT-R decompilation (include/tilemap.h, src/background.c).

const TILE_BYTES = 32;   // 8 × 8 pixels at 4 bits per pixel

/** Header of entry `index` in the tilemap table at `tableAt`. */
export function tilemapHeader(rom, tableAt, index) {
  const at = rom.requirePtr(tableAt + index * 4, `tilemap ${index}`);
  return {
    xTiles: rom.u16(at), yTiles: rom.u16(at + 2),
    animTileSize: rom.u16(at + 4), animFrameCount: rom.u8(at + 6), animDelay: rom.u8(at + 7),
    tiles: rom.requirePtr(at + 8, `tiles of tilemap ${index}`), tilesSize: rom.u32(at + 12),
    palette: rom.ptr(at + 16), paletteOffset: rom.u16(at + 20), paletteLength: rom.u16(at + 22),
    map: rom.requirePtr(at + 24, `map of tilemap ${index}`),
    // stage layers (MapHeader) continue with the metatile map and its size in metatiles
    metatileMap: rom.ptr(at + 28), mapWidth: rom.u16(at + 32), mapHeight: rom.u16(at + 34),
  };
}

function drawTile(img, rom, tileAt, palette, bank, x0, y0, hflip, vflip, opaqueZero) {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const b = rom.u8(tileAt + y * 4 + (x >> 1));
      const c = x & 1 ? b >> 4 : b & 15;
      if (!c && !opaqueZero) continue;
      const px = x0 + (hflip ? 7 - x : x), py = y0 + (vflip ? 7 - y : y);
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const rgb = palette[c ? bank * 16 + c : 0] ?? [255, 0, 255], k = (py * img.width + px) * 4;   // colour 0: the backdrop
      img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
    }
  }
}

// tile entry: bits 0–9 tile, 10 x-flip, 11 y-flip, 12–15 palette bank
function drawEntry(img, rom, header, palette, entry, x, y, opaqueZero, animFrame = 0) {
  drawTile(img, rom, tileAddress(header, entry & 0x3FF, animFrame), palette, entry >> 12, x, y, (entry >> 10) & 1, (entry >> 11) & 1, opaqueZero);
}

// Animated tiles are the first animTileSize bytes of the tileset. Frame 0 is the tileset itself; frame k
// is copied over them from the k-th block stored after the tileset (src/background.c, UpdateBgAnimationTiles).
function tileAddress(header, index, animFrame) {
  const offset = index * TILE_BYTES;
  if (animFrame === 0 || offset >= header.animTileSize) return header.tiles + offset;
  return header.tiles + header.tilesSize + (animFrame - 1) * header.animTileSize + offset;
}

/** The palette banks (rows of 16 colours) used by the first `entries` tile entries of a map. */
export function mapBanks(rom, header, entries) {
  const banks = new Set();
  for (let i = 0; i < entries; i++) banks.add(rom.u16(header.map + i * 2) >> 12);
  return banks;
}

/**
 * Renders metatiles 0 … count-1 of a stage layer into one atlas, 16 per row, plus a copy of every metatile
 * that uses animated tiles for each further animation frame, and of every one that uses a palette bank a palette
 * animation changes for each further state of the animations it uses. `palettes` holds the layer's colours
 * under each combination of the animations' states, the first animation's the most significant digit, and
 * `varying` the animations in that order: the rows each changes and its number of states.
 * @returns {{ canvas: HTMLCanvasElement, size: number, slots: Int16Array[][] }} slots[frame][palette][id] is the atlas slot
 */
export function renderMetatileAtlas(rom, header, palettes, count, varying = []) {
  const size = header.xTiles * 8, perMetatile = header.xTiles * header.yTiles;
  const animTiles = header.animTileSize / TILE_BYTES, frames = Math.max(1, header.animFrameCount);
  const entry = (id, i) => rom.u16(header.map + (id * perMetatile + i) * 2);
  const uses = test => Array.from({ length: count }, (_, id) => {
    for (let i = 0; i < perMetatile; i++) if (test(entry(id, i))) return true;
    return false;
  });
  const animated = uses(e => (e & 0x3FF) < animTiles);
  // the palette whose colours a metatile shows under palette p: the states of the animations it doesn't use
  // make no difference to it, so they count as the stage's own colours
  const affects = varying.map(({ rows }) => uses(e => rows.has(e >> 12)));
  const own = (id, p) => {
    let q = 0, scale = 1;
    for (let k = varying.length - 1; k >= 0; k--) {
      const digit = Math.floor(p / scale) % varying[k].radix;
      if (affects[k][id]) q += digit * scale;
      scale *= varying[k].radix;
    }
    return q;
  };

  const slots = [], jobs = [];
  for (let f = 0; f < frames; f++) {
    slots.push([]);
    for (let p = 0; p < palettes.length; p++) {
      const slot = slots[f][p] = new Int16Array(count);
      for (let id = 0; id < count; id++) {
        const q = own(id, p);
        if ((f === 0 || animated[id]) && p === q) { slot[id] = jobs.length; jobs.push([id, f, p]); }
        else slot[id] = slots[animated[id] ? f : 0][q][id];
      }
    }
  }
  const img = new ImageData(16 * size, Math.ceil(jobs.length / 16) * size);
  jobs.forEach(([id, f, p], slot) => {
    const x0 = (slot % 16) * size, y0 = Math.floor(slot / 16) * size;
    for (let i = 0; i < perMetatile; i++) {
      drawEntry(img, rom, header, palettes[p], entry(id, i), x0 + (i % header.xTiles) * 8, y0 + Math.floor(i / header.xTiles) * 8, false, f);
    }
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d').putImageData(img, 0, 0);
  return { canvas, size, slots };
}

/** Renders a plain (non-metatile) background map, its colour 0 showing the backdrop, colour 0 of the palette. */
export function renderPlainMap(rom, header, palette) {
  const img = new ImageData(header.xTiles * 8, header.yTiles * 8);
  for (let ty = 0; ty < header.yTiles; ty++) {
    for (let tx = 0; tx < header.xTiles; tx++) {
      drawEntry(img, rom, header, palette, rom.u16(header.map + (ty * header.xTiles + tx) * 2), tx * 8, ty * 8, true);
    }
  }
  return img;
}

/** The pixels of a plain background map where its colour 0 lets the backdrop show through, as [x, y]. */
export function mapHoles(rom, header) {
  const holes = [];
  for (let ty = 0; ty < header.yTiles; ty++) {
    for (let tx = 0; tx < header.xTiles; tx++) {
      const entry = rom.u16(header.map + (ty * header.xTiles + tx) * 2), at = tileAddress(header, entry & 0x3FF, 0);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const b = rom.u8(at + y * 4 + (x >> 1));
          if (!(x & 1 ? b >> 4 : b & 15)) holes.push([tx * 8 + ((entry >> 10) & 1 ? 7 - x : x), ty * 8 + ((entry >> 11) & 1 ? 7 - y : y)]);
        }
      }
    }
  }
  return holes;
}
