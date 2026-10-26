// Secret Base's fireballs (SAT-R decompilation, src/game/sa1/stage/enemies/fireball.c; CreateFireballSparks
// from its asm, which the decompilation doesn't match only in its registers). Enemy 7 is a spawner that, on
// every frame of the stage's clock that is a multiple of 240, throws a fireball up from 24 px below it at 6 px
// a frame, slowing by a quarter of a pixel a frame. At the top it bursts into two sparks that fly off either way
// and fall, and it shrinks as it falls back, until it is gone at 2 px a frame. The fireball and the sparks
// can't be destroyed; touching them hurts Sonic. The spawner goes when its point leaves the display's range.
//
// A fireball that leaves the range lets its entity spawn again even while its spawner is still there, as the
// original does, so a second spawner can join the first. The sparks keep their x × 4 in 16 bits, as the
// original does, which would wrap past x 8191 (no Secret Base fireball is that far right).

import { startAnim, animate } from './objects.js';
import { I, s16, gone, sprite } from './enemies.js';
import { overlap } from './collide.js';

export const FIREBALL = 7;

const RATE = 240;        // FIREBALL_SPAWN_RATE, TIME(0, 4)
const SOX = 6;           // Sonic's spriteOffsetX

const offDisplay = (wx, wy, cam) => wx > cam.x + 368 || wx < cam.x - 128 || wy > cam.y + 288 || wy < cam.y - 128;

export function fireball(e, slot) {
  return {
    run(ctx) {
      if (offDisplay(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      if (ctx.world.tick % RATE === 0) ctx.add(flame(e, slot, ctx), 0x2000);
      return true;
    },
  };
}

// a fireball (Task_FireballUpdateRise, then Task_FireballExtinguish)
function flame(e, slot, ctx0) {
  const s = sprite('fireballRise', ctx0.anims, { order: 18, prio: 2 }), x = e.x, y0 = s16(e.y + 24);
  let v = -6 * 256, y = y0, rising = true;
  return {
    run(ctx) {
      const p = ctx.player;
      v += 64; y = s16(y + I(v));
      if (gone(x, y0, x, y, ctx.cam)) { slot.live = null; return false; }
      // Coll_Player_Entity_Intersection: his body, while he is alive
      if (!p.dead && s.boxes[0] && overlap(x, y, s.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) ctx.world.damage();
      if (rising) {
        if (v >= 0) {
          ctx.add(spark(x, y - 16, 6, ctx), 0x3000);
          ctx.add(spark(x, y - 16, -6, ctx), 0x3000);
          startAnim(s, 'fireballFall', true);
          rising = false;
        }
      } else if (v >= 2 * 256) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      ctx.draw({ ...s, flipX: true }, x, y);
      return true;
    },
  };
}

// a spark (Task_FireballSpark): 1.5 px a frame sideways, thrown up at 2 px a frame and falling through
// everything; it goes on through Sonic
function spark(x0, y0, dx, ctx0) {
  const s = sprite('fireballSpark', ctx0.anims, { order: 9 });
  let x4 = s16(x0 * 4), vy = -2 * 256, y = y0;
  return {
    run(ctx) {
      x4 = s16(x4 + dx);
      const x = (x4 < 0 ? x4 + 3 : x4) >> 2;
      vy = s16(vy + 40); y = s16(y + I(vy));
      ctx.projectile(s, x, y);
      const sx = x - ctx.cam.x, sy = y - ctx.cam.y;
      if (((sx + 20) & 0xFFFF) > 276 || sy + 20 < 0 || sy > 240) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
