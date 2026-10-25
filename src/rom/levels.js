// What each level's code sets up rather than its data: the stage init's palette animations (StageInit_ZoneNActM
// in the SAT-R decompilation's src/game/shared/stage/stage.c). The level index is the ROM's: zone × 2 + act for
// the seven zones' acts (0 Neo Green Hill act 1 … 12 X Zone, 13 the Moon), then the four multiplayer stages.

export const LEVELS = {
  // Neo Green Hill act 1 (StageInit_Zone1Act1): 814 steps the background's colours in palette row 15 every
  // 16 frames, 815 the waterfalls' in row 10 every frame
  0: { name: 'Neo Green Hill Zone act 1', paletteAnimations: [814, 815] },
  // X Zone (StageInit_Zone7Act1): only its song; picked from the course select, the HUD's zero-ring flash
  // starts from the 90 the menus left in its task's memory
  12: { name: 'X Zone', paletteAnimations: [], hudFlash: 90 },
};

/** The levels this version builds, by index. */
export const playableLevel = level => Object.hasOwn(LEVELS, level);
