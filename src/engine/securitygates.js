// The security gates (SAT-R decompilation, src/game/sa1/stage/interactables/security_gate.c), kind 77: a
// shutter that drops shut behind Sonic. It waits until his position is inside a zone d2 tiles wide and d3
// tiles tall from its spawn point's height down: with d0 0 the zone ends 10 px right of the gate, otherwise it
// starts there. Then it slides down 6 px a frame for 8 frames, to 48 px below its spawn point, and from the
// next frame on it pushes him out of its sides (Coll_Player_Gate without its attack test). It stays shut
// until it leaves the camera's range.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { gate } from './collide.js';

export const SECURITY_GATE = 77;
const TILE = 8, DROP = 6, FRAMES = 8, SHUT = 48;

/** The task for a security gate entity, or null when `e` is not one. */
export function createSecurityGate(e, slot, anims) {
  if (e.kind !== SECURITY_GATE) return null;
  const o = { ...makeSprite('securityGate'), x: e.x, y: e.y };
  const from = e.d[0] === 0 ? e.d[2] * TILE - 10 : -10;   // unk3E
  // waiting (Task_SecurityGateMain), dropping (Task_SecurityGate1) or shut (Task_SecurityGate2)
  let phase = 'waiting', drop = 0, left = 0;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, y = e.y + drop, was = phase;   // where it shows this frame
      if (phase === 'waiting') {
        const px = Math.floor(p.x), py = Math.floor(p.y);
        if (!p.dead && e.x - from <= px && e.x - from + e.d[2] * TILE >= px && e.y <= py && e.y + e.d[3] * TILE >= py) {
          drop = 0; left = FRAMES; phase = 'dropping';
        }
      } else if (phase === 'shut') {
        o.y = y;
        gate(o, o.boxes[0], p, ctx.world.terrain, false);
      }
      if (offDisplay(e.x, e.y, cam) && offCam(e.x, y, cam)) { slot.live = null; return false; }
      if (was === 'dropping') {
        if (--left === 0) { drop = SHUT; phase = 'shut'; } else drop += DROP;
      }
      animate(o, anims);
      ctx.draw(o, e.x, y);
      return true;
    },
  };
}
