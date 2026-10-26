// Drisame, Ice Mountain's fish frozen in a block of ice (SAT-R decompilation,
// src/game/sa1/stage/enemies/drisame.c). It waits in its block until Sonic comes within 80 px of it on its
// left (or right), within the angles it looks along, then the block shatters and the fish darts straight at
// where he was, about 1.8 px a frame, and keeps going. The angle is sub_8004418's rough one, of (dy, dx)
// rather than (dx, dy), as the original computes it.
//
// The block is a task of its own after Sonic's: it stays drawn when the fish is destroyed inside it, and
// shatters into four pieces that fly apart, drawn and moved only two frames in every four. Once the fish
// darts off, the original tests its spawn point's x in place of its y for leaving the range (issue #56).

import { makeSprite, animate } from './objects.js';
import { I, Div, COS, SIN, gone, sprite } from './enemies.js';
import { octantAngle } from './trig.js';

export const DRISAME = 18;

const NEAR = 80 * 80;
const SPEED_DIV = 35;

export function drisame(e, slot, anims, ctx0) {
  const s = sprite('drisame', anims, { order: 11, prio: 1 });
  const block = iceBlock(e.x, e.y);
  ctx0.add(block.task, 0x3000);
  let darting = false, vx = 0, vy = 0, qx = 0, qy = 0;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (!darting) {
        const x = e.x, y = e.y;
        if (gone(e.x, e.y, x, y, cam)) { slot.live = null; return false; }
        const dy = Math.floor(p.y) - y, dx = Math.floor(p.x) - x;
        const a = octantAngle(dy, dx) & 0x3FF, near = dy * dy + dx * dx < NEAR;
        if (a >= 385 && a < 640 && near) {
          block.shattered = true;
          s.flipX = false;
          vx = -Math.abs(Div(COS(a), SPEED_DIV)); vy = Div(SIN(a), SPEED_DIV);
          qx = 0; qy = 0; darting = true;
        }
        if ((a < 128 || a > 896) && near) {
          block.shattered = true;
          s.flipX = true;
          vx = Div(COS(a), SPEED_DIV); vy = Div(SIN(a), SPEED_DIV);
          qx = 0; qy = 0; darting = true;
        }
        if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
        animate(s, ctx.anims);
        ctx.draw(s, x, y);
        return true;
      }
      qx += vx; qy += vy;
      const x = e.x + I(qx), y = e.y + I(qy);
      if (gone(e.x, e.x, x, y, cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// the pieces: where each starts from the block's centre (right, below, left, above), its speed across in
// quarter pixels and its speed up; the odd ones are large, the even ones small
const PIECES = [[16, 0, 3, -256], [0, 8, -2, -256], [-16, 0, -3, -336], [0, -8, 2, -336]];
const PIECE_GRAVITY = 20, SHATTER_FRAMES = 30;

// the block (CreateIceBlock): whole until the fish breaks out, then its pieces for 29 frames
function iceBlock(x0, y0) {
  const whole = makeSprite('drisameIce', { order: 10, prio: 1 });
  const large = makeSprite('drisameDebrisLarge', { order: 10, prio: 1 });
  const small = makeSprite('drisameDebrisSmall', { order: 10, prio: 1 });
  const pieces = PIECES.map(([dx, dy, vx, vy]) => ({ qx: (x0 + dx) * 4, x: x0 + dx, y: y0 + dy, vx, vy }));
  const block = { shattered: false };
  let broken = false, n = 0;
  block.task = {
    run(ctx) {
      if (!broken) {
        if (gone(x0, y0, x0, y0, ctx.cam)) return false;
        if (block.shattered) broken = true;
        animate(whole, ctx.anims);
        ctx.draw(whole, x0, y0);
        return true;
      }
      if (++n >= SHATTER_FRAMES) return false;
      animate(large, ctx.anims);
      animate(small, ctx.anims);
      if (n & 2) {
        pieces.forEach((q, i) => {
          q.qx += q.vx;
          q.x = Math.trunc(q.qx / 4);
          q.vy += PIECE_GRAVITY;
          q.y += I(q.vy);
          ctx.draw(i & 1 ? large : small, q.x, q.y);
        });
      }
      return true;
    },
  };
  return block;
}
