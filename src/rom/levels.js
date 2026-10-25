// What each level's stage init sets up that the ROM keeps in code rather than in its per-level tables (SAT-R
// decompilation, src/game/shared/stage/stage.c StageInit_ZoneNActM and camera.c's background procedures,
// checked in the USA ROM): the palette animations its tasks run, in the order it makes them, the water line it
// starts with, and the extra background layers its zone draws. `zone` counts from 0 (Neo Green Hill), as the
// original's ZONE_1 does. The level's index is the one the ROM's per-level tables use: zone × 2 + act for the
// seven zones' acts (0 Neo Green Hill act 1 … 12 X Zone, 13 the Moon), then the four multiplayer stages. Its
// song is the ROM's (gLevelSongs). `sprites` are the level's own animations, by the name the engine draws them
// by, as [animation, variant]. `ending`: the art of what comes after the level (src/rom/credits.js).

import { EXTRA_SPRITES } from './extra.js';
import { NORMAL_ENDING_SPRITES, CREDITS_SPRITES } from './credits.js';

export const LEVELS = {
  // Neo Green Hill act 1 (StageInit_Zone1Act1): 814 steps the background's colours in palette row 15 every
  // 16 frames, 815 the waterfalls' in row 10 every frame
  0: { name: 'Neo Green Hill Zone act 1', zone: 0, act: 0, paletteAnimations: [814, 815] },
  // StageInit_Zone4Act1 (0x0803DDCD in the USA ROM): CreateStageWaterTask(1546, 0x7F207F20, 0); the snow is
  // tilemap 71 (TM_ICE_PARADISE_SNOW) on BG0 (CreateStageBg_Zone4)
  6: { name: 'Ice Mountain Zone act 1', zone: 3, act: 0, paletteAnimations: [822, 821], water: { level: 1546, blend: 0x7F207F20 }, snow: 71 },
  // StageInit_Zone4Act2 (0x0803DE11): the same, with the water line at 1664 and act 2's song
  7: { name: 'Ice Mountain Zone act 2', zone: 3, act: 1, paletteAnimations: [822, 821], water: { level: 1664, blend: 0x7F207F20 }, snow: 71 },
  // X Zone (StageInit_Zone7Act1): only its song; picked from the course select, the HUD's zero-ring flash
  // starts from the 90 the menus left in its task's memory. After its results come the congratulations and
  // the staff credits
  12: { name: 'X Zone', zone: 6, act: 0, paletteAnimations: [], hudFlash: 90, sprites: NORMAL_ENDING_SPRITES, ending: true },
  // StageInit_Zone7Act2 (0x0803DF31): only the Super Egg Robo's song. The Moon Zone is the extra stage, run by
  // its own tasks (src/engine/extra.js), with Super Sonic's, the Super Egg Robo's and the WARNING sign's sprites
  // its own tasks (src/engine/extra.js), with Super Sonic's, the Super Egg Robo's and the WARNING sign's
  // sprites, and the staff credits' after the true ending
  13: { name: 'The Moon Zone', zone: 6, act: 1, paletteAnimations: [], extra: true, sprites: { ...EXTRA_SPRITES, ...CREDITS_SPRITES }, ending: true },
};

/** The levels this version builds, by index. */
export const playableLevel = level => Object.hasOwn(LEVELS, level);

/** The entry of `level`, or an error for one this game can't load yet. */
export function levelInfo(level) {
  const info = LEVELS[level];
  if (!info) throw new Error(`Level ${level} is not in this game yet.`);
  return { level, ...info };
}
