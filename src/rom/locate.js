// Finds the extractor's tables by their shape, for ROM versions without known offsets.

import { RomError } from './identify.js';
import { ROM_BASE } from './rom.js';
import { rlDecompress } from './entities.js';
import { findMusicPlayers } from './sound.js';
import { findUiGraphics } from './hud.js';

const MIN_CMD = -12;   // animation commands are -1 … -12
const LEVEL_COUNT = 18;   // 14 single-player stages, then four multiplayer stages

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

/**
 * The collision table has one header per level (18 in all). Act 1's header points at the same metatiles and
 * front and back layer maps as Neo Green Hill's first two tilemap entries, so it is found by those pointers.
 * The spawn positions follow the table.
 */
export function findCollision(rom, tilemapsAt) {
  if (tilemapsAt === null) return null;
  const front = rom.ptr(tilemapsAt), back = rom.ptr(tilemapsAt + 4);
  const key = [rom.u32(front + 24), rom.u32(front + 28), rom.u32(back + 28)];
  for (let at = 0; at + 12 <= rom.size; at += 4) {
    if (rom.u32(at) !== key[0] || rom.u32(at + 4) !== key[1] || rom.u32(at + 8) !== key[2]) continue;
    const header = ROM_BASE + at - 8;
    for (let t = 0; t + 4 <= rom.size; t += 4) if (rom.u32(t) === header) return t;
  }
  return null;
}

/**
 * The entity tables are four lists of 18 pointers to RL-compressed data, one after the other: rings,
 * interactables, item boxes, enemies. Act 1's data in each is a grid of 51 × 6 regions of 256 px.
 */
export function findInteractables(rom) {
  const act1Grid = at => {
    const p = rom.ptr(at);
    if (p === null || rom.u8(p) !== 0x30 || (rom.u32(p) >>> 8) > 0x10000) return false;
    try {
      const d = new DataView(rlDecompress(rom, p).buffer);
      return d.byteLength >= 12 && d.getUint32(4, true) === 51 && d.getUint32(8, true) === 6;
    } catch { return false; }
  };
  for (let at = 0; at + LEVEL_COUNT * 4 * 4 <= rom.size; at += 4) {
    if ([0, 1, 2, 3].every(k => act1Grid(at + k * LEVEL_COUNT * 4))) return at + LEVEL_COUNT * 4;
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
  const tilemaps = findTilemaps(rom), collision = findCollision(rom, tilemaps), interactables = findInteractables(rom);
  const offsets = {
    spriteTables: findSpriteTables(rom),
    tilemaps, collision,
    spawns: collision === null ? null : collision + LEVEL_COUNT * 4,
    // the ring lists are the table just before the interactables
    rings: interactables === null ? null : interactables - LEVEL_COUNT * 4,
    interactables,
    spinDashSpeeds: findSpinDashSpeeds(rom),
    musicPlayers: findMusicPlayers(rom),
    uiGraphics: findUiGraphics(rom),
  };
  const missing = Object.entries(offsets).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) {
    throw new RomError(`This Sonic Advance ROM version is not supported yet (could not find: ${missing.join(', ')}).`);
  }
  return { ...offsets, searched: true };
}
