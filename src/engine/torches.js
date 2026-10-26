// Angel Island's torches (SAT-R decompilation, src/game/sa1/stage/interactables/torch.c): a flame that only
// burns, drawn behind the other sprites. Its animation steps before it is drawn, from the frame it is made.
// Cosmic Angel's zone and Chao Hunt D draw the same kind as their antigravity units: one when its d0 is set,
// two side by side when it is 0.

import { makeSprite, animate, offCam } from './objects.js';

export const TORCH = 87;
const ZONE_6 = 5, CHAO_HUNT_D = 17;

/** The task for a torch entity, or null when `e` is not one. */
export function createTorch(e, slot, world) {
  if (e.kind !== TORCH) return null;
  const antigravity = world.zone === ZONE_6 || world.level === CHAO_HUNT_D;
  const s = makeSprite(antigravity ? (e.d[0] ? 'antigravity' : 'antigravityDouble') : 'torch', { order: 28 });
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(s, ctx.anims);
      ctx.draw(s, e.x, e.y);
      return true;
    },
  };
}
