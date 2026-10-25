// What the bosses share (SAT-R decompilation, src/game/sa1/stage/enemies/bosses_misc.c, bosses_egg_mobile.c,
// nuts_and_bolts_task.c and src/game/shared/stage/collision_3.c): the camera bounds they narrow and pan, Sonic
// against a boss and its shots, the explosions and the flying debris, a part thrown off a beaten boss and the
// Egg Mobile's escape. Positions are in the original's units: whole pixels for the camera, 1/256 px for what
// moves.

import { makeSprite, startAnim, animate, OBJECTS } from './objects.js';
import { overlap } from './collide.js';
import { SINE } from './trig.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { SONG } from '../sound/songs.js';

export const HIT_ENEMY = 1, HIT_PLAYER = 2;   // EHit: the boss was hit, or it hurt Sonic

export const sin = a => SINE[a], cos = a => SINE[a + 256];
export const s16 = v => (v << 16) >> 16, s8 = v => (v << 24) >> 24;
export const I = q => q >> 8;

// the camera's bounds as the original keeps them, gCamera.minY … maxX, the bottom and right ones its far
// edges; the engine's camera keeps the top-left corner's limits (camera.js)
export const camBounds = cam => ({ minX: cam.minX, maxX: cam.maxX + SCREEN_W, minY: cam.minY, maxY: cam.maxY + SCREEN_H });
export function setCamBounds(cam, { minX = cam.minX, maxX = cam.maxX + SCREEN_W, minY = cam.minY, maxY = cam.maxY + SCREEN_H }) {
  cam.minX = minX; cam.maxX = maxX - SCREEN_W; cam.minY = minY; cam.maxY = maxY - SCREEN_H;
}

// eases a bound one pixel a frame toward its target
const toward = (v, target) => (target > v ? v + 1 : target < v ? v - 1 : v);

/**
 * CreatePreBossCameraPan: the camera's top and bottom bounds close in from where it is, a pixel a frame, to
 * minY and maxY; the bottom one starts 320 px below the camera when maxY is lower than 160 px below it.
 * Returns the task (Task_PreBossCameraPan, at the objects' priority).
 */
export function preBossCameraPan(cam, minY, maxY) {
  const y = Math.floor(cam.y);
  setCamBounds(cam, { minY: y, maxY: maxY > y + SCREEN_H ? y + 320 : y + SCREEN_H });
  return {
    priority: OBJECTS,
    run() {
      const b = camBounds(cam);
      setCamBounds(cam, { minY: toward(b.minY, minY), maxY: toward(b.maxY, maxY) });
      return !(minY === cam.minY && maxY === cam.maxY + SCREEN_H);
    },
  };
}

/**
 * Bosses_SetCamBounds: the camera's left and top bounds start where it is and its right one is set to maxX
 * at once; then the top, bottom and left ones close in a pixel a frame (Task_8017244).
 */
export function setBossCamBounds(cam, minY, maxY, minX, maxX) {
  const x = Math.floor(cam.x), y = Math.floor(cam.y);
  setCamBounds(cam, { minY: y, maxY: maxY > y + SCREEN_H ? y + 320 : y + SCREEN_H, minX: x, maxX });
  return {
    priority: OBJECTS,
    run() {
      const b = camBounds(cam);
      setCamBounds(cam, { minY: toward(b.minY, minY), maxY: toward(b.maxY, maxY), minX: toward(b.minX, minX) });
      const now = camBounds(cam);
      return !(now.minY === minY && now.maxY === maxY && now.minX === minX && now.maxX === maxX);
    },
  };
}

const at = p => [Math.floor(p.x), Math.floor(p.y)];

/**
 * Coll_Player_Enemy, as the bosses use it: Sonic's attack box on the boss's box (slot 0) turns his air
 * speeds back (HIT_ENEMY); otherwise his body on it hurts him (HIT_PLAYER), which it reports even while he
 * can't be hurt. 0 when nothing touched.
 */
export function bossHit(s, x, y, ctx) {
  const p = ctx.player, hb = s.boxes[0];
  if (!hb || p.dead) return 0;
  const [px, py] = at(p);
  if (p.boxes[1] && overlap(x, y, hb, px, py, p.boxes[1])) {
    p.xsp = -p.xsp; p.ysp = -p.ysp;
    return HIT_ENEMY;
  }
  if (p.boxes[0] && overlap(x, y, hb, px, py, p.boxes[0])) {
    ctx.world.damage();
    return HIT_PLAYER;
  }
  return 0;
}

/** sub_800BF10: a boss's harmful part (its box in slot 0) on Sonic's body hurts him. */
export function bossShotHit(s, x, y, ctx) {
  const p = ctx.player, hb = s.boxes[0];
  if (!hb || p.dead || !p.boxes[0]) return 0;
  const [px, py] = at(p);
  if (!overlap(x, y, hb, px, py, p.boxes[0])) return 0;
  ctx.world.damage();
  return HIT_PLAYER;
}

/**
 * The nuts-and-bolts task (Task_NutsAndBolts): a sprite at (qx, qy) moving by (vx, vy) and falling by
 * (gx, gy) a frame, in 1/256 px. It goes once it is off the screen's sides or below it, or once its
 * animation has ended with `minFrames` (counting down a frame at a time) used up. `sound` is a song its
 * animation's script starts before its first frame.
 */
export function nutsAndBolts(s, qx, qy, { vx = 0, vy = 0, gx = 0, gy = 0, minFrames = 0, sound = 0 } = {}) {
  return {
    priority: OBJECTS,
    run(ctx) {
      vx = s16(vx + gx); vy = s16(vy + gy);
      qx += vx; qy += vy;
      const x = I(qx), y = I(qy), sx = x - ctx.cam.x, sy = y - ctx.cam.y;
      if (minFrames !== 0) minFrames--;
      if (sx < -32 || sx > SCREEN_W + 32 || sy - 32 > SCREEN_H) return false;
      if (sound && s.anim.i < 0) ctx.world.playSound(sound);
      // an animation that has ended reports it again on every later frame
      if ((animate(s, ctx.anims) || s.anim.done) && minFrames === 0) return false;
      ctx.draw(s, x, y);
      return true;
    },
  };
}

/**
 * sub_8017540: an explosion at (qx, qy), mirrored either way at random (OAM order 20); its script starts the
 * explosion song once it shows. Returns its task, which the caller adds.
 */
export function explosion(ctx, qx, qy) {
  const r = ctx.world.random();
  const s = makeSprite('bossExplosion', { order: 20, flipX: (r & 0x400) !== 0, flipY: (r & 0x800) !== 0 });
  return nutsAndBolts(s, qx, qy, { sound: SONG.EXPLOSION });
}

// the pieces a hit machine throws (gUnknown_080BB41C and gUnknown_080BB42C): small and large bolts and plates
const DEBRIS = ['debrisBolt0', 'debrisBolt1', 'debrisNut0', 'debrisNut1', 'debrisPlate0', 'debrisPlate1', 'debrisBolt0', 'debrisNut0'];

/**
 * A piece of a wrecked boss flying off from (x, y): one of the eight pieces at random, thrown 6 px a frame in
 * a random direction in the upper half turn, falling `gravity`/256 px a frame faster (5 for some bosses, 40
 * for others) and kept at least 32 frames; and an explosion up to 32 px to either side and 63 px above. Adds
 * both tasks.
 */
export function debris(ctx, x, y, order = 23, gravity = 5) {
  const piece = DEBRIS[ctx.world.random() % DEBRIS.length];
  const theta = ctx.world.random() & 0x1FF;
  const s = makeSprite(piece, { order });
  ctx.add(nutsAndBolts(s, x << 8, y << 8, { vx: s16((-(cos(theta) * 0x600)) >> 14), vy: s16((-(sin(theta) * 0x600)) >> 14), gy: gravity, minFrames: 32 }));
  const r = ctx.world.random();
  ctx.add(explosion(ctx, (x + (r & 0x3F) - 32) << 8, (y - ((r & 0x3F0000) >>> 16)) << 8));
}

/**
 * A boss's hit flash (as in sub_80343E0): for the first 16 of the 32 frames after a hit, every other two, the
 * boss's sprite is drawn as an OBJ window in which everything is brightened to white, while Sonic is alive.
 * `flash` counts the frames down; returns whether the sprite is the white window this frame.
 */
export function flashing(boss, p) {
  if (boss.flash === 0) return false;
  boss.flash--;
  return boss.flash > 0x10 && !(boss.flash & 2) && !p.dead;
}

/**
 * A part thrown off a beaten boss (sub_80168F0 and Task_8016A14): drawn through the rotation hardware in a
 * double-size box (OAM order 20) in front of the layers and of the other sprites (background priority 0), it flies `vx` px a frame across and starts up at `vy`/256 px a frame, falling
 * 40/256 px a frame faster, turning by `spin` (of 1024 a turn) and growing or shrinking by `grow`/256 a frame
 * up to twice its size, the way it flies; mirrored when `scaleX` is negative. It shows for `frames` frames.
 * Its animation runs once, as it is made. Returns the task.
 */
export function bossPart(x, y, name, anims, { vx = 1, vy = -512, spin = 0, grow = 8, scaleX = 256, frames = 60 } = {}) {
  const s = makeSprite(name, { order: 20, prio: 0 });
  animate(s, anims);
  let rotation = 0, scaleY = 256;
  return {
    priority: OBJECTS,
    run(ctx) {
      if (frames-- === 0) return false;
      vy = s16(vy + 40);
      x = s16(x + I(vx)); y = s16(y + I(vy));
      if (vx > 0) {
        rotation = (rotation + spin) & 0x3FF;
        if (scaleX > -512) scaleX = s16(scaleX - grow);
      } else {
        rotation = (rotation - spin) & 0x3FF;
        if (scaleX < 512) scaleX = s16(scaleX + grow);
      }
      scaleY = Math.abs(scaleX);
      ctx.draw(s, x, y, { rotation, scaleX, scaleY, double: true });
      return true;
    },
  };
}

/**
 * The Egg Mobile flying off after a boss (CreatePostBossEggMobile): Eggman (OAM order 19) in the Egg Mobile
 * (order 21) at (x, y) waits 45 frames, rises a pixel a frame to 80 px up, turns around and flies off to the
 * right at 4 px a frame, gone once past 360 px across the screen. In X Zone, Eggman looks back once it has
 * turned. Returns the task.
 */
export function eggMobileEscape(x, y, anims, level) {
  const s = makeSprite('eggMobile', { order: 21 }), s2 = makeSprite('eggmanFlee', { order: 19 });
  let state = 'ascent', wait = 0, offsetX = 0, offsetY = 0;
  const show = (ctx, sy) => {
    const ended = animate(s, anims);
    ctx.draw(s, x + offsetX, sy);
    animate(s2, anims);
    ctx.draw(s2, x + offsetX, sy);
    return ended;
  };
  return {
    priority: OBJECTS,
    run(ctx) {
      if (state === 'ascent') {
        show(ctx, y + I(offsetY));
        if (wait > 45) {
          offsetY -= 256;
          if (offsetY <= -80 * 256) {
            state = 'turn';
            startAnim(s, 'eggMobileTurn'); startAnim(s2, 'eggmanTurn');
            offsetY = I(offsetY);   // from here a whole number of pixels
          }
        } else wait++;
      } else if (state === 'turn') {
        if (show(ctx, y + offsetY)) {
          state = 'escape';
          startAnim(s, 'eggMobile'); s.flipX = true; s2.flipX = true;
          startAnim(s2, level === 12 && x >= 8 * 256 ? 'eggmanX' : 'eggman');
        }
      } else {
        offsetX += 4;
        if (x + offsetX - ctx.cam.x > SCREEN_W + 120) return false;
        show(ctx, y + offsetY);
      }
      return true;
    },
  };
}
