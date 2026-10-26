// Casino Paradise's bowls (SAT-R decompilation, src/game/sa1/stage/interactables/bowl.c), kind 62: a funnel
// that catches Sonic when his body touches its box (moved 10 px toward him and 5 down), whirls him round its
// middle, 32 px out, starting from where he came in and as fast as he came, faster each frame, while it sinks
// with him 108 px into the ground. At the bottom it spins him 64 times more on a narrowing circle, then drops
// him out curled up, straight down. It stays sunk until it is out of range and back.

import { makeSprite, animate, offCam } from './objects.js';
import { overlap } from './collide.js';
import { endAttack } from './player.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';

export const BOWL = 62;
const SOX = 6;           // Sonic's spriteOffsetX
const WIDTH = 96;        // SA1_ANIM_BOWL_3_WIDTH
const BOTTOM = 885000;   // how deep it sinks, 1/8192 px (108 px)

/** The task for a bowl entity, or null when `e` is not one. */
export function createBowl(e, slot, anims) {
  if (e.kind !== BOWL) return null;
  const o = makeSprite('bowl', { order: 5 });
  animate(o, anims);   // its first frame, kept until it starts spinning
  // waiting (Task_Bowl), spinning with Sonic (Task_BowlRotating) or sunk (Task_Bowl3)
  let phase = 'waiting';
  let speed = 0, angle = 0, depth = 0, turns = 0, t = 0;   // unk40, unk3C, unk48, unk50 and unk44

  // Coll_Player_Entity_Intersection with its box moved 10 px toward him
  const touches = (p, y) => o.boxes[0] && overlap(e.x - (Math.floor(p.x) > e.x ? 10 : -10), y, o.boxes[0],
    Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY]);

  function sounds(ctx) {
    if (++t > 240) t = 240;
    if (ctx.player.dead) return;
    if (t === 56) ctx.world.playSound(SONG.BOWL_2);
    else if (t === 112) ctx.world.playSound(SONG.BOWL_3);
  }

  return {
    run(ctx) {
      const p = ctx.player;
      if (phase === 'waiting') {
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        if (!p.dead && touches(p, e.y + 5)) {
          speed = (Math.abs(Math.round(p.xsp * 256)) << 2) & 0xFFFF;
          // where round it he starts: a quarter turn back, plus how far across it he is
          const across = Math.trunc(((Math.floor(p.x) - e.x + WIDTH / 2) << 9) / WIDTH);
          angle = (across < 0 ? 0x300 - across : 0x300 + across) & 0x3FF;
          depth = 0; turns = 0; t = 0;
          // Player_TransitionCancelFlyingAndBoost
          endAttack(p); p.pushing = false;
          p.state = 'spin'; p.carried = true;
          ctx.world.playSound(SONG.BOWL);
          phase = 'spinning';
        }
        ctx.draw(o, e.x, e.y);
        return true;
      }

      if (phase === 'sunk') {
        if (offCam(e.x, e.y, ctx.cam) && offCam(e.x, e.y + 108, ctx.cam)) { slot.live = null; return false; }
        sounds(ctx);
        ctx.draw(o, e.x, e.y + 108);
        return true;
      }

      const y = e.y + (depth >>> 13);
      const theta = ((depth >>> 8) + angle + ((turns & 0xF) << 6)) & 0x3FF;
      if (!p.dead) {
        p.x = e.x + Math.trunc(SINE[theta] * 25 / (turns * 4 + 50)) / 256;
        p.y = e.y - 17 + (depth >>> 5) / 256;
      }
      if (depth >= BOTTOM) { if (!p.dead) p.ysp = ((speed >> 2) - 0x7D0) * 2 / 256; }
      else speed = (speed + 64) & 0xFFFF;
      if (speed > 0x8000) speed = 0x8000;
      o.anim.speed = Math.min(Math.trunc(speed * 35 / 0xA000), 16);
      depth += speed;
      if (offCam(e.x, e.y, ctx.cam) && offCam(e.x, y, ctx.cam)) { slot.live = null; return false; }

      if (depth >= BOTTOM) {
        depth = BOTTOM;
        if (!p.dead) p.y += turns < 16 ? turns * 180 / 256 : 11.25;
        if (++turns > 64) {
          if (!p.dead) {
            // out of the bottom: curled up, falling, and his controls in the air locked
            p.carried = false; p.curled = true; p.airLock = true; p.air = true;
            p.xsp = 0; p.gsp = 0; p.x = e.x;
          }
          phase = 'sunk';
        }
      }
      sounds(ctx);
      animate(o, anims);
      ctx.draw(o, e.x, y);
      return true;
    },
  };
}
