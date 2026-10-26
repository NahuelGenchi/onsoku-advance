// Neo Green Hill's shrubbery (SAT-R decompilation, src/game/sa1/stage/interactables/shrubbery.c), kind 30:
// the bushes in act 2. Each is an invisible box from its spawn point, d2 by d3 tiles, that Sonic passes in
// front of. The frame his centre gets into it, unless he is dead, leaves fly up from a point up to 16 px either
// side of him and 8 px above or below, by two of the game's random numbers, and the bush rustles. The leaves
// are a task of their own at Sonic's priority (0x3000), in front of everything: their animation, for 51
// frames or until they are out of range.

import { makeSprite, animate, offCam } from './objects.js';
import { SONG } from '../sound/songs.js';

export const SHRUBBERY = 30;
const LEAVES_FRAMES = 52;   // the counter it destroys them at, a frame before it would show the 52nd

// CreateShrubberyParticles and Task_ShrubberyParticles
function leaves(x, y, anims) {
  const s = makeSprite('leaves', { order: 0, prio: 0 });
  let left = LEAVES_FRAMES;
  return {
    run(ctx) {
      if (offCam(x, y, ctx.cam) || --left === 0) return false;
      animate(s, anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

/** The task for a shrubbery entity, or null when `e` is not one. */
export function createShrub(e, slot, anims) {
  if (e.kind !== SHRUBBERY) return null;
  const right = e.x + e.d[2] * 8, bottom = e.y + e.d[3] * 8;
  let inside = false;   // Sonic was in it on the last frame it looked
  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y), world = ctx.world;
      if (x >= e.x && x <= right && y >= e.y && y <= bottom) {
        if (!p.dead) {
          if (!inside) {
            const lx = x + ((world.random() & 0x1F00) >>> 8) - 16;
            const ly = y + ((world.random() & 0x0F00) >>> 8) - 8;
            ctx.add(leaves(lx, ly, anims), 0x3000);
            world.playSound(SONG.SHRUBBERY);
          }
          inside = true;
        }
      } else inside = false;
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
