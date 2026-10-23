// Finds the extractor's tables by their shape, for ROM versions without known offsets.

import { RomError } from './identify.js';

const MIN_CMD = -12;   // animation commands are -1 … -12

/**
 * The sprite tables are six consecutive ROM pointers (animations, frame sizes, OAM data, palettes,
 * 4bpp tiles, 8bpp tiles). The first animation must start with a command and its first frame must have
 * a plausible size.
 */
export function findSpriteTables(rom) {
  for (let at = 0; at + 24 <= rom.size; at += 4) {
    let pointers = true;
    for (let i = 0; i < 6 && pointers; i++) pointers = rom.isPointer(rom.u32(at + i * 4));
    if (!pointers) continue;
    const anims = rom.ptr(at), dims = rom.ptr(at + 4), oam = rom.ptr(at + 8);
    const variants = rom.ptr(anims);
    if (variants === null) continue;
    const script = rom.ptr(variants);
    if (script === null) continue;
    const first = rom.s32(script);
    if (first >= 0 || first < MIN_CMD) continue;
    const frames = rom.ptr(dims);
    if (frames === null || rom.ptr(oam) === null) continue;
    const w = rom.u16(frames + 4), h = rom.u16(frames + 6);
    if (w > 0 && w <= 256 && h > 0 && h <= 256) return at;
  }
  return null;
}

/**
 * The tilemap table lists each act's layers; act 2 of zones 1–5 reuses act 1's background,
 * so entries [2]/[5], [8]/[11], [14]/[17], [20]/[23] and [26]/[29] are equal.
 * Entry 0 (Neo Green Hill act 1, front layer) must be a 12 × 12-tile metatile map.
 */
export function findTilemaps(rom) {
  for (let at = 0; at + 4 * 60 <= rom.size; at += 4) {
    const p = i => rom.u32(at + i * 4);
    if (!rom.isPointer(p(0))) continue;
    if (p(2) !== p(5) || p(8) !== p(11) || p(14) !== p(17) || p(20) !== p(23) || p(26) !== p(29) || p(1) === p(2)) continue;
    let pointers = true;
    for (let i = 0; i < 54 && pointers; i++) pointers = rom.isPointer(p(i));
    if (!pointers) continue;
    const header = rom.ptr(at);
    if (rom.u16(header) === 12 && rom.u16(header + 2) === 12) return at;
  }
  return null;
}

/** Spin dash release speeds: nine Q8.8 values from 6.0 to 9.0 in steps of 0.375. */
export function findSpinDashSpeeds(rom) {
  for (let at = 0; at + 18 <= rom.size; at += 2) {
    let match = true;
    for (let i = 0; i < 9 && match; i++) match = rom.u16(at + i * 2) === 0x600 + i * 0x60;
    if (match) return at;
  }
  return null;
}

/** Offsets for this ROM: the known ones when the checksum matches, otherwise a search. */
export function locateTables(rom, known) {
  if (known) return { ...known.offsets, searched: false };
  const offsets = {
    spriteTables: findSpriteTables(rom),
    tilemaps: findTilemaps(rom),
    spinDashSpeeds: findSpinDashSpeeds(rom),
  };
  const missing = Object.entries(offsets).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) {
    throw new RomError(`This Sonic Advance ROM version is not supported yet (could not find: ${missing.join(', ')}).`);
  }
  return { ...offsets, searched: true };
}
