// Neo Green Hill's wall poles (SAT-R decompilation, src/game/sa1/stage/interactables/red_flag_and_pole.c),
// kind 44, sticking out of a wall to its right, and kind 45, flipped, to its left. Whenever Sonic's body
// touches one's box, at any speed, on the ground or in the air, it catches him: he hangs from it for 14
// frames, bobbing down and swinging up, and is thrown straight up at 7.5 px a frame, keeping the X speed he
// came with. It takes him again once its swing animation is over.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { overlap } from './collide.js';
import { endAttack, standUp } from './player.js';
import { SONG } from '../sound/songs.js';

export const WALL_POLE_LEFT = 44, WALL_POLE_RIGHT = 45;
const SOX = 6;   // Sonic's spriteOffsetX
// how far the swing moves him on each frame it holds him: down for the first 7, then up
const SWING = [1, 1, 1, 1, 1, 1, 1, 1, 16, 7, 7, 7, 7, 7];
const LAUNCH = 7.5;

/** The task for a wall pole entity, or null when `e` is not one. */
export function createWallPole(e, slot, anims) {
  if (e.kind !== WALL_POLE_LEFT && e.kind !== WALL_POLE_RIGHT) return null;
  const dir = e.kind === WALL_POLE_RIGHT ? -1 : 1;   // the way it points out of its wall
  const o = makeSprite('wallPole', { flipX: dir < 0 });
  // waiting (Task_8077C5C), holding Sonic (Task_8077D1C) or swinging back once he's gone (Task_8077E9C)
  let phase = 'waiting', t = 0;

  // it tests the box its last animation frame set, before stepping the animation; none yet on its first frame
  function catches(p) {
    if (p.dead || !o.boxes[0] || !overlap(e.x, e.y, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) return false;
    // Player_TransitionCancelFlyingAndBoost; his speeds and whether he is in the air stay as they were
    endAttack(p); p.pushing = false;
    p.carried = true;
    p.x = e.x + 8 * dir; p.y = e.y + 16;
    p.facing = -dir;
    p.state = 'pole';
    return true;
  }

  function swing(p) {
    if (p.dead) { p.carried = false; return; }
    p.y += t > 6 ? -SWING[t] : SWING[t];
    if (++t <= 13) return;
    p.air = true;
    standUp(p);   // uncurled, his feet where they were
    p.state = 'springRise';
    p.ysp = -LAUNCH;
    p.carried = false;
    phase = 'swinging';
  }

  return {
    run(ctx) {
      const p = ctx.player;
      if (phase === 'waiting') {
        if (catches(p)) {
          ctx.world.playSound(SONG.POLE);
          startAnim(o, 'wallPoleSwing', true);
          phase = 'holding'; t = 0;
        }
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        animate(o, anims);
      } else {
        // leaving while it holds him would leave him held
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        if (phase === 'holding') {
          swing(p);
          animate(o, anims);
        } else if (animate(o, anims)) {
          // back to rest, its first frame showing from the next one
          startAnim(o, 'wallPole', true);
          phase = 'waiting';
        }
      }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
