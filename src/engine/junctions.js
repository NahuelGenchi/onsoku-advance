// Casino Paradise's tube junctions (kind 107; SAT-R decompilation, src/game/sa1/stage/interactables/107.c):
// where tubes meet, Sonic's centre coming within 10 px of the junction catches him there, curled up and still,
// with the spring's sound. From the next frame he circles it, 4 px out and a turn every 32 frames, until a
// fresh press of a way out (his frameInput, from his last frame) sends him off from its middle at 9 px a frame.
// d0 picks the ways out:
//
// - 0: right, or else down; he circles 4 px above the middle
// - 1: right, down and right at (7, 8), or left, down and left at (-9, 7)
// - 2: right
// - 3: down
//
// After sending him off it leaves him alone for 20 frames.

import { offCam } from './objects.js';
import { endAttack, LEFT, RIGHT, DOWN } from './player.js';
import { setOffsetY } from './sensors.js';
import { SPRITE_OFFSET_Y } from './constants.js';
import { SINE, s8 } from './trig.js';
import { SONG } from '../sound/songs.js';

export const TUBE_JUNCTION = 107;
const REACH = 10;
const AWAY = 20;   // the frames it leaves him alone after sending him off

const Div = (a, b) => Math.trunc(a / b);

// the way out a fresh press picks, as [xsp, ysp], and how far above the middle he circles
const WAYS = [
  { up: 4, way: d => d & RIGHT ? [9, 0] : d & DOWN ? [0, 9] : null },
  { up: 0, way: d => d & RIGHT ? [7, 8] : d & LEFT ? [-9, 7] : null },
  { up: 0, way: d => d & RIGHT ? [9, 0] : null },
  { up: 0, way: d => d & DOWN ? [0, 9] : null },
];

/** The task for a tube junction, or null when `e` is not one. */
export function createTubeJunction(e, slot) {
  if (e.kind !== TUBE_JUNCTION) return null;
  const { up, way } = WAYS[s8(e.d[0])];
  // whether it holds him, the frames left of leaving him alone, and his angle around it (unk40)
  let held = false, away = 0, angle = 0;
  return {
    run(ctx) {
      const p = ctx.player;
      if (p.dead) {
        // nothing
      } else if (held) {
        const out = way(p.pressedDirs);
        angle += 4;
        if (angle > 1024) angle -= 1024;
        const a = (angle * 8) & 0x3FF;
        p.x = e.x + Div(SINE[a + 256], 16) / 256;
        p.y = e.y - up + Div(SINE[a], 16) / 256;
        endAttack(p); p.pushing = false;   // Player_TransitionCancelFlyingAndBoost
        p.state = 'spin';
        setOffsetY(p, SPRITE_OFFSET_Y);
        p.curled = true; p.air = true; p.carried = true;
        if (out) {
          p.x = e.x; p.y = e.y;
          away = AWAY;
          held = false;
          p.carried = false;
          p.rotation = 0;
          [p.xsp, p.ysp] = out; p.gsp = p.xsp;
        }
      } else if (away > 0) away--;
      else {
        const px = Math.floor(p.x), py = Math.floor(p.y);
        if (px >= e.x - REACH && px <= e.x + REACH && py >= e.y - REACH && py <= e.y + REACH) {
          p.curled = true; p.carried = true;
          angle = 0;
          p.x = e.x; p.y = e.y;
          p.xsp = 0; p.ysp = 0; p.gsp = 0;
          setOffsetY(p, SPRITE_OFFSET_Y);
          ctx.world.playSound(SONG.SPRING);
          held = true;
        }
      }
      if (!held && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
