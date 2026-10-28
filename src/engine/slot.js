// Slot, Casino Paradise's slot machine (SAT-R decompilation, src/game/sa1/stage/enemies/slot.c). It floats
// 0.625 px a frame between d0 × 8 and (d0 + d2) × 8 px right of its spawn point, turning at either end, and
// bobs up to 20 px above that line and back down every 32 frames. Away from the ends, with Sonic's centre within
// 16 px of its own across, it stops for 20 frames and drops a coin, then floats on and doesn't drop another for
// 100 frames spent between the ends. Its sprite is a left half, drawn again mirrored for the right. In Casino
// Paradise the original makes it only on Normal; the port doesn't apply Easy yet.
//
// The coin falls, gaining 40/256 px a frame each frame, and shatters on the floor or on touching Sonic: six
// pieces fan out by the floor's angle at a random share of its speed, bounce, slow down, and go after 45
// frames, blinking for the last 30. The pieces don't hurt. On the frame it shatters, one piece shows where the
// coin was.

import { startAnim, animate } from './objects.js';
import { I, TILE, Div, SIN, data, gone, s16, sonicX, sprite } from './enemies.js';
import { tileFloor } from './terrain.js';

export const SLOT = 9;

const STEP = 160;   // 0.625 px, in 1/256 px
const NEAR = 16;
const REST = 100, DROP = 19;
const FALL = 40;
const PIECES = 6, LIFE = 45, BLINK = 30;

export function slotMachine(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('slotWalk', anims);
  let q = 0, v = -STEP, phase = 0, rise = 0, t = 0, rest = 0, dropping = false;
  const show = (ctx, x, y) => {
    ctx.draw(s, x, y);
    ctx.draw({ ...s, flipX: true }, x, y);
  };
  return {
    run(ctx) {
      if (!dropping) {
        phase = (phase + 1) & 31;
        rise = Div(SIN(phase * 16), 800);
        q = s16(q + v);
      }
      const x = e.x + I(q), y = e.y - rise;
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      if (!dropping) {
        if (I(q) <= d0 * TILE) v = STEP;
        else if (I(q) >= (d0 + d2) * TILE) v = -STEP;
        else if (rest !== 0) rest--;
        else if (sonicX(ctx) <= x + NEAR && sonicX(ctx) >= x - NEAR) {
          rest = REST; startAnim(s, 'slotShoot');
          ctx.add(coin(x, y - 6, ctx), 0x3000);
          dropping = true;
        }
      } else if (++t > DROP) { t = 0; startAnim(s, 'slotWalk'); dropping = false; }
      animate(s, ctx.anims);
      show(ctx, x, y);
      return true;
    },
  };
}

// the original's cull window for the coin and its pieces
const out = (x, y, cam) => {
  const sx = x - cam.x, sy = y - cam.y;
  return ((sx + 20) & 0xFFFF) > 276 || sy + 20 < 0 || sy > 240;
};

// sub_801F07C: the floor's distance and, when the column has floor, its angle
function floor(ctx, x, y) {
  const t = ctx.world.terrain, d = tileFloor(t, x, y, 1);
  return { d, angle: t.columnHeight(x, y, 1) !== 0 ? t.angle(x, y, 1) : undefined };
}

// the coin, and once it shatters its pieces, one sprite drawn at each
function coin(x, y0, ctx) {
  const s = sprite('slotCoin', ctx.anims, { order: 9 });
  let vy = 0, y = y0, pieces = null, life = LIFE;
  return {
    run(ctx) {
      if (pieces) return shards(ctx);
      vy = s16(vy + FALL);
      y = s16(y + I(vy));
      const hit = ctx.projectile(s, x, y);
      if (out(x, y, ctx.cam)) return false;
      const f = floor(ctx, x, y);
      if (f.d <= 0 || hit) {
        const angle = hit ? 0 : f.angle;
        pieces = [];
        for (let i = 0; i < PIECES; i++) {
          const r0 = Div(-(vy * 10), ((ctx.world.random() | 0) % 4) + 16);
          pieces.push({
            live: true, x, y: s16(y + f.d), q: x * 256,
            vy: s16(Math.trunc(r0 * SIN(((angle * 4) & 0x7F) + 0x100) / 20000)),
            vx: Div(SIN(((angle - 24 + i * 8) * 4) & 1023), 30),
          });
        }
        startAnim(s, 'slotPiece', true);
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };

  function shards(ctx) {
    animate(s, ctx.anims);
    if (--life === 0) return false;
    for (const pc of pieces) {
      if (!pc.live) continue;
      pc.vy = s16(Div(pc.vy * 1000, 1045 - life));
      pc.q += pc.vx;
      pc.x = s16(I(pc.q));
      pc.vy = s16(pc.vy + FALL);
      pc.y = s16(pc.y + I(pc.vy));
      const { x, y } = pc;
      if (out(x, y, ctx.cam)) { pc.live = false; continue; }
      const f = floor(ctx, x, y);
      if (f.d <= 0) {
        pc.y = s16(pc.y + f.d);
        pc.vy = s16(Div(-(pc.vy * 10), 21));
        pc.vx += Div(SIN((f.angle * 4) & 1023), 30);
      }
      if (life >= BLINK || life & 2) ctx.draw(s, x, y);
    }
    return true;
  }
}
