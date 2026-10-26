// Ferris wheels (SAT-R decompilation, src/game/sa1/stage/interactables/ferris_wheel.c; the task is at
// 0x0808F6B5 in the USA ROM). Each entity is one seat, a thin platform going round its spawn point at d2 × 8 px
// (clockwise) when d2 > d3, else d3 × 8 px (anticlockwise), d1/2048 of a turn a frame of the stage clock, from
// (d0 & 15)/16 of a turn on. A wheel is several seats on one spawn point. Each seat draws the hub and two
// spokes on its way to it (except in zone 3), and sags by up to 6 px while Sonic stands on it.
//
// Standing on a seat, Sonic is carried across by what it moved the frame before, plus 1/256 px on odd
// frames, and held 20 px above its middle (15 px curled up or charging a spin dash).

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { platformTop } from './collide.js';
import { Div } from './enemies.js';
import { SINE } from './trig.js';

export const FERRIS_WHEEL = 91;

const s8 = v => (v << 24) >> 24;

/** The task for a ferris wheel seat entity, or null when `e` is not one. */
export function createFerrisWheel(e, slot, anims) {
  if (e.kind !== FERRIS_WHEEL) return null;
  const [d0, d1, d2, d3] = e.d;
  const phase = (s8(d0) & 0xF) << 7, speed = d2 > d3 ? s8(d1) : -s8(d1), radius = Math.max(d2, d3);
  // its look is the level's (gUnknown_086CEE2C, levels.js `sprites`)
  const o = { ...makeSprite('ferrisSeat') };
  const centre = makeSprite('ferrisHub'), spoke = makeSprite('ferrisSpoke');
  for (const s of [o, centre, spoke]) animate(s, anims);
  let a = 0, last = 0, sag = 0, riding = false;   // the seat's offsets in 1/2048 px; how far it sags
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, t = ctx.world.tick;
      const angle = ((speed * t + phase) & 0x7FF) >> 1;
      a = SINE[angle] * radius;
      const b = SINE[angle + 256] * radius;
      o.x = e.x + (a >> 11); o.y = e.y + (b >> 11);
      if (riding) p.x += (((a - last) >> 3) + (t & 1)) / 256;
      if (!p.dead) {
        platformTop(o, o.x, o.y, o.boxes[0], p);
        if (p.onObject === o) {
          riding = true;
          sag = Math.min(sag + 16, 256);
          p.y = o.y - (p.spinDashing || p.curled ? 15 : 20);
        } else {
          riding = false;
          sag = sag > 16 ? sag - 16 : 0;
        }
      } else riding = false;
      if (offDisplay(e.x, e.y, cam) && offCam(o.x, o.y, cam)) { slot.live = null; return false; }
      ctx.draw(o, o.x, o.y + Div(SINE[sag], 2500));
      if (ctx.world.zone !== 2) {   // not in zone 3 (nor in Chao Hunt C)
        ctx.draw(centre, e.x, e.y);
        const da = Div(a, 3), db = Div(b, 3);
        for (let k = 1; k <= 2; k++) ctx.draw(spoke, e.x + ((da * k) >> 11), e.y + ((db * k) >> 11));
      }
      last = a;
      return true;
    },
  };
}
