// Turns a Sonic Advance ROM into everything the engine draws: Sonic's animations, the dust effects, the
// springs, the spikes, the enemies, the item boxes, the platforms, the rings, the HUD, the title card, an act (Neo Green Hill Zone act 1
// unless another is asked for) with its collision, objects, enemies and rings, and the zone's background. Runs entirely in the browser.

import { Rom } from './rom.js';
import { identify } from './identify.js';
import { locateTables } from './locate.js';
import { spriteTables, animationFrames, animationPalette, renderFrame, framePieces, paletteAnimation } from './sprites.js';
import { tilemapHeader, renderMetatileAtlas, renderPlainMap, mapBanks, indexMetatiles, indexPlainMap } from './tilemaps.js';
import { readCollision, readSpawn } from './collision.js';
import { readInteractables, readItemBoxes, entityRegions, readRings, layerToggles } from './entities.js';
import { readColors } from './colors.js';
import { soundLayout } from './sound.js';
import { hudGraphics } from './hud.js';
import { titleCardGraphics } from './titlecard.js';
import { LEVELS } from './levels.js';

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
// the spikes (animation 454, palette 35): pointing up, and sideways (flipped to point left)
export const SPIKES_ANIM = 454;
export const SPIKE_ANIMATIONS = { spikesUp: [SPIKES_ANIM, 2], spikesSide: [SPIKES_ANIM, 3] };
// act 1's enemies and their shots, the dust and points a defeat leaves and the freed animals, by animation;
// each loads its own palette
export const ENEMY_ANIMATIONS = {
  401: { kikiBob: 1, kikiThrow: 2 }, 408: { coconut: 0 }, 402: { coconutPiece: 0 },
  403: { buzzerFly: 0, buzzerShoot: 1, buzzerTurn: 2 }, 409: { buzzerShot: 0 },
  404: { gamiWalk: 0, gamiClaws: 1 }, 410: { gamiShot: 0 },
  405: { rhinoDrive: 0, rhinoRev: 1, rhinoTurn: 2 },
  406: { keroJump: 0, keroCroak: 1 },
  407: { dustCloud: 0 },
  709: { score0: 0, score1: 1, score2: 2, score3: 3, score4: 4 },
  445: { animalOtter: 0 }, 450: { animalKoala: 0 }, 449: { animalKangaroo: 0 },
  // Casino Paradise's: Hanabii walking and launching, its shot and the firework it bursts into
  415: { hanabiiWalk: 0, hanabiiLaunch: 1 }, 419: { hanabiiShot: 0 }, 416: { hanabiiFirework: 0 },
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
// the splash at Sonic's feet in a waterfall
export const WATER_ANIMATIONS = { 464: { waterSplash: 0 } };
// the splash under Sonic on a forced slide
export const SLIDE_ANIMATIONS = { 474: { slideSplash: 0 } };
// the speed boosters (471): flat, on a slight slope up to the right, and up to the left
export const BOOSTER_ANIMATIONS = { 471: { booster: 0, boosterSlightRight: 1, boosterSlightLeft: 2 } };
// the checkpoints (452): waiting, spinning as Sonic passes (its script starts song 169, which the game plays,
// src/engine/checkpoints.js), and passed
export const CHECKPOINT_ANIMATIONS = { 452: { checkpoint: 0, checkpointSpin: 1, checkpointPassed: 2 } };
// Neo Green Hill's wall pole (468): at rest, and bending as Sonic swings on it
export const POLE_ANIMATIONS = { 468: { wallPole: 0, wallPoleSwing: 1 } };
// the fireworks in Casino Paradise's background, big and small (482, 483)
export const BACKGROUND_ANIMATIONS = { 482: { firework: 0 }, 483: { fireworkSmall: 0 } };
// the marble tracks' entrance and exit (488)
export const MARBLE_TRACK_ANIMATIONS = { 488: { marbleTrackExit: 0 } };
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
// the ring all rings share (animation 707) and the sparkle left where one is collected (708); the sparkle's
// script starts song 117 itself, which the game plays (src/engine/game.js)
export const RING_ANIMATIONS = { ring: [707, 0], ringSparkle: [708, 0] };
// the weaker up springs are yellow: they skip the animation's red palette (33) and draw with sprite
// palette 36 in the next OBJ palette slot
const YELLOW_SPRING_PALETTE = 36;
// the animations drawn through the rotation hardware: Sonic walking and running (and thrown up by a bounce
// block, and carried through a marble track), and the boulders' debris; their frames also keep their OAM pieces as the hardware reads them
const ROTATED = new Set(['walk', 'run', 'bounce', 'marbleTrack', 'rockDebrisSmall', 'rockDebrisLarge']);

// Each level has three tilemap entries: the front layer (drawn over Sonic), the back layer (behind him) and the
// background. Its palette animations and music are in levels.js.
const LAYER = { front: 0, back: 1, background: 2 };
// the most palette states the atlas is rendered for; past that, the layers are kept as colour indices and
// drawn through the palette the animations have loaded (Cosmic Angel's eight animations have 972,000)
const MAX_PALETTE_VARIANTS = 64;

/**
 * Identifies and decodes `buffer`, with the act of `level` (levels.js). `onProgress(message)` reports each stage.
 * @returns {Promise<object>} { info, sprites: { atlas, frames, anims, tiles }, hud: { sheet, glyphs, ring, face }, titleCard: { sheet, slots, text }, stage: { level, zone, name, music, width, height, layers, atlas, collision, spawn, interactables, layerToggles, rings, itemBoxes, enemies, entityRegions, paletteAnimations, background, backgrounds, indexed }, physics, sound }
 */
export async function extractAssets(buffer, onProgress = () => {}, { level = 0 } = {}) {
  const rom = new Rom(buffer);
  onProgress('Checking the ROM…');
  const id = await identify(rom);
  onProgress(id.known ? `Found ${id.known.name}.` : 'Unrecognized version, searching for the data…');
  const offsets = locateTables(rom, id.known);

  onProgress('Decoding Sonic…');
  const tables = spriteTables(rom, offsets.spriteTables);
  const sprites = extractSprites(rom, tables, LEVELS[level].sprites);
  onProgress(`Decoding ${LEVELS[level].name}…`);
  const stage = extractStage(rom, offsets, tables, level);
  // nine release speeds, then the nine of the alternate table right after them: a charge past 8.0
  // indexes into those in the original, so both are read
  const spinDashSpeeds = Array.from({ length: 18 }, (_, i) => rom.s16(offsets.spinDashSpeeds + i * 2) / 256);

  return {
    info: { ...id.header, region: id.region, sha1: id.sha1, version: id.known?.name ?? null, offsets },
    sprites, stage, physics: { spinDashSpeeds },
    hud: extractHud(rom, offsets.uiGraphics),
    titleCard: extractTitleCard(rom, offsets.uiGraphics, offsets.titleCard, level),
    // where the songs are; the sound engine reads them from the ROM itself
    sound: soundLayout(rom, offsets.musicPlayers),
  };
}

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
    ...Object.entries({ ...ENEMY_ANIMATIONS, ...ITEM_ANIMATIONS, ...PLATFORM_ANIMATIONS, ...ROCK_ANIMATIONS, ...WATER_ANIMATIONS, ...SLIDE_ANIMATIONS, ...BOOSTER_ANIMATIONS, ...CHECKPOINT_ANIMATIONS, ...POLE_ANIMATIONS, ...BACKGROUND_ANIMATIONS, ...BALLOON_ANIMATIONS, ...MARBLE_TRACK_ANIMATIONS, ...BUMPER_ANIMATIONS, ...FLIPPER_ANIMATIONS, ...LETTER_ANIMATIONS, ...BARREL_ANIMATIONS }).map(([anim, variants]) => ({
      list: Object.fromEntries(Object.entries(variants).map(([name, v]) => [name, [Number(anim), v]])),
      palette: animationPalette(rom, tables, Number(anim)),
    })),
  ];
  // the objects whose look the level picks (levels.js) take its animation instead
  for (const group of groups) group.list = Object.fromEntries(Object.entries(group.list).filter(([name]) => !(name in levelSprites)));
  for (const [name, [anim, variant]] of Object.entries(levelSprites)) {
    groups.push({ list: { [name]: [anim, variant] }, palette: animationPalette(rom, tables, anim) });
  }

  const images = [], byKey = new Map(), anims = {};
  for (const { list, palette, skipPalette } of groups) {
    for (const [name, [anim, variant]] of Object.entries(list)) {
      const script = animationFrames(rom, tables, anim, variant, palette, { skipPalette });
      const frames = script.frames.map(f => {
        if (f.frame < 0) return [-1, f.delay];
        // identical frames (same layout, tiles and palette) share one atlas entry
        const key = `${anim}:${f.frame}:${f.tilesAt}:${f.palette.join()}`;
        if (!byKey.has(key)) {
          const { img, layout } = renderFrame(rom, tables, anim, f.frame, f.tilesAt, f.palette, f.eightBpp);
          byKey.set(key, images.length);
          images.push({ img, anchorX: layout.anchorX, anchorY: layout.anchorY });
        }
        const image = images[byKey.get(key)];
        if (ROTATED.has(name) && !image.pieces) image.pieces = framePieces(rom, tables, anim, f.frame, f.tilesAt, f.palette, f.eightBpp);
        // the hitboxes set just before a frame come with it
        return f.boxes ? [byKey.get(key), f.delay, f.boxes] : [byKey.get(key), f.delay];
      });
      anims[name] = { frames, loop: script.loop };
    }
  }
  // the crumbling platform draws its 64 × 32 frame as 32 tiles of 8 × 8, left to right and top to bottom,
  // each from its top left corner
  const whole = images[anims.crumblingPlatform.frames[0][0]].img;
  const tiles = { crumblingPlatform: Array.from({ length: 32 }, (_, i) => {
    const img = new ImageData(8, 8), tx = (i & 7) * 8, ty = (i >> 3) * 8;
    for (let y = 0; y < 8; y++) img.data.set(whole.data.subarray(((ty + y) * whole.width + tx) * 4, ((ty + y) * whole.width + tx + 8) * 4), y * 32);
    images.push({ img, anchorX: 0, anchorY: 0 });
    return images.length - 1;
  }) };
  // a rotated frame's pieces go into the atlas after the frames, and its rect gets them as [x, y, w, h, atlasX, atlasY]
  const pieces = images.flatMap((image, i) => (image.pieces ?? []).map(p => ({ img: p.img, frame: i, x: p.x, y: p.y })));
  const { canvas, rects } = packAtlas([...images, ...pieces]);
  pieces.forEach((p, k) => {
    const [ax, ay, w, h] = rects[images.length + k];
    (rects[p.frame][6] ??= []).push([p.x, p.y, w, h, ax, ay]);
  });
  rects.length = images.length;
  return { atlas: canvas, frames: rects, anims, tiles };
}

// shelf packing with a 1px gap; rects are [x, y, w, h, anchorX, anchorY]
function packAtlas(images, width = 512) {
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

function extractStage(rom, offsets, tables, level) {
  const def = LEVELS[level];
  const front = tilemapHeader(rom, offsets.tilemaps, level * 3 + LAYER.front);
  const back = tilemapHeader(rom, offsets.tilemaps, level * 3 + LAYER.back);
  const background = tilemapHeader(rom, offsets.tilemaps, level * 3 + LAYER.background);
  if (front.xTiles !== 12 || front.metatileMap === null || front.palette === null) {
    throw new Error(`${def.name} data is not where this version keeps it.`);
  }
  const collision = readCollision(rom, offsets.collision, level);
  if (collision.layers[0].length !== front.mapWidth * front.mapHeight || collision.levelX !== back.mapWidth) {
    throw new Error(`${def.name} collision does not match its map.`);
  }
  const palette = readColors(rom, front.palette, 256);
  const interactables = readInteractables(rom, offsets.interactables, level);
  const animations = def.paletteAnimations.map(anim => paletteAnimation(rom, tables, anim));
  const count = collision.metatiles.length / 144;
  const stage = {
    level, zone: level >> 1, name: def.name, music: def.music, backgroundScroll: def.background,
    width: collision.width, height: collision.height, levelX: collision.levelX, levelY: collision.levelY,
    layers: { front: collision.layers[0], back: collision.layers[1] },
    animDelay: front.animDelay, collision,
    spawn: readSpawn(rom, offsets.spawns, level),
    interactables, layerToggles: layerToggles(interactables),
    rings: readRings(rom, offsets.rings, level),
    itemBoxes: readItemBoxes(rom, offsets.itemBoxes, level),
    enemies: readInteractables(rom, offsets.enemies, level, 'enemies'),
    entityRegions: entityRegions(rom, offsets.interactables, level),
    paletteAnimations: animations.map(({ frames, loop }) => ({ delays: frames.map(f => f.delay), loop })),
    atlas: null, background: null, backgrounds: null, indexed: null,
  };
  const layerBanks = mapBanks(rom, front, count * front.xTiles * front.yTiles);
  const skyBanks = mapBanks(rom, background, background.xTiles * background.yTiles);
  if (variantCount(animations, layerBanks) > MAX_PALETTE_VARIANTS || variantCount(animations, skyBanks) > MAX_PALETTE_VARIANTS) {
    // the colours each animation frame loads, which the renderer applies over the stage's own
    const loads = animations.map(a => a.frames.map(f => f.loads.map(l => ({ insert: l.insert, colors: l.colors }))));
    stage.indexed = { palette, loads, metatiles: indexMetatiles(rom, front, count), background: indexPlainMap(rom, background) };
    stage.atlas = { slots: stage.indexed.metatiles.slots };
    return stage;
  }
  // the two layers share one tileset and its animated tiles, so one atlas serves both
  const tiles = paletteVariants(palette, animations, layerBanks);
  stage.atlas = { ...renderMetatileAtlas(rom, front, tiles.palettes, count, tiles.rows), follows: tiles.follows };
  const sky = paletteVariants(palette, animations, skyBanks);
  stage.background = toCanvas(renderPlainMap(rom, background, palette));
  stage.backgrounds = { canvases: sky.palettes.map(p => toCanvas(renderPlainMap(rom, background, p))), follows: sky.follows };
  return stage;
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
 * one), and `rows` holds the rows they change.
 */
function paletteVariants(base, animations, banks) {
  const follows = [], rows = new Set();
  let palettes = [base];
  animations.forEach((a, k) => {
    const changes = [...rowsOf(a)].filter(r => banks.has(r));
    if (!changes.length) return;
    follows.push(k);
    for (const r of changes) rows.add(r);
    palettes = palettes.flatMap(p => [p, ...a.frames.map((_, s) => {
      const q = p.slice();
      for (const f of a.frames.slice(0, s + 1)) for (const l of f.loads) l.colors.forEach((c, i) => { q[l.insert + i] = c; });
      return q;
    })]);
  });
  return { palettes, follows, rows };
}

function extractHud(rom, tableAt) {
  const { image, ...rects } = hudGraphics(rom, tableAt);
  return { sheet: toCanvas(image), ...rects };
}

function extractTitleCard(rom, uiAt, cardAt, level) {
  const { image, ...card } = titleCardGraphics(rom, uiAt, cardAt, level);
  return { sheet: toCanvas(image), ...card };
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
