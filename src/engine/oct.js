// Egg Rocket's Oct (SAT-R decompilation, src/game/sa1/stage/enemies/oct.c): an octopus robot that waits until
// Sonic is within 120 px sideways, then patrols left and right at 0.75 px a frame between d0 and d0 + d2 tiles
// from its spawn point, overshooting each end on a half sine wave over 30 frames, and drops a shot straight
// down every 60 frames of patrol. Its art is half of it, drawn twice, the second time mirrored.

import { startAnim, animate } from './objects.js';
import { TILE, I, Div, SIN, gone, sonicX, sprite, data } from './enemies.js';

export const OCT = 14;
const SPEED = 192;            // Q(0.75)
const TURN_FRAMES = 30, TURN_STEP = Math.trunc(0x400 / TURN_FRAMES);   // Div(0x400, 30); enemies.js isn't loaded yet here
const SHOOT_EVERY = 60;

// both halves: as it is, then mirrored around its anchor
function drawBoth(ctx, s, x, y) {
  ctx.draw(s, x, y);
  ctx.draw({ ...s, flipX: true }, x, y);
}

export function oct(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('oct', anims);
  let off = 0, vx = -SPEED, n = 0, wait = 0, latched = false;
  let state = 'waiting';   // Task_OctInit, then patrolling (sub_807033C), turning (sub_807051C), shooting (sub_80706F0)
  // back to patrolling with its animation started over
  const patrol = () => { startAnim(s, 'oct', true); state = 'patrol'; };
  return {
    run(ctx) {
      if (state === 'patrol') off += vx;
      else if (state === 'turn') off += (vx < 0 ? 1 : -1) * Div(SIN(TURN_STEP * n), 55);
      const x = e.x + I(off), y = e.y;
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (state === 'waiting') {
        if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
        if (x - 120 < sonicX(ctx) && x + 120 > sonicX(ctx)) { startAnim(s, 'oct'); state = 'patrol'; }
      } else if (state === 'patrol') {
        // here its animation steps before Sonic's attack is tested
        animate(s, ctx.anims);
        if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
        if (I(off) <= d0 * TILE || I(off) >= (d0 + d2) * TILE) {
          if (!latched) { latched = true; vx = I(off) <= d0 * TILE ? SPEED : -SPEED; n = 0; state = 'turn'; }
        } else {
          latched = false;
          if (wait !== 0) wait--;
          else { wait = SHOOT_EVERY; n = 0; startAnim(s, 'octShoot'); state = 'shoot'; }
        }
        drawBoth(ctx, s, x, y);
        return true;
      } else {
        if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
        if (state === 'turn') {
          if (++n >= TURN_FRAMES) patrol();
        } else {
          if (++n === 20) ctx.add(octShot(x, y - 2, ctx.anims), 0x3000);
          if (n === 26) patrol();
        }
      }
      animate(s, ctx.anims);
      drawBoth(ctx, s, x, y);
      return true;
    },
  };
}

// its shot (Task_OctProjectile) falls 2 px a frame until it leaves the screen
function octShot(x, y0, anims) {
  const s = sprite('octShot', anims, { order: 9 });
  let q = y0 << 8;
  return {
    run(ctx) {
      q += 512;
      const y = I(q);
      ctx.projectile(s, x, y);
      const sx = x - ctx.cam.x, sy = y - ctx.cam.y;
      if (((sx + 20) & 0xFFFF) > 240 + 36 || sy + 20 < 0 || sy > 160 + 80) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
