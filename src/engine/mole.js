// Mole (SAT-R decompilation, src/game/sa1/stage/enemies/mole.c), in Secret Base, Egg Rocket and Cosmic Angel:
// a mole in a mound that pops up every 60 frames, facing Sonic, and ducks back after 60 more. Only while it is
// up can it be destroyed or hurt him. Destroyed, it isn't gone: it sinks into its mound for good, which stays
// until the act starts over (the original clears d1 in the act's copy of the entity). With d1 0 it never
// comes up. While it is down it keeps its last box, so for its first frames up it is hit where it was last.

import { startAnim, animate } from './objects.js';
import { gone, sonicX, sprite } from './enemies.js';

export const MOLE = 15;
const WAIT = 60;   // TIME(0, 1)

export function mole(e, slot, anims) {
  const s = sprite('moleDown', anims, { order: 18, prio: 2 });
  let up = false, t = 0;
  return {
    run(ctx) {
      const x = e.x, y = e.y;
      if (gone(x, y, x, y, ctx.cam)) { slot.live = null; return false; }
      if ((slot.d ?? e.d)[1] !== 0) {
        // Task_Mole, then Task_Mole_8071640 while it is up
        if (!up) {
          if (++t >= WAIT) { t = 0; startAnim(s, 'moleUp'); s.flipX = !(x > sonicX(ctx)); up = true; }
        } else {
          if (++t >= WAIT) { t = 0; startAnim(s, 'moleDown'); up = false; }
          if (ctx.attack(s, x, y)) {
            startAnim(s, 'moleDown'); up = false;
            slot.d = [...e.d]; slot.d[1] = 0;
          }
        }
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
