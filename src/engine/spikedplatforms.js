// Angel Island's spiked platforms (SAT-R decompilation, src/game/sa1/stage/interactables/platform_spiked.c),
// kind 61: a solid block with spikes on its top (d0 0) or its bottom (any other d0) that swings to and fro
// with the stage clock as a thin platform does: across when d2 is above d3 and up and down otherwise, by d2
// (d3) × 8 px either side, once every 256 frames; a negative d0 (d1) starts it half a swing on. Landing on
// its spikes, or hitting them from below, hurts Sonic; the other face carries him. Squeezed into a wall or a
// ceiling by it, he dies on the spot. Casino Paradise's, always spikes up, isn't built.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { platform, overlap, LANDED, FROM_BELOW, LEFT_FACE, RIGHT_FACE } from './collide.js';
import { scan, tileScan, PROBE_FLOOR, PROBE_WALL } from './terrain.js';
import { endAttack } from './player.js';
import { SINE } from './trig.js';

export const SPIKED_PLATFORM = 61;

const s8 = v => (v << 24) >> 24;
const SOX = 6;   // Sonic's spriteOffsetX

// sub_80805C8 (0x080802D0 in the USA ROM): with his flank box (the wider, shorter one that finds what is
// beside him) in the platform's box, it puts him out at the side he is within 8 px of, stopping him if he was
// moving into it, then up out of any ground under and over his centre, and he is no longer pushing or
// standing on anything. Deeper in, it leaves him be.
function pushOut(o, hb, p, terrain) {
  const rect = [-(SOX + 5), 1 - p.offsetY, SOX + 5, p.offsetY - 1];
  const px = Math.floor(p.x);
  if (!overlap(o.x, o.y, hb, px, Math.floor(p.y), rect)) return;
  if (px <= o.x + hb[0] - rect[2] + 8) {
    p.x = o.x + hb[0] - rect[2];
    if (p.xsp > 0) { p.gsp = 0; p.xsp = 0; }
  } else if (px >= o.x + hb[2] - rect[0] - 8) {
    p.x = o.x + hb[2] - rect[0];
    if (p.xsp < 0) { p.gsp = 0; p.xsp = 0; }
  } else return;
  let d = scan(terrain, Math.floor(p.y) + 9, Math.floor(p.x), p.layer, 8, PROBE_FLOOR).d;
  if (d < 0) p.y += d;
  d = scan(terrain, Math.floor(p.y), Math.floor(p.x), p.layer, -8, PROBE_FLOOR).d;
  if (d < 0) p.y += d;
  p.pushing = false; p.onObject = null;
}

// he dies where he is (MOVESTATE_DEAD, with no hurt first)
function crush(p) { p.pushing = false; p.dead = true; }

/**
 * The task for a spiked platform entity, or null when `e` is not one. Animation 538 (spikes up) or 539
 * (spikes down), in OAM order 18 and BG priority 2; its box is set once, as it is made. It runs in
 * Task_Platform_Spiked (`0x0807F835` in the USA ROM) at the objects' priority.
 */
export function createSpikedPlatform(e, slot, anims) {
  if (e.kind !== SPIKED_PLATFORM) return null;
  const up = e.d[0] === 0;
  const o = makeSprite(up ? 'spikedPlatformUp' : 'spikedPlatformDown');
  animate(o, anims);
  const across = e.d[2] > e.d[3];
  const phase = s8(across ? e.d[0] : e.d[1]) < 0 ? 0x80 : 0, reach = (across ? e.d[2] : e.d[3]) << 11;
  let q = 0;              // the offset, in 1/256 px
  let riding = false;     // he stands on its top (unk4E)
  let beside = false;     // he touched its sides or bottom (unk4F)
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, t = ctx.world.terrain;
      const next = Math.imul(reach, SINE[(4 * ((ctx.world.tick + phase) & 0xFF)) & 0x3FF]) >> 14, moved = next - q;
      q = next;
      const x = e.x + (across ? q >> 8 : 0), y = e.y + (across ? 0 : q >> 8), hb = o.boxes[0];
      o.x = x; o.y = y;
      if (!p.dead && !p.carried) {
        const prevX = p.x;
        if (riding) {
          // it carries him by what it moved, plus 1 px down, which its top then puts him back from; the
          // terrain at his centre puts him out on the side it moves him to, and the ceiling over it crushes
          // him while it moves up and down
          if (across) p.x += moved / 256;
          p.y += 1 + (across ? 0 : moved / 256);
          const dx = across ? moved : 0;
          if (dx > 0) {
            const d = tileScan(t, Math.floor(p.x) + 4, Math.floor(p.y), p.layer, 8, PROBE_WALL);
            if (d < 0) p.x += d;
          } else {
            const d = tileScan(t, Math.floor(p.x), Math.floor(p.y), p.layer, -8, PROBE_WALL);
            if (d < 0) p.x -= d;
          }
          if (tileScan(t, Math.floor(p.y) - 5, Math.floor(p.x), p.layer, -8, PROBE_FLOOR) < 0) {
            if (!across) { p.x = prevX; crush(p); }
          } else if (!overlap(x, y, hb, Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) riding = false;
        } else {
          pushOut(o, hb, p, t);
          const px = p.x, py = p.y;
          const flags = platform(o, hb, p, t);
          if (flags & (FROM_BELOW | LEFT_FACE | RIGHT_FACE)) {
            beside = true;
            if (flags & RIGHT_FACE) {
              // at a side of one that moves across, holding toward it on the ground moves him 2 px into it, and
              // with his centre in a wall he is crushed
              if (across) {
                if (ctx.input.left && !p.air) { p.x -= 2; p.pushing = true; }
                if (tileScan(t, Math.floor(p.x), Math.floor(p.y), p.layer, -8, PROBE_WALL) < 0) crush(p);
              }
            } else if (flags & LEFT_FACE) {
              if (across) {
                if (ctx.input.right && !p.air) { p.x += 2; p.pushing = true; }
                if (tileScan(t, Math.floor(p.x), Math.floor(p.y), p.layer, 8, PROBE_WALL) < 0) crush(p);
              }
            } else if (!across) {
              // under one that moves up and down, on the ground he is crushed, and in the air its spikes hurt
              p.x = px;
              if (!p.air) { p.y = py; crush(p); }
              else if (!up) ctx.world.damage();
            } else if (!up) ctx.world.damage();
          } else if (beside && p.state === 'push') {
            // off its side, he stops pushing (character state 14) and walks, or rolls in the air
            beside = false;
            p.gsp = 0;
            endAttack(p); p.pushing = false;   // Player_TransitionCancelFlyingAndBoost
            p.state = p.air ? 'spin' : 'walk';
          }
        }
        // above its origin and not rising, he lands on its top as if it were 8 px higher, then is put 8 px
        // down onto it: onto its spikes, he is hurt, and otherwise it carries him
        if (!p.dead && p.ysp >= 0 && y > Math.floor(p.y)) {
          pushOut(o, hb, p, t);
          o.y = y - 8;
          const flags = platform(o, hb, p, t);
          o.y = y;
          if (flags & LANDED) {
            if (up) ctx.world.damage();
            else { riding = true; p.y += 8; }
          }
        }
      }
      if (offDisplay(e.x, e.y, cam) && offCam(x, y, cam)) { slot.live = null; return false; }
      ctx.draw(o, x, y);
      return true;
    },
  };
}
