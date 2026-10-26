// Where the special stages' data is (SAT-R decompilation, src/game/sa1/special_stage/main.c and
// src/game/sa1/ui/special_stage_intro.c), for versions without known offsets. The special stages read it from the
// ROM as they run (special/).

// the first of main.c's constants (gUnknown_08486FF4): the background behind the tunnel, tilemap 54, its tiles at
// 0x06008000 and its map at 0x0600E000, 32 × 32 tiles, then the first of the tunnel's four quarters, tilemap 55
const TUNNEL_BG = { dest: 0x06008000, layoutVram: 0x0600E000, tilemapId: 54 };

/** main.c's constants, found by the background behind the tunnel and the first quarter after it. */
export function findSpecialStage(rom) {
  for (let at = 0; at + 0x80 <= rom.size; at += 4) {
    if (rom.u32(at + 4) !== TUNNEL_BG.dest || rom.u32(at + 12) !== TUNNEL_BG.layoutVram || rom.u16(at + 0x1C) !== TUNNEL_BG.tilemapId) continue;
    if (rom.u16(at + 0x40 + 0x1C) === TUNNEL_BG.tilemapId + 1) return at;
  }
  return null;
}

// where the first stage's layout is, after main.c's constants
const FIRST_LAYOUT = 0x364;

/**
 * The table of the seven stages' layouts (gUnknown_087BF8DC), found by its first pointer, to the layout right
 * after main.c's constants, and six more after it.
 */
export function findSpecialLayouts(rom) {
  const constants = findSpecialStage(rom);
  if (constants === null) return null;
  const first = 0x08000000 + constants + FIRST_LAYOUT;
  for (let at = 0; at + 28 <= rom.size; at += 4) {
    if (rom.u32(at) !== first) continue;
    let ok = true;
    for (let i = 1; i < 7 && ok; i++) ok = rom.isPointer(rom.u32(at + i * 4)) && rom.u32(at + i * 4) > rom.u32(at + i * 4 - 4);
    if (ok) return at;
  }
  return null;
}

// the first animation of each character's (gPlayerCharacterIdleAnims), Sonic's, Tails's, Knuckles's and Amy's
const CHARACTER_ANIMS = [0, 99, 199, 298];

/** The characters' first animations, which their special stage animations are counted from. */
export function findCharacterAnims(rom) {
  for (let at = 0; at + 8 <= rom.size; at += 2) {
    if (CHARACTER_ANIMS.every((v, i) => rom.u16(at + i * 2) === v)) return at;
  }
  return null;
}

// each character's animation and variant as they fall into the stage, then on the board (gUnknown_0868B584)
const INTRO_ANIMS = [25, 0, 124, 0, 224, 0, 323, 0, 26, 0, 125, 0, 225, 0, 324, 0];

/** The fall's and the emerald scene's tables of animations, starting with the fall's. */
export function findSpecialIntro(rom) {
  for (let at = 0; at + INTRO_ANIMS.length * 2 <= rom.size; at += 4) {
    if (INTRO_ANIMS.every((v, i) => rom.u16(at + i * 2) === v)) return at;
  }
  return null;
}

/**
 * The clouds picture of the fall and the emerald's scene: its colours, its tiles 0x200 bytes after them and its
 * map 0x2B80 after them, side by side (tiles, colours, map) in the constants of the code that loads it.
 */
export function findSpecialClouds(rom) {
  for (let at = 0; at + 12 <= rom.size; at += 4) {
    const palette = rom.u32(at + 4);
    if (rom.isPointer(palette) && rom.u32(at) === palette + 0x200 && rom.u32(at + 8) === palette + 0x2B80) return rom.ptr(at + 4);
  }
  return null;
}
