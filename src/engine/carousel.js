// Casino Paradise's carousels (SAT-R decompilation, src/game/sa1/stage/interactables/carousel.c), kind 74: a
// round top on a pole that Sonic can stand on. Within 8 px of its pole, from 48 px above to 12 px below its
// point, it takes him: he holds on, his speed set to 7.5 the way he was going, while it spins faster each frame
// from as fast as he came and sinks 481 px down its shaft with him. At the bottom it lets him go after 300
// frames, or as soon as left or right is held, curled up and flying off at what its spin has reached, the way
// he holds or else the way he came. It stays at the bottom until it is out of range. While Knuckles climbs it
// does nothing to him.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { platformTop } from './collide.js';
import { endAttack, climbing } from './player.js';
import { setOffsetY } from './sensors.js';
import { SPRITE_OFFSET_Y } from './constants.js';
import { SONG } from '../sound/songs.js';

export const CAROUSEL = 74;
const BOTTOM = 0x3C2A58;   // how far it sinks, 1/8192 px (481 px)
const LEFT = 1, RIGHT = 2;  // Sonic's held d-pad bits (player.js)

/** The task for a carousel entity, or null when `e` is not one. */
export function createCarousel(e, slot, anims) {
  if (e.kind !== CAROUSEL) return null;
  const top = makeSprite('carousel'), pole = makeSprite('carouselPole');
  animate(top, anims); animate(pole, anims);
  // waiting (Task_CarouselIdle), turning with Sonic (Task_RidingCarousel) or at the bottom (Task_ExitCarousel)
  let phase = 'waiting';
  let speed = 0, depth = 0, t = 0, held = 0, right = false;   // unk6E, unk70, unk74, unk76 and unk78
  let riding = false;                                         // unk79

  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (phase === 'waiting') {
        if (offDisplay(e.x, e.y, cam) && offCam(e.x, e.y, cam)) { slot.live = null; return false; }
        if (!p.dead && !climbing(p)) {
          platformTop(top, e.x, e.y, top.boxes[0], p);
          const px = Math.floor(p.x), py = Math.floor(p.y);
          if (px >= e.x - 8 && px <= e.x + 8 && py >= e.y - 48 && py <= e.y + 12) {
            riding = true;
            speed = (Math.abs(Math.round(p.xsp * 256)) << 2) & 0xFFFF;
            depth = 0; held = 0; t = 0;
            p.xsp = 0;
            right = p.gsp > 0;
            p.gsp = right ? 7.5 : -7.5;
            // Player_TransitionCancelFlyingAndBoost
            endAttack(p); p.pushing = false;
            p.state = 'carouselRide'; p.carried = true;
            ctx.world.playSound(SONG.CAROUSEL_A);
            phase = 'riding';
          }
        }
        ctx.draw(top, e.x, e.y);
        ctx.draw(pole, e.x, e.y);
        return true;
      }

      if (phase === 'bottom') {
        const y = e.y + (depth >> 13);
        if (!p.dead) platformTop(top, e.x, y, top.boxes[0], p);
        if (offDisplay(e.x, e.y, cam) && offCam(e.x, y, cam)) { slot.live = null; return false; }
        ctx.draw(top, e.x, y);
        ctx.draw(pole, e.x, y);
        return true;
      }

      const y = e.y + (depth >> 13) + 2;
      if (!p.dead && riding) { p.x = e.x; p.y = e.y + (depth >> 13); }
      if (depth >= BOTTOM) {
        // what it lets him go at
        if (!p.dead && riding) p.xsp = p.gsp = Math.trunc(((speed >> 2) - 0x7D0) * 2 / 3) / 256;
      } else speed += 0x40;
      if (speed > 0x8000) speed = 0x8000;
      top.anim.speed = Math.min(Math.trunc(speed * 35 / 0xA000), 16);
      depth += speed;
      if (offDisplay(e.x, e.y, cam) && offCam(e.x, y, cam)) { slot.live = null; return false; }

      if (!p.dead && riding) {
        if (depth >= BOTTOM) {
          depth = BOTTOM;
          held++;
          // his controls as the player task last read them, on the frame before
          const pad = p.held[0];
          if (held >= 300 || pad & (LEFT | RIGHT)) {
            held = 300;
            // off the way he holds, or else the way he came
            if (pad & LEFT ? p.gsp > 0 : pad & RIGHT ? p.gsp < 0 : !right) p.gsp = -p.gsp;
            p.xsp = p.gsp;
            riding = false;
            endAttack(p); p.pushing = false;
            p.carried = false; p.onObject = null;
            p.curled = true; p.airLock = true; p.air = true;
            p.state = 'walk';
            setOffsetY(p, SPRITE_OFFSET_Y);   // PLAYERFN_CHANGE_SHIFT_OFFSETS(6, 14)
            p.ysp = 0;
            p.x = e.x;
            p.order = 16;   // in front of objects again, after the ride's animation put him behind its pole
            phase = 'bottom';
          }
        }
      } else if (p.dead) {
        if (depth > BOTTOM) depth = BOTTOM;
        p.carried = false;
        if (++held > 300) phase = 'bottom';
      }

      t++;
      if (speed < 0x3200) { if (speed !== 0 && t % 25 === 0) ctx.world.playSound(SONG.CAROUSEL_A); }
      else if (speed < 0x4B00) { if (t % 16 === 0) ctx.world.playSound(SONG.CAROUSEL_B); }
      else if (t % 8 === 0) ctx.world.playSound(SONG.CAROUSEL_C);

      animate(top, anims);
      ctx.draw(top, e.x, y);
      ctx.draw(pole, e.x, y + 2);
      return true;
    },
  };
}
