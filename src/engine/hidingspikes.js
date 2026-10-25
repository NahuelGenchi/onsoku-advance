// The spikes that hide in Egg Rocket's ceilings (SAT-R decompilation, src/game/sa1/stage/interactables/spikes.c,
// Task_Spikes_HidingDown and sub_8021208), kind 6. They follow the stage clock round 128 frames: hidden for 60,
// sliding down for 4, out for 60, sliding back for 4. Coming out onto Sonic puts him under them and hurts him;
// while out they are solid and hurt from below. Hidden or moving, they let go of him if he stood on them.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { platform, overlap, FROM_BELOW, PUSHING } from './collide.js';
import { SONG } from '../sound/songs.js';

export const SPIKES_HIDING_DOWN = 6;
const SOX = 6;   // Sonic's spriteOffsetX
// the animation's variants: hiding, half out, out
const LOOKS = ['spikesHiding', 'spikesHalf', 'spikesUp'];

/** The task for a hiding-down spikes entity, or null when `e` is not one. */
export function createHidingSpikes(e, slot, anims) {
  if (e.kind !== SPIKES_HIDING_DOWN) return null;
  const o = { x: e.x, y: e.y, ...makeSprite(LOOKS[2], { flipY: true, order: 17 }) };
  let variant = -1, flags = 0;
  const show = v => { variant = v; startAnim(o, LOOKS[v]); animate(o, anims); };
  // not solid this frame: off them if he stood on them, and no longer pushing them
  function letGo(p) {
    if (p.onObject === o) { p.onObject = null; p.air = true; }
    if (flags & PUSHING) { p.pushing = false; flags = 0; }
  }
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      const p = ctx.player, world = ctx.world, t = world.tick % 128;
      if (t < 60) { letGo(p); return true; }
      if (t < 62) { letGo(p); show(0); }
      else if (t < 64) { letGo(p); show(1); }
      else if (t < 124) {
        if (variant !== 2) {
          show(2);
          const hb = o.boxes[0];
          if (hb && !p.dead && overlap(e.x, e.y, hb, Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) {
            p.y = e.y + hb[3] + p.offsetY - 1;
            if (world.damage()) world.playSound(SONG.SPIKES);
          }
        } else {
          flags = platform(o, o.boxes[0], p, world.terrain);
          if ((flags & FROM_BELOW) && world.damage()) world.playSound(SONG.SPIKES);
        }
      } else if (t < 126) { letGo(p); show(1); }
      else { letGo(p); show(0); }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
