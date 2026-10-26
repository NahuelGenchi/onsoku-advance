// Ice Mountain's deep snow (SAT-R decompilation, src/game/sa1/stage/interactables/conveyor_belt_movement.c:
// Task_SlowingSnow), kind 69 in zone 4, where other zones make it a conveyor belt: a box from its spawn point,
// d2 by d3 tiles (both edges in). On every frame Sonic's position is in it and he is on the ground, his ground
// speed drops to 95% of itself, rounded toward zero. It leaves when its spawn point leaves the camera's range.

import { offCam } from './objects.js';

export const SNOW = 69;
const ICE_MOUNTAIN = 3;

/** The task for a stretch of deep snow, or null when `e` is not one. */
export function createSnow(e, slot, ctx) {
  if (e.kind !== SNOW || ctx.world.zone !== ICE_MOUNTAIN) return null;
  const w = e.d[2] * 8, h = e.d[3] * 8;
  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (!p.dead && x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h && !p.air) {
        p.gsp = Math.trunc(Math.round(p.gsp * 256) * 95 / 100) / 256;
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
