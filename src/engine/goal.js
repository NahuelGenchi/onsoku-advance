// The goal signpost (SAT-R decompilation, src/game/sa1/stage/interactables/stage_goal.c), kind 0, as it runs in
// single player. Only those with d1 set spawn; act 1 has one that shows (d0 set) and a column of hidden ones
// along the same line, so Sonic can't pass it above or below. The first one he passes, once his centre is right
// of it, ends the act: the clock and the rings stop, it plays song 135 and spins, and from then on it holds
// right for him, raises the camera 56 px a pixel a frame and keeps him to 4.5 px a frame. Any other goal he
// passes after that only spins. 31 frames on, a task waits for him to be on the ground at 2.25 px a frame or
// more and puts him into his act-clear run; from the 122nd frame on, once he is in it, the goal makes way for
// the results (results.js). Ice Mountain act 2 and Egg Rocket have rules of their own: in Ice Mountain act 2
// Sonic must also be lower than 80 px above the goal; in Egg Rocket his body box must take in the goal's point,
// it plays no sound (it isn't the signpost), nothing holds his controls or raises the camera, his own movement
// stops (MOVESTATE_IA_OVERRIDE) and the results come on the 122nd frame, whatever he is doing.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { startActClear } from './player.js';
import { SONG } from '../sound/songs.js';

export const STAGE_GOAL = 0;
const RUN_SPEED = 4.5;        // PLAYER_POST_GOAL_RUN_SPEED
const RESULTS_SPEED = 2.25;   // the least ground speed Task_ShowResults waits for
const SHIFT_Y = -56;          // how far the camera's target rises
const ICE_MOUNTAIN_2 = 7;     // LEVEL_INDEX(ZONE_4, ACT_2)
const EGG_ROCKET = 10;        // LEVEL_INDEX(ZONE_6, ACT_1)
const ICE_MOUNTAIN_ABOVE = 80; // DISPLAY_CENTER_Y: how far above the goal Sonic may be in Ice Mountain act 2
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
    const p = ctx.player, cam = ctx.world.camera, rocket = ctx.world.level === EGG_ROCKET;
    if (rocket) p.carried = true;
    else {
      p.ignoreInput = true; p.heldInput = HOLD_RIGHT;
      if (cam.shiftY > SHIFT_Y) cam.shiftY--;
      if (p.gsp > RUN_SPEED) p.gsp = RUN_SPEED;
      if (frames > 30 && !waiting) { waiting = true; ctx.add(showResults(p)); }
    }
    if (frames++ > 120 && (p.state === 'actClearRun' || rocket)) { ctx.world.stageResults(); return false; }
    return passed(ctx);
  }

  // Task_StageGoal: whether Sonic, right of the goal, ends the act here. The original tests his body box
  // whether or not it is set; here a cleared one never takes in the point
  function reached(ctx) {
    const p = ctx.player, px = Math.floor(p.x), py = Math.floor(p.y), level = ctx.world.level;
    if (px <= e.x) return false;
    if (level === ICE_MOUNTAIN_2) return py > e.y - ICE_MOUNTAIN_ABOVE;
    if (level !== EGG_ROCKET) return true;
    const b = p.boxes[0];
    return !!b && px + b[0] <= e.x && px + b[2] >= e.x && py + b[1] <= e.y && py + b[3] >= e.y;
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
      if (reached(ctx)) {
        startAnim(o, 'goalSpin');
        if (ctx.world.goalReached) { phase = 'passed'; return passed(ctx); }
        ctx.world.reachGoal();
        if (ctx.world.level !== EGG_ROCKET) ctx.world.playSound(SONG.GOAL);
        phase = 'ending';
        return end(ctx);
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      if (shows) ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
