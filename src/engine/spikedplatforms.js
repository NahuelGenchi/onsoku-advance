// Casino Paradise's spiked platforms (SAT-R decompilation, src/game/sa1/stage/interactables/platform_spiked.c),
// kind 61: a block with spikes on top, moving along a sine with the stage timer, every 256 frames. It moves
// sideways d2 × 8 px either way when d2 > d3, else up and down d3 × 8 px, half a period later when d0 (or d1)
// is negative. Its sides and bottom are solid; landing on it hurts. Pushed by a sideways one into a wall, or
// trodden on from above by one moving up and down while he stands, Sonic is crushed. Zone 3's are all spiked on
// top (zone 5's that hang the other way and carry Sonic underneath aren't built).

import { makeSprite, animate, offCam } from './objects.js';
import { overlap, platform, LANDED, FROM_BELOW, LEFT_FACE, RIGHT_FACE } from './collide.js';
import { scan, tileProbe, PROBE_FLOOR, PROBE_WALL } from './terrain.js';
import { endAttack } from './player.js';
import { SINE } from './trig.js';

export const SPIKED_PLATFORM = 61;
const SOX = 6;   // Sonic's spriteOffsetX

// Sonic's wide, short box
const flank = p => [-(SOX + 5), 1 - p.offsetY, SOX + 5, p.offsetY - 1];

// sub_80805C8: with that box on its own, he is put out of the side he is within 8 px of, stopped if he was
// moving into it, then out of the terrain below and above
function pushOut(hb, x, y, p, t) {
  const r = flank(p);
  if (!overlap(x, y, hb, Math.floor(p.x), Math.floor(p.y), r)) return;
  if (Math.floor(p.x) <= x + hb[0] - r[2] + 8) {
    p.x = x + hb[0] - r[2];
    if (p.xsp > 0) { p.gsp = 0; p.xsp = 0; }
  } else {
    const right = x + hb[2] - r[0];
    if (Math.floor(p.x) < right - 8) return;
    p.x = right;
    if (p.xsp < 0) { p.gsp = 0; p.xsp = 0; }
  }
  let d = scan(t, Math.floor(p.y) + 9, Math.floor(p.x), p.layer, 8, PROBE_FLOOR).d;
  if (d < 0) p.y += d;
  d = scan(t, Math.floor(p.y), Math.floor(p.x), p.layer, -8, PROBE_FLOOR).d;
  if (d < 0) p.y += d;
  p.pushing = false; p.onObject = null;
}

const crush = p => { p.pushing = false; p.dead = true; };

/** The task for a spiked platform entity, or null when `e` is not one. */
export function createSpikedPlatform(e, slot, anims) {
  if (e.kind !== SPIKED_PLATFORM) return null;
  const s8 = v => (v << 24) >> 24;
  const sideways = e.d[2] > e.d[3];
  const phase = s8(sideways ? e.d[0] : e.d[1]) >= 0 ? 0 : 0x80;
  const o = makeSprite('spikedPlatform');
  animate(o, anims);   // its only frame, which the task never steps
  let pushed = false;  // he touched a side or the bottom, until he stops pushing

  return {
    run(ctx) {
      const p = ctx.player, t = ctx.world.terrain, hb = o.boxes[0];
      const q = Math.imul((sideways ? e.d[2] : e.d[3]) << 11, SINE[(4 * ((ctx.world.tick + phase) & 0xFF)) & 0x3FF]) >> 14;
      const x = e.x + (sideways ? q >> 8 : 0), y = e.y + (sideways ? 0 : q >> 8);
      o.x = x; o.y = y;

      if (!p.dead && !p.carried) {
        pushOut(hb, x, y, p, t);
        const prevX = p.x, prevY = p.y;
        const f = platform(o, hb, p, t);
        if (f & (FROM_BELOW | LEFT_FACE | RIGHT_FACE)) {
          pushed = true;
          if (f & RIGHT_FACE) {
            if (sideways) {
              // the raw pad, not his controls
              if (ctx.input.left && !p.air) { p.x -= 2; p.pushing = true; }
              if (tileProbe(t, Math.floor(p.x), Math.floor(p.y), p.layer, -8, PROBE_WALL) < 0) crush(p);
            }
          } else if (f & LEFT_FACE) {
            if (sideways) {
              if (ctx.input.right && !p.air) { p.x += 2; p.pushing = true; }
              if (tileProbe(t, Math.floor(p.x), Math.floor(p.y), p.layer, 8, PROBE_WALL) < 0) crush(p);
            }
          } else if (!sideways) {
            p.x = prevX;
            if (!p.air) { p.y = prevY; crush(p); }
          }
        } else if (pushed && p.state === 'push') {
          // Player_TransitionCancelFlyingAndBoost once he stops pushing it
          pushed = false;
          p.gsp = 0; endAttack(p); p.pushing = false;
          p.state = p.air ? 'spin' : 'walk';
        }
        // the spikes: its box raised 8 px, landed on while falling from above its middle
        if (!p.dead && p.ysp >= 0 && y > Math.floor(p.y)) {
          pushOut(hb, x, y, p, t);
          o.y = y - 8;
          const top = platform(o, hb, p, t);
          o.y = y;
          if (top & LANDED) ctx.world.damage();
        }
      }

      // its spawn point and where it is now both out of range
      if (offCam(e.x, e.y, ctx.cam) && offCam(x, y, ctx.cam)) { slot.live = null; return false; }
      ctx.draw(o, x, y);
      return true;
    },
  };
}
