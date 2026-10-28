// Senbon, Secret Base act 1's pincushion (SAT-R decompilation, src/game/sa1/stage/enemies/senbon.c;
// Task_SenbonInit from its asm, which the decompilation doesn't match). It walks 0.625 px a frame between
// (d0 + 1) × 8 and (d0 + d2 - 1) × 8 px right of its spawn point, turning at either end. Away from the ends,
// when Sonic is up to 80 px ahead of it, it stops and puts out its spikes for 60 frames, then walks on and
// doesn't do it again for 120 frames spent walking between the ends. With its spikes out it can't be
// destroyed, and touching their box hurts Sonic. (The original leaves it out of Secret Base on Easy,
// which the port doesn't apply yet.)

import { startAnim, animate } from './objects.js';
import { I, TILE, data, gone, sprite, sonicX } from './enemies.js';
import { overlap } from './collide.js';

export const SENBON = 5;

const STEP = 160;         // 0.625 px, in 1/256 px
const SPIKES = 60, REST = 120, SIGHT = 80;

export function senbon(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('senbonWalk', anims, { order: 18, prio: 2 });
  let q = 0, v = -STEP, spiky = false, t = 0, rest = 0;
  return {
    run(ctx) {
      const p = ctx.player;
      if (!spiky) q += v;
      const x = e.x + I(q), y = e.y;
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (!spiky) {
        // Task_SenbonInit
        if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
        if (I(q) <= (d0 + 1) * TILE) { v = STEP; s.flipX = true; }
        else if (I(q) >= (d0 + d2 - 1) * TILE) { v = -STEP; s.flipX = false; }
        else if (rest !== 0) rest--;
        else {
          const px = sonicX(ctx);
          if (s.flipX ? px >= x && x + SIGHT >= px : px <= x && x - SIGHT <= px) {
            t = 0; startAnim(s, 'senbonSpikes'); spiky = true;
          }
        }
      } else {
        // Task_8070CB4
        if (s.boxes[0] && p.boxes[0] && overlap(x, y, s.boxes[0], Math.floor(p.x), Math.floor(p.y), p.boxes[0])) ctx.world.damage();
        if (++t >= SPIKES) { rest = REST; startAnim(s, 'senbonWalk'); spiky = false; }
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
