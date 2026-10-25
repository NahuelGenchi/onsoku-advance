// Angel Island Zone's bowls (SAT-R decompilation, src/game/sa1/stage/interactables/bowl.c), kind 62: a big
// bowl in a shaft that catches Sonic and sinks with him, 108 px down. It takes him when his body touches its
// box, which sits 5 px below it and 10 px off toward the side away from him. Inside, he swings from side to
// side as a ball, 32 px either way, starting at the side he came in on; the bowl sinks faster and faster,
// from a quarter of his speed across. At the bottom the swing closes in while he sinks another 11 px, and 65
// frames later he drops out of its middle with the speed the bowl had, curled up and unable to steer until
// the insta-shield. The bowl then stays down. Its data bytes aren't used.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { overlap } from './collide.js';
import { endAttack } from './player.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';

export const BOWL = 62;
const SOX = 6;   // Sonic's spriteOffsetX
const WIDTH = 96;
const BOTTOM = 885000;   // how far it sinks, ×8192 per px
// frames from his capture to the second and third sounds
const SOUND_2 = 56, SOUND_3 = 112, COUNT_MAX = 240;

/** The task for a bowl entity, or null when `e` is not one. */
export function createBowl(e, slot, anims) {
  if (e.kind !== BOWL) return null;
  const o = makeSprite('bowl', { order: 5 });
  animate(o, anims);
  // waiting (Task_Bowl), sinking with Sonic (Task_BowlRotating) or down (Task_Bowl3)
  let phase = 'waiting';
  // the bowl's speed and how far it has sunk (unk40, unk48), where his swing started (unk3C), the frames
  // since it reached the bottom (unk50) and since it caught him (unk44)
  let speed = 0, depth = 0, start = 0, settle = 0, count = 0;

  function catches(p) {
    if (p.dead) return false;
    const px = Math.floor(p.x), side = px > e.x ? 10 : -10;
    if (!overlap(e.x - side, e.y + 5, o.boxes[0], px, Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) return false;
    speed = (Math.abs(Math.round(p.xsp * 256)) << 2) & 0xFFFF;
    // his place across it, as a swing angle: the left edge is -32 px, the middle 0
    start = (0x300 + Math.abs(Math.trunc(((px - e.x + WIDTH / 2) << 9) / WIDTH))) & 1023;
    depth = 0; settle = 0; count = 0;
    p.jumpPressed = false;
    endAttack(p); p.pushing = false;   // Player_TransitionCancelFlyingAndBoost
    p.state = 'spin';
    p.carried = true;
    return true;
  }

  function sounds(p, world) {
    if (++count > COUNT_MAX) count = COUNT_MAX;
    if (count === SOUND_2 && !p.dead) world.playSound(SONG.BOWL_2);
    else if (count === SOUND_3 && !p.dead) world.playSound(SONG.BOWL_3);
  }

  function sink(p, ctx) {
    const down = depth >> 13;
    const theta = ((depth >> 8) + start + ((settle & 0xF) << 6)) & 1023;
    if (!p.dead) {
      p.x = e.x + Math.trunc(SINE[theta] * 25 / (settle * 4 + 50)) / 256;
      p.y = e.y - 17 + (depth >> 5) / 256;
    }
    // at the bottom it sets the speed he will drop with; until then it speeds up
    if (depth >= BOTTOM) {
      if (!p.dead) p.ysp = ((speed >> 2) - 0x7D0) * 2 / 256;
    } else speed += 64;
    if (speed > 0x8000) speed = 0x8000;
    o.anim.speed = Math.min(16, Math.trunc(speed * 35 / 0xA000));
    depth += speed;
    // it leaves even while it holds him, who would then stay held
    if (offDisplay(e.x, e.y, ctx.cam) && offCam(e.x, e.y + down, ctx.cam)) return false;
    if (depth >= BOTTOM) {
      depth = BOTTOM;
      if (!p.dead) p.y += (settle < 16 ? settle * 180 : 2880) / 256;
      if (++settle > 64) {
        if (!p.dead) {
          p.carried = false;
          p.curled = true; p.airLock = true; p.air = true;   // his height stays as it was
          p.xsp = 0; p.gsp = 0;
          p.x = e.x;
        }
        phase = 'down';
      }
    }
    sounds(p, ctx.world);
    animate(o, anims);
    ctx.draw(o, e.x, e.y + down);
    return true;
  }

  return {
    run(ctx) {
      const p = ctx.player;
      if (phase === 'waiting') {
        if (offDisplay(e.x, e.y, ctx.cam) && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        if (catches(p)) {
          ctx.world.playSound(SONG.BOWL);
          phase = 'sinking';
        }
        ctx.draw(o, e.x, e.y);
      } else if (phase === 'sinking') {
        if (!sink(p, ctx)) { slot.live = null; return false; }
      } else {
        const down = BOTTOM >> 13;
        if (offDisplay(e.x, e.y, ctx.cam) && offCam(e.x, e.y + down, ctx.cam)) { slot.live = null; return false; }
        sounds(p, ctx.world);
        ctx.draw(o, e.x, e.y + down);
      }
      return true;
    },
  };
}
