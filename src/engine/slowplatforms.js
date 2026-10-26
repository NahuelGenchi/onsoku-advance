// Platforms that sink or rise under Sonic (SAT-R decompilation, src/game/sa1/stage/interactables/
// platforms_085_089.c; the tasks are at 0x0808DCE9 and 0x0808E1FD in the USA ROM). Sonic lands on either
// from above only, as on a thin platform.
//
// Kind 85 sinks 0.75 px a frame while he stands on it, taking him with it, until the terrain is 22 px under
// its spawn point's line, and rises back as fast once he is off it. Landing on it puts him 2 px above its top.
// Kind 89 rises 0.75 px a frame while he stands on it, taking him with it, and sinks back once he is off it;
// once it has risen more than d3 × 8 px, he dies on it.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { platformTop, overlap, LANDED } from './collide.js';
import { tileFloor } from './terrain.js';

export const SINKING_PLATFORM = 85, RISING_PLATFORM = 89;

const SOX = 6;
const STEP = 192;   // 0.75 px, in 1/256 px

// whether his body touches its box at (x, y) (Coll_Player_Entity_Intersection)
const touching = (o, x, y, p) => !p.dead && overlap(x, y, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY]);

/** The task for a sinking or rising platform entity, or null when `e` is neither. */
export function createSlowPlatform(e, slot, anims) {
  if (e.kind === SINKING_PLATFORM) return sinking(e, slot, anims);
  if (e.kind === RISING_PLATFORM) return rising(e, slot, anims);
  return null;
}

// Task_Platform085: its look is the level's (gUnknown_086CEDC0, levels.js `sprites`)
function sinking(e, slot, anims) {
  const o = { ...makeSprite('sinkingPlatform'), x: e.x, y: e.y };
  animate(o, anims);
  let q = 0;   // how far it has sunk, in 1/256 px
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, terrain = ctx.world.terrain, y = e.y + (q >> 8);
      let on = false;
      if (p.onObject === o) {
        const room = tileFloor(terrain, e.x, y + 22, p.layer);
        if (!touching(o, e.x, y - 4, p)) p.onObject = null;
        else {
          on = true;
          if (room >= 0) p.y += STEP / 256;
          // out of the floor under his feet, and off it
          const d = tileFloor(terrain, Math.floor(p.x), Math.floor(p.y) + 16, p.layer);
          if (d < 0) { p.y += d; p.onObject = null; }
        }
      } else if (platformTop(o, e.x, y, o.boxes[0], p) & LANDED) {
        if (!p.spinDashing) p.y -= 2;
        on = true;
      }
      if (on) { if (tileFloor(terrain, e.x, y + 22, p.layer) >= 0) q += STEP; }
      else if (q !== 0) q -= STEP;
      const at = e.y + (q >> 8);
      if (offDisplay(e.x, e.y, cam) && offCam(e.x, at, cam)) { slot.live = null; return false; }
      ctx.draw(o, e.x, at);
      return true;
    },
  };
}

// Task_Platform089: drawn where it was before it moves this frame
function rising(e, slot, anims) {
  const o = { ...makeSprite('risingPlatform'), x: e.x, y: e.y };
  animate(o, anims);
  const top = e.d[3] * 8;
  let q = 0;   // how far it has risen, in 1/256 px
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, y = e.y - (q >> 8);
      let on = false, off = false;
      if (p.onObject === o) {
        on = true;
        if (!touching(o, e.x, y - 4, p)) p.onObject = null;
        else {
          p.y -= STEP / 256;
          if (q >> 8 > top) { p.onObject = null; p.dead = true; }
        }
      } else if (!(platformTop(o, e.x, y, o.boxes[0], p) & LANDED)) off = true;
      if (on) q += STEP;
      else if (off && q !== 0) q -= STEP;
      if (offDisplay(e.x, e.y, cam) && offCam(e.x, y, cam)) { slot.live = null; return false; }
      ctx.draw(o, e.x, y);
      return true;
    },
  };
}
