// Another player as a solid thing this GBA's Sonic stands on and is pushed by (SAT-R decompilation,
// src/game/shared/stage/collision_1.c, the SA1 sub_800D0A0; that draft doesn't match yet, so this follows its
// assembly, asm/non_matching/game/shared/stage/collision__sa2__sub_800D0A0.inc). It tests Sonic against the
// other player's body as their packets show it, a box as wide as Sonic's side probe and as tall as the other
// player is, and moves Sonic out: onto their head when he comes down on it, or out of their side. A player
// rushing at him faster than 4.5 px a frame takes him along, bounces him off or knocks him back. Only the
// normal gravity half is here: the stage of this mode has no gravity switch.

import { tileEdge, PROBE_FLOOR, PROBE_WALL } from './terrain.js';
import { land, standUp } from './player.js';
import { SONG } from '../sound/songs.js';

const SOX = 6;                      // spriteOffsetX
const FAST = 0x480;                 // 4.5 px a frame
const BOUNCE_X = 0x180, BOUNCE_Y = -0x300;
// the result bits
const LANDED = 8, PUSHING = 0x20, FACING_LEFT = 1, FROM_BELOW = 0x10000, ON_RIGHT = 0x20000,
  ON_LEFT = 0x40000, RUSHED = 0x200000;
const I = q => q >> 8;
const q8 = v => Math.round(v * 256);

const overlap = (x0, y0, a, x1, y1, b) => {
  const l0 = x0 + a[0], l1 = x1 + b[0], t0 = y0 + a[1], t1 = y1 + b[1];
  return ((l0 <= l1 && l0 + (a[2] - a[0]) >= l1) || (l0 >= l1 && l1 + (b[2] - b[0]) >= l0))
    && ((t0 <= t1 && t0 + (a[3] - a[1]) >= t1) || (t0 >= t1 && t1 + (b[3] - b[1]) >= t0));
};

// out of a ball, standing (PLAYERFN_CHANGE_SHIFT_OFFSETS), when the terrain stops what the test would do
const stopped = p => { p.curled = false; p.air = false; standUp(p); };

/**
 * Multiplayer player `m` against Sonic `p` (ctx.player). `rush` (arg6) is whether a fast player carries him
 * along instead of knocking him; `knock` knocks him (sub_800DE44). Returns what happened, as the original's
 * bits.
 */
export function solidPlayer(m, p, ctx, rush, knock) {
  if (!m.boxes[0].active || p.dead) return 0;
  const wx = m.pos.x, wy = m.pos.y, vx = m.qvx, vy = m.qvy, layer = (m.flags >> 7) & 1;
  const qx = q8(p.x), qy = q8(p.y), px = I(qx), py = I(qy);
  if (wx === px && wy === py) return 0;
  if (layer !== p.layer) return 0;
  const terrain = ctx.world.terrain, play = ctx.world.playSound;
  const flank = [-(SOX + 5), 1 - p.offsetY, SOX + 5, p.offsetY - 1];
  const body = [-SOX, -p.offsetY, SOX, p.offsetY];
  const them = [-(SOX + 5), 1 - m.offsetY, SOX + 5, m.offsetY - 1];
  let res = 0, stoodHere = false;
  if (p.onObject === m.sprite) { p.onObject = null; stoodHere = true; }
  const ysp = q8(p.ysp);

  const done = () => {
    if (stoodHere && !p.onObject) { p.pushing = false; p.air = true; }
    return res;
  };

  if (wy !== py && overlap(wx, wy, them, px, py, body)) {
    if (py <= wy && ysp - vy >= 0) {
      // onto their head, unless the ceiling there is too low
      const ny = qy + ((wy + them[1] - body[3]) << 8) - (qy & ~0xFF);
      const e = tileEdge(terrain, I(ny) - p.offsetY, px, layer, -8, PROBE_FLOOR);
      if (e < 0) { stopped(p); p.ysp = 0; p.y -= e; return done(); }
      res |= LANDED;
      p.air = false; p.onObject = m.sprite; p.ysp = 0; p.y = ny / 256;
      if (stoodHere) return done();
      land(p); p.gsp = p.xsp; p.rotation = 0;
      return done();
    }
    if (py > wy && ysp - vy < 0) {
      // from below: only the floor under him can move him
      const e = tileEdge(terrain, py + p.offsetY, px, layer, 8, PROBE_FLOOR);
      if (e < 0) { stopped(p); p.ysp = 0; p.y += e; }
      if (q8(p.ysp) - vy <= 0) { res |= FROM_BELOW; return done(); }
    }
  }

  // their sides, unless he runs on a wall
  if ((((p.rotation + 0x20) & 0xC0) >> 6) & 1) return done();
  if (!overlap(wx, wy, them, px, py, flank)) return done();
  const xsp = q8(p.xsp);
  const rushed = () => {
    p.gsp = p.xsp = vx / 256; standUp(p); p.state = 'walk'; p.midAir = 0; p.attack = 0;
    play(SONG.KNOCK_TEAMMATE);
  };
  const knocked = () => { knock(p, 'knocked', ctx.world); play(SONG.KNOCK_OPPONENT); };
  if (px <= wx) {
    res |= ON_LEFT;
    if (p.facing > 0) {
      // facing them from their left
      if (p.attack !== 0) { p.xsp = 0; return done(); }
      const nx = (wx + them[0] - flank[2]) << 8;
      if (Math.abs(xsp) > FAST) {
        res |= RUSHED;
        if (vx > 0) {
          if (rush) { rushed(); return done(); }
          p.gsp = p.xsp = vx / 256; p.x += 1; play(SONG.KNOCK_OPPONENT);
        } else { p.air = true; p.xsp = -BOUNCE_X / 256; p.ysp = BOUNCE_Y / 256; }
      } else if (xsp !== 0) {
        const e = tileEdge(terrain, I(nx), py - SOX, layer, -8, PROBE_WALL);
        if (e < 0) { stopped(p); p.xsp = 0; p.x -= e; return done(); }
        if (!p.air) { p.pushing = true; p.curled = false; res = (res | PUSHING) & ~4; standUp(p); p.state = 'push'; }
        p.facing = 1; res &= ~FACING_LEFT;
        p.gsp = 0; p.xsp = 0;
        p.x = nx / 256; p.y = qy / 256;
      }
    } else {
      // his back to them, from their left
      if (p.attack !== 0) { p.xsp = 0; return done(); }
      if (Math.abs(vx) > FAST) {
        res |= RUSHED;
        if (vx < 0) { if (rush) rushed(); else knocked(); }
        else { p.gsp = 0; p.xsp = 0; }
      }
    }
  } else if (p.facing < 0) {
    // facing them from their right
    res |= ON_RIGHT;
    if (p.attack !== 0) { p.xsp = 0; return done(); }
    const nx = (wx + them[2] - flank[0]) << 8;
    if (Math.abs(xsp) > FAST) {
      res |= RUSHED;
      if (vx < 0) {
        if (rush) { rushed(); return done(); }
        p.gsp = p.xsp = vx / 256; p.x -= 1; play(SONG.KNOCK_OPPONENT);
      } else { p.air = true; p.xsp = BOUNCE_X / 256; p.ysp = BOUNCE_Y / 256; }
    } else if (xsp !== 0) {
      const e = tileEdge(terrain, I(nx), py + SOX, layer, 8, PROBE_WALL);
      if (e < 0) { stopped(p); p.xsp = 0; p.x += e; return done(); }
      if (!p.air) { p.pushing = true; p.curled = false; res = (res | PUSHING) & ~4; p.state = 'push'; standUp(p); }
      p.facing = -1; res |= FACING_LEFT;
      p.gsp = 0; p.xsp = 0;
      p.x = (nx + 0x100) / 256; p.y = qy / 256;
    }
  } else {
    // his back to them, from their right: the original sets this bit in Sonic's own state, not the result
    if (p.attack !== 0) { p.xsp = 0; return done(); }
    if (Math.abs(vx) > FAST) {
      res |= RUSHED;
      if (vx > 0) { if (rush) rushed(); else knocked(); }
      else { p.gsp = 0; p.xsp = 0; }
    }
  }
  return done();
}
