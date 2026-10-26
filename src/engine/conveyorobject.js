// The rollers along Egg Rocket's and Cosmic Angel's conveyor belts (SAT-R decompilation,
// src/game/sa1/stage/interactables/conveyor_belt_object.c), kind 99: solid objects that only animate; d0
// picks the wide or slim one, each in two variants. The belt's push comes from the conveyor belt itself (69).

import { makeSprite, animate, offCam } from './objects.js';
import { platform } from './collide.js';

export const CONVEYOR_BELT_OBJECT = 99;
const LOOKS = ['conveyorWide', 'conveyorWideB', 'conveyorSlim', 'conveyorSlimB'];

/** The task for a conveyor belt object, or null when `e` is not one. */
export function createConveyorBeltObject(e, slot, anims) {
  if (e.kind !== CONVEYOR_BELT_OBJECT) return null;
  const o = { x: e.x, y: e.y, ...makeSprite(LOOKS[e.d[0]] ?? LOOKS[0]) };
  return {
    run(ctx) {
      // its box is the one its last animation frame set; none on its first frame
      platform(o, o.boxes[0], ctx.player, ctx.world.terrain);
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
