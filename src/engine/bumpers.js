// Casino Paradise's bumpers (SAT-R decompilation, src/game/sa1/stage/interactables/bumpers.c). Touching one
// throws Sonic off it curled up, in the air, at a speed that depends on where he touched it, and shakes it
// for 9 frames; it keeps throwing him every frame he still touches it. None animates: each shows its
// animation's first frame, with that frame's hitbox.
//
// - the hexagon (kind 48) and the round bumper (49) throw him at a speed picked by the angle from their
//   centre to his; they can sway along x (the hexagon) or x or y (the round one, whichever of d2 and d3 is
//   larger), d2 or d3 × 8 px each way, a sway every 256 frames, with their phase half a turn on when d0 (or
//   d1) is negative. The round one throws him straight away from it, at 1092/256 px a frame, and gives 10
//   points.
// - the circling round bumper (50) goes round its spot on a circle of the larger of d2 and d3 × 8 px,
//   starting d0 × 1/8 of a turn on and moving 1/2048 of a turn d1 times a frame, the other way when d3 is
//   the larger; it throws him as the round one does, but works out the angle from 8 times its own offset
//   (the original's bug), and gives 10 points too.
// - the small triangles, lying (51, upside down when d0 is 0) and standing (52, facing right when d0 is 0),
//   throw him off whichever side he touches; the big right-angled one (53, mirrored when d0 is 0 and upside
//   down when d1 is 0) only off its slanted side.
// - the wall bumper (71) is part of the scenery: while his centre is in its area, d2 × 8 px across and d3 × 8
//   down, it throws him every frame at 5 px a frame across (right when d0 is odd, else left) and 7 up, or 6
//   down when d0 is 3 or more, without curling him up.
// - a flying Tails stops flying as any of them throws him, curled up (charState 5), and the wall bumper curls
//   him up too.
//
// Each frame of the shake moves it by the sine table's values for 1/8 of a turn more; the last two read
// past the table's end, where the ROM has 1 and 482 for their cosines, so they don't move it across.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { overlap } from './collide.js';
import { BALL_SPRITE_OFFSET_Y } from './constants.js';
import { endAttack, TAILS } from './player.js';
import { SINE, s8, octantAngle } from './trig.js';
import { SONG } from '../sound/songs.js';

export const BUMPER_HEXAGON = 48, BUMPER_ROUND = 49, BUMPER_CIRCLING = 50;
export const BUMPER_TRI_H = 51, BUMPER_TRI_V = 52, BUMPER_RIGHT_ANGLE = 53, WALL_BUMPER = 71;
const SOX = 6;                    // Sonic's spriteOffsetX
const FAST = 1638;                // Q(6.3984375): straight off a side
const SLANT_A = 0x297, SLANT_B = 0x5D9;   // off a corner, across and along
const CORNER = 1200;              // Q(4.6875): off the right-angled one's slant
const POINTS = 10;
// COS(c × 128) >> 12 and SIN(c × 128) >> 12 for shake frames 0–9 (see above)
const SHAKE_X = [4, 2, 0, -3, -4, -3, 0, 2, 0, 0];
const SHAKE_Y = [0, 2, 4, 2, 0, -3, -4, -3, 0, 2];
const SHAKE_END = 8;
// SIN(-1), for the angle of a touch dead on the centre: the halfword before the sine table in the ROM
const SIN_BEFORE = 2048;
const sin = i => i < 0 ? SIN_BEFORE : SINE[i];

const Div = (a, b) => Math.trunc(a / b);

// Coll_Player_Entity_Intersection: his body's box against the bumper's
function touches(s, x, y, p) {
  return !p.dead && s.boxes[0] && overlap(x, y, s.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY]);
}

// a flying Tails stops flying (Player_TransitionCancelFlyingAndBoost), curled up
function stopFlying(p) {
  if (p.character !== TAILS || p.midAir === 0) return false;
  endAttack(p);
  p.state = 'spin';
  return true;
}

// thrown off: in the air and curled up, with his ball's height; it isn't a jump, so letting go of the button
// doesn't cut it short, and he can steer
function throwOff(p) {
  stopFlying(p);
  p.onObject = null; p.air = true;
  p.jumped = false;                // MOVESTATE_100
  p.curled = true;
  p.airLock = false;               // MOVESTATE_FLIP_WITH_MOVE_DIR
  p.offsetY = BALL_SPRITE_OFFSET_Y;
}

// the angle from (x, y) to him, 1024 steps a turn (sub_8004418)
const angle = (p, x, y) => octantAngle(Math.floor(p.y) - y, Math.floor(p.x) - x);

// the round bumpers' throw: along the angle, at the sine table's scale (Q2.14) over 15 in 1/256 px
function roundThrow(p, rot, world) {
  p.xsp = Div(SINE[rot + 256], 15) / 256;
  p.gsp = p.xsp;
  p.ysp = Div(sin(rot), 15) / 256;
  if (p.xsp === 0) p.xsp = 8 / 256;
  world.addScore(POINTS);
  world.playSound(SONG.BUMPER_A);
}

function set(p, xsp, ysp) { p.xsp = xsp / 256; p.ysp = ysp / 256; }

// BumperCheckCollAndPosA1: the hexagon
function hexagonThrow(p, rot) {
  if ((rot - 0x40) >>> 0 > 0x380) p.xsp = FAST / 256;
  else if ((rot - 0x1C1) >>> 0 <= 0x88) p.xsp = -FAST / 256;
  else if (rot >>> 0 > 0x249) set(p, rot >>> 0 > 0x300 ? SLANT_A : -SLANT_A, -SLANT_B);
  else if (rot >>> 0 > 0x100) set(p, -SLANT_A, SLANT_B);
  else set(p, SLANT_A, SLANT_B);
}

// BumperCheckCollAndPosC1: the lying triangle
function triHThrow(p, rot, upsideDown) {
  rot >>>= 0;
  if (upsideDown) {
    if (rot >= 0x200) p.ysp = -FAST / 256;
    else set(p, rot < 0x100 ? SLANT_A : -SLANT_A, SLANT_B);
  } else if (rot > 0x1EE) set(p, rot > 0x300 ? SLANT_A : -SLANT_A, -SLANT_B);
  else if (rot < 0x15) set(p, SLANT_A, -SLANT_B);
  else p.ysp = FAST / 256;
}

// BumperCheckCollAndPosC2: the standing triangle
function triVThrow(p, rot, right) {
  if (right) {
    if ((rot - 0xFD) >>> 0 >= 0x207) p.xsp = FAST / 256;
    else set(p, -SLANT_B, rot >>> 0 > 0x200 ? -SLANT_A : SLANT_A);
  } else if ((rot - 0x104) >>> 0 <= 0x1F8) p.xsp = -0x666 / 256;
  else set(p, SLANT_B, rot >>> 0 > 0x200 ? -SLANT_A : SLANT_A);
}

// BumperCheckCollAndPosC3: the right-angled one throws him only when he is past the line of its slant
function rightAngleThrow(p, x, y, flipX, flipY) {
  const dy = Math.floor(p.y) - y, dx = Math.floor(p.x) - x;
  if (flipY) {
    if (!(dy < 65 - (flipX ? -dx : dx))) return false;
    throwOff(p);
    set(p, flipX ? -CORNER : CORNER, CORNER);
  } else {
    if (!(dy > (flipX ? -dx : dx) - 60)) return false;
    throwOff(p);
    set(p, flipX ? -CORNER : CORNER, -CORNER);
  }
  return true;
}

// the wall bumper (Task_WallBumper)
function wallBumper(e, slot) {
  const dir = s8(e.d[0]), w = e.d[2] * 8, h = e.d[3] * 8;
  return {
    run(ctx) {
      const p = ctx.player, px = Math.floor(p.x), py = Math.floor(p.y);
      if (!p.dead && px >= e.x && px <= e.x + w && py >= e.y && py <= e.y + h) {
        ctx.world.playSound(SONG.BUMPER_B);
        p.jumped = false; p.air = true; p.airLock = false;
        p.xsp = dir & 1 ? 5 : -5;
        p.ysp = dir < 3 ? -7 : 6;
        if (stopFlying(p)) { p.curled = true; p.offsetY = BALL_SPRITE_OFFSET_Y; }
      }
      if (offDisplay(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

// the sway of the hexagon and the round bumper, in 1/256 px: d × 8 px each way, a turn every 256 frames
const sway = (d, phase, t) => Math.imul(d * 2048, SINE[(4 * ((t + phase) & 0xFF)) & 0x3FF]) >> 14;

/** The task for a bumper entity, or null when `e` is not one. */
export function createBumper(e, slot, anims) {
  const k = e.kind;
  if (k === WALL_BUMPER) return wallBumper(e, slot);
  if (k < BUMPER_HEXAGON || k > BUMPER_RIGHT_ANGLE) return null;
  const flipX = (k === BUMPER_TRI_V || k === BUMPER_RIGHT_ANGLE) && e.d[0] === 0;
  const flipY = (k === BUMPER_TRI_H && e.d[0] === 0) || (k === BUMPER_RIGHT_ANGLE && e.d[1] === 0);
  const look = { 48: 'bumperHexagon', 49: 'bumperRound', 50: 'bumperRound', 51: 'bumperTriH', 52: 'bumperTriV', 53: 'bumperRightAngle' }[k];
  const s = makeSprite(look, { flipX, flipY });
  animate(s, anims);

  // the sway: along x (unk48), along y (unk4A), its phase (unk3C)
  let alongX = false, alongY = false, phase = 0;
  if (k === BUMPER_HEXAGON) { alongX = true; phase = s8(e.d[0]) < 0 ? 0x80 : 0; }
  else if (k === BUMPER_ROUND) {
    if (e.d[2] > e.d[3]) { alongX = true; phase = s8(e.d[0]) < 0 ? 0x80 : 0; }
    else { alongY = true; phase = s8(e.d[1]) < 0 ? 0x80 : 0; }
  }
  if (e.d[2] === 0 && e.d[3] === 0) alongX = false;
  // the circling one: where it starts round, which way it goes, how far out
  const start = (e.d[0] & 7) << 8, speed = (e.d[2] > e.d[3] ? 1 : -1) * s8(e.d[1]), radius = Math.max(e.d[2], e.d[3]);

  let qx = 0, qy = 0;           // its offset from its spot, 1/256 px (unk40, unk44)
  let shaking = false, c = 0;   // the shake, and its frame

  // whether it throws him this frame
  function test(p, world) {
    let x = e.x, y = e.y;
    if (k === BUMPER_HEXAGON || k === BUMPER_ROUND) {
      x += qx >> 8; y += qy >> 8;
      if (!touches(s, x, y, p) || p.carried) return false;
      throwOff(p);
      const rot = angle(p, x, y);
      if (k === BUMPER_HEXAGON) { hexagonThrow(p, rot); world.playSound(SONG.BUMPER_A); }
      else roundThrow(p, rot, world);
    } else if (k === BUMPER_CIRCLING) {
      if (!touches(s, x + (qx >> 11), y + (qy >> 11), p)) return false;
      throwOff(p);
      roundThrow(p, angle(p, x + (qx >> 8), y + (qy >> 8)), world);
    } else if (k === BUMPER_TRI_H) {
      if (p.carried || !touches(s, x, y, p)) return false;
      throwOff(p);
      triHThrow(p, angle(p, x, y), flipY);
      world.playSound(SONG.BUMPER_B);
    } else if (k === BUMPER_TRI_V) {
      if (!touches(s, x, y, p) || p.carried) return false;
      throwOff(p);
      triVThrow(p, angle(p, x, y), flipX);
      world.playSound(SONG.BUMPER_B);
    } else {
      if (!touches(s, x, y, p) || p.carried || !rightAngleThrow(p, x, y, flipX, flipY)) return false;
      world.playSound(SONG.BUMPER_B);
    }
    c = 0;
    return true;
  }

  return {
    run(ctx) {
      const p = ctx.player, t = ctx.world.tick;
      const inShake = shaking;
      if (shaking && ++c > SHAKE_END) shaking = false;
      if (alongX) qx = sway(e.d[2], phase, t);
      if (alongY) qy = sway(e.d[3], phase, t);
      if (k === BUMPER_CIRCLING) {
        const a = ((Math.imul(speed, t) + start) & 0x7FF) >> 1;
        qx = SINE[a] * radius; qy = SINE[a + 256] * radius;
      }
      let x = e.x, y = e.y;
      if (k === BUMPER_CIRCLING) { x += qx >> 11; y += qy >> 11; } else { x += qx >> 8; y += qy >> 8; }
      // in the shake, the hexagon, the swaying round bumper and the standing triangle look for him before it
      // moves; the others after
      const sideways = flipX ? 1 : -1;
      if (!inShake) {
        if (test(p, ctx.world)) shaking = true;
      } else if (k === BUMPER_HEXAGON || k === BUMPER_ROUND || k === BUMPER_TRI_V) {
        test(p, ctx.world);
        x += sideways * SHAKE_X[c]; y += SHAKE_Y[c];
      } else {
        x += sideways * SHAKE_X[c]; y += SHAKE_Y[c];
        test(p, ctx.world);
      }
      if (offDisplay(e.x, e.y, ctx.cam) && offCam(x, y, ctx.cam)) { slot.live = null; return false; }
      ctx.draw(s, x, y);
      return true;
    },
  };
}
