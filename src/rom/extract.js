// Turns a Sonic Advance ROM into everything the engine draws: Sonic's animations, the dust effects, the
// springs, the spikes, the enemies, the item boxes, the platforms, the rings, the HUD, the title card, the act's
// results, Neo Green Hill Zone's two acts with their collision, objects, enemies and rings, and the zone's
// background. Runs entirely in the browser.

import { Rom } from './rom.js';
import { identify } from './identify.js';
import { locateTables } from './locate.js';
import { spriteTables, animationFrames, animationPalette, renderFrame, framePieces, paletteAnimation, frameLayout } from './sprites.js';
import { tilemapHeader, renderMetatileAtlas, renderPlainMap, mapBanks, mapHoles } from './tilemaps.js';
import { readCollision, readSpawn, readLoop } from './collision.js';
import { readInteractables, readItemBoxes, entityRegions, readRings, layerToggles } from './entities.js';
import { readColors } from './colors.js';
import { soundLayout } from './sound.js';
import { hudGraphics } from './hud.js';
import { titleCardGraphics } from './titlecard.js';
import { resultsGraphics } from './results.js';
import { levelInfo, LEVELS } from './levels.js';

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
  // hanging from a wall pole (charState 31)
  pole: [38, 0],
  // grinding (charState 16; variant 1 on a rail's steep parts) and jumping off a rail before its end (20)
  grind: [44, 0], grindSteep: [44, 1], railJump: [45, 0],
  // running up a half-pipe's side, higher with each (charStates 24, 25 and 26)
  halfPipeLow: [36, 0], halfPipeMid: [36, 1], halfPipeHigh: [36, 2],
  // running on past the goal (charState 28)
  actClearRun: [22, 0],
  // standing in his act-clear pose once the boss capsule opens (charState 29)
  actClearPose: [23, 0],
  // hanging from a hook rail, a swinging hook or a crane claw (charState 38) and swinging round a rope (34)
  hook: [43, 0], swingRope: [40, 1],
  // carried through a marble track, curled up and scaled (charState 32, drawn through the rotation hardware)
  marbleTrack: [39, 0],
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
};
// the item box (705), the icon that shows its prize (706: one variant per prize, the first five the
// characters' 1-ups), the shield (750), the magnetic shield (751) and invincibility's stars and their
// sparkles (752)
export const ITEM_ANIMATIONS = {
  705: { itemBox: 0 },
  706: { icon0: 0, icon4: 4, icon5: 5, icon6: 6, icon7: 7, icon8: 8, icon9: 9, icon10: 10 },
  750: { shield: 0 }, 751: { magneticShield: 0 }, 752: { stars: 0, starSparkle: 1 },
};
// Neo Green Hill's platforms: the thin one (463), which the falling one shares, the trampoline at rest and
// bouncing (461), the bounce block (462) and the crumbling platform (904)
export const PLATFORM_ANIMATIONS = {
  463: { thinPlatform: 0 }, 461: { trampoline: 0, trampolineBounce: 1 }, 462: { bounceBlock: 0 }, 904: { crumblingPlatform: 0 },
};
// the boulders (458), and the small and large pieces a broken one leaves (459, 460)
export const ROCK_ANIMATIONS = { 458: { rock: 0 }, 459: { rockDebrisSmall: 0 }, 460: { rockDebrisLarge: 0 } };
// Ice Mountain's objects: the block of ice (555) and the large and small pieces a broken one leaves (556, 557)
export const ICE_MOUNTAIN_ANIMATIONS = { 555: { iceBlock: 0 }, 556: { iceShardsLarge: 0 }, 557: { iceShardsSmall: 0 } };
// the breakable wall (559); some levels have their own (levels.js `sprites`)
export const WALL_ANIMATIONS = { 559: { breakableWall: 0 } };
// the splash at Sonic's feet in a waterfall
export const WATER_ANIMATIONS = { 464: { waterSplash: 0 } };
// the splash under Sonic on a forced slide, which a water bridge also shows under him, and the splash that
// stays at one end of a water bridge (473)
export const SLIDE_ANIMATIONS = { 474: { slideSplash: 0 }, 473: { bridgeSplash: 0 } };
// the leaves a shrub throws up as Sonic goes into it (467)
export const SHRUB_ANIMATIONS = { 467: { leaves: 0 } };
// the speed boosters (471): flat, on a slight slope up to the right, and up to the left
export const BOOSTER_ANIMATIONS = { 471: { booster: 0, boosterSlightRight: 1, boosterSlightLeft: 2 } };
// the checkpoints (452): waiting, spinning as Sonic passes (its script starts song 169, which the game plays,
// src/engine/checkpoints.js), and passed
export const CHECKPOINT_ANIMATIONS = { 452: { checkpoint: 0, checkpointSpin: 1, checkpointPassed: 2 } };
// the goal signpost (453): Eggman's face, and spinning once Sonic has passed it
export const GOAL_ANIMATIONS = { 453: { goal: 0, goalSpin: 1 } };
// Neo Green Hill's wall pole (468): at rest, and bending as Sonic swings on it
export const POLE_ANIMATIONS = { 468: { wallPole: 0, wallPoleSwing: 1 } };
// what bosses leave behind: the Egg Mobile and Eggman flying off in it (bosses_egg_mobile.c), the debris
// (gUnknown_080BB41C) and the explosions (sub_8017540)
export const BOSS_ANIMATIONS = {
  693: { eggMobile: 0, eggMobileTurn: 1 }, 694: { eggman: 0, eggmanLaugh: 2, eggmanFlee: 4, eggmanTurn: 9 },
  695: { boltMedium: 0, boltMedium2: 1 }, 696: { boltLarge: 0, boltLarge2: 1 }, 697: { boltSmall: 0, boltSmall2: 1 },
  611: { bossExplosion: 0 },
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
// the animations whose frames' first OAM entry (their dimensions' oamIndex) the game reads: the Egg Press's,
// which places Eggman by it
const OAM_INDEXED = new Set([620]);
// the ring all rings share (animation 707) and the sparkle left where one is collected (708); the sparkle's
// script starts song 117 itself, which the game plays (src/engine/game.js)
export const RING_ANIMATIONS = { ring: [707, 0], ringSparkle: [708, 0] };
// the weaker up springs are yellow: they skip the animation's red palette (33) and draw with sprite
// palette 36 in the next OBJ palette slot
const YELLOW_SPRING_PALETTE = 36;
// the animations drawn through the rotation hardware: Sonic walking and running (and thrown up by a bounce
// block, and carried through a marble track), the boulders' and the ice blocks' debris, Secret Base's swinging
// hook, the Egg Hammer Tank's arm, hammer and belt, and the capsule rising, its shell and the birds circling it, and the Egg Press's spring and base;
// their frames also keep their OAM pieces as the hardware reads them
const ROTATED = new Set(['walk', 'run', 'bounce', 'marbleTrack', 'rockDebrisSmall', 'rockDebrisLarge', 'iceShardsSmall', 'iceShardsLarge', 'swingingHook',
  'hammerTankArm', 'hammerTankHammer', 'hammerTankBelt0', 'hammerTankBelt1', 'hammerTankBelt2', 'hammerTankBelt3',
  'capsuleSmall', 'capsuleShell', 'animalRobin', 'animalParrot', 'eggPressSpring', 'eggPressBase']);

// each level's three tilemap entries: the front layer (drawn over Sonic), the back layer (behind him) and the
// background
const MAP = { front: 0, back: 1, background: 2 };

/**
 * Identifies and decodes `buffer`, with the zone of level `level` (levels.js) from that level on: its acts, each
 * with its title card and its results. `onProgress(message)` reports each stage, and is awaited, so it can let
 * the page draw the message before the next stage.
 * @returns {Promise<object>} { info, sprites: { atlas, frames, anims, tiles, sonic, alts }, hud: { sheet, glyphs, ring, face }, acts, first, stage, titleCard, physics, sound }, where `acts[level]` is { level, stage, titleCard, results } for each act decoded, `first` the level asked for, and stage and titleCard are its; each act's stage is { level, zone, act, music, backgroundScroll, hudFlash, width, height, layers, atlas, collision, spawn, loop, interactables, layerToggles, rings, itemBoxes, enemies, entityRegions, paletteAnimations, background, backgroundHoles, backdrop, backgrounds }, its titleCard { sheet, slots, text } and its results { sheet, slots, text }
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
  const sprites = extractSprites(rom, tables, Object.assign({}, ...levels.map(l => LEVELS[l].sprites ?? {})));
  const acts = [];
  for (const l of levels) {
    const act = levelInfo(l);
    await onProgress(`Decoding ${act.name}…`);
    acts[l] = {
      level: l,
      stage: extractStage(rom, offsets, tables, act),
      titleCard: sheet(titleCardGraphics(rom, offsets.uiGraphics, offsets.titleCard, l)),
      results: sheet(resultsGraphics(rom, offsets.uiGraphics, offsets.titleCard, l)),
    };
  }
  // nine release speeds, then the nine of the alternate table right after them: a charge past 8.0
  // indexes into those in the original, so both are read
  const spinDashSpeeds = Array.from({ length: 18 }, (_, i) => rom.s16(offsets.spinDashSpeeds + i * 2) / 256);

  return {
    info: { ...id.header, region: id.region, sha1: id.sha1, version: id.known?.name ?? null, offsets },
    sprites, acts, first: level, stage: acts[level].stage, titleCard: acts[level].titleCard, physics: { spinDashSpeeds },
    hud: extractHud(rom, offsets.uiGraphics),
    // where the songs are; the sound engine reads them from the ROM itself
    sound: soundLayout(rom, offsets.musicPlayers),
  };
}

// `levelSprites` { name: [anim, variant] } are the level's own looks for objects whose animation the ROM picks
// by level; they replace the default of the same name
function extractSprites(rom, tables, levelSprites = {}) {
  const sonicPalette = animationPalette(rom, tables, SONIC_ANIMATIONS.idle[0]);
  const springPalette = animationPalette(rom, tables, SPRING_ANIM);
  const yellowPalette = springPalette.slice();
  readColors(rom, tables.palettes + YELLOW_SPRING_PALETTE * 32, 16).forEach((c, i) => { yellowPalette[112 + i] = c; });
  const yellow = { springUpYellow: OBJECT_ANIMATIONS.springUp, springUpYellowLaunch: OBJECT_ANIMATIONS.springUpLaunch };
  const groups = [
    { list: { ...SONIC_ANIMATIONS, ...EFFECT_ANIMATIONS }, palette: sonicPalette },
    { list: OBJECT_ANIMATIONS, palette: springPalette },
    { list: yellow, palette: yellowPalette, skipPalette: true },
    { list: RING_ANIMATIONS, palette: animationPalette(rom, tables, RING_ANIMATIONS.ring[0]) },
    { list: SPIKE_ANIMATIONS, palette: animationPalette(rom, tables, SPIKES_ANIM) },
    ...Object.entries({ ...ENEMY_ANIMATIONS, ...ITEM_ANIMATIONS, ...PLATFORM_ANIMATIONS, ...ROCK_ANIMATIONS, ...ICE_MOUNTAIN_ANIMATIONS, ...WALL_ANIMATIONS, ...WATER_ANIMATIONS, ...SLIDE_ANIMATIONS, ...SHRUB_ANIMATIONS, ...BOOSTER_ANIMATIONS, ...CHECKPOINT_ANIMATIONS, ...POLE_ANIMATIONS, ...GOAL_ANIMATIONS, ...BOSS_ANIMATIONS, ...EGG_HAMMER_TANK_ANIMATIONS, ...CAPSULE_ANIMATIONS, ...SPECIAL_SPRING_ANIMATIONS, ...STEAM_EXHAUST_ANIMATIONS, ...EGG_PRESS_ANIMATIONS, ...HOOK_RAIL_ANIMATIONS, ...SECURITY_GATE_ANIMATIONS, ...HOOK_ANIMATIONS, ...MARBLE_TRACK_ANIMATIONS, ...PIPE_ANIMATIONS }).map(([anim, variants]) => ({
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
  const frameImage = (name, anim, f, palette, rows) => {
    // identical frames (same layout, tiles and palette) share one atlas entry
    const key = `${anim}:${f.frame}:${f.tilesAt}:${palette.join()}`;
    if (!byKey.has(key)) {
      const { img, layout } = renderFrame(rom, tables, anim, f.frame, f.tilesAt, palette, f.eightBpp);
      byKey.set(key, images.length);
      images.push({ img, anchorX: layout.anchorX, anchorY: layout.anchorY });
      made.push({ name, anim, f, palette, rows });
    }
    const image = images[byKey.get(key)];
    if (ROTATED.has(name) && !image.pieces) image.pieces = framePieces(rom, tables, anim, f.frame, f.tilesAt, palette, f.eightBpp);
    return byKey.get(key);
  };
  for (const { list, palette, skipPalette } of groups) {
    for (const [name, [anim, variant]] of Object.entries(list)) {
      const script = animationFrames(rom, tables, anim, variant, palette, { skipPalette });
      const rows = new Set(script.frames.flatMap(f => f.loads.flatMap(paletteRows)).map(([row, key]) => {
        if (!rowKeys.has(row)) rowKeys.set(row, new Set());
        rowKeys.get(row).add(key);
        return row;
      }));
      const frames = script.frames.map(f => {
        if (f.frame < 0) return [-1, f.delay];
        const i = frameImage(name, anim, f, f.palette, rows);
        // the hitboxes set just before a frame come with it
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
        const j = frameImage(m.name, m.anim, m.f, palette, m.rows);
        if (j === i) continue;
        if (images[j].img.data.every((v, k) => v === images[i].img.data[k])) continue;
        (alts[i] ??= []).push([row, key, j]);
      }
    }
  }
  // the crumbling platform draws its 64 × 32 frame as 32 tiles of 8 × 8, and the breakable wall its 32 × 64
  // one, left to right and top to bottom, each from its top left corner
  const tiles = Object.fromEntries(['crumblingPlatform', 'breakableWall'].map(name => {
    const whole = images[anims[name].frames[0][0]].img, across = whole.width >> 3;
    return [name, Array.from({ length: across * (whole.height >> 3) }, (_, i) => {
      const img = new ImageData(8, 8), tx = (i % across) * 8, ty = Math.floor(i / across) * 8;
      for (let y = 0; y < 8; y++) img.data.set(whole.data.subarray(((ty + y) * whole.width + tx) * 4, ((ty + y) * whole.width + tx + 8) * 4), y * 32);
      images.push({ img, anchorX: 0, anchorY: 0 });
      return images.length - 1;
    })];
  }));
  // a rotated frame's pieces go into the atlas after the frames, and its rect gets them as [x, y, w, h, atlasX, atlasY]
  const pieces = images.flatMap((image, i) => (image.pieces ?? []).map(p => ({ img: p.img, frame: i, x: p.x, y: p.y })));
  const { canvas, rects } = packAtlas([...images, ...pieces]);
  pieces.forEach((p, k) => {
    const [ax, ay, w, h] = rects[images.length + k];
    (rects[p.frame][6] ??= []).push([p.x, p.y, w, h, ax, ay]);
  });
  rects.length = images.length;
  // Sonic's frames and his row of colours, for drawing them with colours written over (renderer.js)
  const sonic = {
    frames: [...new Set(Object.keys(SONIC_ANIMATIONS).flatMap(name => anims[name].frames.map(f => f[0]).filter(i => i >= 0)))],
    colors: sonicPalette.slice(0, 16),
  };
  return { atlas: canvas, frames: rects, anims, tiles, sonic, alts };
}

// the sprite palette rows a palette load fills, each as [row, key]: the key (palId * 256 + the colour of that
// palette the row starts at) names the colours it gets
function paletteRows({ palId, insert, count }) {
  const rows = [];
  for (let r = Math.ceil(insert / 16); (r + 1) * 16 <= insert + count && r < 16; r++) rows.push([r, palId * 256 + r * 16 - insert]);
  return rows;
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
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = y + shelf;
  const g = canvas.getContext('2d');
  images.forEach(({ img }, i) => g.putImageData(img, rects[i][0], rects[i][1]));
  return { canvas, rects };
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
  // the two layers share one tileset and its animated tiles, so one atlas serves both
  const count = collision.metatiles.length / 144;
  const tiles = paletteVariants(palette, animations, mapBanks(rom, front, count * front.xTiles * front.yTiles));
  const atlas = { ...renderMetatileAtlas(rom, front, tiles.palettes, count, tiles.varying), follows: tiles.follows };
  const sky = paletteVariants(palette, animations, mapBanks(rom, background, background.xTiles * background.yTiles));

  return {
    width: collision.width, height: collision.height, levelX: collision.levelX, levelY: collision.levelY,
    layers: { front: collision.layers[0], back: collision.layers[1] },
    atlas, animDelay: front.animDelay, collision,
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
    background: toCanvas(renderPlainMap(rom, background, palette)),
    backgroundHoles: mapHoles(rom, background), backdrop: palette[0],
    backgrounds: { canvases: sky.palettes.map(p => toCanvas(renderPlainMap(rom, background, p))), follows: sky.follows },
  };
}

/**
 * The stage palette under each state of the palette animations that load colours into the rows in `banks`:
 * its own colours, then those of each frame, which loads over the frames before it. The palettes are indexed
 * by the states of those animations (`follows`) in turn, the first the most significant (stage.js picks
 * one), and `varying` holds, for each of them, the rows it changes and its number of states.
 */
function paletteVariants(base, animations, banks) {
  const rowsOf = a => new Set(a.frames.flatMap(f => f.loads.flatMap(l => l.colors.map((_, i) => (l.insert + i) >> 4))));
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

function extractHud(rom, tableAt) {
  const { image, ...rects } = hudGraphics(rom, tableAt);
  return { sheet: toCanvas(image), ...rects };
}

// the title card's or the results' graphics with their image as a canvas
function sheet({ image, ...rest }) {
  return { sheet: toCanvas(image), ...rest };
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
