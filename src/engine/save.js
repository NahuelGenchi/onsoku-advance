// The save (SAT-R decompilation, src/game/sa1/save.c, and CreateEmptySaveGame in src/game/game.c): Sonic
// Advance's one save, struct SaveGame, the 0x430 bytes the cartridge's flash memory keeps. Here the browser
// keeps them, in its storage (localStorage, as base64). At power-on the game reads the save (SaveGameExists),
// or starts an empty one (CreateEmptySaveGame); then it changes the save in memory (LOADED_SAVE) as it goes,
// and writes it at set moments (WriteSaveGame): as an act's results end, as a game over ends, before the
// congratulations and with the Moon Zone's results.
//
// Its fields, by offset, as the USA ROM has them (the decompilation's struct has a language byte at 0x01A, for the
// European version's six, which the USA ROM doesn't have, so the three fields after it are a byte earlier):
// - 0x000 security: "PIRO" once written (a flash sector without it is empty); 0x004 unk4: the frame count when
//   the name was last changed, which the multiplayer link sends as the player's id
// - 0x008 unlockedLevels: by character, how far they have got (the level after the last one cleared)
// - 0x010 playerName: six characters of the UI font (0x20 to 0x89) and two unused; 0x018 difficultyLevel (0 normal, 1 easy); 0x019 uiLanguage (0 Japanese, 1 English);
//   0x01A timeLimitDisabled; 0x01B btnConfig (1: A and B swapped)
// - 0x01C chaosEmeralds: a bit per special stage
// - 0x020 timeRecords: the three best course times by character and level, 10:00 when none
// - 0x380 multiplayerScores: ten of a player id, a name, wins, losses and draws
// - 0x420 unk420: a best score, which only a time-up game over with no continue raises (HandleDeath)
// - 0x424 unk424: set once the Moon Zone is cleared; 0x425 to 0x427 unk425 to unk427: the player's own
//   multiplayer wins, losses and draws
// - 0x428 score: the rings every act's results have counted, the Tiny Chao Garden's to spend
// - 0x42C checksum: the sum of the 32-bit words before it

import { theMoonOpens, ALL_EMERALDS, MOON_BEATEN } from './unlock.js';

const SAVE_KEY = 'onsoku.save';
const EMERALDS_KEY = 'onsoku.emeralds';   // what came before the save: the Chaos Emeralds alone, as a number
const SIZE = 0x430, CHECKSUM = 0x42C;
const SECURITY = 0x4F524950;
const MAX_COURSE_TIME = 10 * 3600;

/** The frames a write takes mGBA (the reference), in which nothing else runs and gFrameCount doesn't count. */
export const WRITE_FRAMES = 14;
/** The frames erasing the flash takes mGBA (sub_8012F6C, the Options menu's Delete Game Data). */
export const ERASE_FRAMES = 1;

// the browser's storage, or null where it is blocked
function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// CalculateChecksum
function checksum(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, SIZE);
  let sum = 0;
  for (let i = 0; i < CHECKSUM; i += 4) sum = (sum + view.getUint32(i, true)) >>> 0;
  return sum;
}

// CreateEmptySaveGame: normal difficulty, nothing cleared, the menus in English, the time limit on, no records,
// the multiplayer names blank
function emptySave() {
  const bytes = new Uint8Array(SIZE), view = new DataView(bytes.buffer);
  view.setUint32(0x420, 50000, true);
  for (let i = 0; i < 10; i++) {
    const score = 0x380 + i * 16;
    bytes.fill(0x20, score + 4, score + 12);
    bytes[score + 12] = 0xFF;
  }
  for (let i = 0x20; i < 0x380; i += 4) view.setUint32(i, MAX_COURSE_TIME, true);
  bytes[0x19] = 1;
  return bytes;
}

// SaveGameExists: the save the browser keeps, if it is one (its security and checksum right)
function readStored(storage) {
  try {
    const text = storage?.getItem(SAVE_KEY);
    if (!text) return null;
    const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
    if (bytes.length !== SIZE) return null;
    const view = new DataView(bytes.buffer);
    return view.getUint32(0, true) === SECURITY && view.getUint32(CHECKSUM, true) === checksum(bytes) ? bytes : null;
  } catch {
    return null;   // storage blocked, or not a save
  }
}

/**
 * The save at power-on: the one `storage` keeps (the browser's localStorage by default; null keeps nothing), or
 * an empty one, with the Chaos Emeralds an earlier version kept on their own. Where storage is blocked or full,
 * it lasts as long as the page, the way a cartridge's flash would.
 */
export function openSave(storage = browserStorage()) {
  let flash = readStored(storage);   // what the flash holds: the save as last written, or null before the first
  const bytes = flash ? flash.slice() : emptySave(), view = new DataView(bytes.buffer);
  if (!flash) {
    try { bytes[0x1C] = Number(storage?.getItem(EMERALDS_KEY)) & ALL_EMERALDS; } catch { /* none kept */ }
  }
  return {
    bytes,
    get unk4() { return view.getUint32(0x04, true); },
    set unk4(v) { view.setUint32(0x04, v >>> 0, true); },
    /** The name's eight bytes, as a view into the save. */
    playerName: bytes.subarray(0x10, 0x18),
    /** The ten multiplayer records, 16 bytes each, as a view into the save. */
    multiplayerScores: bytes.subarray(0x380, 0x420),
    get difficultyLevel() { return bytes[0x18]; },
    set difficultyLevel(v) { bytes[0x18] = v; },
    get uiLanguage() { return bytes[0x19]; },
    set uiLanguage(v) { bytes[0x19] = v; },
    get timeLimitDisabled() { return bytes[0x1A]; },
    set timeLimitDisabled(v) { bytes[0x1A] = v; },
    get btnConfig() { return bytes[0x1B]; },
    set btnConfig(v) { bytes[0x1B] = v; },
    get chaosEmeralds() { return bytes[0x1C]; },
    set chaosEmeralds(v) { bytes[0x1C] = v; },
    get unk420() { return view.getUint32(0x420, true); },
    set unk420(v) { view.setUint32(0x420, v >>> 0, true); },
    get unk424() { return bytes[0x424]; },
    set unk424(v) { bytes[0x424] = v; },
    get unk425() { return bytes[0x425]; },
    get unk426() { return bytes[0x426]; },
    get unk427() { return bytes[0x427]; },
    get score() { return view.getUint32(0x428, true); },
    set score(v) { view.setUint32(0x428, v >>> 0, true); },
    unlockedLevel: character => view.getUint16(0x08 + character * 2, true),
    setUnlockedLevel(character, level) { view.setUint16(0x08 + character * 2, level, true); },
    /** sub_8012F6C: the flash erased, so the browser keeps no save until the next write. */
    erase() {
      flash = null;
      try { storage?.removeItem(SAVE_KEY); } catch { /* storage blocked */ }
    },
    /** CreateEmptySaveGame: the save in memory empty again. */
    reset() { bytes.set(emptySave()); },
    /**
     * WriteSaveGame: nothing when the flash already holds the save; otherwise the save is marked, summed and
     * kept. Returns whether it was written, which takes WRITE_FRAMES.
     */
    write() {
      if (flash && flash.every((b, i) => b === bytes[i])) return false;
      view.setUint32(0, SECURITY, true);
      view.setUint32(CHECKSUM, checksum(bytes), true);
      flash = bytes.slice();
      try {
        storage?.setItem(SAVE_KEY, btoa(String.fromCharCode(...flash)));
        storage?.removeItem(EMERALDS_KEY);   // the save has them now
      } catch { /* storage blocked or full: kept for this visit */ }
      return true;
    },
  };
}

/**
 * The stage results' part (CreateStageResults): the act's `rings` go to the save's ring bank, and the act counts
 * as cleared for `character`, unless the game is in its final stage (theMoonOpens, with `startLevel`, the level
 * the course select started the game on).
 */
export function saveActCleared(save, { level, rings, character = 0, startLevel = 0 }) {
  save.score += (rings << 16) >> 16;
  const unlockedLevels = [0, 1, 2, 3].map(c => save.unlockedLevel(c));
  if (theMoonOpens({ character, level, emeralds: save.chaosEmeralds, unlockedLevels, courseSelectLevel: startLevel })) return;
  save.setUnlockedLevel(character, Math.max(level + 1, unlockedLevels[character]));
}

/** CreateExtraStageResults: the Moon Zone cleared, which opens everything for Sonic. */
export function saveMoonCleared(save) {
  save.setUnlockedLevel(0, MOON_BEATEN);
  save.unk424 = 1;
}
