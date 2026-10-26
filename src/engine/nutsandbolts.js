// The nuts and bolts that rain down in Egg Rocket's launch and stage separations (SAT-R decompilation,
// src/game/sa1/stage/nuts_and_bolts_task.c, and the batches egg_rocket_transitions.c makes): each is a task at
// the objects' priority that falls from where it was thrown, and leaves 32 px past the screen's sides or
// bottom, or when its animation has ended and 256 frames have passed.

import { makeSprite, animate } from './objects.js';
import { SINE } from './trig.js';

// gUnknown_080BB41C and gUnknown_080BB42C (0x0B8424 in the USA ROM): the piece a random number 0–7 picks
export const NUTS_AND_BOLTS = ['debris697', 'debris697b', 'debris695', 'debris695b', 'debris696', 'debris696b', 'debris697', 'debris695'];
const GRAVITY = 40;   // 1/256 px a frame, each frame

/** One piece at (x, y) in 1/256 px, moving (vx, vy) 1/256 px a frame, drawn with OAM order `order` and BG priority `prio`. */
export function nutOrBolt(name, x, y, vx, vy, order, prio) {
  const s = makeSprite(name, { order, prio });
  let wait = 256;
  return {
    run(ctx) {
      vy += GRAVITY; x += vx; y += vy;
      const sx = (x >> 8) - ctx.cam.x, sy = (y >> 8) - ctx.cam.y;
      if (wait) wait--;
      if (sx < -32 || sx > 240 + 32 || sy - 32 > 160 || (animate(s, ctx.anims) && wait === 0)) return false;
      ctx.draw(s, x >> 8, y >> 8);
      return true;
    },
  };
}

/**
 * The batch of six the launch and the separations throw from 32 px above the screen, across its first 256
 * columns: three slow ones behind the stage's layers (OAM order 31, BG priority 3), then three twice as fast
 * in front of everything (order 16, priority 0), each up to a random angle; three random numbers each.
 */
export function throwNutsAndBolts(ctx) {
  const x0 = ctx.cam.x, y0 = ctx.cam.y - 32;
  for (const [order, prio, shift] of [[31, 3, 6], [16, 0, 5]]) {
    for (let i = 0; i < 3; i++) {
      const name = NUTS_AND_BOLTS[ctx.world.random() % 8];
      const x = (x0 + (ctx.world.random() & 0xFF)) << 8;
      const a = ctx.world.random() & 0x1FF;
      const vy = Math.abs(SINE[a] >> shift);
      const vx = (-(SINE[a + 256] << (14 - shift))) >> 14;
      ctx.add(nutOrBolt(name, x, y0 << 8, vx, vy, order, prio));
    }
  }
}
