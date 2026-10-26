// Cosmic Angel's gravity toggles (SAT-R decompilation, src/game/sa1/stage/interactables/toggle_gravity.c, which
// doesn't match the ROM, so this follows its assembly). What flipped gravity does to Sonic is in sensors.js and
// player.js; the toggles only set it.

import { offCam } from './objects.js';

export const TOGGLE_GRAVITY = 109;

const s8 = v => (v << 24) >> 24;

/**
 * A gravity toggle (Task_ToggleGravity, at the objects' priority): an unseen line that acts when Sonic's centre
 * crosses it, either way, within its span, while he is alive. With d2 above d3 it lies across, at the entity's
 * y, from x + d0 × 8 for d2 × 8 px, and d1 says what it does: 3 turns gravity over, 4 sets it normal, anything
 * else flips it. Otherwise it stands at the entity's x, from y + d1 × 8 for d3 × 8 px, and d0 says: 0 turns it
 * over, 1 normal, anything else flipped. It compares where he is with where he was on its last frame, or when
 * it was made.
 */
export function createToggleGravity(e, slot, ctx) {
  if (e.kind !== TOGGLE_GRAVITY) return null;
  const across = e.d[2] > e.d[3], what = across ? e.d[1] : e.d[0];
  const [turn, normal] = across ? [3, 4] : [0, 1];
  const along = p => (across ? p.y : p.x);   // where Sonic is across the line
  let last = along(ctx.player);
  return {
    run(ctx) {
      const p = ctx.player;
      if (!p.dead) {
        const line = across ? e.y : e.x, now = along(p);
        const from = across ? e.x + s8(e.d[0]) * 8 : e.y + s8(e.d[1]) * 8, to = from + (across ? e.d[2] : e.d[3]) * 8;
        const at = Math.floor(across ? p.x : p.y);
        if (from <= at && to >= at && ((last > line && now < line) || (last < line && now > line))) {
          p.inverted = what === turn ? !p.inverted : what !== normal;
        }
        last = now;
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
