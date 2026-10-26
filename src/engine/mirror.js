// Cosmic Angel's Mirror (SAT-R decompilation, src/game/sa1/stage/enemies/mirror.c): a mirror on legs that walks
// back and forth at 0.625 px a frame between d0 and d0 + d2 tiles from its spawn point. Walking, it can't be
// hurt: touching it hurts Sonic, even while he attacks. Every 90 frames of walking it stops and turns to him for
// 60 frames, and only then can it be destroyed; on the 20th it fires a shot level at 2 px a frame. On easy, zone
// 6's mirrors aren't made; this game plays normal.

import { startAnim, animate } from './objects.js';
import { overlap } from './collide.js';
import { TILE, I, gone, sonicX, sonicY, sprite, data } from './enemies.js';

export const MIRROR = 12;
const SPEED = 160;                 // Q(0.625)
const REST = 90, SHOOT_AT = 20, SHOOT_FRAMES = 60;
const SHOT_SPEED = 512;            // Q(2)
const SHOTS = 0x3000;              // the shots' task priority, after Sonic's

// the shot: it flies level until it is 20 px off the screen's sides, 20 above its top or 80 below its bottom
function shot(x0, y, dir, anims) {
  const s = sprite('mirrorShot', anims, { order: 9, prio: 0 });
  let qx = x0 * 256;
  return {
    run(ctx) {
      qx += dir * SHOT_SPEED;
      const x = I(qx), sx = x - ctx.cam.x, sy = y - ctx.cam.y;
      ctx.projectile(s, x, y);
      if (((sx + 20) & 0xFFFF) > 276 || sy + 20 < 0 || sy > 240) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

/** The Mirror (Task_Mirror, then Task_MirrorShoot). */
export function mirror(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('mirror', anims);
  let off = 0, vx = -SPEED, frames = 0, rest = 0, shooting = false;
  return {
    run(ctx) {
      if (!shooting) off += vx;
      const x = e.x + I(off), y = e.y;
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (!shooting) {
        const p = ctx.player;
        if (s.boxes[0] && p.boxes[0] && overlap(x, y, s.boxes[0], sonicX(ctx), sonicY(ctx), p.boxes[0])) ctx.world.damage();
        if (I(off) <= d0 * TILE) vx = SPEED;
        else if (I(off) >= (d0 + d2) * TILE) vx = -SPEED;
        else if (rest !== 0) rest--;
        else {
          s.flipX = sonicX(ctx) > x;
          rest = REST; frames = 0;
          startAnim(s, 'mirrorShoot');
          shooting = true;
        }
      } else {
        if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
        if (++frames === SHOOT_AT) ctx.add(s.flipX ? shot(x + 8, y - 16, 1, ctx.anims) : shot(x - 8, y - 16, -1, ctx.anims), SHOTS);
        if (frames === SHOOT_FRAMES) { startAnim(s, 'mirror'); shooting = false; }
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
