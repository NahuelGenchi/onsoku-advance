// Egg Rocket's propellers (SAT-R decompilation, src/game/sa1/stage/interactables/propeller.c), kind 103: they
// only spin. Its sprite skips its script's palette load (sprite flag 18), so it shows what the stage left in
// that palette bank, which in Egg Rocket is the same colours.

import { makeSprite, animate, offCam } from './objects.js';

export const PROPELLER = 103;

/** The task for a propeller entity, or null when `e` is not one. */
export function createPropeller(e, slot, anims) {
  if (e.kind !== PROPELLER) return null;
  const o = makeSprite('propeller');
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
