// The conveyor belts (SAT-R decompilation, src/game/sa1/stage/interactables/conveyor_belt_movement.c:
// Task_ConveyorBeltMvt), kind 69 outside Ice Mountain, which uses the kind for its snow. The belt itself is
// drawn in the act; the entity is a box from its spawn point, d2 by d3 tiles (both edges in). On every frame
// Sonic's position is in it and he is on the ground, it carries him 0.625 px, right when d0 is set and left
// otherwise, then pushes him out of any wall 8 px ahead of or behind his centre. It leaves when its spawn point
// leaves the camera's range.

import { offCam } from './objects.js';

export const CONVEYOR = 69;
const ICE_MOUNTAIN = 3;
const SPEED = 0.625;   // CONVEYOR_BELT_SPEED

// sub_801F100 with sub_801EB44: the distance from x to the wall in its tile along `step`, negative inside it
function wallDistance(terrain, x, y, layer, step) {
  const v = terrain.rowWidth(x, y, layer), r = x & 7;
  if (v === 0) return step > 0 ? 8 - r : r + 1;
  if (v === 8) return step > 0 ? -1 - r : r - 8;
  return v > 0 ? v - 1 - r : v + r;
}

/** The task for a conveyor belt, or null when `e` is not one. */
export function createConveyor(e, slot, ctx) {
  if (e.kind !== CONVEYOR || ctx.world.zone === ICE_MOUNTAIN) return null;
  const w = e.d[2] * 8, h = e.d[3] * 8, right = e.d[0] !== 0;
  return {
    run(ctx) {
      const p = ctx.player, terrain = ctx.world.terrain, x = Math.floor(p.x), y = Math.floor(p.y);
      if (!p.dead && x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h && !p.air) {
        if (right) {
          p.x += SPEED;
          const d = wallDistance(terrain, Math.floor(p.x) + 8, y, p.layer, 8);
          if (d < 0) p.x += d;
        } else p.x -= SPEED;
        const d = wallDistance(terrain, Math.floor(p.x) - 8, y, p.layer, -8);
        if (d < 0) p.x -= d;
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
