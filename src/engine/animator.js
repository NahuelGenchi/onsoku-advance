// Steps an animation like the original sprite system: each frame's delay counts down in 8.8 fixed
// point, by animSpeed × 16 per tick (animSpeed 0x10 = 1.0×).

import { ANIMATION } from './constants.js';

// FLAGS_UPDATE_SPRITE_PALETTES: set on a tick when a sprite's script loads colours (animCmd_GetPalette); the
// sprite palette reaches the screen at the end of a frame that set it, which clears it (game.js)
export const spritePalette = { update: false };

// `loaded`: the last tick stepped onto a frame whose commands load colours
export function makeAnimator() {
  return { name: null, i: -1, q: 0, done: false, speed: ANIMATION.normalSpeed, loaded: false };
}

export function setAnim(a, name, restart = false) {
  if (a.name === name && !restart) return;
  a.name = name; a.i = -1; a.q = 0; a.done = false;
}

/** Advances one tick. Returns true on the tick a one-shot animation reaches its end command. */
export function tickAnim(a, anims) {
  a.loaded = false;
  a.stepped = false;
  if (a.done) return false;
  if (a.q > 0) { a.q -= a.speed * 16; return false; }
  const def = anims[a.name];
  if (++a.i >= def.frames.length) {
    if (def.loop === null) { a.i = def.frames.length - 1; a.done = true; return true; }   // one-shot: hold the last frame
    a.i = def.loop;
    a.loaded = !!def.loopLoads;
    load(anims, def.loopRows);
  } else {
    a.loaded = !!def.loads?.[a.i];
    load(anims, def.rows?.[a.i]);
  }
  if (a.loaded) spritePalette.update = true;
  a.q += def.frames[a.i][1] * 256 - a.speed * 16;
  return false;
}

// the palette loads the commands before a frame run ([row, key] each, extract.js), which leave the sprite
// palette's rows in their colours
function load(anims, loads) {
  if (loads && anims.objPalette) for (const [row, key] of loads) anims.objPalette[row] = key;
}

/** Index into the atlas of the frame on screen, or -1 for none. */
export function frameOf(a, anims) {
  return a.i < 0 ? -1 : anims[a.name].frames[a.i][0];
}
