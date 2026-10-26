// Angel Island Zone's lifts (SAT-R decompilation, src/game/sa1/stage/interactables/crane_claw_and_lift.c,
// its Lift half), kind 88: a handle on a chain. Whenever Sonic's body touches the handle it catches him, at
// any speed, on the ground or in the air: he hangs from it, 3 px left of it facing right or 8 px right of it
// facing left, while it climbs 128 px in 64 frames, and stays up there until a jump press lets him go, thrown
// up at 4 px a frame. He keeps whether he was in the air: caught on the ground, his ground movement takes
// over again on that frame and wipes the throw, so he just drops. A second later (60 frames) the handle
// slides back down in 30 and can catch him again. Its data bytes aren't used.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { overlap } from './collide.js';
import { endAttack } from './player.js';
import { SONG } from '../sound/songs.js';

export const LIFT = 88;
const SOX = 6;   // Sonic's spriteOffsetX
const RISE = 64, HEIGHT = 128, WAIT = 60, DROP = 30, THROW = 4;
// how far above the handle the chain's links are drawn: 32 px apart, but 16 while it holds Sonic at the top
const LINKS = [16, 48, 80, 112], LINKS_TOP = [16, 32, 48, 64];

/** The task for a lift entity, or null when `e` is not one. */
export function createLift(e, slot, anims) {
  if (e.kind !== LIFT) return null;
  // each shows the first frame of its animation, stepped once as it is made
  const handle = makeSprite('liftHandle', { order: 15 }), chain = makeSprite('liftChain', { order: 17 });
  animate(handle, anims); animate(chain, anims);
  // waiting (Task_LiftMain), rising with Sonic (Task_Lift2), holding him at the top (Task_Lift3) or going back
  // down (Task_Lift4)
  let phase = 'waiting', t = 0, wait = 0;

  function catches(p) {
    if (p.dead || !overlap(e.x, e.y, handle.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) return false;
    p.carried = true;
    p.xsp = 0; p.gsp = 0; p.ysp = 0;
    endAttack(p); p.pushing = false;   // Player_TransitionCancelFlyingAndBoost
    p.state = 'lift';
    return true;
  }

  function show(ctx, up, links) {
    ctx.draw(handle, e.x, e.y - up);
    for (const dy of links) ctx.draw(chain, e.x, e.y - up - dy);
  }
  // it leaves once its spawn point is out of the display's range and the handle out of the camera's, even
  // while it holds Sonic, who would then hang there for good
  const gone = (ctx, up) => offDisplay(e.x, e.y, ctx.cam) && offCam(e.x, e.y - up, ctx.cam);

  return {
    run(ctx) {
      const p = ctx.player;
      if (phase === 'waiting') {
        if (catches(p)) {
          ctx.world.playSound(SONG.LIFT);
          phase = 'rising'; t = 0;
        }
        if (gone(ctx, 0)) { slot.live = null; return false; }
        show(ctx, 0, LINKS);
      } else if (phase === 'rising') {
        const up = HEIGHT - Math.trunc((RISE - t) * HEIGHT / RISE);
        if (!p.dead) {
          p.x = p.facing > 0 ? e.x - 3 : e.x + 8;
          p.y = e.y - up + 26;
        } else p.carried = false;
        if (++t > RISE) {
          t = 0;
          ctx.world.stopSound(SONG.LIFT);
          phase = 'holding';
        }
        if (gone(ctx, up)) { slot.live = null; return false; }
        show(ctx, up, LINKS);
      } else if (phase === 'holding') {
        if (gone(ctx, HEIGHT)) { slot.live = null; return false; }
        if (p.dead) {
          p.carried = false;
          t = 0; wait = WAIT; phase = 'dropping';
        } else if (p.jumpPressed) {
          p.carried = false; p.airLock = false;
          p.xsp = 0; p.gsp = 0; p.ysp = -THROW;
          endAttack(p); p.pushing = false;
          t = 0; wait = WAIT; phase = 'dropping';
          p.state = 'spin';
        }
        show(ctx, HEIGHT, LINKS_TOP);
      } else {
        const up = Math.trunc((DROP - t) * HEIGHT / DROP);
        if (wait > 0) wait--;
        else if (++t > DROP) { t = 0; phase = 'waiting'; }
        if (gone(ctx, up)) { slot.live = null; return false; }
        show(ctx, up, LINKS);
      }
      return true;
    },
  };
}
