// The boxes that hide Sonic (SAT-R decompilation, src/game/sa1/stage/interactables/toggle_player_visibility.c),
// kind 70, which Casino Paradise puts along its tubes. While his centre is inside one, d2 tiles across and d3
// down from its spawn point, it hides him when its d0 is set and shows him again when it is 0: that is
// MOVESTATE_100000, the player's `invisible`. Once he is dead it shows him. Its task has priority 0x2000 plus
// its d3, and it sees where he was at the end of the last frame.

import { offCam, OBJECTS } from './objects.js';

export const TOGGLE_VISIBILITY = 70;

export function createVisibilityToggle(e, slot) {
  if (e.kind !== TOGGLE_VISIBILITY) return null;
  const w = e.d[2] * 8, h = e.d[3] * 8, hide = e.d[0] !== 0;
  return {
    priority: OBJECTS | e.d[3],
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (p.dead) p.invisible = false;
      else if (x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h) p.invisible = hide;
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
