// Casino Paradise's ship swings (SAT-R decompilation, src/game/sa1/stage/interactables/ship_swing.c), kind 60:
// a pirate ship hanging from a hook on five links, swinging with the stage timer. Sonic can stand on the hook
// and on the ship, which carries him with it, his centre 5 px above its point; stepping off the ship keeps it
// from taking him again for 5 frames. The ship is half a sprite, drawn a second time mirrored.

import { makeSprite, animate, offCam } from './objects.js';
import { platformTop, LANDED } from './collide.js';
import { SINE } from './trig.js';

export const SHIP_SWING = 60;
const LINKS = 5;

/** The task for a ship swing entity, or null when `e` is not one. */
export function createShipSwing(e, slot, anims) {
  if (e.kind !== SHIP_SWING) return null;
  const hook = makeSprite('shipSwingHook', { order: 18 });
  const link = makeSprite('shipSwingLink', { order: 18 });
  const ship = makeSprite('shipSwing', { order: 4 });
  // the sprites' only frames, whose boxes they keep: the task never steps them again
  for (const s of [ship, hook, link]) animate(s, anims);
  hook.x = e.x; hook.y = e.y;
  let onHook = false, onShip = false, wait = 0, lastX = 0;

  return {
    priority: 0x7000,
    run(ctx) {
      const p = ctx.player;
      // the swing: an angle from the timer, and a lift at either end of it
      let t = (ctx.world.tick * 2) % 0x200, lift;
      if (t > 0x100) { t = 0x200 - t; lift = SINE[t * 2] >> 8; }
      else lift = -(SINE[t * 2] >> 8);
      const theta = ((SINE[((t - 0x7E) & 0x1FF) * 2] >> 7) & 0x1FF) * 2;
      const dirX = SINE[theta], dirY = SINE[theta + 256] + lift;

      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      ctx.draw(hook, e.x, e.y);
      let dx = 0, dy = 0;
      for (let i = 0; i < LINKS; i++) {
        dx += Math.trunc(dirX * 110 / 100);
        dy += Math.trunc(dirY * 110 / 100);
        link.order = i === LINKS - 1 ? 3 : 18;
        ctx.draw(link, e.x + (dx >> 10), e.y + (dy >> 10));
      }
      const sx = e.x + (dx >> 10), sy = e.y + (dy >> 10);
      ship.x = sx; ship.y = sy;

      if (!p.dead) {
        if (e.y - 4 > p.y) {
          if (platformTop(hook, e.x, e.y, hook.boxes[0], p) & LANDED) onHook = true;
          else if (onHook) { onHook = false; p.onObject = null; p.pushing = false; }
        }
        if (wait > 0) wait--;
        else if (platformTop(ship, sx, sy, ship.boxes[0], p) & LANDED) {
          if (!onShip) onShip = true;
          else { p.x += sx - lastX; p.y = sy - 5; }
          lastX = sx;
        } else if (onShip) { onShip = false; wait = 5; p.onObject = null; p.pushing = false; }
      }

      ship.flipX = false; ctx.draw(ship, sx, sy);
      ship.flipX = true; ctx.draw(ship, sx, sy);
      return true;
    },
  };
}
