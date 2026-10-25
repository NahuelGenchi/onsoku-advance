// Turns a Sonic Advance ROM into everything the engine draws: Sonic's animations, the dust effects, the
// springs, the spikes, the enemies, the item boxes, the platforms, the rings, the HUD, the title card, Neo Green Hill Zone act 1 with its collision, objects,
// enemies and rings, and the zone's background. Runs entirely in the browser.

import { Rom } from './rom.js';
import { identify } from './identify.js';
import { locateTables } from './locate.js';
import { spriteTables, animationFrames, animationPalette, renderFrame, framePieces, paletteAnimation } from './sprites.js';
import { tilemapHeader, renderMetatileAtlas, metatileIndices, renderPlainMap, plainMapIndices, mapBanks } from './tilemaps.js';
import { readCollision, readSpawn } from './collision.js';
import { readInteractables, readItemBoxes, entityRegions, readRings, layerToggles } from './entities.js';
import { readColors, tintRgb, tintImage } from './colors.js';
import { soundLayout } from './sound.js';
import { hudGraphics } from './hud.js';
import { titleCardGraphics } from './titlecard.js';
import { levelInfo } from './levels.js';

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
  // hanging from a hook rail (charState 38)
  hook: [43, 0],
  // a breath from an air bubble under water (charState 27)
  breathe: [17, 0],
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
export const SPIKE_ANIMATIONS = {
  spikesUp: [SPIKES_ANIM, 2], spikesSide: [SPIKES_ANIM, 3],
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
  // Yukimaru on the ground and on a wall, walking and throwing, and its snowball (the Pen's first snowball
  // animation); the Pen walking and throwing, its snowball and the snowball's pieces
  422: { yukimaruThrow: 0, yukimaruWalk: 1 }, 423: { yukimaruWallThrow: 0, yukimaruWallWalk: 1 }, 427: { yukimaruSnowball: 0 },
  426: { penWalk: 0, penThrow: 1 }, 428: { penSnowball: 0 }, 429: { penSnowballPiece: 0 },
};
// the item box (705), the icon that shows its prize (706: one variant per prize, the first five the
// characters' 1-ups), the shield (750), the magnetic shield (751) and invincibility's stars and their
// sparkles (752)
export const ITEM_ANIMATIONS = {
  705: { itemBox: 0 },
  706: { icon0: 0, icon4: 4, icon5: 5, icon6: 6, icon7: 7, icon8: 8, icon9: 9, icon10: 10 },
  750: { shield: 0 }, 751: { magneticShield: 0 }, 752: { stars: 0, starSparkle: 1 },
};
// Neo Green Hill's platforms: the thin one (463), which the falling and sinking ones share, the trampoline at
// rest and bouncing (461), the bounce block (462) and the crumbling platform (904); and the rising platform
// (523), the same in every zone. Other zones have their own thin and sinking ones (levels.js `sprites`).
export const PLATFORM_ANIMATIONS = {
  463: { thinPlatform: 0, sinkingPlatform: 0, ferrisSeat: 0 }, 461: { trampoline: 0, trampolineBounce: 1 }, 462: { bounceBlock: 0 },
  904: { crumblingPlatform: 0 }, 523: { risingPlatform: 0 },
};
// a ferris wheel's seat (463; other levels have their own, levels.js `sprites`), hub (530) and spokes (531)
export const FERRIS_WHEEL_ANIMATIONS = { 530: { ferrisHub: 0 }, 531: { ferrisSpoke: 0 } };
// the boulders (458), and the small and large pieces a broken one leaves (459, 460)
export const ROCK_ANIMATIONS = { 458: { rock: 0 }, 459: { rockDebrisSmall: 0 }, 460: { rockDebrisLarge: 0 } };
// Ice Mountain's objects: the block of ice (555) and the large and small pieces a broken one leaves (556, 557)
export const ICE_MOUNTAIN_ANIMATIONS = { 555: { iceBlock: 0 }, 556: { iceShardsLarge: 0 }, 557: { iceShardsSmall: 0 } };
// the breakable wall (559); some levels have their own (levels.js `sprites`)
export const WALL_ANIMATIONS = { 559: { breakableWall: 0 } };
// the moving spring at rest and throwing (540); Ice Mountain has its own (levels.js `sprites`)
export const MOVING_SPRING_ANIMATIONS = { 540: { movingSpring: 0, movingSpringLaunch: 1 } };
// the square platform (494); other zones have their own, and some a longer one too (levels.js `sprites`)
export const SQUARE_PLATFORM_ANIMATIONS = { 494: { squarePlatform: 0 } };
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
// the splash under Sonic on a forced slide
export const SLIDE_ANIMATIONS = { 474: { slideSplash: 0 } };
// the skating stone (547) and its large and small pieces (548, 549); Ice Mountain's are 529, 553 and 554
export const STONE_ANIMATIONS = {
  547: { skatingStone: 0 }, 548: { stoneDebrisLarge: 0 }, 549: { stoneDebrisSmall: 0 },
  529: { iceStone: 0 }, 553: { iceStoneDebrisLarge: 0 }, 554: { iceStoneDebrisSmall: 0 },
};
// the speed boosters (471): flat, on a slight slope up to the right, and up to the left
export const BOOSTER_ANIMATIONS = { 471: { booster: 0, boosterSlightRight: 1, boosterSlightLeft: 2 } };
// the checkpoints (452): waiting, spinning as Sonic passes (its script starts song 169, which the game plays,
// src/engine/checkpoints.js), and passed
export const CHECKPOINT_ANIMATIONS = { 452: { checkpoint: 0, checkpointSpin: 1, checkpointPassed: 2 } };
// Neo Green Hill's wall pole (468): at rest, and bending as Sonic swings on it
export const POLE_ANIMATIONS = { 468: { wallPole: 0, wallPoleSwing: 1 } };
// the hook rail's hook (504; Ice Mountain's is 569)
export const HOOK_RAIL_ANIMATIONS = { 504: { hookRail: 0 } };
// the ring all rings share (animation 707) and the sparkle left where one is collected (708); the sparkle's
// script starts song 117 itself, which the game plays (src/engine/game.js)
export const RING_ANIMATIONS = { ring: [707, 0], ringSparkle: [708, 0] };
// the weaker up springs are yellow: they skip the animation's red palette (33) and draw with sprite
// palette 36 in the next OBJ palette slot
const YELLOW_SPRING_PALETTE = 36;
// the animations drawn through the rotation hardware: Sonic walking and running (and thrown up by a bounce
// block), the boulders', the ice blocks' and the skating stones' debris, and the bubbles Sonic lets out under
// water and the drowning countdown's numbers, which grow to full size; their frames also keep their OAM pieces
// as the hardware reads them
const ROTATED = new Set(['walk', 'run', 'bounce', 'rockDebrisSmall', 'rockDebrisLarge', 'iceShardsSmall', 'iceShardsLarge',
  'stoneDebrisSmall', 'stoneDebrisLarge', 'iceStoneDebrisSmall', 'iceStoneDebrisLarge',
  'bubblesSmall', 'bubblesGroup', ...[0, 1, 2, 3, 4, 5].map(n => `drownCountdown${n}`)]);
// the sprite palette that fills the whole OBJ palette when an act with water starts, and that the colours
// under water are made from (LoadPalette423Anim, InitWaterPalettes)
const UNDERWATER_OBJ_PALETTE = 423;

// each level's three tilemap entries: the front layer (drawn over Sonic), the back layer (behind him) and the
// background
const MAP = { front: 0, back: 1, background: 2 };
// past this many states of the palette animations a level's metatiles are kept as colour indices
const MAX_ATLAS_PALETTES = 16;

/**
 * Identifies and decodes `buffer`. `onProgress(message)` reports each stage.
 * @returns {Promise<object>} { info, sprites: { atlas, frames, anims, tiles }, hud: { sheet, glyphs, ring, face }, titleCard: { sheet, slots, text }, stage: { width, height, layers, atlas, collision, spawn, interactables, layerToggles, rings, itemBoxes, enemies, entityRegions, paletteAnimations, background, backgrounds }, physics, sound }
 */
export async function extractAssets(buffer, onProgress = () => {}, { level = 0 } = {}) {
  const info = levelInfo(level);
  const rom = new Rom(buffer);
  onProgress('Checking the ROM…');
  const id = await identify(rom);
  onProgress(id.known ? `Found ${id.known.name}.` : 'Unrecognized version, searching for the data…');
  const offsets = locateTables(rom, id.known);

  onProgress('Decoding Sonic…');
  const tables = spriteTables(rom, offsets.spriteTables);
  const sprites = extractSprites(rom, tables, info.water, info.sprites);
  onProgress(`Decoding ${info.name}…`);
  const stage = extractStage(rom, offsets, tables, info);
  // nine release speeds, then the nine of the alternate table right after them: a charge past 8.0
  // indexes into those in the original, so both are read
  const spinDashSpeeds = Array.from({ length: 18 }, (_, i) => rom.s16(offsets.spinDashSpeeds + i * 2) / 256);

  return {
    info: { ...id.header, region: id.region, sha1: id.sha1, version: id.known?.name ?? null, offsets },
    sprites, stage, physics: { spinDashSpeeds },
    hud: extractHud(rom, offsets.uiGraphics, info.water),
    titleCard: extractTitleCard(rom, offsets.uiGraphics, offsets.titleCard, level, info.water),
    // where the songs are; the sound engine reads them from the ROM itself
    sound: soundLayout(rom, offsets.musicPlayers),
  };
}

/**
 * Every animation's frames on one atlas. In an act with `water` they are drawn a second time, on an atlas with
 * the same layout, in the colours under the water line: palette 423 in the water's colours, whatever palette
 * the animation loads above it. `levelSprites` { name: [anim, variant] } are the level's own looks for objects
 * whose animation the ROM picks by level; they replace the default of the same name.
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
    ...Object.entries({ ...ENEMY_ANIMATIONS, ...ITEM_ANIMATIONS, ...PLATFORM_ANIMATIONS, ...ROCK_ANIMATIONS, ...ICE_MOUNTAIN_ANIMATIONS, ...WALL_ANIMATIONS, ...MOVING_SPRING_ANIMATIONS, ...SQUARE_PLATFORM_ANIMATIONS, ...FERRIS_WHEEL_ANIMATIONS, ...WATER_ANIMATIONS, ...SLIDE_ANIMATIONS, ...BOOSTER_ANIMATIONS, ...CHECKPOINT_ANIMATIONS, ...POLE_ANIMATIONS, ...HOOK_RAIL_ANIMATIONS, ...STONE_ANIMATIONS, ...(water ? UNDERWATER_ANIMATIONS : {}) }).map(([anim, variants]) => ({
      list: Object.fromEntries(Object.entries(variants).map(([name, v]) => [name, [Number(anim), v]])),
      palette: animationPalette(rom, tables, Number(anim)),
    })),
  ];
  for (const group of groups) group.list = Object.fromEntries(Object.entries(group.list).filter(([name]) => !(name in levelSprites)));
  for (const [name, [anim, variant]] of Object.entries(levelSprites)) {
    groups.push({ list: { [name]: [anim, variant] }, palette: animationPalette(rom, tables, anim) });
  }

  // each image keeps how it was drawn, `src`, to be drawn again in the colours under water
  const images = [], byKey = new Map(), anims = {};
  for (const { list, palette, skipPalette, under: groupUnder = under } of groups) {
    for (const [name, [anim, variant]] of Object.entries(list)) {
      const script = animationFrames(rom, tables, anim, variant, palette, { skipPalette });
      const frames = script.frames.map(f => {
        if (f.frame < 0) return [-1, f.delay];
        // identical frames (same layout, tiles and palette) share one atlas entry
        const key = `${anim}:${f.frame}:${f.tilesAt}:${f.palette.join()}`;
        const src = [rom, tables, anim, f.frame, f.tilesAt, f.palette, f.eightBpp];
        if (!byKey.has(key)) {
          const { img, layout } = renderFrame(...src);
          byKey.set(key, images.length);
          images.push({ img, anchorX: layout.anchorX, anchorY: layout.anchorY, src, under: groupUnder });
        }
        const image = images[byKey.get(key)];
        if (ROTATED.has(name) && !image.pieces) image.pieces = framePieces(...src);
        // the hitboxes set just before a frame come with it
        return f.boxes ? [byKey.get(key), f.delay, f.boxes] : [byKey.get(key), f.delay];
      });
      anims[name] = { frames, loop: script.loop };
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
  pieces.forEach((p, k) => {
    const [ax, ay, w, h] = rects[images.length + k];
    (rects[p.frame][6] ??= []).push([p.x, p.y, w, h, ax, ay]);
  });
  rects.length = images.length;
  return { atlas: canvas, under: underAtlas || null, frames: rects, anims, tiles };
}

// the 8 × 8 tile of `img` with its top left corner at (tx, ty)
function cutTile(img, tx, ty) {
  const out = new ImageData(8, 8);
  for (let y = 0; y < 8; y++) out.data.set(img.data.subarray(((ty + y) * img.width + tx) * 4, ((ty + y) * img.width + tx + 8) * 4), y * 32);
  return out;
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
  const animations = info.paletteAnimations.map(anim => paletteAnimation(rom, tables, anim));
  // the two layers share one tileset and its animated tiles, so one atlas serves both. With many states of the
  // palette animations, more than a canvas holds, or with water, whose line changes the colours partway down
  // the screen, it keeps the metatiles' colour indices instead, and the layers are coloured as they are drawn
  // (stage.js).
  const count = collision.metatiles.length / 144;
  const tiles = paletteVariants(palette, animations, mapBanks(rom, front, count * front.xTiles * front.yTiles));
  const atlas = tiles.palettes.length > MAX_ATLAS_PALETTES || info.water
    ? { indexed: true, size: front.xTiles * 8, frames: metatileIndices(rom, front, count), palettes: tiles.palettes, follows: tiles.follows }
    : { ...renderMetatileAtlas(rom, front, tiles.palettes, count, tiles.rows), follows: tiles.follows };
  const sky = paletteVariants(palette, animations, mapBanks(rom, background, background.xTiles * background.yTiles));

  return {
    width: collision.width, height: collision.height, levelX: collision.levelX, levelY: collision.levelY,
    layers: { front: collision.layers[0], back: collision.layers[1] },
    atlas, animDelay: front.animDelay, collision,
    level, zone: info.zone, act: info.act, music: info.music,
    spawn: readSpawn(rom, offsets.spawns, level),
    interactables, layerToggles: layerToggles(interactables),
    rings: readRings(rom, offsets.rings, level),
    itemBoxes: readItemBoxes(rom, offsets.itemBoxes, level),
    enemies: readInteractables(rom, offsets.enemies, level, 'enemies'),
    entityRegions: entityRegions(rom, offsets.interactables, level),
    paletteAnimations: animations.map(({ frames, loop }) => ({ delays: frames.map(f => f.delay), loop })),
    background: toCanvas(renderPlainMap(rom, background, palette)),
    backgrounds: { canvases: sky.palettes.map(p => toCanvas(renderPlainMap(rom, background, p))), follows: sky.follows },
    snow: info.snow === undefined ? null : snowLayer(rom, tilemapHeader(rom, offsets.tilemaps, info.snow), palette, animations),
    water: info.water ? waterColors(rom, info.water, background, palette, animations) : null,
  };
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

/**
 * The stage palette under each state of the palette animations that load colours into the rows in `banks`:
 * its own colours, then those of each frame, which loads over the frames before it. The palettes are indexed
 * by the states of those animations (`follows`) in turn, the first the most significant (stage.js picks
 * one), and `rows` holds the rows they change.
 */
function paletteVariants(base, animations, banks) {
  const rowsOf = a => new Set(a.frames.flatMap(f => f.loads.flatMap(l => l.colors.map((_, i) => (l.insert + i) >> 4))));
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

// The HUD and the title card, and in an act with water their sheets in its colours (`under`): the HUD's
// palettes are the ones palette 423 has in their slots, and the card is coloured from its own while it shows.
function extractHud(rom, tableAt, water) {
  const { image, ...rects } = hudGraphics(rom, tableAt);
  return { sheet: toCanvas(image), under: water ? toCanvas(tintImage(image, water.blend)) : null, ...rects };
}

function extractTitleCard(rom, uiAt, cardAt, level, water) {
  const { image, ...card } = titleCardGraphics(rom, uiAt, cardAt, level);
  return { sheet: toCanvas(image), under: water ? toCanvas(tintImage(image, water.blend)) : null, ...card };
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
