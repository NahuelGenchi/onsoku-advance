// What each level's stage init sets up that the ROM keeps in code rather than in its per-level tables (SAT-R
// decompilation, src/game/shared/stage/stage.c StageInit_ZoneNActM and camera.c's background procedures,
// checked in the USA ROM): the palette animations its tasks run, in the order it makes them, the song it
// starts, the water line it starts with, and the extra background layers its zone draws. `zone` counts from 0
// (Neo Green Hill), as the original's ZONE_1 does. The level's index is the one the ROM's per-level tables use
// (14 single-player levels, then the four multiplayer stages). `sprites` { name: [anim, variant] } are the
// level's own looks for objects whose animation the ROM picks from a per-level table.

export const LEVELS = {
  0: { name: 'Neo Green Hill Zone act 1', zone: 0, act: 0, paletteAnimations: [814, 815], music: 12 },
  // StageInit_Zone2Act1 (0x0803DD45 in the USA ROM): palette animations 819, 845 and 849 and MUS_SECRET_BASE.
  // StageBgUpdate_Zone2Act1 scrolls the background (backgrounds.js); the spotlights are made after the init (acts.js).
  // Picked from the course select, the HUD's data holds 56 (at 0x03002794) when it is made. The zone's platforms
  // (sPlatformThinAnims 0x080B8504, sPlatformCrumblingAnims 0x080B8528), trampoline and bounce block
  // (sBounceBlockAnims 0x086C8C20)
  2: {
    name: 'Secret Base Zone act 1', zone: 1, act: 0, paletteAnimations: [819, 845, 849], music: 14, backgroundScroll: 'secretBase1', hudFlash: 56,
    sprites: { thinPlatform: [506, 0], crumblingPlatform: [502, 0], trampoline: [505, 0], trampolineBounce: [505, 1], bounceBlock: [499, 0] },
  },
  // StageInit_Zone2Act2 (0x0803DD89): act 1's three palette animations and MUS_SECRET_BASE__ACT_2; StageBgUpdate_Zone2Act2
  // scrolls the background as the inside of act 1's does, all the way. Picked from the course select, the HUD's
  // data holds 64 (at 0x03002854) when it is made, so its first frame draws no flash. The zone's sprites are act 1's
  3: {
    name: 'Secret Base Zone act 2', zone: 1, act: 1, paletteAnimations: [819, 845, 849], music: 15, backgroundScroll: 'secretBase2', hudFlash: 64,
    sprites: { thinPlatform: [506, 0], crumblingPlatform: [502, 0], trampoline: [505, 0], trampolineBounce: [505, 1], bounceBlock: [499, 0] },
  },
  // StageInit_Zone4Act1 (0x0803DDCD in the USA ROM): CreateStageWaterTask(1546, 0x7F207F20, 0); the snow is
  // tilemap 71 (TM_ICE_PARADISE_SNOW) on BG0 (CreateStageBg_Zone4)
  6: { name: 'Ice Mountain Zone act 1', zone: 3, act: 0, paletteAnimations: [822, 821], music: 18, water: { level: 1546, blend: 0x7F207F20 }, snow: 71 },
  // StageInit_Zone4Act2 (0x0803DE11): the same, with the water line at 1664 and act 2's song; the breakable
  // wall is 594 (gUnknown_080BB544, 0x080B854C)
  7: {
    name: 'Ice Mountain Zone act 2', zone: 3, act: 1, paletteAnimations: [822, 821], music: 19, water: { level: 1664, blend: 0x7F207F20 }, snow: 71,
    sprites: { breakableWall: [594, 0] },
  },
};

/** The entry of `level`, or an error for one this game can't load yet. */
export function levelInfo(level) {
  const info = LEVELS[level];
  if (!info) throw new Error(`Level ${level} is not in this game yet.`);
  return { level, ...info };
}
