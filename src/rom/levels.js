// What each level's stage init sets up that the ROM keeps in code rather than in its per-level tables (SAT-R
// decompilation, src/game/shared/stage/stage.c StageInit_ZoneNActM and camera.c's background procedures,
// checked in the USA ROM): the palette animations its tasks run, in the order it makes them, the song it
// starts, the water line it starts with, and the extra background layers its zone draws. `zone` counts from 0
// (Neo Green Hill), as the original's ZONE_1 does. The level's index is the one the ROM's per-level tables use
// (14 single-player levels, then the four multiplayer stages). `sprites` are the level's own animations, by the
// name the engine draws them by, as [animation, variant].

import { EXTRA_SPRITES } from './extra.js';

export const LEVELS = {
  0: { name: 'Neo Green Hill Zone act 1', zone: 0, act: 0, paletteAnimations: [814, 815], music: 12 },
  // StageInit_Zone4Act1 (0x0803DDCD in the USA ROM): CreateStageWaterTask(1546, 0x7F207F20, 0); the snow is
  // tilemap 71 (TM_ICE_PARADISE_SNOW) on BG0 (CreateStageBg_Zone4)
  6: { name: 'Ice Mountain Zone act 1', zone: 3, act: 0, paletteAnimations: [822, 821], music: 18, water: { level: 1546, blend: 0x7F207F20 }, snow: 71 },
  // StageInit_Zone4Act2 (0x0803DE11): the same, with the water line at 1664 and act 2's song
  7: { name: 'Ice Mountain Zone act 2', zone: 3, act: 1, paletteAnimations: [822, 821], music: 19, water: { level: 1664, blend: 0x7F207F20 }, snow: 71 },
  // StageInit_Zone7Act2 (0x0803DF31): only the Super Egg Robo's song. The Moon Zone is the extra stage, run by
  // its own tasks (src/engine/extra.js), with Super Sonic's, the Super Egg Robo's and the WARNING sign's sprites
  13: { name: 'The Moon Zone', zone: 6, act: 1, paletteAnimations: [], music: 26, extra: true, sprites: EXTRA_SPRITES },
};

/** The entry of `level`, or an error for one this game can't load yet. */
export function levelInfo(level) {
  const info = LEVELS[level];
  if (!info) throw new Error(`Level ${level} is not in this game yet.`);
  return { level, ...info };
}
