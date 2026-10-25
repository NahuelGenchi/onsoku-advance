// Neo Green Hill's forced slide (SAT-R decompilation, src/game/sa1/stage/interactables/forced_slide.c), kind
// 46: a box, d2 by d3 tiles, down a water slide. On every frame Sonic's centre is in it and he is on the
// ground (not on an object), it takes his controls and sends him down it at 4 px a frame in his knocked-back
// state, a splash under him; with d0 set it sends him left, otherwise right. It only starts on him once the
// one-tile floor probe from his centre finds the ground within 3 px. In the air, or out of the box, it gives
// his controls back, with the jump and attack buttons he holds then not counting as presses, and leaving the
// box fades out the second sound effect player. In Angel Island (zone 5) the splash is mud, and the slide's
// own sound starts as it takes him. Its priority is 0x1000 plus d1, and once spawned it stays.

import { makeSprite, animate } from './objects.js';
import { endAttack, standUp } from './player.js';
import { tileFloor } from './terrain.js';
import { SONG } from '../sound/songs.js';

export const FORCED_SLIDE = 46;
const ZONE_5 = 4;   // zones count from 0
const SPEED = 4;
const SE2 = 2, FADE = 4;   // m4aMPlayFadeOut(&gMPlayInfo_SE2, 4)

/** The task for a forced slide entity, or null when `e` is not one; `zone` is the act's. */
export function createSlide(e, anims, zone) {
  if (e.kind !== FORCED_SLIDE) return null;
  const dir = e.d[0] ? -1 : 1, w = e.d[2] * 8, h = e.d[3] * 8;
  const splash = makeSprite('slideSplash', { flipX: dir < 0, order: 3 });
  let held = 0;   // 1 while it holds him

  // what the player reads once his controls are back: no fresh press of jump or attack
  const release = ctx => {
    ctx.player.ignoreInput = false;
    ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
  };

  return {
    priority: 0x1000 + ((e.d[1] << 24) >> 24),
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (p.dead) return true;
      if (x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h) {
        if ((held !== 0 || tileFloor(ctx.world.terrain, x, y, p.layer) <= 3) && !p.onObject) {
          if (!p.air) {
            if (held === 0 && zone === ZONE_5) ctx.world.playSound(SONG.MUD_SLIDE);
            held = 1;
            // Player_TransitionCancelFlyingAndBoost
            endAttack(p); p.pushing = false; p.airLock = false;
            p.ignoreInput = true; p.jumpPressed = false;
            ctx.input.jumpPressed = false; ctx.input.attackPressed = false; ctx.input.boostPressed = false;
            p.facing = dir;
            p.gsp = p.xsp = SPEED * dir;
            p.ysp = 0;
            p.state = 'hurt';
            standUp(p);
            animate(splash, anims);
            ctx.draw(splash, x, y);
          } else if (held !== 0 && --held === 0) release(ctx);
        }
      } else if (held === 1) {
        ctx.world.fadeOut(SE2, FADE);
        held = 0;
        release(ctx);
      }
      // it would leave once out of range, but only when no character is in its box, and in a one-player game
      // the partner's bit always counts as one that is: it never leaves
      return true;
    },
  };
}
