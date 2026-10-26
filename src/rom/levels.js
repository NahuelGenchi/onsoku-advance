// What each level's stage init sets up that the ROM keeps in code rather than in its per-level tables (SAT-R
// decompilation, src/game/shared/stage/stage.c StageInit_ZoneNActM and camera.c's background procedures,
// checked in the USA ROM): the palette animations its tasks run, in the order it makes them, the song it
// starts, the water line it starts with, and the extra background layers its zone draws. `zone` counts from 0
// (Neo Green Hill), as the original's ZONE_1 does. The level's index is the one the ROM's per-level tables use
// (14 single-player levels, then the four multiplayer stages). `sprites` { name: [anim, variant] } are the
// level's own looks for objects whose animation the ROM picks from a per-level table.

import { EXTRA_SPRITES } from './extra.js';

export const LEVELS = {
  0: { name: 'Neo Green Hill Zone act 1', zone: 0, act: 0, paletteAnimations: [814, 815], music: 12 },
  // StageInit_Zone1Act2: act 1's two and 820, which steps rows 13 and 12 every 2 frames ([animation, variant])
  1: { name: 'Neo Green Hill Zone act 2', zone: 0, act: 1, paletteAnimations: [814, 815, [820, 1], [820, 0]], music: 13 },
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
  // StageInit_Zone3Act1 (0x0803D854 in the USA ROM): act 2's eleven palette animations, in the same order,
  // then MUS_CASINO_PARADISE__ACT_1. Its thin and falling platforms are zone 3's (sPlatformThinAnims), and its
  // wall poles are red flags lying on their side (SA1_ANIM_RED_FLAG_H, outside zone 1).
  4: {
    name: 'Casino Paradise Zone act 1', zone: 2, act: 0, paletteAnimations: [816, 817, 818, 824, 825, 827, 827, 828, 843, 844, 826],
    music: 16, backgroundScroll: 'casinoParadise',
    sprites: { thinPlatform: [495, 0], wallPole: [470, 0], wallPoleSwing: [470, 1] },
  },
  // StageInit_Zone3Act2 (0x0803D90C in the USA ROM): eleven palette animations, each cycling one row of the
  // background palette (827 twice, two tasks loading the same colours together), then
  // MUS_CASINO_PARADISE__ACT_2; StageBgUpdate_Zone3Acts12 scrolls the 256 × 256 background in bands. Its thin
  // and falling platforms are zone 3's (sPlatformThinAnims), and so are its ferris wheels' seats
  // (gUnknown_086CEE2C, 0x086C8D48 in the USA ROM); its wall poles are red flags lying on their side
  // (SA1_ANIM_RED_FLAG_H, outside zone 1).
  5: {
    name: 'Casino Paradise Zone act 2', zone: 2, act: 1, paletteAnimations: [816, 817, 818, 824, 825, 827, 827, 828, 843, 844, 826],
    music: 17, backgroundScroll: 'casinoParadise',
    sprites: { thinPlatform: [495, 0], ferrisSeat: [495, 0], wallPole: [470, 0], wallPoleSwing: [470, 1] },
  },
  // StageInit_Zone4Act1 (0x0803DDCD in the USA ROM): CreateStageWaterTask(1546, 0x7F207F20, 0); the snow is
  // tilemap 71 (TM_ICE_PARADISE_SNOW) on BG0 (CreateStageBg_Zone4); zone 4's thin platforms are 523
  // (sPlatformThinAnims), and so are its ferris wheels' seats (gUnknown_086CEE2C), its sinking platform 528
  // (gUnknown_086CEDC0), its square platform 524 and moving spring 526 (their CreateEntity_), its breakable
  // wall 594 (gUnknown_080BB544, 0x080B854C), its hook rail's hook 569 (CreateEntity_HookRail), its crumbling
  // platform 527 (sPlatformCrumblingAnims), its bounce block 543 (sBounceBlockAnims) and its slides' splash 562
  // (gAnimSlideSplashes)
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
      movingSpring: [526, 1], movingSpringLaunch: [526, 0], hookRail: [569, 0],
      crumblingPlatform: [527, 0], bounceBlock: [543, 0], slideSplash: [562, 0],
    },
  },
  // StageInit_Zone5Act1 (0x0803DE55): palette animation 823, the waterfalls' colours in row 10 every frame; the
  // background stands still under Egg Rocket's clouds, tilemap 72 (TM_EGG_ROCKET_CLOUDS) on BG0, blended over it
  // (CreateStageBg_Zone5). The thin platforms (sPlatformThinAnims), bounce blocks (sBounceBlockAnims), waterfall
  // splash (gUnknown_086CED28), sinking platforms (gUnknown_086CEDC0), square platforms (CreateEntity_Platform_Square:
  // 536, or 537 when long) and breakable wall (595) are zone 5's own; its moving springs keep the default 540.
  8: {
    name: 'Angel Island Zone act 1', zone: 4, act: 0, paletteAnimations: [823], music: 20, clouds: 72,
    sprites: {
      thinPlatform: [535, 0], bounceBlock: [543, 0], waterSplash: [552, 0], sinkingPlatform: [544, 0], squarePlatform: [536, 0],
      squarePlatformLong: [537, 0], breakableWall: [595, 0], ironBall: [541, 0], bowl: [546, 0],
    },
  },
  // StageInit_Zone5Act2: palette animation 823 (the waterfalls) and act 2's song. CreateStageBg_Zone5 puts tilemap
  // 72 (TM_EGG_ROCKET_CLOUDS) on BG0, which StageBgUpdate_Zone5Acts12 moves left over the still background and
  // blends over it. The zone's thin platforms (sPlatformThinAnims), bounce blocks (sBounceBlockAnims), waterfall
  // splash (gUnknown_086CED28) and mud slides' splash (gAnimSlideSplashes) are its own.
  // StageInit_Zone5Act2 (0x0803DE75): the same, with act 2's song; its mud slides' splash (gAnimSlideSplashes) is
  // zone 5's own too. Its boss, Mecha Knuckles, is the act's enemy 26 (`boss` names its animations in extract.js).
  9: {
    name: 'Angel Island Zone act 2', zone: 4, act: 1, paletteAnimations: [823], music: 21, clouds: 72,
    sprites: { thinPlatform: [535, 0], bounceBlock: [543, 0], waterSplash: [552, 0], slideSplash: [568, 0] },
    boss: 'mechaKnuckles',
  },
  // StageInit_Zone6Act1 (0x0803D9C5): 839 and 842 both step row 13 of the stage palette, 840 row 12 and 841 row
  // 10; the act's only, so its zone keeps act 1's index. Its background and its launch and stage separations
  // are eggrocket.js's. Picked from the course select, the HUD's task data lands on memory holding 0 (hud.js). The breakable wall is 596 (gUnknown_080BB544); zone 6 act 1's square
  // platforms are 518 and, long, 519, and zone 6's moving spring 582 (their CreateEntity_). Its thin platform (sPlatformThinAnims), crumbling platform (sPlatformCrumblingAnims) and
  // bounce block (sBounceBlockAnims) are its own, and so is its trampoline (505, CreateEntity_Trampoline)
  10: { name: 'Egg Rocket Zone', zone: 5, act: 0, paletteAnimations: [839, 840, 841, 842], music: 22,
    backgroundScroll: 'eggRocket', hudFlash: 0,
    sprites: {
      thinPlatform: [517, 0], crumblingPlatform: [513, 0], bounceBlock: [507, 0], trampoline: [505, 0], trampolineBounce: [505, 1],
      breakableWall: [596, 0], squarePlatform: [518, 0], squarePlatformLong: [519, 0], movingSpring: [582, 1], movingSpringLaunch: [582, 0],
    },
  },
  // StageInit_Zone6Act2: eight palette animations, each cycling one row of the background palette, and
  // MUS_COSMIC_ANGEL. StageBgUpdate_Zone6Act2 scrolls the background (backgrounds.js). The HUD's task data lands
  // on memory the menus last used, which holds 90 when the act is picked from the course select (hud.js). Zone 6
  // act 2's square platforms are 599 and, long, 600, and zone 6's moving spring 582 (their CreateEntity_)
  11: {
    name: 'Cosmic Angel Zone', zone: 5, act: 1, paletteAnimations: [829, 830, 831, 850, 851, 848, 846, 847], music: 23,
    backgroundScroll: 'cosmicAngel', hudFlash: 90,
    sprites: { squarePlatform: [599, 0], squarePlatformLong: [600, 0], movingSpring: [582, 1], movingSpringLaunch: [582, 0] },
  },
  // StageInit_Zone7Act1: only its song. StageBgUpdate_Zone7Act1 scrolls the background as a whole (backgrounds.js).
  // Picked from the course select, the HUD's zero-ring flash starts from the 90 the menus left in its task's
  // memory. Its thin platforms are its own (605, sPlatformThinAnims), and so are its bricks that fall once Sonic
  // lands on them (574). Its bosses, the Egg Wrecker, the Egg Drillster and Egg X, come one after the other.
  12: {
    name: 'X Zone', zone: 6, act: 0, paletteAnimations: [], music: 24, backgroundScroll: 'xZone', hudFlash: 90,
    sprites: { thinPlatform: [605, 0], fallingBrick: [574, 0] },
  },
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
