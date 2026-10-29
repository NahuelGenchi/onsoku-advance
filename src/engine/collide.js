// Sonic against an object's hitbox, as SA1 does it (SAT-R decompilation, src/game/shared/stage/collision_1.c
// Coll_Player_Platform, collision_2.c sub_800C934 and sub_800CBBC, collision_3.c Coll_Player_Spring_Sideways,
// Coll_Player_Gate and Coll_Player_Itembox). Hitboxes are [left, top, right, bottom] around the object's origin, edges included.
// Sonic is tested with plain rectangles around his centre; only an item box also looks at his attack box.

import { scan, PROBE_WALL } from './terrain.js';
import { land, standUp, TAILS } from './player.js';

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
// the speed is checked, so a rising Sonic in the box's top half is put on top and keeps rising. Under flipped
// gravity he stands on its bottom and is put out of its top, and a tie at its middle still stands him on it.
function vertical(o, hb, p, rect, stoodHere, res) {
  const [px, py] = at(p);
  if (!overlap(o.x, o.y, hb, px, py, rect)) return false;
  const frac = p.y - py, steep = !p.air && ((p.rotation + 0x20) & 0x40), mid = o.y + ((hb[1] + hb[3]) >> 1);
  if (p.inverted ? py < mid : py > mid) {
    p.y = (p.inverted ? o.y + hb[1] + rect[1] : o.y + hb[3] - rect[1]) + frac;
    res.flags |= FROM_BELOW;
    if (p.ysp > 0) return false;
    p.ysp = 0;
    if (steep) p.gsp = 0;
    return true;
  }
  p.y = (p.inverted ? o.y + hb[3] + rect[3] : o.y + hb[1] - rect[3]) + frac;
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
  p.pushing = true;
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
  if (!done && stoodHere && !p.onObject) { p.air = true; p.pushing = false; }   // walked or jumped off
  return res.flags;
}

/**
 * A platform Sonic can only land on (Coll_Player_PlatformCrumbling): he passes through it from below and
 * from the sides, and lands on its top whenever his body touches its box while he isn't rising, wherever in
 * the box he is; under flipped gravity, on its bottom. This test keeps his subpixel position against the box's
 * edges. `o` is what he stands on; (x, y) is where its box is this frame. Returns LANDED while he is on it.
 */
export function platformTop(o, x, y, hb, p) {
  if (!hb || p.dead) return 0;
  const stoodHere = p.onObject === o;
  if (stoodHere) p.onObject = null;
  const l = p.x - SOX, r = p.x + SOX, t = p.y - p.offsetY, b = p.y + p.offsetY;
  const ol = x + hb[0], or = x + hb[2], ot = y + hb[1], ob = y + hb[3];
  if (((ol <= l && or >= l) || (ol >= l && r >= ol)) && ((ot <= t && ob >= t) || (ot >= t && b >= ot)) && p.ysp >= 0) {
    // he is put on top by the height he had before landing stood him up: landing curled, he ends up 5 px
    // into it until the next frame
    const oy = p.offsetY;
    p.onObject = o; p.air = false;
    if (!stoodHere) { land(p); p.gsp = p.xsp; p.rotation = 0; }
    p.ysp = 0;
    p.y = (p.inverted ? ob + oy : ot - oy) + (p.y - Math.floor(p.y));
    return LANDED;
  }
  if (stoodHere) p.air = true;   // walked or jumped off
  return 0;
}

/**
 * A skating stone at rest (Coll_Player_SkatingStone): Coll_Player_Platform without its sides. An airborne
 * Sonic, or one standing on it, is tested from above and below and, failing that, once more; one on the ground
 * once. A dead one falls through.
 */
export function skatingStone(o, hb, p) {
  const res = { flags: 0 };
  if (!hb || p.dead) return 0;
  const stoodHere = p.onObject === o;
  if (stoodHere) p.onObject = null;
  const done = ((p.air || stoodHere) && vertical(o, hb, p, body(p), stoodHere, res)) || vertical(o, hb, p, body(p), stoodHere, res);
  if (!done && stoodHere && !p.onObject) { p.air = true; p.pushing = false; }
  return res.flags;
}

/**
 * Whether Sonic breaks a breakable object (sub_800C394): curled up and moving down with his side probe (a
 * pixel taller at each end) touching it, or his attack box on it while he isn't curled. A falling Sonic
 * bounces back up at the same speed. Rolling into it on level ground doesn't break it. The optional Rush
 * boost's box breaks it too, without a bounce.
 */
export function breaks(o, hb, p) {
  if (!hb || p.dead) return false;
  const [px, py] = at(p), probe = [-(SOX + 5), -(p.offsetY + 1), SOX + 5, p.offsetY + 1];
  if (p.boostBox && overlap(o.x, o.y, hb, px, py, p.boostBox)) return true;
  if ((p.curled && p.ysp > 0 && overlap(o.x, o.y, hb, px, py, probe))
    || (p.boxes[1] && overlap(o.x, o.y, hb, px, py, p.boxes[1]) && !p.curled)) {
    if (p.ysp > 0) p.ysp = -p.ysp;
    return true;
  }
  return false;
}

/**
 * A breakable wall (Coll_Player_Gate, its attack test on): while Sonic's attack box is out, it or his flank
 * touching the wall's box breaks it (LANDED), bouncing him back up if he was falling. Otherwise the wall only
 * pushes him out of its sides. The optional Rush boost's box breaks it too, without a bounce. With `attack`
 * false (a security gate's), it only pushes him out.
 */
export function gate(o, hb, p, terrain, attack = true) {
  const res = { flags: 0 };
  if (!hb || p.dead) return 0;
  const [px, py] = at(p);
  if (attack && p.boostBox && overlap(o.x, o.y, hb, px, py, p.boostBox)) return LANDED;
  if (attack && p.boxes[1] && (overlap(o.x, o.y, hb, px, py, p.boxes[1]) || overlap(o.x, o.y, hb, px, py, flank(p)))) {
    if (p.air && p.ysp > 0) p.ysp = -p.ysp;
    return LANDED;
  }
  sideways(o, hb, p, terrain, res);
  return res.flags;
}

/**
 * An item box (Coll_Player_Itembox): Sonic's attack box on it breaks it (PUSHING), bouncing him back up if
 * he was falling. In the air his body on its upper half, falling or level, breaks it too (LANDED) and bounces
 * him; rising into its lower half stops him under it (FROM_BELOW); beside it, it stops him moving into it.
 * On the ground nothing but the attack box counts. Under flipped gravity its halves swap, and rising into it
 * moves him by the original's sum with its sign turned, which doesn't put him beside it. A flying Tails on its
 * upper half is stood on it instead, as on a platform (on `terrain`), and breaks nothing.
 */
export function itemBox(o, hb, p, terrain) {
  let flags = 0;
  if (!hb || p.dead) return 0;
  const [px, py] = at(p);
  if (p.boxes[1] && overlap(o.x, o.y, hb, px, py, p.boxes[1])) {
    flags |= PUSHING;
    if (p.air && p.ysp > 0) p.ysp = -p.ysp;
  }
  if (!p.air) return flags;
  const b = body(p), a = flank(p);
  if (overlap(o.x, o.y, hb, px, py, b)) {
    const mid = o.y + ((hb[1] + hb[3]) >> 1);
    if (p.inverted ? py >= mid : py <= mid) {
      if (p.character === TAILS && p.midAir !== 0) { platform(o, hb, p, terrain); return 0; }
      if (p.ysp >= 0) { flags |= LANDED; if (p.ysp > 0) p.ysp = -p.ysp; }
    } else if (p.ysp < 0) {
      p.ysp = 0;
      const under = o.y + hb[3] - b[1];
      p.y = p.inverted ? p.y + py - under : under + (p.y - py);
      flags |= FROM_BELOW;
    }
  } else if (overlap(o.x, o.y, hb, px, py, a)) {
    if (px <= o.x + ((hb[0] + hb[2]) >> 1)) {
      if (p.xsp > 0) { p.xsp = 0; p.x = o.x + hb[0] - a[2]; }
    } else if (p.xsp < 0) { p.xsp = 0; p.x = o.x + hb[2] - a[0] + 1; }
  }
  return flags;
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
