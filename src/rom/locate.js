// Finds the extractor's tables by their shape, for ROM versions without known offsets.

import { RomError } from './identify.js';
import { ROM_BASE } from './rom.js';
import { rlDecompress } from './entities.js';
import { findMusicPlayers } from './sound.js';
import { findUiGraphics } from './hud.js';
import { findTitleCard } from './titlecard.js';
import { findIntroGraphics, findIntroTables } from './intro.js';
import { findSpecialStage, findSpecialLayouts, findCharacterAnims, findSpecialIntro, findSpecialClouds } from './special.js';

const MIN_CMD = -12;   // animation commands are -1 … -12
const LEVEL_COUNT = 18;   // 14 single-player stages, then four multiplayer stages
const MP_LEVEL_COUNT = 4;

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

/**
 * The Chao's places in the multiplayer stages (sChaoSpawnPositions): eight (x, y) pairs of s16 for each of the
 * four stages, each inside a stage of at most 2048 × 2048 px. A table of such pairs ends where they stop;
 * the table of byte pairs before it looks like pairs too, so it is found from its end. Null when nothing
 * looks like it.
 */
export function findChaoSpawns(rom) {
  const n = MP_LEVEL_COUNT * 8, fits = v => v >= 64 && v < 2048;
  let run = 0;
  for (let at = 0; at + 4 <= rom.size; at += 4) {
    if (fits(rom.s16(at)) && fits(rom.s16(at + 2))) { run++; continue; }
    if (run >= n) return at - n * 4;
    run = 0;
  }
  return null;
}

// the Options menu's background (gUnknown_086CC774, 086CC794 and 086CC834): its 16 colours, its 5 tiles and its
// 32 × 20 map, one after the other; the map's rows start with tiles 0, 1 and 2 over and over, and it uses no other
// tiles than those five, unflipped or flipped, in palette row 0
const OPTIONS_TILES = 0x20, OPTIONS_MAP = 0xC0, OPTIONS_MAP_ENTRIES = 32 * 20, OPTIONS_TILE_COUNT = 5;

/** The Options menu's background: where its colours start, its tiles and map after them. */
export function findOptionsBackground(rom) {
  for (let at = 0; at + OPTIONS_MAP + OPTIONS_MAP_ENTRIES * 2 <= rom.size; at += 4) {
    const map = at + OPTIONS_MAP;
    if (rom.u32(map) !== 0x10000 || rom.u32(map + 4) !== 0x00000002 || rom.u32(map + 8) !== 0x20001) continue;
    let ok = true;
    for (let i = 0; i < OPTIONS_MAP_ENTRIES && ok; i++) {
      const v = rom.u16(map + i * 2);
      ok = (v & 0xF3FF) < OPTIONS_TILE_COUNT;
    }
    if (ok) return at;
  }
  return null;
}

// the sound test's songs (sSoundTestSongIds): 42 song numbers, the first 17 of them 2, 3, 4, 10 and 12 to 24; its
// background's map (gUnknown_0868403C) is 0x703C bytes before them: 32 × 32 entries of its 64 tiles, which load a
// tile in, so tiles 1 to 64, unflipped, in palette row 0
const SOUND_TEST_FIRST_SONGS = [2, 3, 4, 10, ...Array.from({ length: 13 }, (_, i) => 12 + i)];
const SOUND_TEST_MAP_BEFORE = 0x703C, SOUND_TEST_MAP_ENTRIES = 32 * 32, SOUND_TEST_TILE_COUNT = 64;

/** The sound test's song list and its background's map, or nulls. */
export function findSoundTest(rom) {
  for (let at = SOUND_TEST_MAP_BEFORE; at + SOUND_TEST_FIRST_SONGS.length * 2 <= rom.size; at += 4) {
    if (!SOUND_TEST_FIRST_SONGS.every((n, i) => rom.u16(at + i * 2) === n)) continue;
    const map = at - SOUND_TEST_MAP_BEFORE;
    for (let i = 0; i < SOUND_TEST_MAP_ENTRIES; i++) {
      const v = rom.u16(map + i * 2);
      if (v === 0 || v > SOUND_TEST_TILE_COUNT) return { songs: at, map: null };
    }
    return { songs: at, map };
  }
  return { songs: null, map: null };
}

/** Offsets for this ROM: the known ones when the checksum matches, otherwise a search. */
export function locateTables(rom, known) {
  if (known) return { ...known.offsets, searched: false };
  const tilemaps = findTilemaps(rom), collision = findCollision(rom, tilemaps), interactables = findInteractables(rom);
  const soundTest = findSoundTest(rom);
  const offsets = {
    spriteTables: findSpriteTables(rom),
    tilemaps, collision,
    spawns: collision === null ? null : collision + LEVEL_COUNT * 4,
    // after them the multiplayer stages' four spawn positions each, then the acts' loop points and distances
    loopPoints: collision === null ? null : collision + LEVEL_COUNT * 4 * 2 + MP_LEVEL_COUNT * 4 * 4,
    loopShifts: collision === null ? null : collision + LEVEL_COUNT * 4 * 3 + MP_LEVEL_COUNT * 4 * 4,
    // the ring lists are the table just before the interactables
    rings: interactables === null ? null : interactables - LEVEL_COUNT * 4,
    interactables,
    // then the item boxes' and the enemies' lists
    itemBoxes: interactables === null ? null : interactables + LEVEL_COUNT * 4,
    enemies: interactables === null ? null : interactables + 2 * LEVEL_COUNT * 4,
    spinDashSpeeds: findSpinDashSpeeds(rom),
    musicPlayers: findMusicPlayers(rom),
    uiGraphics: findUiGraphics(rom),
    titleCard: findTitleCard(rom),
    introGraphics: findIntroGraphics(rom),
    introTables: findIntroTables(rom),
    specialStage: findSpecialStage(rom),
    specialLayouts: findSpecialLayouts(rom),
    characterAnims: findCharacterAnims(rom),
    specialIntro: findSpecialIntro(rom),
    specialClouds: findSpecialClouds(rom),
    optionsBackground: findOptionsBackground(rom),
    soundTestSongs: soundTest.songs,
    soundTestBackground: soundTest.map,
  };
  const missing = Object.entries(offsets).filter(([, v]) => v === null).map(([k]) => k);
  // only the multiplayer stages need it
  offsets.chaoSpawns = findChaoSpawns(rom);
  if (missing.length) {
    throw new RomError(`this Sonic Advance rom version is not supported yet (could not find: ${missing.join(', ')}).`);
  }
  return { ...offsets, searched: true };
}
