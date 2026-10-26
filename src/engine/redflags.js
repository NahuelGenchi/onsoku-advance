// Casino Paradise's red flags (SAT-R decompilation, src/game/sa1/stage/interactables/red_flag_and_pole.c), kind
// 42: a flag on a pole that Sonic swings round when he runs into it on the ground facing the way it points (to
// the right, or mirrored to the left when d1 is set) at more than 3 px a frame, or 5.25 px rolling. It puts him
// 15 px behind its pole, holds him there for 7 frames, carries him on 10 px and then 7.5 px a frame for 6
// frames, and lets him go running that way at 10.5 px a frame or more. It takes him again once its animation
// is over.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { overlap } from './collide.js';
import { endAttack } from './player.js';
import { SONG } from '../sound/songs.js';

export const RED_FLAG = 42;
const SOX = 6;   // Sonic's spriteOffsetX
const RUN = 3, ROLL = 5.25, THROW = 10.5;

/** The task for a red flag entity, or null when `e` is not one. */
export function createRedFlag(e, slot, anims) {
  if (e.kind !== RED_FLAG) return null;
  const dir = e.d[1] ? -1 : 1;   // the way it points
  const o = makeSprite('redFlag', { flipX: dir < 0 });
  animate(o, anims);
  // waiting (Task_RedFlag), holding Sonic (Task_8077760) or waving once he's gone (Task_8077918)
  let phase = 'waiting', t = 0, state = null;

  // sub_80780B4, and sub_8077FA4 mirrored: Sonic's body on its box, on the ground, fast enough its way
  function catches(p) {
    if (!o.boxes[0] || p.air || !overlap(e.x, e.y, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) return false;
    if (p.gsp * dir <= (p.curled ? ROLL : RUN) || p.facing !== dir) return false;
    // Player_TransitionCancelFlyingAndBoost
    endAttack(p); p.pushing = false;
    p.x = e.x - 15 * dir;
    p.carried = true;
    state = p.state; p.state = 'flagSwing';
    return true;
  }

  // its charState back, uncurled though his size stays a ball's if he was rolling, and at least the throw's speed
  function release(p) {
    p.state = state === 'brake' ? 'walk' : state;
    p.curled = false;
    if (p.gsp * dir < THROW) { p.gsp = THROW * dir; p.xsp = THROW * dir; }
    p.carried = false;
  }

  return {
    run(ctx) {
      const p = ctx.player;
      if (phase === 'waiting') {
        if (!p.dead && catches(p)) {
          ctx.world.playSound(SONG.POLE);
          startAnim(o, 'redFlagTug', true);
          phase = 'holding'; t = 0;
        }
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        animate(o, anims);
      } else {
        // leaving while it holds him would leave him held
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        if (phase === 'holding') {
          if (p.dead) p.carried = false;
          else {
            if (t > 6) p.x += (t === 7 ? 10 : 7.5) * dir;
            if (++t > 13) { release(p); phase = 'waving'; }
          }
          animate(o, anims);
        } else if (animate(o, anims) || o.anim.done) {
          // an animation that has ended reports it again; back to rest, its first frame showing from the next one
          startAnim(o, 'redFlag', true);
          phase = 'waiting';
        }
      }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
