// The water bridge of the first multiplayer stage (SAT-R decompilation, src/game/sa1/stage/interactables/
// water_bridge.c and water_bridge_splash.c, its task checked against the USA ROM's code, as the decompilation's
// C doesn't match it yet), kind 40: an arc of water across a box d2 × 8 px wide and d3 × 8 px tall, d0 and d1
// tiles (signed) from its spawn point. Where Sonic's feet are in the box and within 32 px under the arc's line,
// half a sine wave from the box's bottom up to its top, the water carries him along it: a quarter px a frame
// faster each frame up to 8, lifted along the arc's slope, in his knocked-back state as a ball's height, with
// his controls taken and a splash at his feet. Each of those frames it starts the bridge's sound unless it is
// still playing, as the move it makes clears the flag it checks. Out of the arc it gives his controls back,
// with the jump and attack buttons he holds then not counting as presses. Kind 43 is a splash drawn where it
// is spawned.

import { makeSprite, animate, offDisplay } from './objects.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';
import { BALL_SPRITE_OFFSET_Y } from './constants.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';

export const WATER_BRIDGE = 40, WATER_BRIDGE_SPLASH = 43;
const ARC = 32;            // WATER_BRIDGE_DIAMETER
const PUSH = 0x40, MAX = 0x800, LIFT = 42;
const s8 = v => (v << 24) >> 24;
const sin8 = t => SINE[t] >> 6, cos8 = t => SINE[t + 256] >> 6;
const clamp = v => Math.min(Math.max(v, -MAX), MAX);

/** The task for a water bridge or its splash, or null when `e` is neither. */
export function createWaterBridge(e, slot, anims) {
  if (e.kind === WATER_BRIDGE_SPLASH) return splash(e, slot, anims);
  if (e.kind !== WATER_BRIDGE) return null;
  const left = e.x + s8(e.d[0]) * 8, top = e.y + s8(e.d[1]) * 8, width = e.d[2] * 8, height = e.d[3] * 8;
  const right = left + width, bottom = top + height;
  const s = makeSprite('slideSplash', { order: 15, prio: 1 });

  // what the player reads once his controls are back: no fresh press of jump or attack
  const release = ctx => {
    ctx.player.ignoreInput = false;
    ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
  };

  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y) + p.offsetY;
      if (offDisplay(e.x, e.y, ctx.cam)) { slot.live = null; p.halfPipe = false; return false; }
      if (left <= x && x < right && top <= y && y <= bottom) {
        if (p.dead) return true;
        const theta = Math.min(Math.max(Math.trunc(((x - left) << 9) / width), 0), 511);
        const line = ((bottom << 8) - sin8(theta) * height) >> 8;
        if (y >= line && y <= line + ARC) {
          // MOVESTATE_8000, which Player_TransitionCancelFlyingAndBoost clears again just below
          if (!p.halfPipe) { ctx.world.playSoundOrChange(SONG.WATER_BRIDGE_SPLASH); p.halfPipe = true; }
          const speed = clamp(Math.round((p.air ? p.xsp : p.gsp) * 256) + PUSH);
          p.gsp = p.xsp = speed / 256;
          p.ysp = clamp((((-height * cos8(theta)) * speed) >> 16) - LIFT) / 256;
          // Player_TransitionCancelFlyingAndBoost
          endAttack(p); p.pushing = false; p.airLock = false;
          p.state = 'hurt';
          p.curled = false;
          setOffsetY(p, BALL_SPRITE_OFFSET_Y);
          p.ignoreInput = true; p.jumpPressed = false;
          ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
          // drawn at his feet less his half width, the offset it meant to take back being the other one
          animate(s, anims);
          ctx.draw(s, x, y - 6);
          return true;
        }
      }
      if (p.ignoreInput) release(ctx);
      p.halfPipe = false;
      return true;
    },
  };
}

function splash(e, slot, anims) {
  const s = makeSprite('waterBridgeSplash', { order: 15, prio: 1 });
  return {
    run(ctx) {
      if (offDisplay(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(s, anims);
      ctx.draw(s, e.x, e.y);
      return true;
    },
  };
}
