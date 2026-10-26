// What the bosses share (SAT-R decompilation, src/game/sa1/stage/enemies/bosses_misc.c and bosses_egg_mobile.c,
// src/game/sa1/stage/nuts_and_bolts_task.c and src/game/shared/stage/collision_3.c): the arena's camera
// bounds, a part flying off, the debris and the explosions a beaten boss throws, the Egg Mobile's escape, and
// the collisions bosses use. Each maker returns a task for `ctx.add`, at the objects' priority.
// Positions are whole pixels in the act and speeds 1/256 px a frame, as the original keeps them.

import { makeSprite, startAnim, animate } from './objects.js';
import { overlap } from './collide.js';
import { SINE } from './trig.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { SONG } from '../sound/songs.js';

const I = v => v >> 8;
const s16 = v => (v << 16) >> 16;
// a bound moves 1 px a frame toward where it is going
const toward = (v, to) => (to > v ? v + 1 : to < v ? v - 1 : v);

/**
 * Bosses_SetCamBounds: the camera's bounds close in on the arena from where it is. The right edge goes to `maxX`
 * at once; the top, bottom and left edges start at the screen's and move 1 px a frame to `minY`, `maxY` and
 * `minX` (Task_8017244), a bottom edge further down than the screen's starting 160 px below it instead. The
 * arguments are the screen's edges in the act, as the original has them. They are the arena's walls, which the
 * widescreen view doesn't show past (camera.js viewOf).
 */
export function setBossCamBounds(cam, minY, maxY, minX, maxX) {
  const x = Math.floor(cam.x), y = Math.floor(cam.y);
  cam.arena = { minX, maxX, minY, maxY };
  cam.minY = y; cam.maxY = y; cam.minX = x; cam.maxX = maxX - SCREEN_W;
  if (maxY > y + SCREEN_H) cam.maxY = y + 320 - SCREEN_H;
  return {
    run() {
      cam.minY = toward(cam.minY, minY);
      cam.maxY = toward(cam.maxY + SCREEN_H, maxY) - SCREEN_H;
      cam.minX = toward(cam.minX, minX);
      return !(cam.minY === minY && cam.maxY + SCREEN_H === maxY && cam.minX === minX && cam.maxX + SCREEN_W === maxX);
    },
  };
}

/**
 * CreatePreBossCameraPan: only the top and bottom edges close in, as in Bosses_SetCamBounds, 1 px a frame to `minY`
 * and `maxY` (Task_PreBossCameraPan).
 */
export function preBossCameraPan(cam, minY, maxY) {
  const y = Math.floor(cam.y);
  cam.minY = y; cam.maxY = y;
  if (maxY > y + SCREEN_H) cam.maxY = y + 320 - SCREEN_H;
  return {
    run() {
      cam.minY = toward(cam.minY, minY);
      cam.maxY = toward(cam.maxY + SCREEN_H, maxY) - SCREEN_H;
      return !(cam.minY === minY && cam.maxY + SCREEN_H === maxY);
    },
  };
}

/**
 * A part of a boss flying off (sub_80168F0, Task_8016A14) for `frames` frames: it falls 40/256 px a frame
 * faster each frame, turns `spin` steps of 1024 a frame, one way moving right and the other moving left, and its
 * horizontal scale moves by `grow` toward twice its size, mirrored (the vertical follows it). It is drawn
 * through the rotation hardware at double size, in front of the layers.
 */
export function bossPart(x, y, name, anims, { vx = 256, vy = -512, spin = 0, grow = 8, scaleX = 256, frames = 60 } = {}) {
  const s = makeSprite(name, { order: 20, prio: 0 });
  animate(s, anims);
  let left = frames, rotation = 0;
  return {
    run(ctx) {
      if (left-- === 0) return false;
      vy = s16(vy + 40);
      x = s16(x + I(vx)); y = s16(y + I(vy));
      if (vx > 0) {
        rotation = (rotation + spin) & 0x3FF;
        if (scaleX > -512) scaleX = s16(scaleX - grow);
      } else {
        rotation = (rotation - spin) & 0x3FF;
        if (scaleX < 512) scaleX = s16(scaleX + grow);
      }
      ctx.draw(s, x, y, { rotation, scaleX, scaleY: Math.abs(scaleX), double: true });
      return true;
    },
  };
}

/**
 * A piece moving on its own (Task_NutsAndBolts): its speed (vx, vy) gains (ax, ay) each frame, from (qx, qy) in
 * 1/256 px. It goes once it is more than 32 px off the screen's sides or below it, or once its animation has
 * ended and `hold` frames have passed. `sound` is a song its animation's script starts before its first frame.
 */
export function nutsAndBolts(s, qx, qy, { vx = 0, vy = 0, ax = 0, ay = 0, hold = 0, sound = 0 } = {}) {
  return {
    run(ctx) {
      vx = s16(vx + ax); vy = s16(vy + ay);
      qx += vx; qy += vy;
      const sx = s16(I(qx) - ctx.cam.x), sy = s16(I(qy) - ctx.cam.y);
      if (hold) hold--;
      if (sx < -32 || sx > SCREEN_W + 32 || sy - 32 > SCREEN_H) return false;
      if (sound && s.anim.i < 0) ctx.world.playSound(sound);
      animate(s, ctx.anims);
      if (s.anim.done && hold === 0) return false;
      ctx.draw(s, I(qx), I(qy));
      return true;
    },
  };
}

/**
 * An explosion at (qx, qy) in 1/256 px (sub_8017540), flipped either way by the game's random numbers. Its
 * animation's script (611) starts the explosion's sound as it first shows.
 */
export function bossExplosion(ctx, qx, qy) {
  const r = ctx.world.random() & 0xC00;
  return nutsAndBolts(makeSprite('bossExplosion', { order: 20, prio: 2, flipX: (r & 0x400) !== 0, flipY: (r & 0x800) !== 0 }), qx, qy, { sound: SONG.EXPLOSION });
}

// the debris a beaten boss throws, one picked at random (gUnknown_080BB41C, gUnknown_080BB42C)
const DEBRIS = ['boltSmall', 'boltSmall2', 'boltMedium', 'boltMedium2', 'boltLarge', 'boltLarge2', 'boltSmall', 'boltMedium'];

/**
 * What a beaten boss throws every 8 frames from (x, y): a piece of debris flung up at 6 px a frame at a random
 * angle, falling 40/256 px a frame faster each frame and kept for at least 32 frames, and an explosion up to
 * 63 px above and 32 px either side.
 */
export function bossDebris(ctx, x, y) {
  const random = ctx.world.random;
  const s = makeSprite(DEBRIS[random() % DEBRIS.length], { order: 17, prio: 2 });
  const angle = random() & 0x1FF;
  const vy = s16(-(SINE[angle] * 0x600) >> 14), vx = s16(-(SINE[angle + 256] * 0x600) >> 14);
  ctx.add(nutsAndBolts(s, x << 8, y << 8, { vx, vy, ay: 40, hold: 32 }));
  const r = random();
  ctx.add(bossExplosion(ctx, (x + (r & 0x3F) - 32) << 8, (y - ((r & 0x3F0000) >> 16)) << 8));
}

/**
 * The Egg Mobile after a boss (CreatePostBossEggMobile): Eggman sits in it at (x, y) for 46 frames, rises
 * 1 px a frame to 80 px up, turns round and flies off to the right at 4 px a frame until it is 120 px past
 * the screen's right edge.
 */
export function eggMobileEscape(x, y, anims) {
  const s = makeSprite('eggMobile', { order: 21, prio: 2 }), s2 = makeSprite('eggmanFlee', { order: 19, prio: 2 });
  let phase = 'ascent', wait = 0, dy = 0, dx = 0;
  return {
    run(ctx) {
      if (phase === 'escape') {
        dx += 4;
        if (x + dx - ctx.cam.x > SCREEN_W + 120) return false;
      }
      const ended = animate(s, anims);
      animate(s2, anims);
      ctx.draw(s, x + dx, y + (phase === 'ascent' ? I(dy) : dy));
      ctx.draw(s2, x + dx, y + (phase === 'ascent' ? I(dy) : dy));
      if (phase === 'ascent') {
        if (wait > 45) {
          dy -= 256;
          if (dy <= -80 * 256) { phase = 'turn'; startAnim(s, 'eggMobileTurn'); startAnim(s2, 'eggmanTurn'); dy = I(dy); }
        } else wait++;
      } else if (phase === 'turn' && ended) {
        phase = 'escape';
        s.flipX = s2.flipX = true;
        startAnim(s, 'eggMobile'); startAnim(s2, 'eggman');
      }
      return true;
    },
  };
}

// EHit: nothing touched, Sonic hit the boss, or the boss hurt Sonic
export const HIT_NONE = 0, HIT_ENEMY = 1, HIT_PLAYER = 2;

/**
 * Coll_Player_Bosses_2_6: Sonic's attack box on the boss's box 0 while he is in the air hits it and sends him
 * back the way he came (both speeds reversed); otherwise his body on either of its boxes hurts him, even
 * when he can't be hurt then. `s` is the boss's sprite at (x, y).
 */
export function bossHit26(s, x, y, ctx) {
  const p = ctx.player, [b0, b1] = s.boxes, [body, attack] = p.boxes;
  if (p.dead) return HIT_NONE;
  const px = Math.floor(p.x), py = Math.floor(p.y);
  if (attack && b0 && p.air && overlap(x, y, b0, px, py, attack)) {
    p.xsp = -p.xsp; p.ysp = -p.ysp;
    return HIT_ENEMY;
  }
  if (body && ((b0 && overlap(x, y, b0, px, py, body)) || (b1 && overlap(x, y, b1, px, py, body)))) {
    ctx.world.damage();
    return HIT_PLAYER;
  }
  return HIT_NONE;
}

/**
 * Coll_Player_Enemy, as the Egg Ball uses it: Sonic's attack box on the boss's box 0 hits it and sends him back
 * the way he came (both speeds reversed), in the air or not; otherwise his body on that box hurts him, even when
 * he can't be hurt then.
 */
export function bossHit(s, x, y, ctx) {
  const p = ctx.player, b0 = s.boxes[0], [body, attack] = p.boxes;
  if (!b0 || p.dead) return HIT_NONE;
  const px = Math.floor(p.x), py = Math.floor(p.y);
  if (attack && overlap(x, y, b0, px, py, attack)) {
    p.xsp = -p.xsp; p.ysp = -p.ysp;
    return HIT_ENEMY;
  }
  if (body && overlap(x, y, b0, px, py, body)) {
    ctx.world.damage();
    return HIT_PLAYER;
  }
  return HIT_NONE;
}

/** sub_800BF10: a boss's harmful part (its box 0) on Sonic's body hurts him. */
export function bossShotHit(s, x, y, ctx) {
  const p = ctx.player, b0 = s.boxes[0], body = p.boxes[0];
  if (!b0 || p.dead || !body) return HIT_NONE;
  if (!overlap(x, y, b0, Math.floor(p.x), Math.floor(p.y), body)) return HIT_NONE;
  ctx.world.damage();
  return HIT_PLAYER;
}
