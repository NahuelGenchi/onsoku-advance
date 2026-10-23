// Reads an act's terrain collision. Format as documented by the SAT-R decompilation (include/core.h,
// src/game/shared/stage/terrain_collision.c) and checked against the USA ROM (see docs/ROM.md).
//
// Collision is stored per graphics tile: the header points at the same metatiles and layer maps the
// stage is drawn with, and each tile index has its own heights, angle and flags.

/**
 * Collision header of `level` in the collision table at `tableAt`.
 * @returns {{ width, height, levelX, levelY, metatiles: Uint16Array, layers: Uint8Array[], heights: Uint8Array, angles: Uint8Array, flags: Uint16Array }}
 */
export function readCollision(rom, tableAt, level) {
  const at = rom.requirePtr(tableAt + level * 4, `collision header ${level}`);
  const heightsAt = rom.requirePtr(at, 'collision heights'), anglesAt = rom.requirePtr(at + 4, 'tile angles');
  const metatilesAt = rom.requirePtr(at + 8, 'collision metatiles');
  const layersAt = [rom.requirePtr(at + 12, 'front collision layer'), rom.requirePtr(at + 16, 'back collision layer')];
  const flagsAt = rom.requirePtr(at + 20, 'collision flags');
  const levelX = rom.u16(at + 24), levelY = rom.u16(at + 26);
  const width = rom.u16(at + 28), height = rom.u16(at + 30);

  // the height table comes right before the angle table: 8 bytes per tile
  const tileCount = (anglesAt - heightsAt) >> 3;
  const layers = layersAt.map(p => rom.bytes.slice(p, p + levelX * levelY));
  let metatileCount = 0;
  for (const layer of layers) for (const id of layer) metatileCount = Math.max(metatileCount, id + 1);

  return {
    width, height, levelX, levelY, layers,
    metatiles: copy16(rom, metatilesAt, metatileCount * 144),
    heights: rom.bytes.slice(heightsAt, heightsAt + tileCount * 8),
    angles: rom.bytes.slice(anglesAt, anglesAt + tileCount),
    // 2 bits per tile, eight tiles per halfword
    flags: copy16(rom, flagsAt, Math.ceil(tileCount / 8)),
  };
}

/** The act's start position: an s16 pair per level. */
export function readSpawn(rom, spawnsAt, level) {
  return { x: rom.s16(spawnsAt + level * 4), y: rom.s16(spawnsAt + level * 4 + 2) };
}

function copy16(rom, at, count) {
  const out = new Uint16Array(count);
  for (let i = 0; i < count; i++) out[i] = rom.u16(at + i * 2);
  return out;
}
