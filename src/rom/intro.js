// Where the intro's data is (SAT-R decompilation, src/game/sa1/ui/intro_animation.c), for versions without
// known offsets. The intro reads its pictures and tables from the ROM as it runs (front/intro.js).

/**
 * The intro's pictures start with the first scene's colours; the code that loads the green streaks behind it
 * has their tiles, those colours and their map side by side in its constants, the tiles 0x200 bytes after the
 * colours and the map 0x3100 after them.
 */
export function findIntroGraphics(rom) {
  for (let at = 0; at + 12 <= rom.size; at += 4) {
    const palette = rom.u32(at + 4);
    if (rom.isPointer(palette) && rom.u32(at) === palette + 0x200 && rom.u32(at + 8) === palette + 0x3100) return rom.ptr(at + 4);
  }
  return null;
}

// where each character's name stops on the screen, the first of the intro's tables (gUnknown_0868B27C)
const NAME_STOPS = [0x14, 0x70, 0x5C, 0x5A, 0x58, 0x70, 0x1C, 0x5A];
const OBJ_VRAM = 0x06010000;

/** The intro's tables: where the names stop, then the names' letters, each pointing at sprite VRAM. */
export function findIntroTables(rom) {
  for (let at = 0; at + 0x15C <= rom.size; at += 4) {
    if (!NAME_STOPS.every((v, i) => rom.s16(at + i * 2) === v)) continue;
    const vram = rom.u32(at + 0x18);
    if (vram >= OBJ_VRAM && vram < OBJ_VRAM + 0x8000) return at;
  }
  return null;
}
