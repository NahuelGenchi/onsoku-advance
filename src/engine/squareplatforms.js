// Square platforms (SAT-R decompilation, src/game/sa1/stage/interactables/platform_square.c; the task is at
// 0x0807D0F1 in the USA ROM): a solid block that swings with the stage clock, d2 × 8 px either way across when
// d2 > d3, else d3 × 8 px either way up and down, one swing every 256 frames, half a swing later when the sign
// of d0 (across) or d1 (up and down) is set.
//
// It carries Sonic while he stands on it, by what it moved that frame plus 1 px down, which its top then puts
// him back from, and keeps him out of the terrain across. Its sides push him out on their own, 8 px of slack
// each way, but only once he is lower than its top. It crushes him (he dies where he is) when it would push
// him into the terrain: across, into a wall beside him; up and down, into a ceiling over him while he rides it,
// or onto the floor under him from below. Walking into its side and then away from it leaves his push, and
// once he is clear the platform puts him walking (or curled up, in the air) and stops him.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { platform, overlap, LANDED, FROM_BELOW, LEFT_FACE, RIGHT_FACE } from './collide.js';
import { endAttack } from './player.js';
import { scan, PROBE_FLOOR, PROBE_WALL } from './terrain.js';
import { SINE } from './trig.js';

export const SQUARE_PLATFORM = 55;

const s8 = v => (v << 24) >> 24;
const SOX = 6;
const LEFT = 1, RIGHT = 2;   // Sonic's held d-pad bits (player.js)

/** The task for a square platform entity, or null when `e` is not one. */
export function createSquarePlatform(e, slot, anims) {
  if (e.kind !== SQUARE_PLATFORM) return null;
  const [d0, d1, d2, d3] = e.d;
  const across = d2 > d3, phase = s8(across ? d0 : d1) < 0 ? 0x80 : 0, reach = (across ? d2 : d3) << 11;
  // zones 5 and 6 draw it longer when the other byte is set (levels.js `sprites`)
  const long = (across ? d1 : d0) !== 0 && anims.squarePlatformLong ? 'squarePlatformLong' : 'squarePlatform';
  const o = { ...makeSprite(long), x: e.x, y: e.y };
  animate(o, anims);
  let q = 0, riding = false, touched = false;   // its offset in 1/256 px; Sonic on it; Sonic against its side
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, terrain = ctx.world.terrain;
      const next = Math.imul(reach, SINE[(4 * ((ctx.world.tick + phase) & 0xFF)) & 0x3FF]) >> 14, moved = next - q;
      q = next;
      o.x = e.x + (across ? q >> 8 : 0); o.y = e.y + (across ? 0 : q >> 8);
      if (!p.dead && !p.carried) collide(p, terrain, across ? moved : 0, across ? 0 : moved);
      if (offDisplay(e.x, e.y, cam) && offCam(o.x, o.y, cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, o.x, o.y);
      return true;
    },
  };

  function collide(p, terrain, dx, dy) {
    const hb = o.boxes[0];
    let prevX = p.x, r = 0;
    if (riding) {
      p.x += dx / 256; p.y += dy / 256 + 1;
      // out of a wall the way it carries him (standing still counts as to the left)
      const side = dx > 0 ? SOX + 2 : -(SOX + 2), step = dx > 0 ? 8 : -8;
      const d = Math.min(scan(terrain, Math.floor(p.x) + side, Math.floor(p.y), p.layer, step, PROBE_WALL).d,
        scan(terrain, Math.floor(p.x) + side, Math.floor(p.y) - p.offsetY, p.layer, step, PROBE_WALL).d);
      if (d < 0) p.x += dx > 0 ? d : -d;
      if (ceiling(p, terrain) < 0) {
        if (!across) { p.x = prevX; crush(p); }
      } else if (!overlap(o.x, o.y, hb, Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) riding = false;
    } else {
      const prevY = p.y;
      if (ceiling(p, terrain) < 0) side(p, terrain);
      else r = platform(o, hb, p, terrain);
      if (r & (FROM_BELOW | LEFT_FACE | RIGHT_FACE)) {
        touched = true;
        if (r & RIGHT_FACE) {
          if (across) {
            if (scan(terrain, Math.floor(p.x) + SOX, Math.floor(p.y), p.layer, 8, PROBE_WALL).d <= 0) crush(p);
            else if (p.held[0] & LEFT && !p.air) { p.x -= 1; p.pushing = true; }
          }
        } else if (r & LEFT_FACE) {
          if (across) {
            if (scan(terrain, Math.floor(p.x) - SOX, Math.floor(p.y), p.layer, -8, PROBE_WALL).d < 0) crush(p);
            else if (p.held[0] & RIGHT && !p.air) { p.x += 1; p.pushing = true; }
          }
        } else {
          p.x = prevX;
          if (!across) {
            const y = Math.floor(p.y) + p.offsetY;
            const d = Math.min(scan(terrain, y, Math.floor(p.x) - SOX, p.layer, 8, PROBE_FLOOR).d,
              scan(terrain, y, Math.floor(p.x) + SOX, p.layer, 8, PROBE_FLOOR).d);
            if (d <= 0 && o.y + hb[3] < Math.floor(p.y)) { p.x = prevX; p.y = prevY; crush(p); }
          }
        }
        // (a fourth case, for a flag only the multiplayer test sets, never runs here)
      } else if (touched && p.state === 'push') {
        touched = false;
        p.gsp = 0;
        endAttack(p); p.pushing = false;
        p.state = p.air ? 'spin' : 'walk';
      }
    }
    // a second test while he is above its middle and not rising, which lands him on it
    if (!p.dead && p.ysp >= 0 && o.y > Math.floor(p.y)) {
      side(p, terrain);
      prevX = p.x;
      r = platform(o, hb, p, terrain);
      if (r & LANDED) { riding = true; p.y += 1; }
      else if (r & FROM_BELOW) p.x = prevX;
    }
  }

  // how far into a ceiling his head is, at both sides
  function ceiling(p, terrain) {
    const y = Math.floor(p.y) - p.offsetY;
    return Math.min(scan(terrain, y, Math.floor(p.x) - SOX, p.layer, -8, PROBE_FLOOR).d,
      scan(terrain, y, Math.floor(p.x) + SOX, p.layer, -8, PROBE_FLOOR).d);
  }

  // sub_807E914: out of its sides to a whole pixel (one past its right edge), within 8 px of the left one and
  // 7 px of the right, once he is lower than its top, then out of the floor below and the ceiling above him
  function side(p, terrain) {
    const flank = [-(SOX + 5), 1 - p.offsetY, SOX + 5, p.offsetY - 1], hb = o.boxes[0];
    const px = Math.floor(p.x), py = Math.floor(p.y);
    if (!hb || !overlap(o.x, o.y, hb, px, py, flank) || py <= o.y + hb[1] - flank[3] + 2) return;
    const left = o.x + hb[0] - flank[2], right = o.x + hb[2] - flank[0];
    if (px <= left + 8) p.x = left;
    else if (px >= right - 7) p.x = right + 1;
    else return;
    let d = scan(terrain, py + 9, p.x, p.layer, 8, PROBE_FLOOR).d;
    if (d < 0) p.y += d;
    d = scan(terrain, Math.floor(p.y), p.x, p.layer, -8, PROBE_FLOOR).d;
    if (d < 0) p.y += d;
    // off whatever he stood on, not only this
    p.pushing = false; p.onObject = null;
  }
}

// crushed: he dies where he is, and no object moves him again (MOVESTATE_DEAD | MOVESTATE_IA_OVERRIDE)
function crush(p) {
  p.pushing = false;
  p.dead = true; p.carried = true;
}
