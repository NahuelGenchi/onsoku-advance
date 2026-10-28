// The player's own Sonic Advance 2 ROM, for the optional extras that take from it: it is checked, and its
// sprite tables and its sound engine's tables are found as for Sonic Advance (locate.js, sound.js), which keeps
// them in the same formats. Each extra reads its own art from what openSa2 returns (sa2boost.js for Boost Mode).
// Nothing of Sonic Advance 2 is in this repository.

import { Rom } from './rom.js';
import { RomError, readHeader } from './identify.js';
import { findSpriteTables } from './locate.js';
import { findMusicPlayers, soundLayout } from './sound.js';
import { spriteTables } from './sprites.js';

const TITLE = 'SONICADVANC2', CODE = 'A2N';   // A2NE (USA), A2NJ, A2NP

/** Whether the header of `buffer` names Sonic Advance 2, before the full check: which game a file is. */
export function isSa2(buffer) {
  const rom = new Rom(buffer);
  return rom.size >= 0x200 && rom.u8(0xB2) === 0x96 && readHeader(rom).title === TITLE;
}

/**
 * Checks that `buffer` is Sonic Advance 2 and finds its tables. Returns { rom, code, tables, sound: { rom:
 * buffer, layout } }: the ROM to read, its game code, its sprite tables (sprites.js), and its sound engine's
 * layout with the ROM for the sound engine to read. Throws RomError with a message meant for the player when it
 * is not Sonic Advance 2 or its tables are missing.
 */
export function openSa2(buffer) {
  const rom = new Rom(buffer);
  if (rom.size < 0x200 || rom.u8(0xB2) !== 0x96) throw new RomError('This file is not a Game Boy Advance ROM.');
  const { title, code } = readHeader(rom);
  if (title !== TITLE || !code.startsWith(CODE)) {
    throw new RomError(`This is not Sonic Advance 2 (its header says "${title}", ${code}).`);
  }
  const at = findSpriteTables(rom), players = findMusicPlayers(rom);
  if (at === null || players === null) {
    throw new RomError('Unexpected data in the Sonic Advance 2 ROM: its sprite or sound tables are missing.');
  }
  return { rom, code, tables: spriteTables(rom, at), sound: { rom: buffer, layout: soundLayout(rom, players) } };
}
