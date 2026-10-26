// Angel Island's hang bars (SAT-R decompilation, src/game/sa1/stage/interactables/hang_bar.c), kind 83: an
// invisible bar along the top of a box, d0 and d1 tiles (signed) from its point and d2 by d3 tiles big. Falling
// with his centre in the box, Sonic catches it: it holds him (MOVESTATE_IA_OVERRIDE) 16 px under it, still or
// moving 2 px a frame the way he holds, until he presses jump or goes past either end, when it drops him 22 px
// under it, falling from rest in the air with the spin attack on, at 2 px a frame the way he holds. Its task runs
// after Sonic's, at priority 0x8000, and it leaves once its point is out of range with nobody on it.

import { offCam } from './objects.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';
import { SPRITE_OFFSET_Y } from './constants.js';

export const HANG_BAR = 83;
const s8 = v => (v << 24) >> 24;
const HANG = 16, CATCH = 18, DROP = 22, STEP = 2;

/** The task for a hang bar entity, or null when `e` is not one. */
export function createHangBar(e, slot) {
  if (e.kind !== HANG_BAR) return null;
  const left = e.x + s8(e.d[0]) * 8, right = left + e.d[2] * 8;
  const top = e.y + s8(e.d[1]) * 8, bottom = top + e.d[3] * 8;
  let on = false, x = 0;   // whether it holds him, and where it last put him
  // hanging still (character state 35) or moving along it (36), facing the way he holds
  function pose(p, input) {
    if (input.right) { p.state = 'hangMove'; p.facing = 1; return 1; }
    if (input.left) { p.state = 'hangMove'; p.facing = -1; return -1; }
    p.state = 'hang';
    return 0;
  }
  return {
    priority: 0x8000,
    run(ctx) {
      const p = ctx.player, input = ctx.input;
      if (on) {
        if (p.dead) on = false;
        else {
          p.x = x + STEP * pose(p, input);
          p.y = e.y + HANG;
          x = p.x;
          if (p.jumpPressed || Math.floor(p.x) < left || Math.floor(p.x) > right) {
            // Player_TransitionCancelFlyingAndBoost; the spin attack goes on, the sprite offsets staying
            endAttack(p); p.pushing = false;
            p.carried = false; p.curled = true;
            p.ysp = 0; p.y = e.y + DROP; p.air = true;
            p.state = 'springPeak';   // character state 18
            const dir = input.right ? 1 : input.left ? -1 : 0;
            if (dir < 0) p.facing = -1;
            p.gsp = p.xsp = STEP * dir;
            on = false;
          }
        }
      } else if (!p.dead && p.ysp > 0) {
        const px = Math.floor(p.x), py = Math.floor(p.y);
        if (px >= left && px <= right && py >= top && py <= bottom) {
          p.rotation = 0;
          endAttack(p); p.pushing = false;
          p.carried = true; p.air = false;
          pose(p, input);
          p.y = e.y + CATCH;
          // PLAYERFN_CHANGE_SHIFT_OFFSETS(p, 6, 14): his feet stay where they are, and a spin attack stays on
          setOffsetY(p, SPRITE_OFFSET_Y);
          on = true; x = p.x;
        }
      }
      if (!on && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
