// Neo Green Hill's incline ramp (SAT-R decompilation, src/game/sa1/stage/interactables/incline_ramp.c), kind
// 26, a box at the top of a slope. While Sonic's centre is in it moving its way faster than 4 px a frame, on
// the ground or in the air, it throws him off: up at 8 px a frame, uncurled and somersaulting, with 4 px a
// frame more its way, up to 17. It does so on every frame he is still in it. With d0 set it points right,
// otherwise left.

import { offCam } from './objects.js';
import { endAttack, standUp } from './player.js';
import { SONG } from '../sound/songs.js';

export const INCLINE_RAMP = 26;
const FAST = 4, RISE = 8, BOOST = 4, MAX = 17;

/** The task for an incline ramp entity, or null when `e` is not one. */
export function createRamp(e, slot) {
  if (e.kind !== INCLINE_RAMP) return null;
  const dir = e.d[0] ? 1 : -1, w = e.d[2] * 8, h = e.d[3] * 8;
  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (!p.dead && x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h && p.xsp * dir > FAST) {
        p.onObject = null; p.air = true; p.jumped = false;
        standUp(p);
        p.ysp = -RISE;
        p.xsp = dir * Math.min(p.xsp * dir + BOOST, MAX);
        // Player_TransitionCancelFlyingAndBoost
        endAttack(p); p.pushing = false; p.airLock = false;
        p.state = 'spring';
        ctx.world.playSound(SONG.SPRING);
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
