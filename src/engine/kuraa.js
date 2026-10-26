// Kuraa, Ice Mountain's crab (SAT-R decompilation, src/game/sa1/stage/enemies/kuraa.c). It walks a quarter
// of a pixel a frame between d0 × 8 and (d0 + d2) × 8 px right of its spawn point, turning at either end. Away
// from the ends it snaps its claws for 120 frames, then walks on and doesn't snap again for 500 frames spent
// walking between the ends. Its sprite is a left half, drawn again mirrored for the right.
//
// While it snaps it can't be destroyed, and touching its box hurts Sonic. The original tests that box at the
// spawn point instead of where the crab has walked to: the crab hurts where it started, kept here (issue #56).

import { startAnim, animate } from './objects.js';
import { I, TILE, data, gone, sprite } from './enemies.js';
import { overlap } from './collide.js';

export const KURAA = 19;

const STEP = 64;   // a quarter of a pixel, in 1/256 px
const SNAP = 120, REST = 500;

export function kuraa(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('kuraaWalk', anims, { order: 18, prio: 2 });
  let q = 0, v = -STEP, snapping = false, t = 0, rest = 0;
  const show = (ctx, x, y) => {
    ctx.draw(s, x, y);
    ctx.draw({ ...s, flipX: true }, x, y);
  };
  return {
    run(ctx) {
      const p = ctx.player;
      if (!snapping) {
        q += v;
        const x = e.x + I(q), y = e.y;
        if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
        if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
        if (I(q) <= d0 * TILE) v = STEP;
        else if (I(q) >= (d0 + d2) * TILE) v = -STEP;
        else if (rest !== 0) rest--;
        else { t = 0; rest = REST; startAnim(s, 'kuraaSnap', true); snapping = true; }
        animate(s, ctx.anims);
        show(ctx, x, y);
        return true;
      }
      const x = e.x + I(q), y = e.y;
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (s.boxes[0] && p.boxes[0] && overlap(e.x, e.y, s.boxes[0], Math.floor(p.x), Math.floor(p.y), p.boxes[0])) ctx.world.damage();
      if (++t >= SNAP) { startAnim(s, 'kuraaWalk', true); snapping = false; }
      animate(s, ctx.anims);
      show(ctx, x, y);
      return true;
    },
  };
}
