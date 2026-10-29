// The waterfalls (SAT-R decompilation, src/game/sa1/stage/interactables/waterfall.c). A waterfall is an area,
// d2 × 8 px wide and d3 × 8 px tall, starting d1 × 8 px below its spawn point (d1 is signed), with a splash
// drawn at Sonic's feet while his centre is in it.
//
// Neo Green Hill's (Task_Waterfall) push him down 16/256 px a frame faster, unless Knuckles is climbing. On the
// ground the push does nothing, since the walk sets his speed from the ground speed.
//
// Angel Island's (zone 5, Task_WaterfallZone5) hold him on every frame he is in one and not moving up: they
// put him on his feet in the walk, out of the air (with no ground under him), stop him falling and sink him
// 0.6875 px a frame. Left adds 4/256 px a frame to his ground speed and right takes it away, the other way
// round from the d-pad; with neither held, a twentieth of it goes, rounded toward zero. A jump press instead
// throws him up at 2.4375 px a frame in the jump's animation, without curling him or putting him in the air.
// Knuckles gliding in stops dead, and an attack press in the air stops him too (his speeds to 0).
// The first frame one holds him plays SE_201 on the second sound effect player, which fades out once he is
// out of the area, or when the waterfall leaves. Its splash animates on every frame.
//
// Both kinds would halve his falling speed when they leave while he is in them, but the flag for it is
// never set.

import { makeSprite, animate, offCam } from './objects.js';
import { endAttack, KNUCKLES, climbing } from './player.js';
import { s8 } from './trig.js';
import { SONG } from '../sound/songs.js';

export const WATERFALL = 27;
const ANGEL_ISLAND = 4;
const SINK = 176 / 256, PUSH = 4 / 256, THROW = 624 / 256;
const LEFT = 1, RIGHT = 2;   // Sonic's held d-pad bits (player.js)
const SE2 = 2, FADE = 4;     // m4aMPlayFadeOut(&gMPlayInfo_SE2, 4)

/** The task for a waterfall entity, or null when `e` is not one. */
export function createWaterfall(e, slot, anims, ctx) {
  if (e.kind !== WATERFALL) return null;
  const splash = makeSprite('waterSplash', { order: 5, prio: 2 });
  const top = e.y + s8(e.d[1]) * 8, right = e.x + e.d[2] * 8, bottom = top + e.d[3] * 8;
  const inside = p => {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    return x >= e.x && x <= right && y >= top && y <= bottom;
  };
  if (ctx.world.zone === ANGEL_ISLAND) return angelIsland(slot, anims, splash, e, inside);
  return {
    run(ctx) {
      const p = ctx.player;
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      if (!p.dead && inside(p)) {
        if (!climbing(p)) p.ysp += 16 / 256;
        // the splash animates only while it is drawn
        animate(splash, anims);
        ctx.draw(splash, Math.floor(p.x), Math.floor(p.y) + 10);
      }
      return true;
    },
  };
}

function angelIsland(slot, anims, splash, e, inside) {
  let sounding = false;   // unk3D: SE_201 has started
  return {
    run(ctx) {
      const p = ctx.player;
      if (offCam(e.x, e.y, ctx.cam)) {
        if (sounding) ctx.world.fadeOut(SE2, FADE);
        slot.live = null;
        return false;
      }
      animate(splash, anims);
      if (p.dead) return true;
      if (inside(p)) {
        if (p.ysp >= 0) {
          if (!sounding) { sounding = true; ctx.world.playSound(SONG.WATERFALL); }
          // Player_TransitionCancelFlyingAndBoost
          endAttack(p); p.pushing = false; p.airLock = false;
          if (p.jumpPressed) {
            p.state = 'spin';
            p.ysp = -THROW;
          } else {
            if (p.character === KNUCKLES) {
              // a glide stops dead, and of his move state only the way he faces is left
              if (p.state === 'glide') {
                p.state = 'walk'; p.gsp = 0; p.xsp = 0;
                p.air = false; p.onObject = null; p.curled = false; p.jumped = false;
              }
              if (p.air && p.attackPressed) { p.gsp = 0; p.xsp = 0; }
            }
            p.air = false; p.curled = false;   // his hitbox keeps its height
            p.state = 'walk';
            p.y += SINK;
            if (p.ysp > 0) p.ysp = 0;
            if (p.held[0] & LEFT) p.gsp += PUSH;
            else if (p.held[0] & RIGHT) p.gsp -= PUSH;
            else p.gsp -= Math.trunc(Math.round(p.gsp * 256) / 20) / 256;
          }
        }
        ctx.draw(splash, Math.floor(p.x), Math.floor(p.y) + 10);
      } else if (sounding) {
        ctx.world.fadeOut(SE2, FADE);
        sounding = false;
      }
      return true;
    },
  };
}
