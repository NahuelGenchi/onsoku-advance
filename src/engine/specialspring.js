// The special spring (SAT-R decompilation, src/game/sa1/stage/interactables/special_spring.c), kind 102: the
// spring that sends Sonic up out of the act into the special stage. Its d bytes aren't read. Landing on it
// throws him up like a spring; unless the special springs are off, it then holds him and the camera while he
// rises out of the screen, and the act stops for the special stage. Coming back from one turns them off
// (player.plainSprings, the original's gPlayer.unk99[1]) until the act starts over. They are plain springs too
// when the game has no special stage to go to (world.specialStages).

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { platform, LANDED } from './collide.js';
import { land, standUp } from './player.js';
import { SONG } from '../sound/songs.js';

export const SPECIAL_SPRING = 102;
const LAUNCH_SPEED = 7.5;   // the throw, and how fast he rises out of the screen (Q(7.5))
const LEAVE_ABOVE = 128;    // how far above the top of the screen his centre is when the act ends

const plain = (p, world) => p.plainSprings || !world.specialStages;

/**
 * The task for a special spring entity, or null when `e` is not one. Animation 572 in OAM order 18 and BG
 * priority 2: variant 1 waits (frame 0, with the box (−15, −32, 15, 1)) and variant 0 launches (five frames, 12
 * in all, then it ends); the box stays through the launch. It waits in Task_SpecialSpringMain (`0x08092FC5` in
 * the USA ROM) and launches in Task_TransitionSpStage (`0x080931FD`), both at priority 0x2000.
 */
export function createSpecialSpring(e, slot, anims) {
  if (e.kind !== SPECIAL_SPRING) return null;
  const o = { x: e.x, y: e.y, ...makeSprite('specialSpring') };
  animate(o, anims);
  let launching = false;
  let held = null;   // the camera when Sonic landed (camX, camY)

  // Task_SpecialSpringMain: Sonic, if alive, landing on its top (Coll_Player_Platform's COLL_FLAG_8) is thrown
  // up at 7.5 px a frame in the spring's rising state (character state 21), uncurled, with the spring's song.
  // It doesn't start his animation over as the other springs do. With the special springs on, it also holds
  // him (MOVESTATE_IA_OVERRIDE) and stops the course clock (STAGE_FLAG__ACT_START). The launch's first frame
  // shows on the same frame. (Amy's hammer, which also launches her 1.5 times as fast, and the partner aren't
  // built.)
  function wait(ctx) {
    const p = ctx.player;
    if (!p.dead && platform(o, o.boxes[0], p, ctx.world.terrain) & LANDED) {
      land(p);
      p.onObject = null; p.air = true;
      p.ysp = -LAUNCH_SPEED;
      p.state = 'springRise';
      held = { x: ctx.cam.x, y: ctx.cam.y };
      if (!plain(p, ctx.world)) { p.carried = true; ctx.world.stopClock(); }
      startAnim(o, 'specialSpringLaunch', true);
      standUp(p);
      ctx.world.playSound(SONG.SPRING);
      launching = true;
    }
    if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
    animate(o, anims);
    ctx.draw(o, e.x, e.y);
    return true;
  }

  // Task_TransitionSpStage. Sonic isn't tested while it runs. With the special springs off it plays the launch
  // and goes back to waiting as it ends, its first frame showing on the same frame. With them on it puts the
  // camera back where it was when he landed, after the camera's task has moved it and drawn the layers there,
  // and moves him up 7.5 px a frame, until his centre is more than 128 px above the top of the screen: then
  // every task ends and the special stage starts (CreateSpecialStageIntro), the spring being where he comes
  // back to (the original makes it his checkpoint, checkPointX and Y, and keeps the one he had in
  // gSpecialStageReturnX and Y). The spring is still drawn where the moved camera put it, as it was placed
  // before, and what is drawn after it this frame where the camera is held. The launch shows its last frame
  // once it ends.
  function launch(ctx) {
    const p = ctx.player;
    if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
    if (plain(p, ctx.world)) {
      if (animate(o, anims)) { launching = false; startAnim(o, 'specialSpring', true); animate(o, anims); }
      ctx.draw(o, e.x, e.y);
      return true;
    }
    const dx = ctx.cam.x - held.x, dy = ctx.cam.y - held.y;
    ctx.world.holdCamera(held.x, held.y);
    p.y -= LAUNCH_SPEED;
    if (Math.floor(p.y) - held.y < -LEAVE_ABOVE) { ctx.world.specialStage(e.x, e.y); return false; }
    animate(o, anims);
    ctx.draw(o, e.x - dx, e.y - dy);
    return true;
  }

  return { run: ctx => (launching ? launch(ctx) : wait(ctx)) };
}
