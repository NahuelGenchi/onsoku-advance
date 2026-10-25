// Lava (SAT-R decompilation, src/game/sa1/stage/interactables/lava.c): an area with nothing drawn, from its spawn
// point d2 tiles across and d3 down, both edges in. On every frame Sonic's position is in it, he is alive and no
// object carries him, d0 decides: 0 hurts him as spikes do (unless he is invincible), anything else kills him
// where he is, keeping his speeds. Angel Island act 1's one lava pool kills. It leaves when its spawn point
// leaves the camera's range (where, as the waterfalls do, it would halve his falling speed behind a flag
// that is never set).

import { offCam } from './objects.js';

export const LAVA = 105;

/** The task for a lava entity, or null when `e` is not one. */
export function createLava(e, slot) {
  if (e.kind !== LAVA) return null;
  const right = e.x + e.d[2] * 8, bottom = e.y + e.d[3] * 8, kills = e.d[0] !== 0;
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (!p.carried && x >= e.x && x <= right && y >= e.y && y <= bottom && !p.dead) {
        if (!kills) ctx.world.damage();
        else p.dead = true;
      }
      return true;
    },
  };
}
