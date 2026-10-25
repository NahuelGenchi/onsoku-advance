// Iron balls (SAT-R decompilation, src/game/sa1/stage/interactables/iron_ball.c; CreateEntity_IronBall at
// 0x0808B999 and Task_IronBallMain at 0x0808BB11 in the USA ROM): a spiked ball that swings with the stage
// clock, d2 × 8 px either way across when d2 > d3, else d3 × 8 px either way up and down, one swing every 256
// frames, half a swing later when the sign of d0 (across) or d1 (up and down) is set. It hurts Sonic where its
// box meets his body and is never solid. Angel Island has its own look (levels.js `sprites`).
//
// Its sprite runs its script once, when it is made: the frame and its box stay as they are from then on.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { overlap } from './collide.js';
import { SINE } from './trig.js';

export const IRON_BALL = 82;

const s8 = v => (v << 24) >> 24;
const SOX = 6;   // spriteOffsetX

/** The task for an iron ball entity, or null when `e` is not one. */
export function createIronBall(e, slot, anims) {
  if (e.kind !== IRON_BALL) return null;
  const [d0, d1, d2, d3] = e.d;
  const across = d2 > d3, phase = s8(across ? d0 : d1) < 0 ? 0x80 : 0;
  const o = { ...makeSprite('ironBall'), x: e.x, y: e.y };
  animate(o, anims);
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, t = ctx.world.tick;
      const swing = Math.imul((across ? d2 : d3) << 11, SINE[(4 * ((t + phase) & 0xFF)) & 0x3FF]) >> 14 >> 8;
      o.x = across ? e.x + swing : e.x; o.y = across ? e.y : e.y + swing;
      // Coll_Player_Entity_Intersection, then Coll_DamagePlayer
      if (!p.dead && o.boxes[0] && overlap(o.x, o.y, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) {
        ctx.world.damage();
      }
      if (offDisplay(e.x, e.y, cam) && offCam(o.x, o.y, cam)) { slot.live = null; return false; }
      ctx.draw(o, o.x, o.y);
      return true;
    },
  };
}
