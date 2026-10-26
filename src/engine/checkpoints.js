// Neo Green Hill's checkpoints (SAT-R decompilation, src/game/sa1/stage/interactables/checkpoint.c), kind 7.
// d0 numbers them along the act. When Sonic's centre enters one's box it spins, with song 169 from its
// script, and the act starts over from it after a death; one whose number is not above the last passed
// spawns already passed. It doesn't count while an object holds Sonic (MOVESTATE_IA_OVERRIDE), as a wall
// pole does.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { createEggRocketCheckpoint } from './eggrocket.js';
import { SONG } from '../sound/songs.js';

export const CHECKPOINT = 7;

/** The task for a checkpoint entity, or null when `e` is not one. */
export function createCheckpoint(e, slot, anims, ctx) {
  if (e.kind !== CHECKPOINT) return null;
  // Egg Rocket's have no post: passing them is the rocket's launch and its stage separations
  const rocket = createEggRocketCheckpoint(e, slot, ctx);
  if (rocket) return rocket;
  const index = (e.d[0] << 24) >> 24;
  // waiting (Task_CheckpointMain), spinning (Task_Checkpoint1) or passed (Task_Checkpoint2)
  let phase = index <= ctx.world.checkpointIndex ? 'passed' : 'waiting';
  const o = makeSprite(phase === 'passed' ? 'checkpointPassed' : 'checkpoint');
  animate(o, anims);

  function spin(ctx) {
    if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
    if (o.anim.i < 0) ctx.world.playSound(SONG.CHECKPOINT);
    if (animate(o, anims)) { phase = 'passed'; startAnim(o, 'checkpointPassed'); }
    ctx.draw(o, e.x, e.y);
    return true;
  }

  return {
    run(ctx) {
      if (phase === 'spinning') return spin(ctx);
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y), [l, t, r, b] = o.boxes[0] ?? [];
      if (phase === 'waiting' && !p.carried && x >= e.x + l && x <= e.x + r && y >= e.y + t && y <= e.y + b) {
        // it records where Sonic will start, his feet at its base, and the time, then runs its spinning
        // task at once and goes on with the rest of this one, so the spin's first frame shows for one frame
        ctx.world.passCheckpoint(index, e.x, e.y - p.offsetY);
        phase = 'spinning';
        startAnim(o, 'checkpointSpin');
        if (!spin(ctx)) return false;
        animate(o, anims);
        return true;
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
