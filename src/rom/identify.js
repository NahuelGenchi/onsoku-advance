// Recognizes a Sonic Advance ROM from its cartridge header and checksum.

import { Rom } from './rom.js';
import { KNOWN_VERSIONS, GAME_TITLE, GAME_CODES } from './versions.js';

export class RomError extends Error {}

/** SHA-1 of the whole ROM as lowercase hex, or null when the browser has no Web Crypto (non-secure contexts). */
export async function sha1Hex(buffer) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', buffer));
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Reads the GBA cartridge header (title at 0xA0, game code at 0xAC, version at 0xBC). */
export function readHeader(rom) {
  return { title: rom.ascii(0xA0, 12), code: rom.ascii(0xAC, 4), maker: rom.ascii(0xB0, 2), revision: rom.u8(0xBC) };
}

/** Whether the header of `buffer` names Sonic Advance, before the full check: which game a file is. */
export function isSonicAdvance(buffer) {
  const rom = new Rom(buffer);
  return rom.size >= 0x200 && rom.u8(0xB2) === 0x96 && readHeader(rom).title === GAME_TITLE;
}

/**
 * Checks that this is a Sonic Advance ROM and matches it against the known versions.
 * Throws RomError with a message meant for the player when it is not.
 */
export async function identify(rom) {
  if (rom.size < 0x200 || rom.u8(0xB2) !== 0x96) {
    throw new RomError('This file is not a Game Boy Advance ROM.');
  }
  const header = readHeader(rom);
  if (header.title !== GAME_TITLE || !(header.code in GAME_CODES)) {
    throw new RomError(`This is a Game Boy Advance ROM, but not Sonic Advance (its header says "${header.title}", ${header.code}).`);
  }
  const sha1 = await sha1Hex(rom.buffer);
  const known = KNOWN_VERSIONS.find(v => v.sha1 === sha1) ?? null;
  return { header, region: GAME_CODES[header.code], sha1, known };
}
