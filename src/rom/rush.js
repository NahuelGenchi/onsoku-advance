// What the optional Sonic Rush boost takes from the player's own Sonic Rush ROM (Nintendo DS): the boost's
// effects, act/ac_eff_boost.bac, the stage's sound archive, and the sound tables of the SDK in its ARM7 and
// ARM9 programs (sound/nitro.js plays the archive with them). Nothing of Sonic Rush is in this repository.
//
// A .bac file (the layout RushRE's Sonic Rush Adventure decompilation documents in sprite.c) holds animations
// as lists of blocks: a frame's OAM entries, the pixels of each entry, its palette, and the end of the frame
// with its length in frames; an animation ends with a block that goes back to its loop point.

import { NdsRom, lz10 } from './nds.js';
import { RomError } from './identify.js';

const TITLE = 'SONIC RUSH', CODE = 'ASC';   // ASCE (USA), ASCJ, ASCP
const BOOST_FILE = 'act/ac_eff_boost.bac';
const SOUND_FILE = 'snd/z1s/sound_data.sdat';   // Leaf Storm's, the stage the boost was checked in
export const RUSH_AURA = 4, RUSH_BURST = 5;      // Sonic's animations in the file (Blaze's are 7 and 8)
export const RUSH_BOOST_SE = [0, 10];            // the game's sound effects archive, Sonic's boost (SE_Superboast)

// OAM shape (attribute 0 bits 14–15) and size (attribute 1 bits 14–15) to width and height
export const OBJ_SIZES = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
];

// a block of pixels or colours: a header byte 0 (stored as is, with its length in the next three) or 0x10 (LZ77)
function data(bytes, at) {
  if (bytes[at] === 0x10) return lz10(bytes, at);
  const size = bytes[at + 1] | (bytes[at + 2] << 8) | (bytes[at + 3] << 16);
  return bytes.subarray(at + 4, at + 4 + size);
}

/**
 * One animation of a .bac file: its frames, each with its length, its centre (where the object's position
 * goes), its OAM entries (attributes 0 and 1, size, and pixels as 4-bit colour indices, row by row) and its 16
 * colours (15-bit BGR); and the frame its end block goes back to.
 */
export function decodeBacAnimation(bytes, anim) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = at => view.getUint16(at, true), s16 = at => view.getInt16(at, true), u32 = at => view.getUint32(at, true);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2]) !== 'BAC') throw new RomError('unexpected data in the Sonic Rush rom: the boost effects are not a .bac file.');
  const animHdr = u32(4), seq = u32(8), asm = u32(12), pal = u32(16), pix = u32(20);
  let at = u32(animHdr + 4 + anim * 8);
  const frames = [], starts = new Map();
  let cur = { start: at };
  for (let guard = 0; guard < 256; guard++) {
    const id = u16(seq + at), size = u16(seq + at + 2), body = seq + at + 4;
    if (id === 1) {
      const f = asm + u32(body), count = u16(f);
      cur.center = [s16(f + 12), s16(f + 14)];
      cur.oam = [];
      for (let k = 0; k < count; k++) cur.oam.push({ a0: u16(f + 16 + k * 8), a1: u16(f + 18 + k * 8) });
    } else if (id === 2) {
      cur.parts = [];
      for (let k = 0; k + 6 <= size - 4; k += 8) cur.parts.push(data(bytes, pix + u32(body + k)));
    } else if (id === 3) {
      const colors = data(bytes, pal + u32(body));
      cur.colors = Array.from({ length: 16 }, (_, i) => colors[i * 2] | (colors[i * 2 + 1] << 8));
    } else if (id === 0) {
      cur.duration = u16(body + 4);
      starts.set(cur.start, frames.length);
      frames.push(cur);
      cur = { start: at + size, center: cur.center, oam: cur.oam, parts: cur.parts, colors: cur.colors };
    } else if (id === 4) {
      const loop = starts.get(u32(body));
      return { frames: frames.map(toFrame), loop: loop ?? 0 };
    } else throw new RomError(`unexpected data in the Sonic Rush rom: a .bac block of type ${id}.`);
    at += size;
  }
  throw new RomError('unexpected data in the Sonic Rush rom: a .bac animation with no end.');
}

// a frame's entries with their pixels unpacked from 8×8 tiles, laid out row by row (1D mapping)
function toFrame(f) {
  return {
    duration: f.duration, center: f.center, colors: f.colors,
    oam: f.oam.map(({ a0, a1 }, k) => {
      const [w, h] = OBJ_SIZES[a0 >> 14][a1 >> 14], src = f.parts[k], pixels = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const byte = src[(((y >> 3) * (w >> 3) + (x >> 3)) << 5) + ((y & 7) << 2) + ((x & 7) >> 1)] ?? 0;
          pixels[y * w + x] = x & 1 ? byte >> 4 : byte & 15;
        }
      }
      return { a0, a1, w, h, pixels };
    }),
  };
}

// the SDK's sound tables, each found by its first values: in the ARM7 program the decibel-squared curve, the
// LFO's quarter sine and the envelope's attack curve; in the ARM9 program the decibel curve NitroSystem's
// volumes use (SND_CalcDecibel)
function soundTables(rom) {
  const program = header => rom.bytes.subarray(rom.u32(header), rom.u32(header) + rom.u32(header + 12));
  const arm9 = program(0x20), arm7 = program(0x30);
  const find = (bytes, first, length, Type) => {
    const head = new Uint8Array(new Type(first).buffer);
    for (let at = 0; at + length * Type.BYTES_PER_ELEMENT <= bytes.length; at += Type.BYTES_PER_ELEMENT) {
      if (head.every((b, k) => bytes[at + k] === b)) return new Type(bytes.slice(at, at + length * Type.BYTES_PER_ELEMENT).buffer);
    }
    throw new RomError('this Sonic Rush rom is missing the sound tables the boost needs.');
  };
  return {
    dBsq: find(arm7, [-723, -722, -721, -651], 128, Int16Array),
    sine: find(arm7, [0, 6, 12, 19, 25, 31], 33, Uint8Array),
    attackTable: find(arm7, [0, 1, 5, 14, 26, 38, 51, 63], 19, Uint8Array),
    decibel: find(arm9, [-723, -421, -361, -325], 128, Int16Array),
  };
}

// every DS cartridge header holds the Nintendo logo, with its checksum, 0xCF56, at 0x15C
const isNds = rom => rom.size >= 0x200 && rom.u16(0x15C) === 0xCF56;

/** Whether the header of `buffer` names Sonic Rush, before the full check: which game a file is. */
export function isRush(buffer) {
  const rom = new NdsRom(buffer);
  return isNds(rom) && rom.header().title === TITLE;
}

/**
 * Checks that `buffer` is Sonic Rush and reads what the boost needs from it: the aura and burst animations and
 * the stage's sound archive with the SDK's tables. Throws RomError with a message meant for the player when it is not.
 */
export function extractRush(buffer) {
  const rom = new NdsRom(buffer);
  if (!isNds(rom)) throw new RomError('this file is not a nintendo ds rom.');
  const { title, code } = rom.header();
  if (title !== TITLE || !code.startsWith(CODE)) {
    throw new RomError(`this is not Sonic Rush (its header says "${title}", ${code}).`);
  }
  const boost = rom.file(BOOST_FILE), sound = rom.file(SOUND_FILE);
  if (!boost || !sound) throw new RomError('this Sonic Rush rom is missing files the boost needs.');
  return {
    code,
    aura: decodeBacAnimation(boost, RUSH_AURA),
    burst: decodeBacAnimation(boost, RUSH_BURST),
    sound: { sdat: sound.slice(), ...soundTables(rom) },
  };
}
