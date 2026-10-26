// Hanabii, Casino Paradise's firework launcher (SAT-R decompilation, src/game/sa1/stage/enemies/hanabii.c). It
// walks 0.625 px a frame between (d0 + 1) × 8 and (d0 + d2) × 8 px right of its spawn point, following the
// floor, and turns at either end. Away from the ends, with Sonic within 100 px, it stops to launch a shot, then
// walks on and doesn't launch again for 100 frames spent walking between the ends.
//
// The distance test squares each axis into 16 bits, as the original does: from 182 px away along either one the
// square wraps, and Sonic far off can set it launching as if he were near (issue #56).
//
// The shot goes up from its mouth, slowing by 44/256 px a frame per frame, and bursts into a firework when it
// has nearly stopped. The firework hangs there for 20 frames, drawn four times mirrored around the shot's
// point; only the unmirrored quarter's box hurts Sonic.

import { startAnim, animate } from './objects.js';
import { I, TILE, data, gone, s16, sonicX, sonicY, sprite } from './enemies.js';
import { tileFloor } from './terrain.js';

export const HANABII = 8;

const STEP = 160;            // 0.625 px, in 1/256 px
const NEAR = 100 * 100;
const REST = 100;
const LAUNCH = 7, LAUNCHED = 19;
const SHOT_SPEED = -944, SHOT_SLOW = 44, BURST_AT = -16, BURST = 20;

export function hanabii(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('hanabiiWalk', anims);
  let q = 0, v = -STEP, yoff = 0, t = 0, rest = 0, launching = false;
  return {
    run(ctx) {
      if (!launching) q += v;
      const x = e.x + I(q), y = e.y + yoff;
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      yoff += tileFloor(ctx.world.terrain, x, y, 1);
      if (!launching) {
        const dx = s16(sonicX(ctx) - x), dy = s16(sonicY(ctx) - y);
        if (I(q) <= (d0 + 1) * TILE) {
          if (!s.flipX) { s.flipX = true; v = STEP; }
        } else if (I(q) >= (d0 + d2) * TILE) {
          if (s.flipX) { s.flipX = false; v = -STEP; }
        } else if (rest !== 0) rest--;
        else if (s16(dx * dx) + s16(dy * dy) < NEAR) {
          t = 0; rest = REST; startAnim(s, 'hanabiiLaunch', true); launching = true;
        }
      } else {
        if (++t === LAUNCH) ctx.add(shot(s.flipX ? x + 4 : x - 6, y - 20, ctx), 0x3000);
        if (t === LAUNCHED) { t = 0; startAnim(s, 'hanabiiWalk', true); launching = false; }
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// the shot and the firework it bursts into
function shot(x, y0, ctx) {
  const s = sprite('hanabiiShot', ctx.anims, { order: 9 });
  let vy = SHOT_SPEED, y = y0, burst = false, t = 0;
  const out = () => {
    const sx = x - ctx.cam.x, sy = y - ctx.cam.y;
    return ((sx + 60) & 0xFFFF) > 360 || sy + 60 < 0 || sy > 300;
  };
  return {
    run(ctx) {
      if (!burst) {
        vy = s16(vy + SHOT_SLOW);
        y += I(vy);
        ctx.projectile(s, x, y);
        if (out()) return false;
        animate(s, ctx.anims);
        ctx.draw(s, x, y);
        if (vy > BURST_AT) { startAnim(s, 'hanabiiFirework', true); burst = true; }
        return true;
      }
      y += I(vy);
      ctx.projectile(s, x, y);
      if (out() || ++t > BURST) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      ctx.draw({ ...s, flipY: true }, x, y);
      ctx.draw({ ...s, flipX: true, flipY: true }, x, y);
      ctx.draw({ ...s, flipX: true }, x, y);
      return true;
    },
  };
}
