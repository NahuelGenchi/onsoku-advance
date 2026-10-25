// Interactable 096 (SAT-R decompilation, src/game/sa1/stage/interactables/096.c), kind 96, at the mouth of
// Secret Base's pipe: on every frame Sonic's position is within 8 px of its spawn point (edges in), it curls him
// into a ball (character state 4, Player_TransitionCancelFlyingAndBoost first). It leaves when its spawn point
// leaves the camera's range.

import { offCam } from './objects.js';
import { endAttack, curlUp } from './player.js';

export const CURLER = 96;

/** The task for a kind 96, or null when `e` is not one. */
export function createCurler(e, slot) {
  if (e.kind !== CURLER) return null;
  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (!p.dead && x >= e.x - 8 && x <= e.x + 8 && y >= e.y - 8 && y <= e.y + 8) {
        endAttack(p); p.pushing = false;
        p.state = 'spin';
        curlUp(p);
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
