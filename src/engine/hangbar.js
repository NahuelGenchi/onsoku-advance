// Egg Rocket's hang bars (SAT-R decompilation, src/game/sa1/stage/interactables/hang_bar.c), kind 83: bars
// drawn in the level's layers, with an invisible task that runs after Sonic (priority 0x8000). Falling into its
// area (d0, d1 tiles from its point, d2 × d3 tiles) catches him, hanging 16 px under it; left and right move him
// 2 px a frame along it, and a jump, or moving past either end of the area, drops him with 2 px a frame the way
// he holds, curled up, though shown topping out of a spring's rise.

import { offCam } from './objects.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';

export const HANG_BAR = 83;
const LEFT = 1, RIGHT = 2;   // Sonic's held d-pad bits (player.js)
const TILE = 8;
const SPRITE_OFFSET_Y = 14;
const CATCH_Y = 18, HANG_Y = 16, DROP_Y = 22;   // where it puts his centre, below its point
const STEP = 2, DROP_SPEED = 2;
const s8 = v => (v << 24) >> 24;

/** The task for a hang bar entity, or null when `e` is not one. */
export function createHangBar(e, slot) {
  if (e.kind !== HANG_BAR) return null;
  const x0 = e.x + s8(e.d[0]) * TILE, x1 = x0 + e.d[2] * TILE;
  const y0 = e.y + s8(e.d[1]) * TILE, y1 = y0 + e.d[3] * TILE;
  let on = false, heldX = 0;
  return {
    priority: 0x8000,
    run(ctx) {
      const p = ctx.player;
      if (on) {
        if (p.dead) on = false;
        else {
          if (p.held[0] & RIGHT) { p.state = 'hangMove'; p.facing = 1; p.x = heldX + STEP; }
          else if (p.held[0] & LEFT) { p.state = 'hangMove'; p.facing = -1; p.x = heldX - STEP; }
          else p.state = 'hang';
          p.y = e.y + HANG_Y;
          heldX = p.x;
          const x = Math.floor(p.x);
          if (p.jumpPressed || x < x0 || x > x1) {
            // Player_TransitionCancelFlyingAndBoost
            endAttack(p); p.pushing = false;
            p.carried = false;
            p.curled = true;   // MOVESTATE_SPIN_ATTACK, his sprite offsets as they were
            p.ysp = 0;
            p.state = 'springPeak';
            p.y = e.y + DROP_Y;
            p.air = true;
            if (p.held[0] & RIGHT) p.gsp = p.xsp = DROP_SPEED;
            else if (p.held[0] & LEFT) { p.facing = -1; p.gsp = p.xsp = -DROP_SPEED; }
            else p.gsp = p.xsp = 0;
            on = false;
          }
        }
      } else if (!p.dead && p.ysp > 0) {
        const x = Math.floor(p.x), y = Math.floor(p.y);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
          // his speeds stay as they were, and so does a jump's curl
          p.rotation = 0;
          endAttack(p); p.pushing = false;
          p.carried = true;
          p.air = false;
          if (p.held[0] & RIGHT) { p.state = 'hangMove'; p.facing = 1; }
          else if (p.held[0] & LEFT) { p.state = 'hangMove'; p.facing = -1; }
          else p.state = 'hang';
          p.y = e.y + CATCH_Y;
          on = true;
          heldX = p.x;
          setOffsetY(p, SPRITE_OFFSET_Y);
        }
      }
      if (!on && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
