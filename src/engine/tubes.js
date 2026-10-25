// Angel Island's tubes (SAT-R decompilation, src/game/sa1/stage/interactables/034.c and mini_loop_boost.c):
// kind 34 curls Sonic up at a tube's mouth and kind 35, at its other end, lets him go. Each is a box, d0 and d1
// tiles (signed) from its point and d2 by d3 tiles big, that does nothing but look at Sonic's centre. On every
// frame his centre is in kind 34's box, it takes his controls and curls him into a ball that stays curled
// (player.js stayCurled: landing doesn't stand him up and a roll that stops starts again), and starts the
// rolling sound unless it is already playing. Kind 35's box ends that and gives his controls back, with the
// jump and attack buttons he holds then not counting as presses. Both leave once their point is more than
// 128 px from the screen, and leaving clears his half-pipe flag (MOVESTATE_8000). The item effect bit they
// set and clear (0x80) only matters in multiplayer.

import { offDisplay } from './objects.js';
import { endAttack, curlUp } from './player.js';
import { SONG } from '../sound/songs.js';

export const TUBE_IN = 34, TUBE_OUT = 35;
const s8 = v => (v << 24) >> 24;

// Task_Interactable034 (0x0804D6FD in the USA ROM): Player_TransitionCancelFlyingAndBoost, then MOVESTATE_200,
// the spin attack and MOVESTATE_IGNORE_INPUT with no buttons held or pressed, character state 5 (the roll),
// and m4aSongNumStartOrChange(SE_SPIN_ATTACK); it also lets go of an object's hold (MOVESTATE_IA_OVERRIDE)
function curl(p, ctx) {
  endAttack(p); p.pushing = false;
  p.stayCurled = true;
  p.ignoreInput = true; p.jumpPressed = false;
  ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
  p.state = 'spin';
  curlUp(p);
  p.carried = false;
  ctx.world.playSoundOrChange(SONG.SPIN);
}

// Task_MiniLoop_Base (0x0804D8B5): clears MOVESTATE_200, and gives back held controls with jump and attack
// held (heldInput |= jump | attack)
function release(p, ctx) {
  p.stayCurled = false;
  if (!p.ignoreInput) return;
  p.ignoreInput = false;
  ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
}

/** The task for a tube's end, or null when `e` is not one. Both run at the objects' priority. */
export function createTube(e, slot) {
  if (e.kind !== TUBE_IN && e.kind !== TUBE_OUT) return null;
  const left = e.x + s8(e.d[0]) * 8, top = e.y + s8(e.d[1]) * 8, right = left + e.d[2] * 8, bottom = top + e.d[3] * 8;
  const act = e.kind === TUBE_IN ? curl : release;
  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (offDisplay(e.x, e.y, ctx.cam)) { p.halfPipe = false; slot.live = null; return false; }
      if (x >= left && x < right && y >= top && y < bottom && !p.dead) act(p, ctx);
      return true;
    },
  };
}
