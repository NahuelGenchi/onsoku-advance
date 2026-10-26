// Neo Green Hill's water bridge (SAT-R decompilation, src/game/sa1/stage/interactables/water_bridge.c, ported
// from its assembly, asm/non_matching/game/sa1/stage/interactables/water_bridge__Task_WaterBridge.inc), kind
// 40, and the splashes along it, kind 43 (water_bridge_splash.c). The bridge is an arc of water across a box,
// d0 and d1 tiles (signed) from its spawn point to its top left and d2 by d3 tiles in size: half a sine, from
// the bottom corners up to the top in the middle. On every frame Sonic's feet are in the box and within 32 px
// below the arc, it carries him along it: his speed goes up by 0.25 px a frame to at most 8 either way, and his
// rise follows the arc's slope, less 42/256 px a frame. It holds his controls and puts him in his knocked-back
// state, uncurled but as short as a ball, with a splash at his feet; the first frame it does, it plays the
// splash's sound and sets his MOVESTATE_8000, the half-pipe's flag. On every other frame it gives his controls
// back, with the jump and attack buttons he holds then not counting as presses, and clears that flag. The
// splash is drawn 6 px above his feet: the original takes away his spriteOffsetX where it means his
// spriteOffsetY (9), so it shows 3 px lower than where it was meant to.

import { makeSprite, animate, offDisplay } from './objects.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';
import { BALL_SPRITE_OFFSET_Y } from './constants.js';
import { SINE, s8 } from './trig.js';
import { SONG } from '../sound/songs.js';

export const WATER_BRIDGE = 40, WATER_BRIDGE_SPLASH = 43;
const ARC = 32;                        // WATER_BRIDGE_DIAMETER: how far below the arc it still holds him
const SOX = 6;                         // his spriteOffsetX
const MAX = 0x800, PUSH = 0x40, FALL = 42;   // in 1/256 px a frame
const clamp = v => Math.max(-MAX, Math.min(MAX, v));

/** The task for a water bridge entity, or null when `e` is not one. */
export function createWaterBridge(e, slot, anims) {
  if (e.kind !== WATER_BRIDGE) return null;
  const w = e.d[2] * 8, h = e.d[3] * 8;
  const left = e.x + s8(e.d[0]) * 8, top = e.y + s8(e.d[1]) * 8, right = left + w, bottom = top + h;
  const splash = makeSprite('slideSplash', { order: 15, prio: 1 });

  // his controls back, with no fresh press of jump or attack
  const release = ctx => {
    ctx.player.ignoreInput = false;
    ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
  };

  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), feet = Math.floor(p.y) + p.offsetY;
      if (offDisplay(e.x, e.y, ctx.cam)) { p.halfPipe = false; slot.live = null; return false; }
      if (x >= left && x < right && feet >= top && feet <= bottom) {
        if (p.dead) return true;
        // where the arc is above his centre's column: half a turn of the sine table across the box
        const theta = Math.min(0x1FF, Math.max(0, Math.trunc(((x - left) << 9) / w)));
        const y = ((bottom << 8) - (SINE[theta] >> 6) * h) >> 8;
        if (feet >= y && feet <= y + ARC) {
          const cos = SINE[theta + 256] >> 6;
          if (!p.halfPipe) { ctx.world.playSoundOrChange(SONG.WATER_BRIDGE_SPLASH); p.halfPipe = true; }
          const v = clamp(Math.round((p.air ? p.xsp : p.gsp) * 256) + PUSH);
          p.gsp = p.xsp = v / 256;
          p.ysp = clamp(((-h * cos * v) >> 16) - FALL) / 256;
          // Player_TransitionCancelFlyingAndBoost
          endAttack(p); p.pushing = false; p.airLock = false;
          p.state = 'hurt';
          p.curled = false; setOffsetY(p, BALL_SPRITE_OFFSET_Y);
          p.ignoreInput = true; p.heldInput = null; p.jumpPressed = false;
          ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
          animate(splash, anims);
          ctx.draw(splash, x, feet - SOX);
          return true;
        }
      }
      if (p.ignoreInput) release(ctx);
      p.halfPipe = false;
      return true;
    },
  };
}

/** The task for a splash along the water bridge, or null when `e` is not one: it only plays its animation. */
export function createBridgeSplash(e, slot, anims) {
  if (e.kind !== WATER_BRIDGE_SPLASH) return null;
  const o = makeSprite('bridgeSplash', { order: 15, prio: 1 });
  return {
    run(ctx) {
      if (offDisplay(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
