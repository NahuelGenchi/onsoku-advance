// What differs from level to level, by the ROM's level index (0 Neo Green Hill act 1, 1 act 2, 2 Secret Base
// act 1, … 10 Egg Rocket, 11 Cosmic Angel, 12 X Zone, 13 the Moon; 14–17 the multiplayer stages). Each act's
// stage init (SAT-R decompilation, src/game/shared/stage/stage.c, StageInit_*) makes its palette loader tasks
// and starts its music; its background scrolls as StageBgUpdate_* (src/game/sa1/stage/backgrounds/) has it.
// Every level's layers, collision, entities and start come from the per-level tables the extractor reads.

export const LEVELS = {
  // StageInit_Zone1Act1: palette animations 814 (the sea, every 16 frames) and 815 (the waterfalls, every
  // frame), MUS_NEO_GREEN_HILL__ACT_1
  0: { name: 'Neo Green Hill Zone act 1', paletteAnimations: [814, 815], music: 12, background: 'neoGreenHill' },
  // StageInit_Zone3Act2 (0x0803D90C in the USA ROM): eleven palette animations, each cycling one row of the
  // background palette (827 twice, two tasks loading the same colours together), then
  // MUS_CASINO_PARADISE__ACT_2; StageBgUpdate_Zone3Acts12 scrolls the 256 × 256 background in bands
  5: {
    name: 'Casino Paradise Zone act 2', paletteAnimations: [816, 817, 818, 824, 825, 827, 827, 828, 843, 844, 826],
    music: 17, background: 'casinoParadise',
  },
};

/** The level `?level=N` asks for, when the extractor knows it; otherwise act 1. */
export function levelFromQuery(search) {
  const n = Number(new URLSearchParams(search).get('level'));
  return Number.isInteger(n) && LEVELS[n] ? n : 0;
}
