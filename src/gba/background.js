// A background from the ROM's tilemap table (SAT-R decompilation, src/background.c: DrawBackground): its tiles go
// in the graphics queue, its colours into the background palette, and its map into the queue the V-blank copies
// to the layer's map (engine.js).

import { tilemapHeader } from '../rom/tilemaps.js';

const DISABLE_TILESET_UPDATE = 0x8, DISABLE_PALETTE_UPDATE = 0x10;

/** A background (struct Background) showing tilemap `tilemapId`; `dest` and `layoutVram` are VRAM offsets. */
export function createBackground(fields) {
  return {
    graphics: { src: 0, dest: 0, size: 0, anim: 0 }, layoutVram: 0, layout: 0, xTiles: 0, yTiles: 0,
    unk18: 0, unk1A: 0, tilemapId: 0, unk1E: 0, unk20: 0, unk22: 0, unk24: 0, targetTilesX: 0, targetTilesY: 0,
    paletteOffset: 0, flags: 0, scrollX: 0, scrollY: 0, prevScrollX: 0, prevScrollY: 0, ...fields,
  };
}

/** DrawBackground, with the tilemap table at `tilemapsAt` in the ROM. */
export function drawBackground(e, tilemapsAt, bg) {
  const rom = e.rom, h = tilemapHeader(rom, tilemapsAt, bg.tilemapId);
  bg.xTiles = h.xTiles; bg.yTiles = h.yTiles;
  bg.graphics.src = h.tiles;
  bg.graphics.size = h.tilesSize & 0xFFFF;
  if (!(bg.flags & DISABLE_TILESET_UPDATE)) {
    e.queueGraphics(bg.graphics);
    bg.flags ^= DISABLE_TILESET_UPDATE;
  }
  bg.paletteOffset = h.paletteOffset & 0xFF;
  if (!(bg.flags & DISABLE_PALETTE_UPDATE)) {
    for (let i = 0; i < h.paletteLength; i++) e.bgPalette[(bg.paletteOffset + i) & 0xFF] = rom.u16(h.palette + i * 2);
    e.flags |= 0x1;
    bg.flags ^= DISABLE_PALETTE_UPDATE;
  }
  bg.layout = h.map;
  e.queueBackground(bg);
}
