// Secret Base's swing ropes (SAT-R decompilation, src/game/sa1/stage/interactables/swing_rope.c), kind 78: a
// rope across the act, drawn in its layers, which Sonic grabs when his centre enters its box (d0, d1 its top
// left corner in tiles from the entity, d2 × d3 its size). He swings round it as he slides along it to the
// right, at half the ground speed he came with, gaining 1/16 px a frame each frame up to 0.90625 and 1/16 more
// while right is held (left takes it back off, not below that), up to 9 px a frame. Jump throws him off at
// 6.75 px a frame, up or down as held, or else the way his swing is going. It doesn't take him again for 20
// frames.

import { offCam } from './objects.js';
import { endAttack, curlUp, standUp } from './player.js';
import { s8 } from './trig.js';

export const SWING_ROPE = 78;

const LEFT = 1, RIGHT = 2, UP = 4, DOWN = 8;   // Sonic's held d-pad bits (player.js)
const SLOWEST = 232, FASTEST = 2304, PUSH = 16, GAIN = 16;   // in 1/256 px a frame
const THROW = 6.75;
const TURN = 30;   // frames his swing takes, as its animation does
const WAIT = 20;
const Div = (a, b) => Math.trunc(a / b);

// Player_TransitionCancelFlyingAndBoost; his speeds and whether he is in the air stay as they were
function cancel(p) { endAttack(p); p.pushing = false; }

// the distance to a wall left of (x, y), negative inside it (sub_801F100 with sub_801EB44, scanning left)
function wallLeft(terrain, x, y, layer) {
  const v = terrain.rowWidth(x, y, layer), r = x & 7;
  if (v === 0) return r + 1;
  if (v === 8) return -8 | x;
  return v > 0 ? v - 1 - r : v + r;
}

/** The task for a swing rope, or null when `e` is not one. */
export function createSwingRope(e, slot) {
  if (e.kind !== SWING_ROPE) return null;
  const { x, y } = e;
  const left = x + s8(e.d[0]) * 8, right = left + e.d[2] * 8, top = y + s8(e.d[1]) * 8, bottom = top + e.d[3] * 8;
  // his speed along it (1/256 px a frame), the frames of his swing, and the frames before it takes him again
  let holding = false, speed = 0, turn = 0, wait = 0;

  return {
    run(ctx) {
      const p = ctx.player;
      if (p.dead) {
        if (holding) { p.carried = false; holding = false; }
      } else if (holding) {
        if (speed < SLOWEST) speed += GAIN;
        if (speed > FASTEST) speed = FASTEST;
        p.y = y + 1;
        if (left <= Math.floor(p.x) && right >= Math.floor(p.x)) {
          p.x += speed / 256;
          if (p.held[0] & RIGHT) speed += PUSH;
          else if ((p.held[0] & LEFT) && speed > SLOWEST) speed -= PUSH;
          const d = wallLeft(ctx.world.terrain, Math.floor(p.x) - 8, Math.floor(p.y), p.layer);
          if (d < 0) p.x -= d;
        }
        p.ysp = 0;
        if (p.jumpPressed) {
          cancel(p);
          p.ignoreInput = false; p.carried = false; p.curled = true; p.air = true; p.airLock = false; p.jumped = false;
          // it counts jump and attack as held, so a press of either on this frame isn't one
          ctx.input.jumpPressed = false; ctx.input.attackPressed = false;
          const held = p.held[0];
          if (held & (UP | DOWN)) p.ysp = held & UP ? -THROW : THROW;
          else p.ysp = Div(turn, TURN / 2) !== 0 ? THROW : -THROW;
          p.state = 'spin';
          curlUp(p);
          p.y = y + 9;
          p.gsp = 0; p.xsp = 0;
          holding = false; turn = 0; wait = WAIT;
          p.front = false; p.prio = 2;
        }
        turn = (turn + 1) % TURN;
      } else if (wait > 0) wait--;
      else {
        const px = Math.floor(p.x), py = Math.floor(p.y);
        if (left <= px && right >= px && top <= py && bottom >= py) {
          speed = Math.max(0, Math.round(p.gsp * 256) >> 1);
          cancel(p);
          p.carried = true; p.air = false; p.jumped = false;
          holding = true;
          p.state = 'swingRope';
          standUp(p);
          turn = 0;
        }
      }
      if (!holding && offCam(x, y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
