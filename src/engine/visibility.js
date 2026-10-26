// The visibility toggles (SAT-R decompilation, src/game/sa1/stage/interactables/toggle_player_visibility.c),
// kind 70: on every frame Sonic's position is in a box d2 by d3 tiles from the spawn point (edges in), they make
// him invisible when d0 is set and visible again otherwise; Secret Base hides him inside its pipes this way.
// Dead, he is made visible wherever he is. The task's priority is 0x2000 plus d3, as the original's is.
// It leaves when its spawn point leaves the camera's range.

import { offCam } from './objects.js';

export const TOGGLE_VISIBILITY = 70;

/** The task for a visibility toggle, or null when `e` is not one. */
export function createVisibilityToggle(e, slot) {
  if (e.kind !== TOGGLE_VISIBILITY) return null;
  const w = e.d[2] * 8, h = e.d[3] * 8, hide = e.d[0] !== 0;
  return {
    priority: 0x2000 | e.d[3],
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (p.dead) p.invisible = false;
      else if (x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h) p.invisible = hide;
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
