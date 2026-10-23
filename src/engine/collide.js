// Sonic against an object's hitbox, as SA1 does it (SAT-R decompilation, src/game/shared/stage/collision_1.c
// Coll_Player_Platform, collision_2.c sub_800C934 and sub_800CBBC, collision_3.c Coll_Player_Spring_Sideways).
// Hitboxes are [left, top, right, bottom] around the object's origin, edges included. Sonic is tested
// with plain rectangles around his centre, never with his sprite's own hitboxes.

import { scan, PROBE_WALL } from './terrain.js';
import { land, standUp } from './player.js';

// what a test found, as the original's result bits
export const LANDED = 0x8, FROM_BELOW = 0x10000, LEFT_FACE = 0x20000, RIGHT_FACE = 0x40000, PUSHING = 0x20;

const SOX = 6;   // spriteOffsetX, the same standing and curled

/** True when two boxes overlap, touching edges included (HB_COLLISION). */
export function overlap(x0, y0, a, x1, y1, b) {
  const l0 = x0 + a[0], r0 = x0 + a[2], t0 = y0 + a[1], b0 = y0 + a[3];
  const l1 = x1 + b[0], r1 = x1 + b[2], t1 = y1 + b[1], b1 = y1 + b[3];
  return ((l0 <= l1 && r0 >= l1) || (l0 >= l1 && r1 >= l0)) && ((t0 <= t1 && b0 >= t1) || (t0 >= t1 && b1 >= t0));
}

// Sonic's body, and the wider, shorter box that finds the objects beside him
const body = p => [-SOX, -p.offsetY, SOX, p.offsetY];
const flank = p => [-(SOX + 5), 1 - p.offsetY, SOX + 5, p.offsetY - 1];
const at = p => [Math.floor(p.x), Math.floor(p.y)];

// onto the top of the box or out below it, keeping the subpixel (sub_800C934). The position moves before
// the speed is checked, so a rising Sonic in the box's top half is put on top and keeps rising.
function vertical(o, hb, p, rect, stoodHere, res) {
  const [px, py] = at(p);
  if (!overlap(o.x, o.y, hb, px, py, rect)) return false;
  const frac = p.y - py, steep = !p.air && ((p.rotation + 0x20) & 0x40);
  if (py > o.y + ((hb[1] + hb[3]) >> 1)) {
    p.y = o.y + hb[3] - rect[1] + frac;
    res.flags |= FROM_BELOW;
    if (p.ysp > 0) return false;
    p.ysp = 0;
    if (steep) p.gsp = 0;
    return true;
  }
  p.y = o.y + hb[1] - rect[3] + frac;
  if (p.ysp < 0) return false;
  p.ysp = 0;
  if (steep) p.gsp = 0;
  p.onObject = o; p.air = false;
  res.flags |= LANDED;
  if (!stoodHere) { land(p); p.gsp = p.xsp; p.rotation = 0; }
  return true;
}

// out to the nearer side of the box, or to the other one when the terrain is in the way (sub_800CBBC);
// walking into it on the ground stops him and stands him up
function sideways(o, hb, p, terrain, res) {
  if (((p.rotation + 0x20) >> 6) & 1) return false;   // not while on a wall
  const rect = flank(p), [px, py] = at(p);
  if (!overlap(o.x, o.y, hb, px, py, rect)) return false;
  const leftX = o.x + hb[0] - rect[2], rightX = o.x + hb[2] - rect[0] + 1;
  const fromLeft = px <= o.x + ((hb[0] + hb[2]) >> 1);
  if (fromLeft) {
    p.x = scan(terrain, leftX, py, p.layer, -8, PROBE_WALL).d >= 0 ? leftX : rightX;
    if (p.xsp < 0) return false;
    res.flags |= LEFT_FACE;
  } else {
    p.x = scan(terrain, rightX, py, p.layer, 8, PROBE_WALL).d >= 0 ? rightX : leftX;
    if (p.xsp > 0) return false;
    res.flags |= RIGHT_FACE;
  }
  if (p.air || p.attack !== 0) { p.xsp = 0; return true; }
  if (p.xsp === 0) return true;
  res.flags |= PUSHING;
  p.facing = fromLeft ? 1 : -1;
  standUp(p);
  p.gsp = 0; p.xsp = 0;
  return true;
}

/**
 * A solid object (Coll_Player_Platform): Sonic lands on it, bumps it from below or is pushed out of its
 * sides. An airborne Sonic, or one standing on it, is tested from above and below first. A dead one falls
 * through.
 */
export function platform(o, hb, p, terrain) {
  const res = { flags: 0 };
  if (!hb || p.dead) return 0;
  const stoodHere = p.onObject === o;
  if (stoodHere) p.onObject = null;
  const done = ((p.air || stoodHere) && vertical(o, hb, p, body(p), stoodHere, res))
    || sideways(o, hb, p, terrain, res) || vertical(o, hb, p, body(p), stoodHere, res);
  if (!done && stoodHere && !p.onObject) p.air = true;   // walked or jumped off
  return res.flags;
}

/**
 * A horizontal spring's box (Coll_Player_Spring_Sideways): its top is a platform from the air, and its
 * sides report which face Sonic touches, decided against the spring's origin. Standing still against a
 * face counts.
 */
export function springSide(o, hb, p) {
  const res = { flags: 0 };
  if (!hb || p.dead) return 0;
  let inAir = p.air, stoodHere = false;
  if (p.onObject === o) { p.onObject = null; inAir = true; stoodHere = true; }
  const a = flank(p), b = body(p);
  let [px, py] = at(p);
  if (inAir) {
    if (overlap(o.x, o.y, hb, px, py, b)) {
      if (vertical(o, hb, p, b, stoodHere, res)) return res.flags;
    } else if (overlap(o.x, o.y, hb, px, py, a)) {
      if (px <= o.x) {
        if (p.xsp >= 0) { p.xsp = 0; p.x = o.x + hb[0] - a[2]; res.flags |= LEFT_FACE; }
      } else if (p.xsp <= 0) { p.xsp = 0; p.x = o.x + hb[2] - a[0] + 1; res.flags |= RIGHT_FACE; }
    }
  }
  [px, py] = at(p);
  if (overlap(o.x, o.y, hb, px, py, a)) {
    if (px <= o.x) {
      if (p.xsp >= 0) {
        res.flags |= LEFT_FACE;
        if (p.xsp > 0) { res.flags |= PUSHING; p.x = o.x + hb[0] - a[2]; }
      }
    } else if (p.xsp <= 0) {
      res.flags |= RIGHT_FACE;
      if (p.xsp < 0) { res.flags |= PUSHING; p.x = o.x + hb[2] - a[0] + 1; }
    }
  }
  return res.flags;
}
