// Where the sound engine's tables are: the music player table (gMPlayTable) and the song table (gSongTable)
// that follows it. The engine (src/sound/m4a.js) reads songs, voices and samples through them.

const PLAYERS = 4;   // SA1 builds the engine with four music players: BGM and three for sound effects
const EWRAM = [0x02000000, 0x02040000];
const inEwram = v => v >= EWRAM[0] && v < EWRAM[1];

// a song table entry: a ROM pointer to the song header, then the player's number twice
function isSong(rom, at) {
  const ms = rom.u16(at + 4);
  return rom.isPointer(rom.u32(at)) && ms < PLAYERS && rom.u16(at + 6) === ms;
}

/**
 * The music player table is four entries of {player state, track array (both EWRAM pointers), track count,
 * 0, u16}, and the song table starts right after it. Returns the player table's file offset, or null.
 */
export function findMusicPlayers(rom) {
  for (let at = 0; at + PLAYERS * 12 + 16 <= rom.size; at += 4) {
    let ok = true;
    for (let i = 0; i < PLAYERS && ok; i++) {
      const e = at + i * 12, tracks = rom.u8(e + 8);
      ok = inEwram(rom.u32(e)) && inEwram(rom.u32(e + 4)) && tracks >= 1 && tracks <= 16 && rom.u8(e + 9) === 0;
    }
    if (ok && isSong(rom, at + PLAYERS * 12) && isSong(rom, at + PLAYERS * 12 + 8)) return at;
  }
  return null;
}

/** The layout the engine needs: both tables and how many songs there are. */
export function soundLayout(rom, playerTable) {
  const songTable = playerTable + PLAYERS * 12;
  let songs = 0;
  while (songTable + (songs + 1) * 8 <= rom.size && isSong(rom, songTable + songs * 8)) songs++;
  return { playerTable, songTable, players: PLAYERS, songs };
}
