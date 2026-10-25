// The Moon Zone's own art (SAT-R decompilation, src/game/sa1/stage/player_super_sonic.c and
// enemies/boss_xtra_super_egg_robot.c, checked in the USA ROM): Super Sonic, the effects around him, the WARNING
// sign, the Super Egg Robo's parts and its attacks. The robot's body is a background sprite, drawn into the
// rotating background BG2 rather than OAM, so it is decoded on its own in the background's colours.

import { tilemapHeader } from './tilemaps.js';
import { readColors } from './colors.js';
import { animationFrames, renderFrame } from './sprites.js';

// [animation, variant] by the name the engine draws them by. Super Sonic's state table (gUnknown_084AE1B0,
// 0x084A70AC in the USA ROM) picks his animation by charState: 0 the first frame's 398, 1 dying (Sonic's own 21,
// in his own colours), 2 flying, 3 dashing and 4 thrown back, all three 399.
export const EXTRA_SPRITES = {
  superStart: [398, 0], superDead: [21, 0], superFly: [399, 0], superDash: [399, 1], superHurt: [399, 2],
  // the dash's trail (400), and the sparkles he gives off (775)
  superTrail: [400, 0], superTrailEnd: [400, 1], superSparkle: [775, 0], superSparkleSmall: [775, 1],
  // the four pieces of the WARNING sign (719)
  warning0: [719, 0], warning1: [719, 1], warning2: [719, 2], warning3: [719, 3],
  // the robot: its head (665, with its mouth open for the laser), the ball joints (674), the hands (673), the
  // thighs, shins and feet of both legs (667, 668), the knee (669)
  roboHead: [665, 0], roboHeadLaser: [665, 1], roboJoint: [674, 0], roboHand: [673, 0],
  roboThigh: [667, 0], roboThighFar: [667, 1], roboFoot: [667, 2], roboFootFar: [667, 3],
  roboShin: [668, 0], roboShinFar: [668, 1], roboKnee: [669, 0],
  // the ring capsule (670): thrown, homing in, closing on Super Sonic and holding him; its halves (671)
  capsule: [670, 0], capsuleHold: [670, 1], capsuleChase: [670, 2], capsuleShut: [670, 3], capsuleHalf: [671, 0],
  // the laser's fire along the ground (672) and the rocks the robot's steps throw up (676, 677, 678)
  groundFire: [672, 0], rockBig: [676, 0], rockMid: [677, 0], rockSmall: [678, 0],
  // the nuts and bolts a beaten robot spills (611, the bosses' own)
  roboBlast: [611, 0],
};

// the robot's body (666): an 8bpp background sprite, loading its colours into background palette row 10
const BODY_ANIM = 666;

/**
 * The extra stage's art that isn't in the sprite atlas: `body`, the robot's body as background sprite frames
 * ({ img, anchorX, anchorY } in the background's colours) and its animation ({ frames: [index, delay, boxes],
 * loop }); `facePalette`, the colours the HUD's face shows in, Super Sonic's (his animations load them into the
 * sprite palette row the face uses).
 */
export function extraStageArt(rom, offsets, tables, level) {
  const front = tilemapHeader(rom, offsets.tilemaps, level * 3);
  const palette = readColors(rom, front.palette, 256);
  const script = animationFrames(rom, tables, BODY_ANIM, 0, palette);
  const images = [], frames = script.frames.map(f => {
    const { img, layout } = renderFrame(rom, tables, BODY_ANIM, f.frame, f.tilesAt, f.palette, f.eightBpp, { background: true });
    images.push({ img, anchorX: layout.anchorX, anchorY: layout.anchorY });
    return f.boxes ? [images.length - 1, f.delay, f.boxes] : [images.length - 1, f.delay];
  });
  const fly = animationFrames(rom, tables, ...EXTRA_SPRITES.superFly, palette).frames[0].palette;
  return { body: { images, anim: { frames, loop: script.loop } }, facePalette: fly.slice(0, 16) };
}
