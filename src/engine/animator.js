// Steps an animation like the original sprite system: each frame's delay counts down in 8.8 fixed
// point, by animSpeed × 16 per tick (animSpeed 0x10 = 1.0×).

import { ANIMATION } from './constants.js';

export function makeAnimator() {
  return { name: null, i: -1, q: 0, done: false, speed: ANIMATION.normalSpeed };
}

export function setAnim(a, name, restart = false) {
  if (a.name === name && !restart) return;
  a.name = name; a.i = -1; a.q = 0; a.done = false;
}

/**
 * Advances one tick. Returns true on the tick a one-shot animation reaches its end command. `stepped` tells
 * whether the tick ran the script on to a frame (and the commands before it).
 */
export function tickAnim(a, anims) {
  a.stepped = false;
  if (a.done) return false;
  if (a.q > 0) { a.q -= a.speed * 16; return false; }
  const def = anims[a.name];
  if (++a.i >= def.frames.length) {
    if (def.loop === null) { a.i = def.frames.length - 1; a.done = true; return true; }   // one-shot: hold the last frame
    a.i = def.loop;
  }
  a.q += def.frames[a.i][1] * 256 - a.speed * 16;
  a.stepped = true;
  return false;
}

/** Index into the atlas of the frame on screen, or -1 for none. */
export function frameOf(a, anims) {
  return a.i < 0 ? -1 : anims[a.name].frames[a.i][0];
}
