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

export function tickAnim(a, anims) {
  if (a.done) return;
  if (a.q > 0) { a.q -= a.speed * 16; return; }
  const def = anims[a.name];
  if (++a.i >= def.frames.length) {
    if (def.loop === null) { a.i = def.frames.length - 1; a.done = true; return; }   // one-shot: hold the last frame
    a.i = def.loop;
  }
  a.q += def.frames[a.i][1] * 256 - a.speed * 16;
}

/** Index into the atlas of the frame on screen, or -1 for none. */
export function frameOf(a, anims) {
  return a.i < 0 ? -1 : anims[a.name].frames[a.i][0];
}
