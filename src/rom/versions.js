// ROM versions checked against this project, identified by SHA-1.
// Offsets are file offsets of the tables the extractor reads (see docs/ROM.md).
// Unknown versions fall back to the signature search in locate.js.

export const KNOWN_VERSIONS = [
  {
    sha1: 'd842afa7dd1e84de08addb94a51506f1bcafd551',
    name: 'Sonic Advance (USA)',
    code: 'ASOE',
    offsets: {
      spriteTables: 0x0D868C,
      tilemaps: 0x4A6C40,
      collision: 0x4A6DA4,
      spawns: 0x4A6DEC,
      loopPoints: 0x4A6E74,
      loopShifts: 0x4A6EBC,
      rings: 0x0B7F4C,
      interactables: 0x0B7F94,
      itemBoxes: 0x0B7FDC,
      enemies: 0x0B8024,
      spinDashSpeeds: 0x4A7084,
      musicPlayers: 0x6D767C,
      uiGraphics: 0x680A38,
      titleCard: 0x681274,
      trueEnding: 0x6B4B10,
      introGraphics: 0x69EC10,
      introTables: 0x684178,
      specialStage: 0x47FEF4,
      specialLayouts: 0x7B97F8,
      characterAnims: 0x4A6F04,
      specialIntro: 0x684480,
      specialClouds: 0x6B4B10,
    },
  },
];

export const GAME_TITLE = 'SONICADVANCE';
export const GAME_CODES = { ASOE: 'USA', ASOP: 'Europe', ASOJ: 'Japan' };
