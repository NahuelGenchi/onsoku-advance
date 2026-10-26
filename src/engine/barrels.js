// Casino Paradise's small Barrel of Doom (kind 57; SAT-R decompilation,
// src/game/sa1/stage/interactables/platform_square.c, Task_BarrelOfDoomMini): a barrel that bobs on a spring.
// Sonic lands on its top as on a crumbling platform, from any side while he isn't rising, and landing pushes it
// down by 6/10 of his falling speed. Off its place it is pulled back at 48/256 px a frame per frame, its speed
// loses 1% a frame, and it comes to rest when that speed is under 48/256 px a frame within 3 px of its place.
//
// Standing on it he moves with it, kept on its top while his feet are within 8 px of it. His presses from his
// last frame count: jump throws him off at half its speed less 4 px a frame up, as his own jump starts; with
// down held, jump only curls him up on it, and attack does nothing (both are Amy's moves in the original).

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { platformTop, LANDED } from './collide.js';
import { DOWN } from './player.js';
import { setOffsetY } from './sensors.js';
import { BALL_SPRITE_OFFSET_Y } from './constants.js';

export const BARREL_OF_DOOM_MINI = 57;
const PULL = 48;          // 1/256 px a frame per frame
const REST_SPEED = 48, REST_RANGE = 3 * 256;
const JUMP = 4 * 256;
const GLUE = 8;

const Div = (a, b) => Math.trunc(a / b);

/** The task for a small Barrel of Doom, or null when `e` is not one. */
export function createBarrelOfDoomMini(e, slot, anims) {
  if (e.kind !== BARREL_OF_DOOM_MINI) return null;
  // its one frame, and with it its box, comes when it is made
  const o = { x: e.x, y: e.y, ...makeSprite('barrelMini') };
  animate(o, anims);
  // its speed and how far down from its place it is (qUnk3C, qUnk44), in 1/256 px
  let speed = 0, at = 0;
  return {
    run(ctx) {
      const p = ctx.player;
      if (at !== 0) speed += at < 0 ? PULL : -PULL;
      const y = e.y + (at >> 8);
      o.y = y;
      const fall = p.ysp * 256;
      if (p.onObject === o) {
        p.ysp = 0;
        p.y += speed / 256;
        if (p.attackPressed && p.heldDirs & DOWN) {
          // Amy's
        } else if (p.jumpPressed && p.heldDirs & DOWN) setOffsetY(p, BALL_SPRITE_OFFSET_Y);
        else if (p.jumpPressed) {
          p.ysp = ((speed >> 1) - JUMP) / 256;
          p.onObject = null;
        } else {
          p.y += GLUE; p.ysp = 1 / 256;
          if (!platformTop(o, e.x, y, o.boxes[0], p)) { p.onObject = null; p.y -= GLUE; }
          p.ysp = 0;
        }
      } else if (platformTop(o, e.x, y, o.boxes[0], p) & LANDED) speed += Div(fall * 6, 10);
      speed = Div(speed * 9900, 10000);
      if (speed > -REST_SPEED && speed < REST_SPEED && at > -REST_RANGE && at < REST_RANGE) speed = 0;
      at += speed;
      if (offDisplay(e.x, e.y, ctx.cam) && offCam(e.x, y, ctx.cam)) { slot.live = null; return false; }
      ctx.draw(o, e.x, y);
      return true;
    },
  };
}
