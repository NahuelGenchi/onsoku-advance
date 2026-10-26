// Pierrot, Casino Paradise's clown on a ball (SAT-R decompilation, src/game/sa1/stage/enemies/pierrot.c). It
// rolls 0.625 px a frame between d0 × 8 and (d0 + d2) × 8 px right of its spawn point, following the floor, and
// turns at either end. Its ball (the sprite's second hitbox) can't be broken: Sonic curled up bounces back off
// it, moved back by his speed and turned round, and any other way it hurts him. The clown on top is defeated as
// any enemy is.
//
// The original takes 48 px off its height every frame (Q(0.1875) where a pixel count was meant). It follows
// the floor all the same, as the floor test makes up the difference in its first frames.

import { overlap } from './collide.js';
import { animate } from './objects.js';
import { I, TILE, data, gone, s16, sonicX, sonicY, sprite } from './enemies.js';
import { tileFloor } from './terrain.js';

export const PIERROT = 10;

const STEP = 160;   // 0.625 px, in 1/256 px

export function pierrot(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('pierrot', anims);
  let q = 0, v = -STEP, yoff = 0;
  return {
    run(ctx) {
      const p = ctx.player;
      q += v;
      const x = s16(e.x + I(q)), y = s16(e.y + yoff - 48);
      if (gone(x, y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (!p.dead) {
        if (s.boxes[1] && p.boxes[0] && overlap(x, y, s.boxes[1], sonicX(ctx), sonicY(ctx), p.boxes[0])) {
          if (p.curled) {
            // back by his speed, the other way round
            if (p.facing < 0) { p.x += Math.abs(p.gsp); p.facing = 1; } else { p.x -= Math.abs(p.gsp); p.facing = -1; }
            p.gsp = -p.gsp; p.xsp = -p.xsp;
          } else ctx.world.damage();
        }
        if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      }
      yoff = s16(yoff + tileFloor(ctx.world.terrain, x, y, 1));
      if (I(q) <= d0 * TILE) { v = STEP; s.flipX = true; }
      else if (I(q) >= (d0 + d2) * TILE) { v = -STEP; s.flipX = false; }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
