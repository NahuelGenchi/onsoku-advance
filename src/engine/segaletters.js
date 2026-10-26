// Casino Paradise's SEGA SONIC letters (SAT-R decompilation,
// src/game/sa1/stage/interactables/sega_sonic_letters.c): letters Sonic can stand on, which light up and go dark
// on a cycle that runs with the stage clock. d0 picks the letter, the low two bits of d1 the cycle's length (500,
// 400 or 300 frames; 3 doesn't occur) and d2 delays it by that many frames. With h = (length - 161) / 2 (169, 119
// or 69 frames), on frame r of the cycle:
//
// - 0: it flickers on (its variant 1); from 58 it shines (variant 3); from 58 + h it blinks out (variant 0).
//   It is solid all the while, except on frames 0 and 58 + h.
// - from length - h to the end: it is dark (variant 2) and isn't solid, and Sonic's body touching it lets him
//   drop off whatever he stands on.
//
// Before the stage clock reaches the delay the cycle's frame is negative, which the original reads as a huge
// one: the letter blinks out as it spawned, and isn't solid.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { overlap, platform } from './collide.js';

export const SEGA_SONIC_LETTER = 58;
const LENGTHS = [500, 400, 300];
const START = 58;
const SOX = 6;   // Sonic's spriteOffsetX

/** The task for a SEGA SONIC letter, or null when `e` is not one. */
export function createSegaSonicLetter(e, slot, anims) {
  if (e.kind !== SEGA_SONIC_LETTER) return null;
  const look = v => `segaLetter${e.d[0] * 4 + v}`;
  const length = LENGTHS[e.d[1] & 3], h = (length - 161) >> 1, delay = e.d[2];
  const o = { x: e.x, y: e.y, ...makeSprite(look(0)) };
  animate(o, anims);
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      const p = ctx.player;
      // Mod(gStageTime - delay, length), compared unsigned
      const r = (((ctx.world.tick - delay) | 0) % length) >>> 0;
      let solid = true;
      if (r < START) {
        if (r === 0) { solid = false; startAnim(o, look(1), true); }
      } else if (r < START + h) {
        if (r === START) startAnim(o, look(3), true);
      } else if (r < length - h) {
        if (r === START + h) { solid = false; startAnim(o, look(0), true); }
      } else {
        solid = false;
        if (r === length - h) startAnim(o, look(2), true);
        // Coll_Player_Entity_Intersection, then MOVESTATE_STOOD_ON_OBJ cleared
        if (!p.dead && o.boxes[0] && overlap(e.x, e.y, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) {
          p.onObject = null;
        }
      }
      if (solid) platform(o, o.boxes[0], p, ctx.world.terrain);
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
