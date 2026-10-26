// Yukimaru, Ice Mountain's snowman (SAT-R decompilation, src/game/sa1/stage/enemies/yukimaru.c), kinds 16 and
// 17. Its sprite is a half, drawn again mirrored for the other.
//
// On the ground (16) it walks 0.625 px a frame between d0 × 8 and (d0 + d2) × 8 px right of its spawn point,
// 6 px above it and following the floor, turning at either end. Away from the ends, once it has walked 60 frames
// since its last throw, it throws a snowball straight up whenever Sonic is above it and no more than 8 px to
// either side. On a wall (17) it climbs the same way between d1 × 8 and (d1 + d3) × 8 px below its spawn point,
// keeping to the wall (on its right when d0 isn't 0, on its left when it is), and throws across, away from the
// wall, whenever Sonic is on that side no more than 8 px above or below it.
//
// The snowballs pass through Sonic, hurting him, and leave only off the screen. The one thrown up keeps the
// snowman's X in a 16-bit field four times over: from X 8192 on it would appear 16384 px to the left and leave
// at once, which no Yukimaru in the game is far enough right for.

import { startAnim, animate } from './objects.js';
import { I, TILE, s16, data, gone, sonicX, sonicY, sprite } from './enemies.js';
import { tileFloor, probeTile, PROBE_WALL } from './terrain.js';

export const YUKIMARU = 16, YUKIMARU_WALL = 17;

const SPEED = 160;          // 0.625 px, in 1/256 px
const REST = 60;            // frames of walking before it can throw again
const SNOWBALLS = 0x3000;   // the snowballs' task priority

export function yukimaru(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('yukimaruWalk', anims, { order: 0, prio: 2 });
  let q = 0, v = -SPEED, dy = 0, rest = 0, t = 0, throwing = false;
  return {
    run(ctx) {
      if (!throwing) q = s16(q + v);
      const x = s16(e.x + I(q)), y = s16(e.y - 6 + dy);
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      dy = s16(dy + tileFloor(ctx.world.terrain, x, y, 1));
      if (!throwing) {
        if (I(q) <= d0 * TILE) v = SPEED;
        else if (I(q) >= (d0 + d2) * TILE) v = -SPEED;
        else if (rest !== 0) rest--;
        else if (sonicY(ctx) <= y && sonicX(ctx) <= x + 8 && x - 8 <= sonicX(ctx)) {
          rest = REST; t = 0; startAnim(s, 'yukimaruThrow'); throwing = true;
        }
      } else {
        t++;
        if (t === 4) ctx.add(snowballUp(x, y - 18, ctx.anims), SNOWBALLS);
        if (t === 13) { startAnim(s, 'yukimaruWalk'); throwing = false; }
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      ctx.draw({ ...s, flipX: true, order: 18 }, x, y);
      return true;
    },
  };
}

export function yukimaruWall(e, slot, anims) {
  const { d0, d1, d3 } = data(e), right = d0 === 0;   // the side it throws to, away from the wall
  const s = sprite('yukimaruWallWalk', anims, { order: 0, prio: 2, flipX: d0 !== 1 });
  let q = 0, v = -SPEED, dx = 0, rest = 0, t = 0, throwing = false;
  const show = (ctx, x, y) => {
    ctx.draw(s, x, y);
    ctx.draw({ ...s, flipY: true }, x, y);
  };
  return {
    run(ctx) {
      if (!throwing) q = s16(q + v);
      const x = s16(e.x + dx), y = s16(e.y + I(q));
      // the throw to the right sets off its snowball before it can leave or be defeated that frame
      if (throwing && right && ++t === 4) ctx.add(snowballAcross(x + 10, y, 3, ctx.anims), SNOWBALLS);
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      if (!throwing) {
        const d = probeTile(ctx.world.terrain, x, y, 1, right ? -8 : 8, PROBE_WALL).d;
        dx = s16(right ? dx - d : dx + d);
        const px = sonicX(ctx), py = sonicY(ctx);
        if (I(q) <= d1 * TILE) v = SPEED;
        else if (I(q) >= (d1 + d3) * TILE) v = -SPEED;
        else if (rest !== 0) rest--;
        else if ((right ? px >= x : px <= x) && py <= y + 8 && y - 8 <= py) {
          rest = REST; t = 0; startAnim(s, 'yukimaruWallThrow'); throwing = true;
        }
      } else {
        if (!right && ++t === 4) ctx.add(snowballAcross(x - 10, y, -3, ctx.anims), SNOWBALLS);
        if (t === 18) { startAnim(s, 'yukimaruWallWalk'); throwing = false; }
      }
      animate(s, ctx.anims);
      show(ctx, x, y);
      return true;
    },
  };
}

// a snowball's test for leaving: its screen position 20 px or more past the left, right or top, or 80 past the bottom
const off = (x, y, cam) => (s16(x - cam.x) + 20 & 0xFFFF) > 276 || s16(y - cam.y) + 20 < 0 || s16(y - cam.y) > 240;

// the snowball thrown up (CreateSnowball, Task_Snowball): 5 px a frame, slowing by 40/256 px a frame each frame
function snowballUp(x0, y0, anims) {
  const s = sprite('yukimaruSnowball', anims, { order: 1, prio: 0 }), q = s16(x0 * 4), x = (q < 0 ? q + 3 : q) >> 2;
  let y = y0, vy = -0x500;
  return {
    run(ctx) {
      vy = s16(vy + 40);
      y = s16(y + I(vy));
      ctx.projectile(s, x, y);
      if (off(x, y, ctx.cam)) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// the snowball thrown across (CreateSnowball2, Task_Snowball2): 3 px a frame, falling by 23/256 px a frame more
// each frame; it starts 8 px left of where it was thrown from
function snowballAcross(x0, y0, vx, anims) {
  const s = sprite('yukimaruSnowball', anims, { order: 1, prio: 0 });
  let x = s16(x0 - 8), y = y0, vy = 0;
  return {
    run(ctx) {
      x = s16(x + vx);
      vy = s16(vy + 23);
      y = s16(y + I(vy));
      ctx.projectile(s, x, y);
      if (off(x, y, ctx.cam)) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
