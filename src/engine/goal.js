// The goal signpost (SAT-R decompilation, src/game/sa1/stage/interactables/stage_goal.c), kind 0, as it runs in
// single player. Only those with d1 set spawn; act 1 has one that shows (d0 set) and a column of hidden ones
// along the same line, so Sonic can't pass it above or below. The first one he passes, once his centre is right
// of it, ends the act: the clock and the rings stop, it plays song 135 and spins, and from then on it holds
// right for him, raises the camera 56 px a pixel a frame and keeps him to 4.5 px a frame. Any other goal he
// passes after that only spins. 31 frames on, a task waits for him to be on the ground at 2.25 px a frame or
// more and puts him into his act-clear run; from the 122nd frame on, once he is in it, the goal makes way for
// the results (results.js).

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { startActClear } from './player.js';
import { SONG } from '../sound/songs.js';

export const STAGE_GOAL = 0;
const RUN_SPEED = 4.5;        // PLAYER_POST_GOAL_RUN_SPEED
const RESULTS_SPEED = 2.25;   // the least ground speed Task_ShowResults waits for
const SHIFT_Y = -56;          // how far the camera's target rises
const HOLD_RIGHT = { left: false, right: true, up: false, down: false, jump: false, attack: false, boost: false,
  jumpPressed: false, attackPressed: false, boostPressed: false };

// Task_ShowResults
function showResults(player) {
  return {
    run() {
      if (player.air || player.gsp < RESULTS_SPEED) return true;
      startActClear(player);
      return false;
    },
  };
}

/** The task for a goal entity, or null when `e` is not one or doesn't spawn. */
export function createGoal(e, slot, anims) {
  if (e.kind !== STAGE_GOAL) return null;
  if (e.d[1] === 0) return null;
  const o = makeSprite('goal');
  animate(o, anims);
  const shows = e.d[0] !== 0;
  let phase = 'waiting';   // Task_StageGoal; then 'ending' (Task_StageGoal2) or 'passed' (Task_StageGoal3)
  let frames = 0, waiting = false;   // unk3C and unk3E

  // Task_StageGoal2
  function end(ctx) {
    const p = ctx.player, cam = ctx.world.camera;
    p.ignoreInput = true; p.heldInput = HOLD_RIGHT;
    if (cam.shiftY > SHIFT_Y) cam.shiftY--;
    if (p.gsp > RUN_SPEED) p.gsp = RUN_SPEED;
    if (frames > 30 && !waiting) { waiting = true; ctx.add(showResults(p)); }
    if (frames++ > 120 && p.state === 'actClearRun') { ctx.world.stageResults(); return false; }
    return passed(ctx);
  }

  // Task_StageGoal3, and the end of Task_StageGoal2: the hidden ones draw nothing
  function passed(ctx) {
    if (!shows) return true;
    animate(o, anims);
    ctx.draw(o, e.x, e.y);
    return true;
  }

  return {
    run(ctx) {
      if (phase === 'ending') return end(ctx);
      if (phase === 'passed') return passed(ctx);
      if (Math.floor(ctx.player.x) > e.x) {
        startAnim(o, 'goalSpin');
        if (ctx.world.goalReached) { phase = 'passed'; return passed(ctx); }
        ctx.world.reachGoal();
        ctx.world.playSound(SONG.GOAL);
        phase = 'ending';
        return end(ctx);
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      if (shows) ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
