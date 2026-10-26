// Neo Green Hill's mini loops (SAT-R decompilation, src/game/sa1/stage/interactables/034.c, mini_loop.c and
// mini_loop_boost.c): the small tunnels in act 2 that Sonic rolls through, curling round inside the ground.
// Each part is an invisible box, d0 and d1 tiles (signed) from its spawn point to its top left and d2 by d3
// tiles in size, that acts on every frame Sonic's centre is in it:
//   34, the entry: takes his controls and curls him into a ball that keeps rolling (MOVESTATE_200), so he
//       lands curled up, isn't held to the rise cap, and rolls on at 3 px a frame when he would stop;
//   35, the way out: lets him uncurl again and gives his controls back;
//   36, the start of the run: sends him right at 9 px a frame, on the ground;
//   37, the exit: sends him left at 7.25 px a frame, on the ground;
//   38, the entrance: turns him upside down, and on the ground the other way.
// None of them draw. Each one goes when its spawn point is more than 128 px off the screen, and as it does,
// it clears Sonic's half-pipe flag whatever he is on.

import { offDisplay } from './objects.js';
import { endAttack, curlUp } from './player.js';
import { SONG } from '../sound/songs.js';

export const MINI_LOOP_ENTRY = 34, MINI_LOOP_BASE = 35, MINI_LOOP_START_BOOST = 36, MINI_LOOP_EXIT = 37, MINI_LOOP_ENTRANCE = 38;

const s8 = v => (v << 24) >> 24;

// what each part does to Sonic while his centre is in its box; returns nothing
const PARTS = {
  // Task_Interactable034: Player_TransitionCancelFlyingAndBoost, then the forced roll, with no input at all
  // and the spin attack's sound (m4aSongNumStartOrChange, so it doesn't start over while it plays). The
  // teleport bit it also sets only matters in a multiplayer game.
  [MINI_LOOP_ENTRY](p, ctx) {
    if (p.dead) return;
    endAttack(p); p.pushing = false; p.airLock = false;
    p.forcedRoll = true;
    curlUp(p); p.state = 'spin';
    p.ignoreInput = true; p.heldInput = null; p.jumpPressed = false;
    ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
    p.carried = false;
    ctx.world.playSoundOrChange(SONG.SPIN);
  },
  // Task_MiniLoop_Base: the forced roll ends, and his controls come back with the jump and attack buttons he
  // holds then not counting as presses
  [MINI_LOOP_BASE](p, ctx) {
    if (p.dead) return;
    p.forcedRoll = false;
    if (p.ignoreInput) {
      p.ignoreInput = false;
      ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
    }
  },
  // Task_MiniLoop_StartBoost, which doesn't look whether he is alive
  [MINI_LOOP_START_BOOST](p) {
    if (!p.air) p.gsp = 9;
  },
  // Task_MiniLoop_Exit
  [MINI_LOOP_EXIT](p) {
    if (p.dead) return;
    if (!p.air) p.gsp = -7.25;
  },
  // Task_MiniLoop_Entrance
  [MINI_LOOP_ENTRANCE](p) {
    if (p.dead) return;
    p.rotation = 0x80;
    if (!p.air) p.gsp = -p.gsp;
  },
};

/** The task for a mini loop part, or null when `e` is not one. */
export function createMiniLoop(e, slot) {
  const part = PARTS[e.kind];
  if (!part) return null;
  const left = e.x + s8(e.d[0]) * 8, top = e.y + s8(e.d[1]) * 8;
  const right = left + e.d[2] * 8, bottom = top + e.d[3] * 8;
  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (offDisplay(e.x, e.y, ctx.cam)) { p.halfPipe = false; slot.live = null; return false; }
      if (x >= left && x < right && y >= top && y < bottom) part(p, ctx);
      return true;
    },
  };
}
