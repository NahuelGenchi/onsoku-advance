// The rings Sonic drops when he is hurt (SAT-R decompilation, src/game/shared/stage/rings_scatter.c,
// InitScatteringRings and the single-player normal-gravity update). Their task runs after the objects and
// before the HUD and Sonic, so a ring dropped this frame already moves once. Positions and speeds are kept
// in 1/256 px, as the original's Q24.8 and Q8.8 integers.

import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { SINE } from './trig.js';
import { tileFloor } from './terrain.js';

const SLOTS = 48;
const LIFE = 256, PICKUP_AFTER = 224, BLINK_BELOW = 32;   // frames
const GRAVITY = 18;
const TILE = 8;

// the speeds go round three circles in mirrored pairs: each even ring gets the next angle on the circle,
// and the odd ring after it the same with X reversed
function launchSpeeds(n) {
  const out = [];
  let r3 = 0x488, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    if (r3 >= 0) {
      let shift = r3 >> 8;
      if (shift > 5) shift = 9 - shift;
      const a = (r3 & 0xFF) * 4;
      vx = SINE[a] >> shift; vy = SINE[a + 256] >> shift;
      vx -= vx >> 2; vy -= vy >> 2;
      r3 = (r3 + 0x10) | 0x80;
    }
    out.push([vx, vy]);
    r3 = -r3; vx = -vx;
  }
  return out;
}

// RECT_TOUCHING_RING: a ring covers 16 × 16 px above its point, and Sonic is his sprite's body hitbox
function touching(px, py, box, rx, ry) {
  const l = px + box[0], r = px + box[2], t = py + box[1], b = py + box[3];
  return ((rx - TILE <= l && rx + TILE >= l) || (rx - TILE >= l && r >= rx - TILE))
    && ((ry - 2 * TILE <= t && ry >= t) || (ry - 2 * TILE >= t && b >= ry - 2 * TILE));
}

export function createScatter(anims) {
  const anim = makeAnimator();
  anim.speed = 0x20;   // twice the rings' normal speed
  let rings = [];

  return {
    /** Clears every slot, as a new stage task does. */
    reset() {
      rings = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, layer: 0, shown: false }));
      setAnim(anim, 'ring', true);
    },

    /** InitScatteringRings: up to 48 rings from (x, y), in the free slots; the rest are lost. */
    launch(x, y, n, layer) {
      const speeds = launchSpeeds(Math.min(n, SLOTS));
      let k = 0;
      for (const r of rings) {
        if (k === speeds.length) break;
        if (r.life) continue;
        Object.assign(r, { x: x * 256, y: y * 256, vx: speeds[k][0], vy: speeds[k][1], life: LIFE, layer });
        k++;
      }
    },

    /**
     * One frame for every ring: it moves, may be picked up, bounces off the floor while falling (they go
     * through walls and ceilings), falls, and ages. Returns the rings picked up, as { x, y }. `view` is what
     * the screen shows (camera.js viewOf): only drawing depends on it.
     */
    update(player, view, terrain, tick) {
      tickAnim(anim, anims);
      const px = Math.floor(player.x), py = Math.floor(player.y), box = player.boxes[0];
      const canTake = !player.dead && (player.state !== 'hurt' || player.invulnerable === 0) && box;
      const taken = [];
      for (const r of rings) {
        r.shown = false;
        if (!r.life) continue;
        r.x += r.vx; r.y += r.vy;
        const rx = r.x >> 8, ry = r.y >> 8;
        if (r.life <= PICKUP_AFTER && canTake && touching(px, py, box, rx, ry)) {
          taken.push({ x: rx, y: ry }); r.life = 0;
          continue;
        }
        if (r.vy > 0) {
          const d = tileFloor(terrain, rx, ry, r.layer);
          if (d <= 0) { r.y += d * 256; r.vy = (r.vy >> 2) - r.vy; }
        }
        r.vy += GRAVITY;
        // drawn where it was before the bounce; blinking in its last 32 frames with Sonic's blink
        const sx = rx - view.x, sy = ry - view.y;
        r.shown = sx + TILE > 0 && sx + TILE < view.w + 2 * TILE && sy > -TILE && sy < view.h + TILE
          && (r.life >= BLINK_BELOW || (tick & 2) === 0);
        r.sx = rx; r.sy = ry;
        r.life--;
      }
      return taken;
    },

    /** The atlas frame they all show, and where the ones drawn this frame are. */
    visible() {
      return { frame: frameOf(anim, anims), list: rings.filter(r => r.shown).map(r => ({ x: r.sx, y: r.sy })) };
    },
  };
}
