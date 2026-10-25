// Angel Island's torches (SAT-R decompilation, src/game/sa1/stage/interactables/torch.c): a flame that only
// burns, drawn behind the other sprites. Its animation steps before it is drawn, from the frame it is made.
// (Cosmic Angel uses the same kind for its antigravity units, with its own animations.)

import { makeSprite, animate, offCam } from './objects.js';

export const TORCH = 87;

/** The task for a torch entity, or null when `e` is not one. */
export function createTorch(e, slot) {
  if (e.kind !== TORCH) return null;
  const s = makeSprite('torch', { order: 28 });
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(s, ctx.anims);
      ctx.draw(s, e.x, e.y);
      return true;
    },
  };
}
