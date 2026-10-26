// Angel Island Zone's updraft debris (SAT-R decompilation, src/game/sa1/stage/interactables/updraft.c), kind
// 97: a bit of debris that rises 64 px over and over inside a whirlwind (kind 90), 8 px at a time. It is only
// a sprite; d0 picks which: 0 the first (every 4 frames), 1 the third (every 5), any other the second (every 6).

import { makeSprite, animate, offCam } from './objects.js';

export const UPDRAFT = 97;

/** The task for an updraft debris entity, or null when `e` is not one. */
export function createUpdraft(e, slot, anims) {
  if (e.kind !== UPDRAFT) return null;
  // its animation only starts on its first frame
  const o = makeSprite(e.d[0] === 0 ? 'debrisA' : e.d[0] === 1 ? 'debrisC' : 'debrisB');
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
