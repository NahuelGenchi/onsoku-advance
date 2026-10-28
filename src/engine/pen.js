// Pen, Ice Mountain's penguin (SAT-R decompilation, src/game/sa1/stage/enemies/pen_mk1.c), kind 20. It walks
// 0.625 px a frame between (d0 + 1) × 8 and (d0 + d2) × 8 px right of its spawn point, following the floor,
// turning to face the way it goes at either end. Away from the ends, once it has walked 60 frames since its
// last throw, it stops to throw a snowball when Sonic is less than 80 px away, and the snowball slides off along
// the ground the way the penguin faces. It isn't made in Ice Mountain on Easy.
//
// While it throws it follows the floor twice a frame from the same place, so on a slope it moves twice as far
// toward it, kept here.

import { startAnim, animate } from './objects.js';
import { I, TILE, Div, s8, s16, COS, SIN, data, gone, sonicX, sonicY, sprite, leftOutOnEasy } from './enemies.js';
import { tileFloor, probeTile, PROBE_FLOOR } from './terrain.js';

export const PEN = 20;

const SPEED = 160;          // 0.625 px, in 1/256 px
const REST = 60;            // frames of walking before it can throw again
const SNOWBALLS = 0x3000;   // the snowball's and its pieces' task priority

export function pen(e, slot, anims, ctx) {
  if (leftOutOnEasy(ctx, 3)) return null;
  const { d0, d2 } = data(e), s = sprite('penWalk', anims, { order: 18, prio: 2 });
  let q = 0, v = -SPEED, dy = 0, rest = 0, t = 0, throwing = false;
  return {
    run(ctx) {
      const terrain = ctx.world.terrain;
      if (!throwing) q = (q + v) | 0;
      const x = s16(e.x + I(q)), y = s16(e.y + dy);
      if (throwing) {
        dy += tileFloor(terrain, x, y, 1);
        t++;
      }
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      if (!throwing) {
        dy += tileFloor(terrain, x, y, 1);
        const ddx = sonicX(ctx) - x, ddy = sonicY(ctx) - y;
        if (I(q) <= (d0 + 1) * TILE) {
          if (!s.flipX) { s.flipX = true; v = SPEED; }
        } else if (I(q) >= (d0 + d2) * TILE) {
          if (s.flipX) { s.flipX = false; v = -SPEED; }
        } else if (rest !== 0) rest--;
        else if (ddx * ddx + ddy * ddy < 80 * 80) {
          t = 0; rest = REST; startAnim(s, 'penThrow', true); throwing = true;
        }
      } else {
        if (t === 13) ctx.add(snowball(s.flipX ? x + 4 : x - 6, y, s.flipX, ctx), SNOWBALLS);
        dy += tileFloor(terrain, x, y, 1);
        if (t > 16) { t = 0; startAnim(s, 'penWalk', true); throwing = false; }
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

/**
 * The snowball (CreatePenMk1Snowball, Task_PenMk1Snowball): it slides 2 px a frame along the floor, sped up or
 * slowed by the floor's slope (sine / 1000 of its angle a frame) and pushed down by its cosine / 1000. Off the
 * floor it falls, 60/256 px a frame faster each frame. It breaks into pieces when it touches Sonic (hurting him),
 * after 800 frames, when it lands faster than 4 px a frame, when the floor's angle changes by a quarter turn or
 * more from one frame to the next, or when it reaches a steep slope; off the screen it goes.
 *
 * The original keeps the floor distance it starts with in the field it keeps in 1/256 px, so it starts 1/256 of
 * that lower (nothing to see), and the test that would stop it on a slope steeper than its speed never passes:
 * both kept.
 */
function snowball(x0, y0, right, ctx0) {
  const terrain = ctx0.world.terrain, s = sprite('penSnowball', ctx0.anims, { order: 9, prio: 2 });
  let vx = right ? 512 : -512, vy = 0, qx = 0, qy = tileFloor(terrain, x0, y0, 1), angle = 0, air = false, life = 800;
  const burst = (ctx, x, y) => { ctx.add(pieces(x, y, ctx.anims), SNOWBALLS); return false; };
  return {
    run(ctx) {
      if (air) vy = s16(vy + 60);
      qx = (qx + vx) | 0;
      qy = (qy + vy) | 0;
      const x = s16(x0 + (qx >> 8)), y = s16(y0 + (qy >> 8));
      vx = s16(vx + Div(SIN((angle * 4) & 1023), 1000));
      qy = (qy + Div(COS(angle * 4), 1000)) | 0;
      if (life !== 0) life--;
      if (ctx.projectile(s, x, y) || life === 0) return burst(ctx, x, y);
      const { d, rot } = probeTile(terrain, y, x, 1, 8, PROBE_FLOOR);
      if (d > 0) {
        if (!air) vy = 0;
        air = true;
      } else {
        if (air) {
          angle = 0;
          if (vy > 0x400) return burst(ctx, x, y);
        }
        if (d < 0) air = false;
      }
      // a floor was found whenever d ≤ 0, so `rot` is set wherever it is read
      if (!air) {
        if (d < 0) { qy = (qy + d * 256) | 0; vy = 0; } else vy = s16(vy + d * 64);
        let turn = s8(angle - rot);
        if (turn < 0) turn = s8(-turn);
        if (turn > 0x3F) return burst(ctx, x, y);
        angle = rot;
      }
      if (d >= -5 && d <= 0) {
        if (((rot + 0x3F) & 0xFF) <= 0x1C || ((rot + 0x5D) & 0xFF) <= 0x1C) return burst(ctx, x, y);
      } else {
        const sx = s16(x - ctx.cam.x), sy = s16(y - ctx.cam.y);
        if (((sx + 60) & 0xFFFF) > 360 || sy + 60 < 0 || sy > 300) return false;
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// the snowball's two pieces (CreatePenMk1SnowballDebris, Task_SnowballDebris): thrown up at 3.75 px a frame and
// falling 60/256 px a frame faster each frame, one moving 1 px a frame left and the other as far right, drawn
// the same way round; they go 80 px below the screen
function pieces(x0, y0, anims) {
  const s = sprite('penSnowballPiece', anims, { order: 9, prio: 2 });
  let ql = x0 * 256, qr = ql, qy = y0 * 256, vy = -0x3C0;
  return {
    run(ctx) {
      ql -= 256; qr += 256;
      vy = s16(vy + 60);
      qy = (qy + vy) | 0;
      const y = s16(qy >> 8);
      if (s16(y - ctx.cam.y) > 240) return false;
      animate(s, ctx.anims);
      ctx.draw(s, s16(ql >> 8), y);
      ctx.draw(s, s16(qr >> 8), y);
      return true;
    },
  };
}
