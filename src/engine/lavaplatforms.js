// Underwater lava platforms (SAT-R decompilation, src/game/sa1/stage/interactables/underwater_lava_platform.c;
// the tasks are at 0x08092469 and 0x080926A9 in the USA ROM): a thin platform resting on a solid pool of lava.
// Whenever the stage clock is a multiple of 102 while it rests, the lava spurts (song 182): the platform is
// thrown up at 5 px a frame, falls back 37/256 px a frame faster every frame, and bounces twice more at 2/5 of
// the speed it came back with, taking Sonic with it. Frames 7 to 53 of the spurt, the lava hurts him.
//
// Kept from the original: the spurt doesn't step its animation for its first 6 frames, and once it is back to
// the pool's animation, that runs at twice its speed until the platform stops bouncing. The bouncing can
// outlast the 102 frames, and the stage clock's next multiple of 102 then passes without a spurt.

import { makeSprite, startAnim, animate, offCam, offDisplay } from './objects.js';
import { platform, platformTop, overlap, LANDED } from './collide.js';
import { endAttack } from './player.js';
import { SONG } from '../sound/songs.js';

export const LAVA_PLATFORM = 98;

const SOX = 6;
const EVERY = 102;   // TIME(0, 1.7)

/** The task for an underwater lava platform entity, or null when `e` is not one. */
export function createLavaPlatform(e, slot, anims) {
  if (e.kind !== LAVA_PLATFORM) return null;
  // neither runs its animation before the task's first frame, so neither is solid on it
  const lava = { ...makeSprite('lava'), x: e.x, y: e.y }, top = { ...makeSprite('lavaPlatform', { order: 17 }) };
  let spurting = false, vy = 0, q = 0, n = 0, bounces = 0, riding = false;   // speed and offset in 1/256 px
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (spurting) return spurt(ctx);
      if (platformTop(top, e.x, e.y, top.boxes[0], p) & LANDED) { p.y = e.y - 27; p.air = false; }
      platform(lava, lava.boxes[0], p, ctx.world.terrain);
      if (offDisplay(e.x, e.y, cam) && offCam(e.x, e.y - 3, cam)) { slot.live = null; return false; }
      if (ctx.world.tick % EVERY === 0) {
        n = EVERY; riding = false; vy = -5 * 256; q = 0; bounces = 3;
        startAnim(lava, 'lavaSpurt', true);
        ctx.world.playSound(SONG.LAVA_SPURT);
        spurting = true;
      }
      animate(lava, anims);
      ctx.draw(lava, e.x, e.y - 3);
      animate(top, anims);
      ctx.draw(top, e.x, e.y);
      return true;
    },
  };

  // Task_80929A0
  function spurt(ctx) {
    const p = ctx.player;
    vy += 37; q += vy;
    const y = e.y + (q >> 8);
    if (riding) {
      if (p.dead || !overlap(e.x, y, top.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) riding = false;
      else p.y += vy / 256;
    } else if (platformTop(top, e.x, y, top.boxes[0], p)) {
      p.y = y - 27;
      riding = !p.air;
      if (p.ysp === 0 && p.state !== 'walk') { endAttack(p); p.pushing = false; p.state = 'walk'; }
    } else riding = false;
    if (--n === 48) {
      startAnim(lava, 'lava', true);
      animate(lava, anims);
    } else if (n >= 49 && n < 96) {
      if (!p.dead && p.boxes[0] && lava.boxes[1] && overlap(e.x, e.y, lava.boxes[1], Math.floor(p.x), Math.floor(p.y), p.boxes[0])) ctx.world.damage();
      animate(lava, anims);
    } else if (n < 48) {
      if (animate(lava, anims)) startAnim(lava, 'lava', true);
      animate(lava, anims);
    }
    if (q >= 0) {
      if (--bounces !== 0) { vy = -Math.trunc(vy * 2 / 5); riding = false; q = 0; }
      else { startAnim(lava, 'lava', true); spurting = false; }
    }
    ctx.draw(lava, e.x, e.y - 3);
    animate(top, anims);
    ctx.draw(top, e.x, y);
    return true;
  }
}
