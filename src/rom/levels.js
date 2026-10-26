// What each level's stage init sets up that the ROM keeps in code rather than in its per-level tables (SAT-R
// decompilation, src/game/shared/stage/stage.c StageInit_ZoneNActM and camera.c's background procedures,
// checked in the USA ROM): the palette animations its tasks run, in the order it makes them, the song it
// starts, the water line it starts with, and the extra background layers its zone draws. `zone` counts from 0
// (Neo Green Hill), as the original's ZONE_1 does. The level's index is the one the ROM's per-level tables use
// (14 single-player levels, then the four multiplayer stages). `sprites` { name: [anim, variant] } are the
// level's own looks for objects whose animation the ROM picks from a per-level table.

export const LEVELS = {
  0: { name: 'Neo Green Hill Zone act 1', zone: 0, act: 0, paletteAnimations: [814, 815], music: 12 },
  // StageInit_Zone4Act1 (0x0803DDCD in the USA ROM): CreateStageWaterTask(1546, 0x7F207F20, 0); the snow is
  // tilemap 71 (TM_ICE_PARADISE_SNOW) on BG0 (CreateStageBg_Zone4); zone 4's thin platforms are 523
  // (sPlatformThinAnims), and so are its ferris wheels' seats (gUnknown_086CEE2C), its sinking platform 528
  // (gUnknown_086CEDC0), its square platform 524 and moving spring 526 (their CreateEntity_), its breakable
  // wall 594 (gUnknown_080BB544, 0x080B854C), its crumbling platform 527 (sPlatformCrumblingAnims) and its bounce
  // block 543 (sBounceBlockAnims), and its forced slides' splash is 562 (gAnimSlideSplashes); act 1 also has a
  // hook rail, 569 in zone 4 (CreateEntity_HookRail)
  6: {
    name: 'Ice Mountain Zone act 1', zone: 3, act: 0, paletteAnimations: [822, 821], music: 18, water: { level: 1546, blend: 0x7F207F20 }, snow: 71,
    sprites: {
      thinPlatform: [523, 0], sinkingPlatform: [528, 0], squarePlatform: [524, 0], ferrisSeat: [523, 0], breakableWall: [594, 0],
      movingSpring: [526, 1], movingSpringLaunch: [526, 0], hookRail: [569, 0],
      crumblingPlatform: [527, 0], bounceBlock: [543, 0], slideSplash: [562, 0],
    },
  },
  // StageInit_Zone4Act2 (0x0803DE11): the same, with the water line at 1664 and act 2's song
  7: {
    name: 'Ice Mountain Zone act 2', zone: 3, act: 1, paletteAnimations: [822, 821], music: 19, water: { level: 1664, blend: 0x7F207F20 }, snow: 71,
    sprites: {
      thinPlatform: [523, 0], sinkingPlatform: [528, 0], squarePlatform: [524, 0], ferrisSeat: [523, 0], breakableWall: [594, 0],
      movingSpring: [526, 1], movingSpringLaunch: [526, 0],
      crumblingPlatform: [527, 0], bounceBlock: [543, 0], slideSplash: [562, 0],
    },
  },
};

/** The entry of `level`, or an error for one this game can't load yet. */
export function levelInfo(level) {
  const info = LEVELS[level];
  if (!info) throw new Error(`Level ${level} is not in this game yet.`);
  return { level, ...info };
}
