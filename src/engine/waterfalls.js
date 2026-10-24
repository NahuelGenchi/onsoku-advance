// Neo Green Hill's waterfalls (SAT-R decompilation, src/game/sa1/stage/interactables/waterfall.c). A waterfall
// is an area, d2 × 8 px wide and d3 × 8 px tall, starting d1 × 8 px below its spawn point (d1 is signed):
// while Sonic's centre is in it, the water pushes him down 16/256 px a frame faster, and a splash is drawn
// at his feet. On the ground the push does nothing, since the walk sets his speed from the ground speed.

import { makeSprite, animate, offCam } from './objects.js';
import { s8 } from './trig.js';

export const WATERFALL = 27;

/** The task for a waterfall entity, or null when `e` is not one. */
export function createWaterfall(e, slot, anims) {
  if (e.kind !== WATERFALL) return null;
  const splash = makeSprite('waterSplash', { order: 5, prio: 2 });
  const top = e.y + s8(e.d[1]) * 8, right = e.x + e.d[2] * 8, bottom = top + e.d[3] * 8;
  return {
    run(ctx) {
      const p = ctx.player;
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (!p.dead && x >= e.x && x <= right && y >= top && y <= bottom) {
        p.ysp += 16 / 256;
        // the splash animates only while it is drawn
        animate(splash, anims);
        ctx.draw(splash, x, y + 10);
      }
      return true;
    },
  };
}
