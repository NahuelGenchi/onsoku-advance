// The act's rings, collected and drawn like the original's ring manager (SAT-R decompilation,
// src/game/shared/stage/rings_manager.c). It runs after the camera and before the objects and Sonic, so it
// sees where he was at the end of the last frame. Every ring shares one sprite, so they all spin together.

import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { SCREEN_W, SCREEN_H } from './constants.js';

const REGION = 256, TILE = 8;
const HALF_WIDTH = 6;   // Sonic's spriteOffsetX: the same in every state

// The original keeps region indices in u16s: a search that starts left of or above the map wraps to 65535
// and finds nothing.
const lower = v => (v >> 8) & 0xFFFF, upper = v => v >> 8;

// a ring covers 16 × 16 px above its point; Sonic's box is ±6 px wide and ±spriteOffsetY tall around his
// centre, and the two touch when either one's left (top) edge lies inside the other
function touching(px, py, oy, rx, ry) {
  const l = px - HALF_WIDTH, r = px + HALF_WIDTH, t = py - oy, b = py + oy;
  return ((rx - TILE <= l && rx + TILE >= l) || (rx - TILE >= l && r >= rx - TILE))
    && ((ry - 2 * TILE <= t && ry >= t) || (ry - 2 * TILE >= t && b >= ry - 2 * TILE));
}

export function createRings(layout, anims) {
  const { regionsX, regionsY } = layout;
  let regions;
  const anim = makeAnimator();

  return {
    /** Puts every ring back, as the act's start does. */
    reset() {
      regions = layout.regions.map(list => list.map(({ x, y }) => ({ x, y, taken: false })));
      setAnim(anim, 'ring', true);
    },

    /**
     * Steps the spin and collects what Sonic touches (nothing when `player` is null). Returns the rings
     * taken this frame, in the original's order: by region row, then column, then the region's list.
     */
    update(player) {
      tickAnim(anim, anims);
      if (!player) return [];
      const px = Math.floor(player.x), py = Math.floor(player.y), oy = player.offsetY;
      const taken = [];
      // the search's bottom and right edges come in by a ring's height and half its width, so a ring just
      // inside the next region down or right can be missed for a frame
      for (let ry = lower(py - oy); ry <= upper(py + oy - 2 * TILE) && ry < regionsY; ry++) {
        for (let rx = lower(px - HALF_WIDTH - TILE); rx <= upper(px + HALF_WIDTH - TILE) && rx < regionsX; rx++) {
          for (const ring of regions[rx + ry * regionsX]) {
            if (!ring.taken && touching(px, py, oy, ring.x, ring.y)) { ring.taken = true; taken.push(ring); }
          }
        }
      }
      return taken;
    },

    /** The atlas frame every ring shows, and the rings on screen as the original picks them. */
    visible(cam) {
      const cx = Math.floor(cam.x), cy = Math.floor(cam.y), list = [];
      for (let ry = cy >> 8; ry * REGION < cy + SCREEN_H && ry < regionsY; ry++) {
        for (let rx = cx >> 8; rx * REGION < cx + SCREEN_W && rx < regionsX; rx++) {
          for (const ring of regions[rx + ry * regionsX]) {
            const sx = ring.x - cx, sy = ring.y - cy;
            if (ring.taken || sx < -TILE || sx + TILE > SCREEN_W + 2 * TILE || sy < 0 || sy - 2 * TILE > SCREEN_H) continue;
            list.push(ring);
          }
        }
      }
      return { frame: frameOf(anim, anims), list };
    },
  };
}
