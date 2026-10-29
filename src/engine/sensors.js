// Sonic's terrain sensors, following SA1's player code (SAT-R decompilation, src/game/shared/stage/player.c).
// Positions are Sonic's centre; sensor offsets come from spriteOffsetX (always 6) and spriteOffsetY (14
// standing, 9 curled). Distances follow scan() in terrain.js.
//
// With gravity flipped (Cosmic Angel's toggles, p.inverted), his speeds and angles stay as he sees them: his
// floor is the act's ceiling, a Y speed down moves him up the act, and an angle a is the act's -0x80 - a.

import { scan, PROBE_FLOOR, PROBE_WALL, IGNORE_PLATFORMS } from './terrain.js';
import { arcTan2, s8 } from './trig.js';

const SOX = 6, REACH = 2 + SOX;     // the paired sensors sit 8 px either side of the centre
const MAX_SNAP = 11;                // grounded sensors never pull Sonic further than this
const quadrant = rot => (((rot & 0xFF) + 0x20) & 0xC0) >> 6;

/** An angle turned over top to bottom: Sonic's under flipped gravity to the act's, and back. */
export const flipAngle = rot => (-0x80 - rot) & 0xFF;
/** The angle of the surface Sonic is on, as the act has it. */
export const actAngle = p => (p.inverted ? flipAngle(p.rotation) : p.rotation);

// ground mode from the angle, with the original's rounding at the 45° edges (sub_8022D6C)
function groundMode(rot) {
  const r = s8(rot);
  return (((r + (r > -0x20 && r <= 0 ? 0x20 : 0x1F)) & 0xFF) >> 6);
}

/** Two scans; the nearer one wins, ties going to the second. */
function pair(a, b) {
  return a.d < b.d ? { d: a.d, rot: a.rot, out: b.d } : { d: b.d, rot: b.rot, out: a.d };
}

// the sensor pairs the air code and the jump check use (sub_8029BB8, sub_8021B08, sub_802195C, sub_8021A34)
function floorPair(p, t) {
  const x = Math.floor(p.x), y = Math.floor(p.y) + p.offsetY, m = p.layer | (p.ysp < 0 ? IGNORE_PLATFORMS : 0);
  return pair(scan(t, y, x - REACH, m, 8, PROBE_FLOOR), scan(t, y, x + REACH, m, 8, PROBE_FLOOR));
}
function ceilingPair(p, t) {
  const x = Math.floor(p.x), y = Math.floor(p.y) - p.offsetY, m = p.layer | (p.ysp < 3 ? IGNORE_PLATFORMS : 0);
  return pair(scan(t, y, x - REACH, m, -8, PROBE_FLOOR), scan(t, y, x + REACH, m, -8, PROBE_FLOOR));
}
function leftPair(p, t) {
  const x = Math.floor(p.x) - REACH, y = Math.floor(p.y), m = p.layer | (p.ysp < 3 ? IGNORE_PLATFORMS : 0);
  return pair(scan(t, x, y - p.offsetY, m, -8, PROBE_WALL), scan(t, x, y + p.offsetY, m, -8, PROBE_WALL));
}
function rightPair(p, t) {
  const x = Math.floor(p.x) + REACH, y = Math.floor(p.y), m = p.layer | (p.ysp < 3 ? IGNORE_PLATFORMS : 0);
  return pair(scan(t, x, y - p.offsetY, m, 8, PROBE_WALL), scan(t, x, y + p.offsetY, m, 8, PROBE_WALL));
}

// his floor and his ceiling (sub_8029B88, sub_8029B58): flipped, the act's ceiling and floor, whose distance
// counts the other way. An odd angle (or none) reads 0, and flipped, an even one is turned over.
const sensed = (r, flip) => ({ ...r, rot: r.rot === undefined || r.rot & 1 ? 0 : flip ? flipAngle(r.rot) : r.rot });
/** The floor under him and the ceiling over him, as he sees them ({ d, rot, out }; sub_8029B88, sub_8029B58). */
export const floorUnder = (p, t) => sensed(p.inverted ? ceilingPair(p, t) : floorPair(p, t), p.inverted);
export const ceilingOver = (p, t) => sensed(p.inverted ? floorPair(p, t) : ceilingPair(p, t), p.inverted);
/** The act's floor and ceiling under and over him, whichever way gravity pulls (sub_8029B0C, sub_8029AC0). */
export const actFloor = (p, t) => sensed(floorPair(p, t), p.inverted);
export const actCeiling = (p, t) => sensed(ceilingPair(p, t), p.inverted);
/** The wall to his left (dir -1) or right, with its two sensors at his top and bottom (sub_8029A28, sub_8029A74). */
export const wallBeside = (p, t, dir) => sensed(dir < 0 ? leftPair(p, t) : rightPair(p, t), p.inverted);

/** Room above (or beyond) Sonic in the act's direction `angle` (sub_8022F58); a jump needs at least 4 px. */
export function clearance(p, t, angle) {
  return [floorPair, leftPair, ceilingPair, rightPair][quadrant(angle)](p, t).d;
}

/**
 * Keeps a grounded Sonic on the surface (sub_8022D6C): snaps him onto it, follows its angle, or lets him
 * fall off when it drops away faster than he moves.
 */
export function groundSensors(p, t) {
  const x = Math.floor(p.x), y = Math.floor(p.y), soy = p.offsetY;
  const mode = groundMode(actAngle(p));
  let a, b, speed;
  if (mode === 0) {
    a = scan(t, y + soy, x - REACH, p.layer, 8, PROBE_FLOOR); b = scan(t, y + soy, x + REACH, p.layer, 8, PROBE_FLOOR); speed = p.xsp;
  } else if (mode === 1) {
    a = scan(t, x - soy, y - REACH, p.layer, -8, PROBE_WALL); b = scan(t, x - soy, y + REACH, p.layer, -8, PROBE_WALL); speed = p.ysp;
  } else if (mode === 2) {
    a = scan(t, y - soy, x + REACH, p.layer, -8, PROBE_FLOOR); b = scan(t, y - soy, x - REACH, p.layer, -8, PROBE_FLOOR); speed = p.xsp;
  } else {
    a = scan(t, x + soy, y + REACH, p.layer, 8, PROBE_WALL); b = scan(t, x + soy, y - REACH, p.layer, 8, PROBE_WALL); speed = p.ysp;
  }
  // the scans' angles persist in the player and stay stale when a scan finds nothing
  if (a.rot !== undefined) p.rotA = a.rot;
  if (b.rot !== undefined) p.rotB = b.rot;
  const val = Math.min(a.d, b.d), rot = a.d < b.d ? p.rotA : p.rotB;

  if (val < -MAX_SNAP) return;
  if (val > 0 && val > Math.min(Math.floor(Math.abs(speed)) + 3, MAX_SNAP)) { p.air = true; p.pushing = false; return; }
  if (mode === 0) p.y += val;
  else if (mode === 1) p.x -= val;
  else if (mode === 2) p.y -= val;
  else p.x += val;
  if (!(rot & 1)) p.rotation = p.inverted ? flipAngle(rot) : rot;   // odd angles mean "keep the previous one"
}

/**
 * Stops Sonic at a wall ahead of him, one frame early (sub_8023128 walking, sub_80231C0 rolling and in the
 * B-button combo). Returns true when he was pushed back by a wall to his side; walking, that starts a push.
 */
export function wallPush(p, t, rolling = false) {
  if (p.gsp === 0) return false;
  const a = (p.rotation + (p.gsp >= 0 ? -0x40 : 0x40)) & 0xFF;
  p.rotA = p.rotB = a;
  // the scan's own rounding, which differs from the plain quadrant used below at the 45° edges
  const sa = s8(a), up = ((a + 0x20) & 0xFF) >= 0x01 && ((a + 0x20) & 0xFF) <= 0x7F;
  const q = ((a + (up === (sa <= 0) ? 0x20 : 0x1F)) & 0xFF) >> 6;
  const x = Math.floor(p.x), y = Math.floor(p.y);
  const d = q === 0 ? scan(t, y + REACH, x, p.layer, 8, PROBE_FLOOR).d
    : q === 1 ? scan(t, x - REACH, y, p.layer, -8, PROBE_WALL).d
    : q === 2 ? scan(t, y - REACH, x, p.layer, -8, PROBE_FLOOR).d
    : scan(t, x + REACH, y, p.layer, 8, PROBE_WALL).d;
  if (d > 0) return false;
  switch (quadrant(a)) {
    case 0: p.y += d; p.ysp = 0; return false;
    case 1: p.x -= d; p.xsp = 0; p.gsp = 0; p.pushing ||= !rolling; return true;
    case 2: p.y -= d; p.ysp = 0; p.air = true; return false;
    default: p.x += d; p.xsp = 0; p.gsp = 0; p.pushing ||= !rolling; return true;
  }
}

// the wall checks every air direction starts with: 9 px out, one pixel wider than on the ground; moving
// sideways under flipped gravity they don't pass through the platforms
function airWall(p, t, dir, solid = false) {
  const m = p.layer | (p.ysp < 3 && !solid ? IGNORE_PLATFORMS : 0), x = Math.floor(p.x), y = Math.floor(p.y);
  const { d } = scan(t, x + dir * (3 + SOX), y, m, 8 * dir, PROBE_WALL);
  if (d > 0) return false;
  p.x += dir * d; p.xsp = 0;
  return true;
}

/**
 * Collision for an airborne Sonic, by the direction he moves (sub_8022190). `land(rot)` touches him down on
 * a surface of angle `rot`; the speed conversion that follows depends on the direction. Standing still in the
 * air he counts as moving right, or left under flipped gravity.
 */
export function airCollision(p, t, land) {
  const vx = Math.round(p.xsp * 256), vy = Math.round(p.ysp * 256), down = p.inverted ? -1 : 1;
  const a = vx || vy ? arcTan2(vx, vy) >> 8 : p.inverted ? 0x80 : 0;
  switch (((a - 0x20) & 0xC0) >> 6) {
    case 0: {   // moving down
      airWall(p, t, -1); airWall(p, t, 1);
      const f = floorUnder(p, t);
      if (f.d >= 0 || f.out < -(Math.floor(p.ysp) + 6)) return;
      p.rotation = f.rot; p.y += down * f.d;
      land();
      landingSpeed(p, f.rot);
      return;
    }
    case 2: {   // moving up
      airWall(p, t, -1); airWall(p, t, 1);
      const c = ceilingOver(p, t);
      if (c.d > 0) return;
      p.y -= down * c.d;
      // only one of the two steep ceiling slopes catches him (0x41–0x5F), as in the original
      if (((c.rot + 0x20) & 0x40) && s8(c.rot) > 0x40) {
        p.rotation = c.rot; land(); p.gsp = Math.abs(p.ysp);
        return;
      }
      p.ysp = 0;
      return;
    }
    default: {  // moving left (1) or right (3)
      const dir = a >= 0x60 && a < 0xA0 ? -1 : 1;
      if (airWall(p, t, dir, p.inverted)) p.gsp = p.ysp;   // a quirk of the original
      const c = ceilingOver(p, t);
      if (c.d <= 0) {
        p.y -= down * c.d;
        if (p.ysp < 0) p.ysp = 0;
      } else if (p.ysp >= 0) {
        const f = floorUnder(p, t);
        if (f.d > 0) return;
        p.y += down * f.d; p.rotation = f.rot;
        land();
        p.ysp = 0; p.gsp = p.xsp;
      }
    }
  }
}

// a wall `reach` px out to one side, which stops him and marks it in the glide's flags (0x20)
function glideWall(p, t, dir, reach) {
  const m = p.layer | (p.ysp < 3 ? IGNORE_PLATFORMS : 0), x = Math.floor(p.x), y = Math.floor(p.y);
  const { d } = scan(t, x + dir * (reach + SOX), y, m, 8 * dir, PROBE_WALL);
  if (d > 0) return;
  p.x += dir * d; p.xsp = 0;
  p.glideFlags |= 0x20;
}
// touching down clears the glide's flag 0x2
function glideFloor(p, t, down) {
  const f = floorUnder(p, t);
  if (f.d > 0) return;
  p.y += down * f.d; p.rotation = f.rot; p.ysp = 0;
  p.glideFlags &= ~2;
}

/**
 * Collision for Knuckles' glide, his drop from it and his slide after it (sub_8022838): by the way he moves,
 * the walls (3 px further out than his sides moving up or down, 2 moving sideways) stop him and set flag 0x20 of
 * p.glideFlags, and the ground clears its flag 0x2, as standing on an object does. Moving sideways, a ceiling
 * stops him rising and he touches down only while not rising.
 */
export function glideCollision(p, t) {
  if (p.onObject) { p.glideFlags &= ~2; p.rotA = p.rotB = 0; return; }
  const vx = (Math.round(p.xsp * 256) << 16) >> 16, vy = (Math.round(p.ysp * 256) << 16) >> 16, down = p.inverted ? -1 : 1;
  const a = arcTan2(vx, vy) >> 8;
  switch (((a - 0x20) & 0xC0) >> 6) {
    case 0:   // moving down
      glideWall(p, t, -1, 3); glideWall(p, t, 1, 3);
      glideFloor(p, t, down);
      return;
    case 2: {   // moving up
      glideWall(p, t, -1, 3); glideWall(p, t, 1, 3);
      const c = ceilingOver(p, t);
      if (c.d <= 0) { p.y -= down * c.d; p.ysp = 0; }
      return;
    }
    default: {  // moving left (1) or right (3)
      glideWall(p, t, a >= 0x60 && a < 0xA0 ? -1 : 1, 2);
      const c = ceilingOver(p, t);
      if (c.d <= 0) {
        p.y -= down * c.d;
        if (p.ysp < 0) p.ysp = 0;
      } else if (p.ysp >= 0) glideFloor(p, t, down);
    }
  }
}

// ground speed after landing on a surface of angle `rot` while falling (sub_8021C4C)
function landingSpeed(p, rot) {
  const sign = s8(rot) < 0 ? -1 : 1;
  if ((rot + 0x20) & 0x40) {
    p.xsp = 0; p.ysp = Math.min(p.ysp, 11.8125);
    p.gsp = Math.abs(p.ysp) * sign;
  } else if (!((rot + 0x10) & 0x20)) {
    p.ysp = 0; p.gsp = p.xsp;
  } else {
    p.ysp = Math.floor(p.ysp * 128) / 256;   // arithmetic shift of the 8.8 value
    p.gsp = Math.abs(p.ysp) * sign;
  }
}

/** Moves the centre so the feet stay put when the sprite's Y offset changes (Player_HandleSpriteYOffsetChange). */
export function setOffsetY(p, soy) {
  const dlt = soy - p.offsetY;
  if (!dlt) return;
  switch (groundMode(actAngle(p))) {
    case 0: p.y -= dlt; break;
    case 1: p.x += dlt; break;
    case 2: p.y += dlt; break;
    default: p.x -= dlt;
  }
  p.offsetY = soy;
}
