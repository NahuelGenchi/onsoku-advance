// Angel Island's rolling boulders (SAT-R decompilation, src/game/sa1/stage/interactables/boulder_spawner.c).
// A spawner draws nothing: on every frame the stage clock is a multiple of 120, it lets a boulder go at its
// spawn point, and it leaves once that point is more than 128 px off the screen.
//
// A boulder rolls right along the back layer's floor, starting at 1/4 px a frame. Each frame it reads the
// floor in the tile at its bottom: within 5 px it settles 2 px into it and speeds up by the cosine of the
// floor's angle over 1250 (13/256 px a frame on the flat); further down, it falls, from 2/5 of its speed
// across, gaining 1/8 px a frame each frame. Landing stops the fall; it lands d0 times and breaks on the
// next landing, into the pieces of a broken boulder, with an explosion when it is on the screen. It hurts
// Sonic where its box meets his, and it is drawn where it was at the start of the frame.
//
// Original quirks kept: where the tile at its bottom is empty the floor probe leaves the angle alone, and the
// boulder reads whatever its stack held there instead; and it leaves as soon as it is off the screen, since
// the test meant to keep it while its spawn point is near looks at that point's world position as if it were
// a place on the screen.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { overlap } from './collide.js';
import { tileFloor } from './terrain.js';
import { SINE } from './trig.js';
import { debris } from './boulders.js';
import { SONG } from '../sound/songs.js';

export const BOULDER_SPAWNER = 92;
const EVERY = 120;
const SOX = 6;   // spriteOffsetX
const LAYER = 1;
// what the angle left on the stack adds to its speed where the tile at its bottom is empty: 3/256 px a frame
// in every mGBA recording (an angle of 52 to 54)
const STACK_SPEED_UP = 3;

// IS_OUT_OF_CAM_RANGE on a screen position
const screenOff = (sx, sy) => ((sx + 128) & 0xFFFF) > 496 || sy + 128 < 0 || sy > 288;

/** The task for a boulder spawner entity, or null when `e` is not one. */
export function createBoulderSpawner(e, slot, anims) {
  if (e.kind !== BOULDER_SPAWNER) return null;
  return {
    run(ctx) {
      if (ctx.world.tick % EVERY === 0) ctx.add(boulder(e.x, e.y, e.d[0] & 0xFF, anims));
      if (offDisplay(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

function boulder(x0, y0, landings, anims) {
  const s = makeSprite('fallingBoulder');
  animate(s, anims);
  // its speed and how far it has gone, in 1/256 px (qUnkA0, qUnkA4, qUnkA8, qUnkAC)
  let vx = 64, vy = 0, dx = 0, dy = 0, falling = false;
  return {
    run(ctx) {
      const cam = ctx.cam, p = ctx.player, t = ctx.world.terrain;
      const x = x0 + (dx >> 8), y = y0 + (dy >> 8);
      if (screenOff(x0, y0) && screenOff(x - cam.x, y - cam.y)) return false;
      if (!p.dead && s.boxes[0] && overlap(x, y, s.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) {
        ctx.world.damage();
      }
      const d = tileFloor(t, x, y, LAYER);
      if (falling) {
        if (d >= 0) vy += 32;
        else {
          vy = 0; falling = false;
          if (landings !== 0) landings--;
          else {
            ctx.add(debris(x - cam.x, y - cam.y, cam.x, cam.y, anims));
            if (!offCam(x, y, cam)) ctx.world.playSound(SONG.EXPLOSION);
            return false;
          }
        }
      } else if (d > 5) {
        vy += Math.abs(Math.trunc(vx * 2 / 5));
        falling = true;
      } else {
        vx += t.columnHeight(x, y, LAYER) !== 0 ? Math.trunc(SINE[t.angle(x, y, LAYER) * 4 + 256] / 1250) : STACK_SPEED_UP;
        dy += (d + 2) * 256;
      }
      dx += vx; dy += vy;
      animate(s, anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
