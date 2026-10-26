// Turns a Sonic Advance ROM into everything the engine draws: Sonic's animations, the dust effects, the
// springs, the spikes, the enemies, the item boxes, the platforms, the rings, the HUD, the title card, the act's
// results, the game over, Neo Green Hill Zone's two acts with their collision, objects, enemies and rings, and the zone's
// background. Runs entirely in the browser.

import { Rom } from './rom.js';
import { identify } from './identify.js';
import { locateTables } from './locate.js';
import { spriteTables, animationFrames, animationPalette, renderFrame, framePieces, paletteAnimation, frameLayout } from './sprites.js';
import { tilemapHeader, renderMetatileAtlas, renderPlainMap, mapBanks, mapHoles, indexMetatiles, indexPlainMap, metatileIndices, plainMapIndices } from './tilemaps.js';
import { readCollision, readSpawn, readLoop } from './collision.js';
import { readInteractables, readItemBoxes, entityRegions, readRings, layerToggles } from './entities.js';
import { readColors, tintRgb, tintImage } from './colors.js';
import { soundLayout } from './sound.js';
import { hudGraphics } from './hud.js';
import { titleCardGraphics } from './titlecard.js';
import { resultsGraphics } from './results.js';
import { levelInfo, LEVELS } from './levels.js';
import { gameOverGraphics } from './gameover.js';
import { createM4A } from '../sound/m4a.js';
import { createApu } from '../sound/apu.js';

// [animation id, variant] in the sprite tables, as the ROM's character state table maps them for Sonic
export const SONIC_ANIMATIONS = {
  idle: [0, 0], bored: [1, 0], lookUp: [2, 0], lookUpEnd: [2, 1], crouch: [3, 0], crouchEnd: [3, 1],
  walk: [4, 0], run: [5, 0], turn: [6, 0], brakeTurn: [7, 0], spin: [8, 0], brake: [9, 0],
  spinDash: [18, 0], spinDashRev: [18, 1], airDash: [49, 0], instaShield: [50, 0],
  spinAttack: [51, 0], somersault: [52, 0], slide: [53, 0], slideEnd: [53, 1], backflip: [55, 0],
  // launched by a spring: the somersault (charState 17), or rising, topping out and falling (21, 18, 19)
  spring: [11, 0], springRise: [10, 0], springPeak: [10, 1], springFall: [10, 2],
  // thrown up by a bounce block (charState 23): the walk animation
  bounce: [4, 0],
  // walking into a wall or a solid object (charState 14)
  push: [12, 0],
  // standing still at an edge, facing the drop (charState 12) or with his back to it (13)
  balanceForward: [13, 0], balanceBack: [14, 0],
  // knocked back (charState 15) and dying (1)
  hurt: [19, 0], dead: [21, 0],
  // hanging from a wall pole (charState 31), and swinging round a red flag (30)
  pole: [38, 0], flagSwing: [37, 0],
  // holding on to a carousel (charState 33)
  carouselRide: [40, 0],
  // hanging from a lift (charState 38)
  lift: [43, 0],
  // grinding (charState 16; variant 1 on a rail's steep parts) and jumping off a rail before its end (20)
  grind: [44, 0], grindSteep: [44, 1], railJump: [45, 0],
  // running up a half-pipe's side, higher with each (charStates 24, 25 and 26)
  halfPipeLow: [36, 0], halfPipeMid: [36, 1], halfPipeHigh: [36, 2],
  // held in Egg X's claw (charState 40)
  grabbed: [98, 0],
  // running on past the goal (charState 28)
  actClearRun: [22, 0],
  // standing in his act-clear pose once the boss capsule opens (charState 29)
  actClearPose: [23, 0],
  // hanging from a hook rail, a swinging hook or a crane claw (charState 38) and swinging round a rope (34)
  hook: [43, 0], swingRope: [40, 1],
  // carried through a marble track, curled up and scaled (charState 32, drawn through the rotation hardware)
  marbleTrack: [39, 0],
  // a breath from an air bubble under water (charState 27)
  breathe: [17, 0],
  // spinning in a whirlwind (charState 37)
  float: [42, 0],
  // taken aback as Mecha Knuckles wakes up (charState 39)
  react: [24, 0],
  // hanging from a hang bar, still (charState 35) and moving along it (36)
  hang: [41, 0], hangMove: [41, 1],
};
export const EFFECT_ANIMATIONS = {
  brakeDust: [748, 0], dashDust: [746, 0], dashDustBig: [747, 0], instaShieldFlash: [50, 1],
  grindSparks: [749, 0],
};

// the spring (animation 455): each kind's idle and launch variants
export const SPRING_ANIM = 455;
export const OBJECT_ANIMATIONS = {
  springUp: [SPRING_ANIM, 0], springUpLaunch: [SPRING_ANIM, 1], springSide: [SPRING_ANIM, 2], springSideLaunch: [SPRING_ANIM, 3],
  springBig: [SPRING_ANIM, 4], springBigLaunch: [SPRING_ANIM, 5], springSmall: [SPRING_ANIM, 6], springSmallLaunch: [SPRING_ANIM, 7],
};
// the spikes (animation 454, palette 35): pointing up, and sideways (pointing right, flipped to point left);
// the hiding ones come up through the first two variants
export const SPIKES_ANIM = 454;
export const SPIKE_ANIMATIONS = {
  spikesUp: [SPIKES_ANIM, 2], spikesSide: [SPIKES_ANIM, 3], spikesLow: [SPIKES_ANIM, 0], spikesMid: [SPIKES_ANIM, 1],
  // the hiding spikes rising and sinking
  spikesHiding0: [SPIKES_ANIM, 0], spikesHiding1: [SPIKES_ANIM, 1],
};
// act 1's enemies and their shots, the dust and points a defeat leaves and every zone's freed animals, by
// animation; each loads its own palette
export const ENEMY_ANIMATIONS = {
  401: { kikiBob: 1, kikiThrow: 2 }, 408: { coconut: 0 }, 402: { coconutPiece: 0 },
  403: { buzzerFly: 0, buzzerShoot: 1, buzzerTurn: 2 }, 409: { buzzerShot: 0 },
  404: { gamiWalk: 0, gamiClaws: 1 }, 410: { gamiShot: 0 },
  405: { rhinoDrive: 0, rhinoRev: 1, rhinoTurn: 2 },
  406: { keroJump: 0, keroCroak: 1 },
  407: { dustCloud: 0 },
  709: { score0: 0, score1: 1, score2: 2, score3: 3, score4: 4 },
  430: { leonWalk: 0, leonShoot: 1, leonTurn: 2 },
  431: { wamuHead: 0, wamuBody: 1, wamuTail: 2 },
  437: { animalSeal: 0 }, 438: { animalGorilla: 0 }, 439: { animalPeacock: 0 }, 440: { animalLion: 0 },
  441: { animalMole: 0 }, 442: { animalParrot: 0 }, 443: { animalPenguin: 0 }, 444: { animalRabbit: 0 },
  445: { animalOtter: 0 }, 446: { animalDeer: 0 }, 447: { animalSkunk: 0 }, 448: { animalRobin: 0 },
  449: { animalKangaroo: 0 }, 450: { animalKoala: 0 }, 451: { animalElephant: 0 },
  // Ice Mountain's: Drisame, its block of ice and the block's large and small pieces, and Kuraa walking and
  // snapping its claws
  424: { drisame: 0 }, 573: { drisameIce: 0 }, 579: { drisameDebrisLarge: 0 }, 580: { drisameDebrisSmall: 0 },
  425: { kuraaWalk: 0, kuraaSnap: 1 },
  // the Mole of Secret Base, Egg Rocket and Cosmic Angel, down in its mound and popping up
  434: { moleDown: 0, moleUp: 1 },
  // Secret Base's Tentou hovering, flying and firing (its shots are GamiGami's)
  412: { tentouHover: 0, tentouFly: 1, tentouFire: 2 },
  // and its Senbon walking and with its spikes out
  411: { senbonWalk: 0, senbonSpikes: 1 },
  // and its fireball rising and falling, and the fireball's sparks
  413: { fireballRise: 0, fireballFall: 1 }, 414: { fireballSpark: 0 },
  // Casino Paradise's: Hanabii walking and launching, its shot and the firework it bursts into, Slot
  // walking and shooting, its coin and the coin's pieces, and Pierrot on its ball
  415: { hanabiiWalk: 0, hanabiiLaunch: 1 }, 419: { hanabiiShot: 0 }, 416: { hanabiiFirework: 0 },
  417: { slotWalk: 0, slotShoot: 1 }, 420: { slotCoin: 0 }, 421: { slotPiece: 0 }, 418: { pierrot: 0 },
  // Yukimaru on the ground and on a wall, walking and throwing, and its snowball (the Pen's first snowball
  // animation); the Pen walking and throwing, its snowball and the snowball's pieces
  422: { yukimaruThrow: 0, yukimaruWalk: 1 }, 423: { yukimaruWallThrow: 0, yukimaruWallWalk: 1 }, 427: { yukimaruSnowball: 0 },
  426: { penWalk: 0, penThrow: 1 }, 428: { penSnowball: 0 }, 429: { penSnowballPiece: 0 },
  // Egg Rocket's Oct, patrolling and shooting, and its shot
  433: { oct: 0, octShoot: 1 }, 436: { octShot: 0 },
  // Cosmic Angel's Mirror, walking and shooting, and its shot
  432: { mirror: 0, mirrorShoot: 1 }, 435: { mirrorShot: 0 },
};
// the item box (705), the icon that shows its prize (706: one variant per prize, the first five the
// characters' 1-ups), the shield (750), the magnetic shield (751) and invincibility's stars and their
// sparkles (752)
export const ITEM_ANIMATIONS = {
  705: { itemBox: 0 },
  706: { icon0: 0, icon4: 4, icon5: 5, icon6: 6, icon7: 7, icon8: 8, icon9: 9, icon10: 10 },
  750: { shield: 0 }, 751: { magneticShield: 0 }, 752: { stars: 0, starSparkle: 1 },
};
// Neo Green Hill's platforms: the thin one (463), which the falling and sinking ones and a ferris wheel's seat
// share, the trampoline at rest and bouncing (461), the bounce block (462) and the crumbling platform (904); and
// the rising platform (523), the same in every zone. Other zones have their own thin and sinking ones
// (levels.js `sprites`).
export const PLATFORM_ANIMATIONS = {
  463: { thinPlatform: 0, sinkingPlatform: 0, ferrisSeat: 0 }, 461: { trampoline: 0, trampolineBounce: 1 }, 462: { bounceBlock: 0 },
  904: { crumblingPlatform: 0 }, 523: { risingPlatform: 0 },
};
// a ferris wheel's seat (463; other levels have their own, levels.js `sprites`), hub (530) and spokes (531)
export const FERRIS_WHEEL_ANIMATIONS = { 530: { ferrisHub: 0 }, 531: { ferrisSpoke: 0 } };
// the boulders (458), Angel Island's rolling ones (457), and the small and large pieces a broken one leaves (459, 460)
export const ROCK_ANIMATIONS = { 457: { fallingBoulder: 0 }, 458: { rock: 0 }, 459: { rockDebrisSmall: 0 }, 460: { rockDebrisLarge: 0 } };
// Ice Mountain's objects: the block of ice (555) and the large and small pieces a broken one leaves (556, 557),
// and the underwater lava platform's pool (561), spurt (560) and platform (525)
export const ICE_MOUNTAIN_ANIMATIONS = {
  555: { iceBlock: 0 }, 556: { iceShardsLarge: 0 }, 557: { iceShardsSmall: 0 },
  561: { lava: 0 }, 560: { lavaSpurt: 0 }, 525: { lavaPlatform: 0 },
};
// the breakable wall (559); some levels have their own (levels.js `sprites`)
export const WALL_ANIMATIONS = { 559: { breakableWall: 0 } };
// the moving spring at rest and throwing (540); Ice Mountain has its own (levels.js `sprites`)
export const MOVING_SPRING_ANIMATIONS = { 540: { movingSpring: 0, movingSpringLaunch: 1 } };
// the square platform (494); other zones have their own, and some a longer one too (levels.js `sprites`)
export const SQUARE_PLATFORM_ANIMATIONS = { 494: { squarePlatform: 0 } };
// the iron ball (510); Angel Island has its own (levels.js `sprites`)
export const IRON_BALL_ANIMATIONS = { 510: { ironBall: 0 } };
// the rollers along a conveyor belt (kind 99): wide and slim, two variants each; act 1s use 508 and 509 (act 2s
// 604 and 603, which no act built so far needs)
export const CONVEYOR_OBJECT_ANIMATIONS = { 508: { conveyorWide: 0, conveyorWideB: 1 }, 509: { conveyorSlim: 0, conveyorSlimB: 1 } };
// Egg Rocket's spiked barrel (516): spikes on top, turning, underneath, turning back
export const SPIKED_BARREL_ANIMATIONS = { 516: { spikedBarrel: 0, spikedBarrel1: 1, spikedBarrel2: 2, spikedBarrel3: 3 } };
// Egg Rocket's propeller (515)
export const PROPELLER_ANIMATIONS = { 515: { propeller: 0 } };
// the splash at Sonic's feet in a waterfall
export const WATER_ANIMATIONS = { 464: { waterSplash: 0 } };
// an act's water: its surface (563) and the splash where Sonic goes in or out (581), the drowning countdown's
// numbers 5 to 0 (781), the small bubbles (753) and the groups of them (754), and the air bubbles' big bubble
// (532) and the spot they come out of (533)
export const UNDERWATER_ANIMATIONS = {
  563: { waterSurface: 0 }, 581: { surfaceHit: 0 },
  781: Object.fromEntries([0, 1, 2, 3, 4, 5].map(n => [`drownCountdown${n}`, 5 - n])),
  753: { bubblesSmall: 0 }, 754: { bubblesGroup: 0 }, 532: { airBubble: 0 }, 533: { bubbleMaker: 0 },
};
// the splash under Sonic on a forced slide, which a water bridge also shows under him, and the splash that
// stays at one end of a water bridge (473)
export const SLIDE_ANIMATIONS = { 474: { slideSplash: 0 }, 473: { bridgeSplash: 0 } };
// the leaves a shrub throws up as Sonic goes into it (467)
export const SHRUB_ANIMATIONS = { 467: { leaves: 0 } };
// the skating stone (547) and its large and small pieces (548, 549); Ice Mountain's are 529, 553 and 554
export const STONE_ANIMATIONS = {
  547: { skatingStone: 0 }, 548: { stoneDebrisLarge: 0 }, 549: { stoneDebrisSmall: 0 },
  529: { iceStone: 0 }, 553: { iceStoneDebrisLarge: 0 }, 554: { iceStoneDebrisSmall: 0 },
};
// the speed boosters (471): flat, on a slight slope up to the right, and up to the left; and on a steep slope
export const BOOSTER_ANIMATIONS = {
  471: { booster: 0, boosterSlightRight: 1, boosterSlightLeft: 2 }, 472: { boosterWall: 0 },
  571: { boosterSteep: 0 }, 570: { boosterSteep2: 0 },   // steep, turned counter-clockwise and clockwise
};
// Angel Island's torches (558), and Cosmic Angel's antigravity units, one (511) and two (512)
export const TORCH_ANIMATIONS = { 558: { torch: 0 }, 511: { antigravity: 0 }, 512: { antigravityDouble: 0 } };
// the checkpoints (452): waiting, spinning as Sonic passes (its script starts song 169, which the game plays,
// src/engine/checkpoints.js), and passed
export const CHECKPOINT_ANIMATIONS = { 452: { checkpoint: 0, checkpointSpin: 1, checkpointPassed: 2 } };
// the goal signpost (453): Eggman's face, and spinning once Sonic has passed it
export const GOAL_ANIMATIONS = { 453: { goal: 0, goalSpin: 1 } };
// the animation tables as one, by animation number: two tables that name variants of the same animation (X Zone's
// bosses and Egg Rocket's nuts and bolts both use 695 to 697) keep each other's names
const mergeAnimations = (...tables) => {
  const out = {};
  for (const t of tables) for (const [anim, variants] of Object.entries(t)) out[anim] = { ...out[anim], ...variants };
  return out;
};

// the nuts and bolts Egg Rocket's launch and stage separations rain down (gUnknown_080BB41C and
// gUnknown_080BB42C, 0x0B8424 in the USA ROM, pick a piece from these): three pieces, two variants each
export const NUTS_AND_BOLTS_ANIMATIONS = {
  695: { debris695: 0, debris695b: 1 }, 696: { debris696: 0, debris696b: 1 }, 697: { debris697: 0, debris697b: 1 },
};
// Neo Green Hill's wall pole (468): at rest, and bending as Sonic swings on it
export const POLE_ANIMATIONS = { 468: { wallPole: 0, wallPoleSwing: 1 } };
// the Egg Spider's (boss_4_egg_spider.c), and what bosses leave behind: the Egg Mobile and Eggman flying off in it (bosses_egg_mobile.c), the debris
// (gUnknown_080BB41C) and the explosions (sub_8017540)
export const BOSS_ANIMATIONS = {
  628: { eggSpider: 0, eggSpiderDrop: 1, eggSpiderStill: 2 }, 629: { eggSpiderEggman: 0, eggSpiderEggmanLaugh: 1, eggSpiderEggmanHit: 2 },
  626: { eggSpiderBody: 0 }, 627: { eggSpiderPart: 0, eggSpiderLeg: 1 }, 630: { icicle: 0 },
  693: { eggMobile: 0, eggMobileTurn: 1 },
  // X Zone's bosses (xbosses.js) name the same frames by number
  694: { eggman: 0, eggmanLaugh: 2, eggmanFlee: 4, eggmanFly: 6, eggmanTaunt: 7, eggmanTurn: 9, eggman0: 0, eggman4: 4, eggman6: 6, eggman8: 8, eggman9: 9 },
  // the Egg Ball's (boss_3_egg_ball.c): its pipes in the floor and the ceiling and in the walls, Eggman still,
  // laughing and wincing, the star disc it loses, the mobile and the spike ball
  593: { eggBallPipe: 0, eggBallPipeSide: 1 }, 622: { eggBallEggman: 0, eggBallEggmanLaugh: 1, eggBallEggmanHit: 2 },
  623: { eggBallStarDisc: 0 }, 624: { eggBallMobile: 0 }, 625: { eggBallSpikeBall: 0 },
  695: { boltMedium: 0, boltMedium2: 1, debrisMid0: 0, debrisMid1: 1 }, 696: { boltLarge: 0, boltLarge2: 1, debrisLarge0: 0, debrisLarge1: 1 },
  697: { boltSmall: 0, boltSmall2: 1, debrisSmall0: 0, debrisSmall1: 1 },
  611: { bossExplosion: 0 },
};
// X Zone's Egg Wrecker: its ship (684), Eggman in it at rest, laughing and hurt (686), the ship's flame, the
// hook and a chain link (683), and the ball (685)
export const EGG_WRECKER_ANIMATIONS = {
  684: { eggWreckerMobile: 0 },
  686: { eggWreckerEggman0: 0, eggWreckerEggman1: 1, eggWreckerEggman2: 2 },
  683: { eggWreckerFlame: 0, eggWreckerHook: 1, eggWreckerLink: 2 },
  685: { eggWreckerBall: 0 },
};
// X Zone's Egg Drillster: its car (682), Eggman in it at rest, laughing and hurt (680), its drill (679) and
// its four wheels (681)
export const EGG_DRILLSTER_ANIMATIONS = {
  682: { eggDrillster: 0 },
  680: { drillsterEggman0: 0, drillsterEggman1: 1, drillsterEggman2: 2 },
  679: { drillsterDrill: 0 },
  681: { drillsterWheel0: 0, drillsterWheel1: 1, drillsterWheel2: 2, drillsterWheel3: 3 },
};
// X Zone's Egg X: the machine (687), its rotary arm (688: a variant for each turn and pose, two sprites a
// pose), its claw open, shooting out and closing (689), a chain ball and a bouncing ball (690), and Eggman in
// it at rest, laughing, hurt and laughing at Sonic (691)
export const EGG_X_ANIMATIONS = {
  687: { eggX: 0 },
  688: Object.fromEntries(Array.from({ length: 20 }, (_, v) => [`eggXArm${v}`, v])),
  689: { eggXHand0: 0, eggXHand1: 1, eggXHand2: 2 },
  690: { eggXBall0: 0, eggXBall1: 1 },
  691: { eggXEggman0: 0, eggXEggman1: 1, eggXEggman2: 2, eggXEggman3: 3 },
};
// Neo Green Hill's boss, the Egg Hammer Tank (boss_1_egg_hammer_tank.c): its body on its two alternating scripts and
// without its belt, an arm segment, the hammer, Eggman (still, laughing, hurt) and the belt's four pieces
export const EGG_HAMMER_TANK_ANIMATIONS = {
  607: { hammerTank: 1, hammerTank2: 2 }, 608: { hammerTankArm: 0 }, 609: { hammerTankHammer: 0 },
  610: { hammerTankEggman: 0, hammerTankEggmanLaugh: 1, hammerTankEggmanHurt: 2 }, 612: { hammerTankBeaten: 0 },
  613: { hammerTankBelt0: 0 }, 614: { hammerTankBelt1: 0 }, 615: { hammerTankBelt2: 0 }, 616: { hammerTankBelt3: 0 },
};
// the capsule a beaten boss leaves (bosses_misc.c): small while it rises, then full size shut, opening and open,
// its switch, a half of its shell, and the animals inside: each zone's two hopping kinds (gUnknown_080BB43C,
// besides the kangaroo the enemies already let out) and the birds every zone shares
export const CAPSULE_ANIMATIONS = {
  578: { capsuleSmall: 0 }, 575: { capsule: 0, capsuleOpening: 1, capsuleOpen: 2 }, 576: { capsuleSwitch: 0 },
  577: { capsuleShell: 0 }, 438: { animalGorilla: 0 }, 439: { animalPeacock: 0 }, 443: { animalPenguin: 0 },
  444: { animalRabbit: 0 }, 446: { animalDeer: 0 }, 447: { animalSkunk: 0 }, 448: { animalRobin: 0 }, 442: { animalParrot: 0 },
};
// the special spring (specialspring.js): waiting, and its launch
export const SPECIAL_SPRING_ANIMATIONS = { 572: { specialSpring: 1, specialSpringLaunch: 0 } };
// the hook rail's hook (504; Ice Mountain's is 569), and Secret Base's swinging hook
export const HOOK_RAIL_ANIMATIONS = { 504: { hookRail: 0, swingingHook: 1 } };
// the marble tracks' entrance and exit (488)
export const MARBLE_TRACK_ANIMATIONS = { 488: { marbleTrackExit: 0 } };
// the security gate's shutter (534)
export const SECURITY_GATE_ANIMATIONS = { 534: { securityGate: 0 } };
// the swinging hook's chain (503: the trolley a crane claw runs on, a link and the anchor), and the crane claw
// (498: open, closing, opening, and a piece of its cable)
export const HOOK_ANIMATIONS = {
  503: { craneTrolley: 0, hookLink: 1, hookAnchor: 2 },
  498: { craneClaw: 0, craneClawClose: 1, craneClawOpen: 2, craneCable: 3 },
};
// the tubes' pipe ends (pipe.c): entrances and exits standing up and lying across, the other levels' and zone 6's
// two acts' own (Cosmic Angel, Egg Rocket); and Cosmic Angel's air corners (maze_air_corner.c)
export const PIPE_ANIMATIONS = {
  589: { pipeV: 0, pipeExitV: 1 }, 588: { pipeH: 0, pipeExitH: 1 },
  591: { pipeVCosmic: 0, pipeExitVCosmic: 1 }, 590: { pipeHCosmic: 0, pipeExitHCosmic: 1 },
  584: { pipeVRocket: 0 }, 585: { pipeExitVRocket: 0 }, 586: { pipeHRocket: 0 }, 587: { pipeExitHRocket: 0 },
  592: { airCorner: 0 },
};
// Secret Base act 2's steam exhaust: the vent and its lid (501), and the vent blowing steam and the steam's end (567)
export const STEAM_EXHAUST_ANIMATIONS = { 501: { steamExhaust: 0, steamExhaustLid: 2 }, 567: { steamExhaustBlow: 0, steamExhaustBlowEnd: 1 } };
// Secret Base's boss, the Egg Press (boss_2_egg_press.c)
export const EGG_PRESS_ANIMATIONS = {
  617: { eggPressBase: 0 }, 618: { eggPressEggman: 0, eggPressEggmanLaugh: 1, eggPressEggmanHurt: 2 }, 619: { eggPressSpring: 0 },
  620: { eggPress: 0, eggPressSquash: 1, eggPressStomp: 2 }, 621: { eggPressNoSpring: 0 },
};
// the animations whose frames' first OAM entry (their dimensions' oamIndex) the game reads: the Egg Press's
// and the Egg Spider's, which place Eggman by it
const OAM_INDEXED = new Set([620, 628]);
// Casino Paradise's red flag (469): at rest, and waving as Sonic swings round it
export const RED_FLAG_ANIMATIONS = { 469: { redFlag: 0, redFlagTug: 1 } };
// Casino Paradise's ship swing: the ship (491, half of it, drawn twice), the hook (490) and a link of its chain (489)
export const SHIP_SWING_ANIMATIONS = { 491: { shipSwing: 0 }, 490: { shipSwingHook: 0 }, 489: { shipSwingLink: 0 } };
// the spiked platforms: Casino Paradise's (521), and every other zone's, spikes up (538) and down (539)
export const SPIKED_PLATFORM_ANIMATIONS = { 521: { spikedPlatform: 0 }, 538: { spikedPlatformUp: 0 }, 539: { spikedPlatformDown: 0 } };
// zone 3's bowl (486), whose two frames turn faster as it spins
export const BOWL_ANIMATIONS = { 486: { bowl: 0 } };
// zone 3's carousel (487), whose frames turn faster as it spins, and its pole (583)
export const CAROUSEL_ANIMATIONS = { 487: { carousel: 0 }, 583: { carouselPole: 0 } };
// zone 3's panel gates: the one Sonic runs through (496: shut, and spinning open) and the one he falls through
// (497: spinning open, and shut)
export const PANEL_GATE_ANIMATIONS = { 496: { panelGate: 0, panelGateOpen: 1 }, 497: { panelGateFloorOpen: 0, panelGateFloor: 1 } };
// the fireworks in Casino Paradise's background, big and small (482, 483)
export const BACKGROUND_ANIMATIONS = { 482: { firework: 0 }, 483: { fireworkSmall: 0 } };
// Casino Paradise's party balloons (479 blue, 480 red, 481 yellow): whole, and bursting
export const BALLOON_ANIMATIONS = {
  479: { balloonBlue: 0, balloonBluePop: 1 }, 480: { balloonRed: 0, balloonRedPop: 1 }, 481: { balloonYellow: 0, balloonYellowPop: 1 },
};
// Casino Paradise's bumpers: the big right-angled one (475), the small triangles lying (476) and standing (477),
// the hexagon (484) and the round one (485)
export const BUMPER_ANIMATIONS = {
  475: { bumperRightAngle: 0 }, 476: { bumperTriH: 0 }, 477: { bumperTriV: 0 }, 484: { bumperHexagon: 0 }, 485: { bumperRound: 0 },
};
// the flippers (478): lying, idle and flipping, and standing, idle and flipping; the small blue one in the
// marble tracks (522), idle and flipping
export const FLIPPER_ANIMATIONS = {
  478: { flipper: 0, flipperFlip: 1, flipperStanding: 2, flipperStandingFlip: 3 }, 522: { blueFlipper: 0, blueFlipperFlip: 1 },
};
// the SEGA SONIC letters (492): four variants for each of its eight letters, named by their number as the
// letters pick them (letter × 4 + 0..3)
export const LETTER_ANIMATIONS = { 492: Object.fromEntries(Array.from({ length: 32 }, (_, v) => [`segaLetter${v}`, v])) };
// the small Barrel of Doom (493)
export const BARREL_ANIMATIONS = { 493: { barrelMini: 0 } };
// Angel Island Zone's carriers: the run wheel turning back and forward (542), the lift's handle and a link of
// its chain (545) (the bowl's look, 546, is Angel Island's `sprites` in levels.js)
export const CARRIER_ANIMATIONS = { 542: { runWheelBack: 0, runWheel: 1 }, 545: { liftHandle: 1, liftChain: 0 } };
// the three kinds of debris rising in Angel Island Zone's whirlwinds (564 to 566)
export const UPDRAFT_ANIMATIONS = { 564: { debrisA: 0 }, 565: { debrisB: 0 }, 566: { debrisC: 0 } };
// Cosmic Angel's boss, the Egg Snake (boss_6_egg_snake.c): a segment of its body, Eggman in its head (open,
// laughing, hit; then the same with the head shut), the spikes it loses, its head (closing, opening, open, shut),
// the laser's flash and its shot
export const EGG_SNAKE_ANIMATIONS = {
  659: { eggSnakeSegment: 0 },
  660: { eggSnakeEggmanOpen: 0, eggSnakeEggmanOpenLaugh: 1, eggSnakeEggmanOpenHit: 2, eggSnakeEggman: 3, eggSnakeEggmanLaugh: 4, eggSnakeEggmanHit: 5 },
  661: { eggSnakeSpike: 0 }, 662: { eggSnakeClose: 0, eggSnakeOpen: 1, eggSnakeOpened: 2, eggSnakeHead: 3 },
  663: { eggSnakeLaser: 0 }, 664: { eggSnakeShot: 0 },
};
// GAME OVER and CONTINUE? (715): each word in two halves, drawn through the rotation hardware as they turn
export const GAME_OVER_ANIMATIONS = { 715: { gameOverLeft: 0, gameOverRight: 1, continueLeft: 2, continueRight: 3 } };
// the ring all rings share (animation 707) and the sparkle left where one is collected (708); the sparkle's
// script starts song 117 itself, which the game plays (src/engine/game.js)
export const RING_ANIMATIONS = { ring: [707, 0], ringSparkle: [708, 0] };
// each boss's animations, by animation, for the act that has it (levels.js `boss`)
export const LEVEL_BOSS_ANIMATIONS = {
  // Mecha Knuckles (boss_5_mecha_knuckles.c): its first phase (631–643) and second (644–657), the rocket and the
  // parts it breaks into, the Egg Mobile (693) with Eggman in it (694), and the explosions it and its rocket leave
  mechaKnuckles: {
    631: { mkActivate: 0, mkActivateEnd: 1 }, 632: { mkIdle: 0 }, 634: { mkHit: 0 }, 635: { mkGround: 0 },
    636: { mkSpin: 0 }, 637: { mkSpinDash: 0 }, 638: { mkGlide: 0 }, 640: { mkLand: 0, mkLandEnd: 1 }, 642: { mkCover: 0 },
    643: { mkPunch: 0, mkPunchEnd: 1 }, 644: { mkIdleB: 0 }, 646: { mkHitB: 0 }, 648: { mkSpinB: 0 }, 649: { mkSpinDashB: 0 },
    650: { mkGlideB: 0 }, 652: { mkLandB: 0, mkLandEndB: 1 }, 654: { mkCoverB: 0 }, 655: { mkLaunch: 0, mkLaunchEnd: 1 },
    656: { mkRocket: 0 }, 657: { mkDefeated: 0, mkDefeatedEnd: 1 }, 658: { mkPart0: 0, mkPart1: 1, mkPart2: 2, mkPart3: 3, mkPart4: 4 },
    693: { eggMobile: 0, eggMobileEnd: 1 }, 694: { eggmanSeated: 3, eggmanTurn: 6, eggmanLaugh: 9 },
    611: { explosion: 0 },
  },
};
const bossSprites = boss => Object.fromEntries(Object.entries(LEVEL_BOSS_ANIMATIONS[boss] ?? {})
  .flatMap(([anim, variants]) => Object.entries(variants).map(([name, v]) => [name, [Number(anim), v]])));
// the weaker up springs are yellow: they skip the animation's red palette (33) and draw with sprite
// palette 36 in the next OBJ palette slot
const YELLOW_SPRING_PALETTE = 36;
// the animations drawn through the rotation hardware: Sonic walking and running (and thrown up by a bounce
// block, and carried through a marble track), the boulders' and the ice blocks' debris, the Egg Ball's star disc, Secret Base's swinging
// hook, the Egg Hammer Tank's arm, hammer and belt, and the capsule rising, its shell and the birds circling it, and the Egg Press's spring and base;
// the skating stones' debris, and the bubbles Sonic lets out under water and the drowning countdown's numbers,
// which grow to full size, and the game over's words; their frames also keep their OAM pieces as the hardware reads them
const ROTATED = new Set(['walk', 'run', 'bounce', 'marbleTrack', 'rockDebrisSmall', 'rockDebrisLarge', 'iceShardsSmall', 'iceShardsLarge', 'swingingHook',
  'hammerTankArm', 'hammerTankHammer', 'hammerTankBelt0', 'hammerTankBelt1', 'hammerTankBelt2', 'hammerTankBelt3',
  'capsuleSmall', 'capsuleShell', 'animalRobin', 'animalParrot', 'eggPressSpring', 'eggPressBase', 'eggBallStarDisc',
  'stoneDebrisSmall', 'stoneDebrisLarge', 'iceStoneDebrisSmall', 'iceStoneDebrisLarge',
  'bubblesSmall', 'bubblesGroup', ...[0, 1, 2, 3, 4, 5].map(n => `drownCountdown${n}`),
  'eggSpiderPart', 'eggSpiderLeg',
  'mkRocket', 'mkPart0', 'mkPart1', 'mkPart2', 'mkPart3', 'mkPart4', 'eggSnakeSpike',
  'grabbed', 'eggXHand0', 'eggXHand1', 'eggXHand2', 'eggXBall0',
  ...Object.keys(GAME_OVER_ANIMATIONS[715])]);
// the sprite palette that fills the whole OBJ palette when an act with water starts, and that the colours
// under water are made from (LoadPalette423Anim, InitWaterPalettes)
const UNDERWATER_OBJ_PALETTE = 423;

// each level's three tilemap entries: the front layer (drawn over Sonic), the back layer (behind him) and the
// background
const MAP = { front: 0, back: 1, background: 2 };
// the most palette states the atlas is rendered for; past that, the layers are kept as colour indices and
// drawn through the palette the animations have loaded (Cosmic Angel's eight animations have 972,000)
const MAX_PALETTE_VARIANTS = 64;
// past this many states of the palette animations a level's metatiles are kept as colour indices
const MAX_ATLAS_PALETTES = 16;

/**
 * Identifies and decodes `buffer`, with the zone of level `level` (levels.js) from that level on: its acts, each
 * with its title card and its results. `onProgress(message)` reports each stage, and is awaited, so it can let
 * the page draw the message before the next stage.
 * @returns {Promise<object>} { info, sprites: { atlas, frames, anims, tiles, sonic, alts }, hud: { sheet, glyphs, ring, face }, gameOver: { sheet, digits, ok, box, voices, hudSheet, song, songFrames }, acts, first, stage, titleCard, physics, sound }, where `acts[level]` is { level, stage, titleCard, results, anims } for each act decoded (`anims` the animations that act draws its own way), `first` the level asked for, and stage and titleCard are its; each act's stage is { level, zone, act, music, backgroundScroll, hudFlash, width, height, layers, atlas, collision, spawn, loop, interactables, layerToggles, rings, itemBoxes, enemies, entityRegions, paletteAnimations, background, backgroundHoles, backdrop, backgrounds }, its titleCard { sheet, slots, text } and its results { sheet, slots, text }
 */
export async function extractAssets(buffer, onProgress = () => {}, { level = 0 } = {}) {
  const info = levelInfo(level);
  const rom = new Rom(buffer);
  await onProgress('Checking the ROM…');
  const id = await identify(rom);
  await onProgress(id.known ? `Found ${id.known.name}.` : 'Unrecognized version, searching for the data…');
  const offsets = locateTables(rom, id.known);

  await onProgress('Decoding Sonic…');
  const tables = spriteTables(rom, offsets.spriteTables);
  // the zone's acts from `level` on, which share the zone's looks for the objects that differ by level
  const levels = Object.keys(LEVELS).map(Number).filter(l => l >= level && LEVELS[l].zone === info.zone).sort((a, b) => a - b);
  // the zone's water, which its acts share
  const water = levels.map(l => LEVELS[l].water).find(Boolean);
  // the acts' sprites; one the zone's acts draw differently (Egg Rocket's square platforms and Cosmic Angel's)
  // is also read for each act as `name@level`, which that act's `anims` puts in its place
  const actSprites = levels.map(l => ({ ...LEVELS[l].sprites, ...bossSprites(LEVELS[l].boss) }));
  const differs = [...new Set(actSprites.flatMap(Object.keys))]
    .filter(name => new Set(actSprites.filter(a => name in a).map(a => a[name].join())).size > 1);
  const own = (i, l) => differs.filter(name => name in actSprites[i]).map(name => [name, `${name}@${l}`]);
  const sprites = extractSprites(rom, tables, water, Object.assign({}, ...actSprites,
    ...levels.map((l, i) => Object.fromEntries(own(i, l).map(([name, key]) => [key, actSprites[i][name]])))));
  const acts = [];
  for (const [i, l] of levels.entries()) {
    const act = levelInfo(l);
    await onProgress(`Decoding ${act.name}…`);
    acts[l] = {
      level: l,
      stage: extractStage(rom, offsets, tables, act),
      titleCard: { ...sheet(titleCardGraphics(rom, offsets.uiGraphics, offsets.titleCard, l), act.water), level: l },
      results: sheet(resultsGraphics(rom, offsets.uiGraphics, offsets.titleCard, l)),
      anims: Object.fromEntries(own(i, l).map(([name, key]) => [name, sprites.anims[key]])),
    };
  }
  // nine release speeds, then the nine of the alternate table right after them: a charge past 8.0
  // indexes into those in the original, so both are read
  const spinDashSpeeds = Array.from({ length: 18 }, (_, i) => rom.s16(offsets.spinDashSpeeds + i * 2) / 256);

  return {
    info: { ...id.header, region: id.region, sha1: id.sha1, version: id.known?.name ?? null, offsets },
    sprites, acts, first: level, stage: acts[level].stage, titleCard: acts[level].titleCard, physics: { spinDashSpeeds },
    hud: extractHud(rom, offsets.uiGraphics, water),
    gameOver: extractGameOver(rom, offsets),
    // where the songs are; the sound engine reads them from the ROM itself
    sound: soundLayout(rom, offsets.musicPlayers),
  };
}

/**
 * Every animation's frames on one atlas. In an act with `water` they are drawn a second time, on an atlas with
 * the same layout, in the colours under the water line: palette 423 in the water's colours, whatever palette
 * the animation loads above it (`under`), and a third time in their own colours in the water's (`underOwn`).
 * `levelSprites` { name: [anim, variant] } are the level's own looks for objects whose animation the ROM picks
 * by level; they replace the default of the same name.
 */
function extractSprites(rom, tables, water, levelSprites = {}) {
  const sonicPalette = animationPalette(rom, tables, SONIC_ANIMATIONS.idle[0]);
  const springPalette = animationPalette(rom, tables, SPRING_ANIM);
  const yellowPalette = springPalette.slice();
  readColors(rom, tables.palettes + YELLOW_SPRING_PALETTE * 32, 16).forEach((c, i) => { yellowPalette[112 + i] = c; });
  const yellow = { springUpYellow: OBJECT_ANIMATIONS.springUp, springUpYellowLaunch: OBJECT_ANIMATIONS.springUpLaunch };
  const under = water && readColors(rom, tables.palettes + UNDERWATER_OBJ_PALETTE * 32, 256).map(c => tintRgb(c, water.blend));
  // the yellow springs are drawn from the next OBJ palette slot, which the extractor's palette has in this one
  const underYellow = under && [...under.slice(0, 112), ...under.slice(128, 144), ...under.slice(128)];
  const groups = [
    { list: { ...SONIC_ANIMATIONS, ...EFFECT_ANIMATIONS }, palette: sonicPalette },
    { list: OBJECT_ANIMATIONS, palette: springPalette },
    { list: yellow, palette: yellowPalette, skipPalette: true, under: underYellow },
    { list: RING_ANIMATIONS, palette: animationPalette(rom, tables, RING_ANIMATIONS.ring[0]) },
    { list: SPIKE_ANIMATIONS, palette: animationPalette(rom, tables, SPIKES_ANIM) },
    ...Object.entries(mergeAnimations(ENEMY_ANIMATIONS, ITEM_ANIMATIONS, PLATFORM_ANIMATIONS, ROCK_ANIMATIONS, ICE_MOUNTAIN_ANIMATIONS, NUTS_AND_BOLTS_ANIMATIONS, EGG_SNAKE_ANIMATIONS, EGG_WRECKER_ANIMATIONS, EGG_DRILLSTER_ANIMATIONS, EGG_X_ANIMATIONS, CONVEYOR_OBJECT_ANIMATIONS, SPIKED_BARREL_ANIMATIONS, PROPELLER_ANIMATIONS, CARRIER_ANIMATIONS, IRON_BALL_ANIMATIONS, TORCH_ANIMATIONS, UPDRAFT_ANIMATIONS, WALL_ANIMATIONS, WATER_ANIMATIONS, SLIDE_ANIMATIONS, SHRUB_ANIMATIONS, BOOSTER_ANIMATIONS, CHECKPOINT_ANIMATIONS, POLE_ANIMATIONS, GOAL_ANIMATIONS, BOSS_ANIMATIONS, EGG_HAMMER_TANK_ANIMATIONS, CAPSULE_ANIMATIONS, SPECIAL_SPRING_ANIMATIONS, STEAM_EXHAUST_ANIMATIONS, EGG_PRESS_ANIMATIONS, HOOK_RAIL_ANIMATIONS, SECURITY_GATE_ANIMATIONS, HOOK_ANIMATIONS, MARBLE_TRACK_ANIMATIONS, PIPE_ANIMATIONS, MOVING_SPRING_ANIMATIONS, STONE_ANIMATIONS, (water ? UNDERWATER_ANIMATIONS : {}), BACKGROUND_ANIMATIONS, BALLOON_ANIMATIONS, BARREL_ANIMATIONS, BOWL_ANIMATIONS, BUMPER_ANIMATIONS, CAROUSEL_ANIMATIONS, FERRIS_WHEEL_ANIMATIONS, FLIPPER_ANIMATIONS, LETTER_ANIMATIONS, PANEL_GATE_ANIMATIONS, RED_FLAG_ANIMATIONS, SHIP_SWING_ANIMATIONS, SPIKED_PLATFORM_ANIMATIONS, SQUARE_PLATFORM_ANIMATIONS, GAME_OVER_ANIMATIONS)).map(([anim, variants]) => ({
      list: Object.fromEntries(Object.entries(variants).map(([name, v]) => [name, [Number(anim), v]])),
      palette: animationPalette(rom, tables, Number(anim)),
    })),
  ];
  for (const group of groups) group.list = Object.fromEntries(Object.entries(group.list).filter(([name]) => !(name in levelSprites)));
  for (const [name, [anim, variant]] of Object.entries(levelSprites)) {
    groups.push({ list: { [name]: [anim, variant] }, palette: animationPalette(rom, tables, anim) });
  }

  // `made[i]` is how atlas entry i was drawn, and `rows` the sprite palette rows its animation loads
  const images = [], byKey = new Map(), anims = {}, made = [], rowKeys = new Map();
  const frameImage = (name, anim, f, palette, rows, under) => {
    // identical frames (same layout, tiles and palette) share one atlas entry
    const key = `${anim}:${f.frame}:${f.tilesAt}:${palette.join()}`;
    if (!byKey.has(key)) {
      const src = [rom, tables, anim, f.frame, f.tilesAt, palette, f.eightBpp];
      const { img, layout } = renderFrame(...src);
      byKey.set(key, images.length);
      // how it was drawn, `src`, to be drawn again in the colours under water
      images.push({ img, anchorX: layout.anchorX, anchorY: layout.anchorY, src, under });
      made.push({ name, anim, f, palette, rows, under });
    }
    const image = images[byKey.get(key)];
    if (ROTATED.has(name) && !image.pieces) image.pieces = framePieces(rom, tables, anim, f.frame, f.tilesAt, palette, f.eightBpp);
    return byKey.get(key);
  };
  for (const { list, palette, skipPalette, under: groupUnder = under } of groups) {
    for (const [name, [anim, variant]] of Object.entries(list)) {
      const script = animationFrames(rom, tables, anim, variant, palette, { skipPalette });
      const rows = new Set(script.frames.flatMap(f => f.loads.flatMap(paletteRows)).map(([row, key]) => {
        if (!rowKeys.has(row)) rowKeys.set(row, new Set());
        rowKeys.get(row).add(key);
        return row;
      }));
      const frames = script.frames.map(f => {
        if (f.frame < 0) return [-1, f.delay];
        const i = frameImage(name, anim, f, f.palette, rows, groupUnder);
        // the hitboxes and the OAM order set just before a frame come with it
        if (f.order !== null) return [i, f.delay, f.boxes, f.order];
        return f.boxes ? [i, f.delay, f.boxes] : [i, f.delay];
      });
      // the frames whose commands load colours, and whether going round does (animator.js)
      anims[name] = { frames, loop: script.loop, loads: script.frames.map(f => f.loads.length > 0), loopLoads: script.loopLoads.length > 0 };
      // the sprite palette rows each frame's loads set, and those going round sets again ([row, key])
      const rowLoads = Object.fromEntries(script.frames.map((f, i) => [i, f.loads.flatMap(paletteRows)]).filter(([, l]) => l.length));
      if (Object.keys(rowLoads).length) anims[name].rows = rowLoads;
      if (script.loopLoads.length) anims[name].loopRows = script.loopLoads.flatMap(paletteRows);
      // the sprite priority each frame's script has set (only Sonic's swing round a rope sets one)
      if (script.frames.some(f => f.priority !== null)) anims[name].prio = script.frames.map(f => f.priority);
      if (OAM_INDEXED.has(anim)) anims[name].oamIndex = script.frames.map(f => (f.frame < 0 ? -1 : frameLayout(rom, tables, anim, f.frame).oamIndex));
    }
  }
  // Where animations load different colours into the same row, the screen shows the row as the last load left
  // it (animCmd_GetPalette writes gObjPalette, which VBlank uploads), so each frame of theirs is also drawn in
  // the others' colours: alts[i] lists [row, key, atlas entry] for the ones that look different.
  const alts = {}, drawn = made.length;
  for (const [row, keys] of rowKeys) {
    if (keys.size < 2) continue;
    for (const key of keys) {
      const colors = readColors(rom, tables.palettes + (key >> 8) * 32 + (key & 0xFF) * 2, 16);
      for (let i = 0; i < drawn; i++) {
        const m = made[i];
        if (!m.rows.has(row)) continue;
        const palette = m.palette.slice();
        colors.forEach((c, k) => { palette[row * 16 + k] = c; });
        const j = frameImage(m.name, m.anim, m.f, palette, m.rows, m.under);
        if (j === i) continue;
        if (images[j].img.data.every((v, k) => v === images[i].img.data[k])) continue;
        (alts[i] ??= []).push([row, key, j]);
      }
    }
  }
  const redrawn = new Map(), redraw = i => {
    if (!redrawn.has(i)) {
      const { src, under: colors } = images[i], again = [...src.slice(0, 5), colors, src[6]];
      redrawn.set(i, { img: renderFrame(...again).img, pieces: images[i].pieces && framePieces(...again) });
    }
    return redrawn.get(i);
  };
  // the crumbling platform draws its 64 × 32 frame as 32 tiles of 8 × 8, and the breakable wall its 32 × 64
  // one, left to right and top to bottom, each from its top left corner
  const tiles = Object.fromEntries(['crumblingPlatform', 'breakableWall'].map(name => {
    const whole = anims[name].frames[0][0], { width, height } = images[whole].img, across = width >> 3;
    return [name, Array.from({ length: across * (height >> 3) }, (_, i) => {
      const cut = img => cutTile(img, (i % across) * 8, Math.floor(i / across) * 8);
      images.push({ img: cut(images[whole].img), anchorX: 0, anchorY: 0, redraw: () => cut(redraw(whole).img) });
      return images.length - 1;
    })];
  }));
  // a rotated frame's pieces go into the atlas after the frames, and its rect gets them as [x, y, w, h, atlasX, atlasY]
  const pieces = images.flatMap((image, i) => (image.pieces ?? []).map((p, k) => ({ img: p.img, frame: i, x: p.x, y: p.y, redraw: () => redraw(i).pieces[k].img })));
  const all = [...images, ...pieces], { canvas, rects } = packAtlas(all);
  const underAtlas = under && paintAtlas(canvas.width, canvas.height, rects, all.map((image, i) => (image.redraw ? image.redraw() : redraw(i).img)));
  // and once the Egg Spider's task copies the OBJ palette as it is every frame, each in its own colours, in the
  // water's
  const underOwn = under && paintAtlas(canvas.width, canvas.height, [[0, 0]], [tintImage(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height), water.blend)]);
  pieces.forEach((p, k) => {
    const [ax, ay, w, h] = rects[images.length + k];
    (rects[p.frame][6] ??= []).push([p.x, p.y, w, h, ax, ay]);
  });
  rects.length = images.length;
  // Sonic's frames and his row of colours, for drawing them with colours written over (renderer.js), and in an
  // act with water his row under water, for another game's Sonic drawn there
  const sonic = {
    frames: [...new Set(Object.keys(SONIC_ANIMATIONS).flatMap(name => anims[name].frames.map(f => f[0]).filter(i => i >= 0)))],
    colors: sonicPalette.slice(0, 16), under: under ? under.slice(0, 16) : null,
  };
  return { atlas: canvas, under: underAtlas || null, underOwn: underOwn || null, frames: rects, anims, tiles, sonic, alts };
}

// the sprite palette rows a palette load fills, each as [row, key]: the key (palId * 256 + the colour of that
// palette the row starts at) names the colours it gets
function paletteRows({ palId, insert, count }) {
  const rows = [];
  for (let r = Math.ceil(insert / 16); (r + 1) * 16 <= insert + count && r < 16; r++) rows.push([r, palId * 256 + r * 16 - insert]);
  return rows;
}

// the 8 × 8 tile of `img` with its top left corner at (tx, ty)
function cutTile(img, tx, ty) {
  const out = new ImageData(8, 8);
  for (let y = 0; y < 8; y++) out.data.set(img.data.subarray(((ty + y) * img.width + tx) * 4, ((ty + y) * img.width + tx + 8) * 4), y * 32);
  return out;
}

// shelf packing with a 1px gap; rects are [x, y, w, h, anchorX, anchorY]
export function packAtlas(images, width = 512) {
  let x = 0, y = 0, shelf = 0;
  const rects = images.map(({ img, anchorX, anchorY }) => {
    if (x + img.width > width) { x = 0; y += shelf + 1; shelf = 0; }
    const rect = [x, y, img.width, img.height, anchorX, anchorY];
    x += img.width + 1; shelf = Math.max(shelf, img.height);
    return rect;
  });
  return { canvas: paintAtlas(width, y + shelf, rects, images.map(i => i.img)), rects };
}

// a w × h canvas with each of `imgs` at its rect
function paintAtlas(w, h, rects, imgs) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  imgs.forEach((img, i) => g.putImageData(img, rects[i][0], rects[i][1]));
  return canvas;
}

function extractStage(rom, offsets, tables, info) {
  const { level } = info;
  const front = tilemapHeader(rom, offsets.tilemaps, level * 3 + MAP.front);
  const back = tilemapHeader(rom, offsets.tilemaps, level * 3 + MAP.back);
  const background = tilemapHeader(rom, offsets.tilemaps, level * 3 + MAP.background);
  if (front.xTiles !== 12 || front.metatileMap === null || front.palette === null) {
    throw new Error(`${info.name}'s data is not where this version keeps it.`);
  }
  const collision = readCollision(rom, offsets.collision, level);
  if (collision.layers[0].length !== front.mapWidth * front.mapHeight || collision.levelX !== back.mapWidth) {
    throw new Error(`${info.name}'s collision does not match its map.`);
  }
  const palette = readColors(rom, front.palette, 256);
  const interactables = readInteractables(rom, offsets.interactables, level);
  const animations = info.paletteAnimations.map(a => paletteAnimation(rom, tables, ...[a].flat()));
  const count = collision.metatiles.length / 144;
  const layerBanks = mapBanks(rom, front, count * front.xTiles * front.yTiles);
  const skyBanks = mapBanks(rom, background, background.xTiles * background.yTiles);
  let clouds = null;
  if (info.clouds !== undefined) {
    // drawn with the stage's palette (its own isn't loaded), colour 0 transparent
    const map = tilemapHeader(rom, offsets.tilemaps, info.clouds);
    const v = paletteVariants(palette, animations, mapBanks(rom, map, map.xTiles * map.yTiles));
    clouds = { canvases: v.palettes.map(p => toCanvas(renderPlainMap(rom, map, p, true))), follows: v.follows };
  }
  const stage = {
    width: collision.width, height: collision.height, levelX: collision.levelX, levelY: collision.levelY,
    layers: { front: collision.layers[0], back: collision.layers[1] },
    animDelay: front.animDelay, collision,
    level, zone: info.zone, act: info.act, music: info.music, backgroundScroll: info.backgroundScroll ?? null,
    hudFlash: info.hudFlash ?? 1,
    spawn: readSpawn(rom, offsets.spawns, level),
    loop: readLoop(rom, offsets.loopPoints, offsets.loopShifts, level),
    interactables, layerToggles: layerToggles(interactables),
    rings: readRings(rom, offsets.rings, level),
    itemBoxes: readItemBoxes(rom, offsets.itemBoxes, level),
    enemies: readInteractables(rom, offsets.enemies, level, 'enemies'),
    entityRegions: entityRegions(rom, offsets.interactables, level),
    paletteAnimations: animations.map(({ frames, loop }) => ({ delays: frames.map(f => f.delay), loop })),
    backgroundHoles: mapHoles(rom, background), backdrop: palette[0],
    atlas: null, background: null, backgrounds: null, indexed: null,
    snow: info.snow === undefined ? null : snowLayer(rom, tilemapHeader(rom, offsets.tilemaps, info.snow), palette, animations),
    water: info.water ? waterColors(rom, info.water, background, palette, animations) : null,
    clouds,
  };
  if (variantCount(animations, layerBanks) > MAX_PALETTE_VARIANTS || variantCount(animations, skyBanks) > MAX_PALETTE_VARIANTS) {
    // the colours each animation frame loads, which the renderer applies over the stage's own
    const loads = animations.map(a => a.frames.map(f => f.loads.map(l => ({ insert: l.insert, colors: l.colors }))));
    stage.indexed = { palette, loads, metatiles: indexMetatiles(rom, front, count), background: indexPlainMap(rom, background) };
    stage.atlas = { slots: stage.indexed.metatiles.slots };
    return stage;
  }
  // the two layers share one tileset and its animated tiles, so one atlas serves both. With many states of the
  // palette animations, more than a canvas holds, or with water, whose line changes the colours partway down
  // the screen, it keeps the metatiles' colour indices instead, and the layers are coloured as they are drawn
  // (stage.js).
  const tiles = paletteVariants(palette, animations, layerBanks);
  stage.atlas = tiles.palettes.length > MAX_ATLAS_PALETTES || info.water
    ? { indexed: true, size: front.xTiles * 8, frames: metatileIndices(rom, front, count), palettes: tiles.palettes, follows: tiles.follows }
    : { ...renderMetatileAtlas(rom, front, tiles.palettes, count, tiles.varying), follows: tiles.follows };
  const sky = paletteVariants(palette, animations, skyBanks);
  stage.background = toCanvas(renderPlainMap(rom, background, palette));
  stage.backgrounds = { canvases: sky.palettes.map(p => toCanvas(renderPlainMap(rom, background, p))), follows: sky.follows };
  return stage;
}

// An act's water (CreateStageWaterTask): its line and colour, and what the screen below the line is drawn
// from. The background palette there is a copy of the whole one, under the state of the palette animations
// at the time it was made (`palettes`, indexed by `follows` as paletteVariants does), in the water's colours;
// the background, whose lines waver there, is kept as colour indices.
function waterColors(rom, water, background, palette, animations) {
  const { palettes, follows } = paletteVariants(palette, animations, new Set(Array.from({ length: 16 }, (_, r) => r)));
  return {
    level: water.level, blend: water.blend & 0xFFFF, palettes, follows,
    background: { width: background.xTiles * 8, height: background.yTiles * 8, indices: plainMapIndices(rom, background) },
  };
}

// Ice Mountain's falling snow (CreateStageBg_Zone4): a plain map over everything, whose tiles animate, in the
// stage palette's rows, which the palette animations step. Each of its animation frames is kept as colour
// indices, 0 where it is clear, with the palette under each state of those animations (`follows`).
function snowLayer(rom, header, palette, animations) {
  const { palettes, follows } = paletteVariants(palette, animations, mapBanks(rom, header, header.xTiles * header.yTiles));
  return {
    width: header.xTiles * 8, height: header.yTiles * 8, delay: header.animDelay,
    frames: Array.from({ length: Math.max(1, header.animFrameCount) }, (_, f) => plainMapIndices(rom, header, f)),
    palettes, follows,
  };
}

// how many palettes paletteVariants() would render for the rows in `banks`
const rowsOf = a => new Set(a.frames.flatMap(f => f.loads.flatMap(l => l.colors.map((_, i) => (l.insert + i) >> 4))));
function variantCount(animations, banks) {
  return animations.reduce((n, a) => ([...rowsOf(a)].some(r => banks.has(r)) ? n * (a.frames.length + 1) : n), 1);
}

/**
 * The stage palette under each state of the palette animations that load colours into the rows in `banks`:
 * its own colours, then those of each frame, which loads over the frames before it. The palettes are indexed
 * by the states of those animations (`follows`) in turn, the first the most significant (stage.js picks
 * one), and `varying` holds, for each of them, the rows it changes and its number of states.
 */
function paletteVariants(base, animations, banks) {
  const follows = [], varying = [];
  let palettes = [base];
  animations.forEach((a, k) => {
    const changes = [...rowsOf(a)].filter(r => banks.has(r));
    if (!changes.length) return;
    follows.push(k);
    varying.push({ rows: new Set(changes), radix: a.frames.length + 1 });
    palettes = palettes.flatMap(p => [p, ...a.frames.map((_, s) => {
      const q = p.slice();
      for (const f of a.frames.slice(0, s + 1)) for (const l of f.loads) l.colors.forEach((c, i) => { q[l.insert + i] = c; });
      return q;
    })]);
  });
  return { palettes, follows, varying };
}

// The HUD and the title card, and in an act with water their sheets in its colours (`under`): the HUD's
// palettes are the ones palette 423 has in their slots, and the card is coloured from its own while it shows.
function extractHud(rom, tableAt, water) {
  const { image, ...rects } = hudGraphics(rom, tableAt);
  return { sheet: toCanvas(image), under: water ? toCanvas(tintImage(image, water.blend)) : null, ...rects };
}

// the title card's or the results' graphics with their image as a canvas
function sheet({ image, ...rest }, water = null) {
  return { sheet: toCanvas(image), under: water ? toCanvas(tintImage(image, water.blend)) : null, ...rest };
}

// the game over's song (MUS_GAME_OVER): the screen waits for it to end before it leaves, so the sound engine
// plays it through here, without sound, to count its frames
const GAME_OVER_SONG = 37;
function extractGameOver(rom, offsets) {
  const { image, palette, ...rest } = gameOverGraphics(rom, offsets.uiGraphics, offsets.titleCard);
  const engine = createM4A(rom.bytes, soundLayout(rom, offsets.musicPlayers), createApu());
  engine.songStart(GAME_OVER_SONG);
  const player = engine.players.find(p => p.songHeader === engine.songHeader(GAME_OVER_SONG));
  let songFrames = 0;
  do { engine.frame(); songFrames++; } while ((player.status & 0xFFFF) !== 0 && songFrames < 60 * 60);
  return { sheet: toCanvas(image), ...rest, hudSheet: toCanvas(hudGraphics(rom, offsets.uiGraphics, palette).image), song: GAME_OVER_SONG, songFrames };
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
