// What the item boxes' prizes put around Sonic (SAT-R decompilation, src/game/shared/stage/item_tasks.c,
// mp_sprite_task.c and magnetic_ring.c): the shields, invincibility's stars and their sparkles, and the rings a
// magnetic shield pulls in. The shields and the stars are tasks after the music manager (0x4001) and follow
// Sonic. They take turns on screen, 2 frames each by the stage clock: a shield on the frames with its bit 1
// set, the stars on the others.

import { makeSprite, animate } from './objects.js';
import { SINE } from './trig.js';

export const ITEM_TASKS = 0x4001;

// a ring right on Sonic's centre has angle -1, which reads the table one entry early (0 here for the one before it)
const COS = a => SINE[a + 256], SIN = a => SINE[a] ?? 0;
const s16 = v => (v << 16) >> 16;
const at = p => [Math.floor(p.x), Math.floor(p.y)];
// Sonic's own sprite priority, which these take: in front of the front layer while he is dying
const prio = p => (p.death ? 1 : 2);

/**
 * A shield ('normal' or 'magnetic'): it goes when Sonic loses it or takes the other one, and is hidden and
 * still while he is invincible.
 */
export function shieldTask(kind) {
  const s = makeSprite(kind === 'normal' ? 'shield' : 'magneticShield', { order: 8 });
  return {
    run(ctx) {
      const p = ctx.player;
      if (p.shield !== kind) return false;
      if (p.invincible > 0) return true;
      s.prio = prio(p);
      animate(s, ctx.anims);
      if (ctx.world.tick & 2) ctx.draw(s, ...at(p));
      return true;
    },
  };
}

/**
 * Invincibility's stars, until it runs out. Every 8th frame of the stage clock they leave a sparkle up to
 * 15 px from Sonic in a random direction, from two draws of the game's random numbers.
 */
export function starsTask() {
  const s = makeSprite('stars', { order: 8 });
  return {
    run(ctx) {
      const p = ctx.player;
      if (p.invincible <= 0) return false;
      const [x, y] = at(p);
      if ((ctx.world.tick & 7) === 0) {
        const r = (ctx.world.random() >>> 8) % 16, a = (ctx.world.random() >>> 8) % 256;
        ctx.add(sparkle(x + ((COS(a * 4) >> 6) * r >> 8), y + ((SIN(a * 4) >> 6) * r >> 8)), ITEM_TASKS);
      }
      s.prio = prio(p);
      animate(s, ctx.anims);
      if (!(ctx.world.tick & 2)) ctx.draw(s, x, y);
      return true;
    },
  };
}

// a sparkle stays where it appeared and plays its animation once
function sparkle(x, y) {
  const s = makeSprite('starSparkle', { order: 8 });
  return {
    run(ctx) {
      const ended = animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return !ended;
    },
  };
}

// the original's quick angle (sub_8004418): 1024 steps a turn, straight within each eighth of it, from its
// two arguments in the order the magnetic ring passes them (y, then x)
const OCTANT = [1, 0, 2, 3, 6, 7, 5, 4];
function angle(a, b) {
  if ((a | b) === 0) return -1;
  let i = 0, f;
  if (a <= 0) { a = -a; i = 4; }
  if (b <= 0) { b = -b; i += 2; }
  if (a >= b) f = Math.trunc(b * 128 / a);
  else { i++; f = Math.trunc(a * 128 / b); }
  if (OCTANT[i] & 1) f = 128 - f;
  return (f + OCTANT[i] * 128) & 0x3FF;
}

/**
 * A ring the magnetic shield pulled out of the act (Task_MagneticRing), at the objects' priority: it flies
 * toward Sonic, 0.25 px a frame faster every frame, until it touches his body's hitbox. `collect(x, y)` counts
 * it (unless he is dead) and `frame()` is the act's ring frame, which it shares.
 */
export function magneticRing(x, y, collect, frame) {
  let speed = 0;
  return {
    run(ctx) {
      const p = ctx.player, [px, py] = at(p);
      const a = angle(py - (y & 0xFFFF), px - (x & 0xFFFF));
      speed = s16(speed + 64);
      x = s16(x + ((speed * COS(a)) >> 22));
      y = s16(y + ((speed * SIN(a)) >> 22));
      const hb = p.boxes[0];
      if (hb && touching(px, py, hb, x, y)) {
        if (!p.dead) collect(x, y);
        return false;
      }
      ctx.draw({ frame: frame(), flipX: false, flipY: false, order: 15, prio: 2 }, x, y);
      return true;
    },
  };
}

// HB_TOUCHING_RING: a ring's 16 × 16 px above its point against a hitbox
function touching(px, py, hb, rx, ry) {
  const l = px + hb[0], r = px + hb[2], t = py + hb[1], b = py + hb[3];
  return ((rx - 8 <= l && rx + 8 >= l) || (rx - 8 >= l && r >= rx - 8))
    && ((ry - 16 <= t && ry >= t) || (ry - 16 >= t && b >= ry - 16));
}
