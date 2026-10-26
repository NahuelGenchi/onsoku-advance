// The air bubbles under water (SAT-R decompilation, src/game/sa1/stage/interactables/air_bubbles.c), kind 94:
// a spot on the ground that fizzes, lets a stream of small bubbles out and, now and then, a big one Sonic can
// breathe from. All are tasks at the objects' priority; the bubbles burst when they reach the water line.

import { makeSprite, animate, offCam } from './objects.js';
import { overlap } from './collide.js';
import { breathe } from './player.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';

export const AIR_BUBBLES = 94;
// the frames between two big bubbles, in turn (gUnknown_086CEE60); a stream of small ones starts every half
// of one of them, picked by the stage clock
const DELAYS = [301, 241, 121, 261, 301, 121, 201, 121];
const BIG = 4;   // the big bubble's unk3C, which keeps it animating and lets Sonic breathe from it

// a bubble's sway: up to 8 px either way, a turn every 341 frames of its own
const sway = t => SINE[(t * 3) & 1023] >> 11;

/** The task for an air bubbles entity, or null when `e` is not one. */
export function createAirBubbles(e, slot, anims) {
  if (e.kind !== AIR_BUBBLES) return null;
  const s = makeSprite('bubbleMaker', { order: 18, prio: 2 });
  let big = 120, next = 0, small = 60;
  return {
    run(ctx) {
      const { world } = ctx;
      if (--big === 0) {
        ctx.add(bigBubble(e.x, e.y - 4, anims));
        big = DELAYS[next];
        next = (next + 1) % DELAYS.length;
      }
      if (--small === 0) {
        ctx.add(smallBubbles(e.x, e.y - 4, ((big >> 3) + world.tick) & 0xFF));
        small = Math.trunc(DELAYS[world.tick % DELAYS.length] / 2);
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(s, anims);
      ctx.draw(s, e.x, e.y);
      return true;
    },
  };
}

// The big bubble (CreateBubbleContainingAir, Task_BubbleContainingAir): it rises half a pixel a frame, swaying.
// From its 80th frame Sonic's body touching its box takes a breath (breathe in player.js) with its sound, and
// the drowning music stops; the bubble then stays where it is for 16 more frames (Task_809141C).
function bigBubble(x, y, anims) {
  const s = makeSprite('airBubble', { order: 15, prio: 2 });
  let t = 0, after = -1;
  animate(s, anims);
  return {
    run(ctx) {
      const { player: p, world } = ctx, w = world.water;
      const bx = x + sway(t), by = y - (t >> 1);
      if (offCam(bx, by, ctx.cam) || !w || w.level < 0 || by < w.level) return false;
      if (after >= 0) {
        if (--after < 0) return false;
        animate(s, anims);
        ctx.draw(s, bx, by);
        return true;
      }
      t++;
      animate(s, anims);
      if (t >= 80 && !p.dead && s.boxes[0] && overlap(bx, by, s.boxes[0], Math.floor(p.x), Math.floor(p.y), [-6, -p.offsetY, 6, p.offsetY])) {
        breathe(p);
        world.stopSound(SONG.DROWNING);
        world.playSound(SONG.AIR_BUBBLE);
        after = 16;
      }
      ctx.draw(s, bx, by);
      return true;
    },
  };
}

// a stream's bubble (sub_80914F8, Task_80915F0): small or a group by the low bit of `n`, set off from the
// spot by its low four bits; it rises and sways like the big one
function smallBubbles(x, y, n) {
  const s = makeSprite(n & 1 ? 'bubblesGroup' : 'bubblesSmall', { order: 18, prio: 2 });
  const dx = n & 0xF;
  let t = 0;
  return {
    run(ctx) {
      const w = ctx.world.water, bx = x - 8 + sway(t) + dx, by = y - (t >> 1);
      if (offCam(bx, by, ctx.cam) || !w || w.level < 0 || by < w.level) return false;
      t++;
      animate(s, ctx.anims);
      ctx.draw(s, bx, by);
      return true;
    },
  };
}
