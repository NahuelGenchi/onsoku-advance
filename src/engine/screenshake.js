// The screen shake (SAT-R decompilation, src/game/shared/stage/screen_shake.c, CreateScreenShake): a task just
// before the camera's that sets the camera's shake offsets, which the camera adds to its position after keeping
// it inside its bounds (camera.js). Each frame the offset is the amplitude p0 (in 1/256 px) times the sine of an
// angle that steps by p2, or times a random factor; p0 then drops by p1. It lasts p3 frames, or until p0 runs
// out when p3 is negative, and puts the offsets it set back to 0 as it ends.

import { SINE } from './trig.js';

export const SCREEN_SHAKE = 0xEFF;   // the task's priority
export const SHAKE = {
  POSITIVE: 0x1, NEGATIVE: 0x2,   // only that side of the swing
  RANDOM: 0x10,                    // a random factor each frame instead of the sine
  EVEN_FRAMES: 0x20,               // only moves the camera on even stage frames
  HORIZONTAL: 0x40, VERTICAL: 0x80,
};

/** A screen shake task (CreateScreenShake(p0, p1, p2, p3, flags)), for `ctx.add(task, SCREEN_SHAKE)`. */
export function screenShake(p0, p1, p2, p3, flags) {
  let angle = 0;
  return {
    run(ctx) {
      const cam = ctx.world.camera;
      if (p3 === 0 || p0 <= 0) {
        if (flags & SHAKE.HORIZONTAL) cam.shakeX = 0;
        if (flags & SHAKE.VERTICAL) cam.shakeY = 0;
        return false;
      }
      // the random factor: 9 bits of PSEUDO_RANDOM_32() << 15, less 255
      const factor = flags & SHAKE.RANDOM ? ((ctx.world.random() << 15) >>> 23) - 0xFF : SINE[angle] >> 6;
      let r = (p0 * factor) >> 16;
      if ((flags & 3) === SHAKE.POSITIVE) r = Math.abs(r);
      else if ((flags & 3) === SHAKE.NEGATIVE) r = -Math.abs(r);
      if (!(flags & SHAKE.EVEN_FRAMES) || (ctx.world.tick & 1) === 0) {
        if (flags & SHAKE.HORIZONTAL) cam.shakeX = r;
        if (flags & SHAKE.VERTICAL) cam.shakeY = r;
      }
      if (p3 > 0) p3--;
      if (p0 > 0) p0 -= p1;
      angle = (angle + p2) & 0x3FF;
      return true;
    },
  };
}
