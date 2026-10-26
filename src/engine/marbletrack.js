// Casino Paradise's marble tracks (SAT-R decompilation, src/game/sa1/stage/interactables/marble_track.c): the
// pinball tubes Sonic is carried through, curled up and shrunk. A track is a chain of objects that hand him on
// by the step number he carries (the player's unk99[0], 0x7F off any track); each takes him from a lower step,
// or from no track when its own step is 0:
//
// - the entrance (kind 67), a chute he drops into from above: landing on it while on no track takes him in,
//   with his step set to its d3; he falls with gravity, moved across d1 px over d0 frames, until d0 frames
//   have gone, he has dropped more than d2 px, or a later step has him. His sprite grows from 0xB0 to full size.
// - the direction points (65): reaching within 8 px across and 10 down of one moves him d0 × 8 px across and
//   d1 × 8 down over d2 frames, in a straight line, as step d3. One that ends with no later step to take him
//   lets him go there, standing still.
// - the drop (66): within 12 px of it, he falls with gravity as step d1, for at most d2 × 3 frames or
//   d0 × 8 px, until a later step has him; then he is off the track and on his own.
// - the exit (68), a cup that throws him up: any step he carries, within its 24-px-wide box (shifted 24 px left
//   when d2 is set) and 24 px above or below it, takes him off the track and launches him at 5 px a frame,
//   shrinking; as he starts to fall, it lets him go curled up, at full size, unable to steer until he lands.
//   Otherwise it is solid.
//
// The entrance runs at priority 0x1900 + d3, the points at 0x2000 + d3, the drop at 0x2000 + d1 and the exit at
// 0x2100 + d1, so a chain's objects run in its order. The ROM's teleport flag, which only multiplayer reads,
// and the tail sprite the entrance makes for Tails on its 25th frame aren't kept.

import { makeSprite, animate, offCam } from './objects.js';
import { platform, LANDED } from './collide.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';
import { SPRITE_OFFSET_Y } from './constants.js';
import { s8 } from './trig.js';
import { SONG } from '../sound/songs.js';

export const MARBLE_TRACK_DIR = 65, MARBLE_TRACK_DROP = 66, MARBLE_TRACK_ENTRANCE = 67, MARBLE_TRACK_EXIT = 68;
export const NO_TRACK = 0x7F;
const GRAVITY = 42 / 256;
const LAUNCH = 5;
const SMALL = 0xB0, FULL = 0x100, GROW = 4;   // his sprite's scale (unk80, unk82)

const Div = (a, b) => Math.trunc(a / b);
const s16 = v => (v << 16) >> 16;

// Player_TransitionCancelFlyingAndBoost
function cancel(p) { endAttack(p); p.pushing = false; }
// PLAYERFN_CHANGE_SHIFT_OFFSETS(6, 14): his standing height, curled up or not
const fullHeight = p => setOffsetY(p, SPRITE_OFFSET_Y);
// the jump and attack buttons he holds don't count as presses (heldInput, frameInput)
function noPresses(input) { input.jumpPressed = false; input.attackPressed = false; input.boostPressed = false; }
// taken in: curled up, carried, standing still
function takeIn(p, input) {
  p.curled = true; p.carried = true;
  p.xsp = 0; p.ysp = 0; p.gsp = 0;
  noPresses(input);
  fullHeight(p);
}

// the entrance (Task_MarbleTrack_Entrance)
function entrance(e, slot, anims) {
  const frames = e.d[0], across = s8(e.d[1]), depth = e.d[2], step = e.d[3];
  const o = { x: e.x, y: e.y, ...makeSprite('marbleTrackExit') };
  animate(o, anims);
  let held = false, n = 0, dropped = 0;
  return {
    priority: 0x1900 + step,
    run(ctx) {
      const p = ctx.player;
      if (!p.dead) {
        if (held) {
          p.ysp += GRAVITY;
          p.y += p.ysp;
          dropped += p.ysp;
          p.x = e.x + Div(across * n, frames);
          p.scale = Math.min(p.scale + GROW, FULL);
          if (++n >= frames || Math.floor(dropped) > depth || (p.track !== NO_TRACK && p.track > step)) held = false;
          else {
            cancel(p);
            p.carried = true; p.xsp = 0; p.gsp = 0;
            p.state = 'marbleTrack';
            fullHeight(p);
          }
        } else {
          const x = p.x;
          if (p.track === NO_TRACK && platform(o, o.boxes[0], p, ctx.world.terrain) & LANDED) {
            n = 0; dropped = 0;
            cancel(p);
            p.onObject = null;
            p.track = step;
            takeIn(p, ctx.input);
            p.state = 'marbleTrack';
            p.scale = SMALL;
            ctx.world.playSound(SONG.SPRING);
            held = true;
            p.x = x;
          }
        }
      }
      if (!held && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

// a direction point (Task_MarbleTrack_Dir): (x0, y0) is where it took him, `last` where it put him a frame ago,
// from which his speeds are worked out, wrapping as the original's 16-bit speeds do; they start at 0
function direction(e, slot) {
  const dx = s8(e.d[0]) * 8, dy = s8(e.d[1]) * 8, frames = e.d[2], step = e.d[3];
  let held = false, n = 0, x0 = 0, y0 = 0, lastX = 0, lastY = 0;
  return {
    priority: 0x2000 | step,
    run(ctx) {
      const p = ctx.player;
      if (!p.dead) {
        if (held) {
          if (p.track === step) {
            p.x = x0 + Div(dx * n, frames);
            p.y = y0 + Div(dy * n, frames);
            p.xsp = s16(p.x * 256 - lastX) / 256;
            p.ysp = s16(p.y * 256 - lastY) / 256;
            n = (n + 1) & 0xFF;
            if (n >= frames) {
              // the last step lets him go, still
              p.ignoreInput = false; noPresses(ctx.input);
              p.carried = false;
              p.xsp = 0; p.ysp = 0; p.gsp = 0;
              held = false;
            } else {
              p.ignoreInput = true; p.carried = true; p.gsp = 0;
              noPresses(ctx.input);
              fullHeight(p);
            }
            lastX = p.x * 256; lastY = p.y * 256;
          } else held = false;
        } else if ((p.carried && p.track < step) || step === 0) {
          const px = Math.floor(p.x), py = Math.floor(p.y);
          if (px >= e.x - 8 && px <= e.x + 8 && py >= e.y - 10 && py <= e.y + 10) {
            n = 0;
            p.ignoreInput = true;
            x0 = px; y0 = py;
            takeIn(p, ctx.input);
            ctx.world.playSound(SONG.SPRING);
            held = true;
            p.track = step;
          }
        }
      }
      if (!held && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

// the drop (Task_MarbleTrack_Unk); with `centre` (Secret Base's zone, and multiplayer stage 15) it also moves
// him across to it, half a pixel a frame
function drop(e, slot, centre) {
  const depth = s8(e.d[0]) * 8, step = e.d[1], frames = e.d[2] * 3;
  let held = false, n = 0, dropped = 0;
  return {
    priority: 0x2000 + s8(e.d[1]),
    run(ctx) {
      const p = ctx.player;
      if (!p.dead) {
        if (held) {
          p.ysp += GRAVITY;
          p.y += p.ysp;
          dropped += p.ysp;
          if (centre) p.x = p.x < e.x ? Math.min(p.x + 0.5, e.x) : Math.max(p.x - 0.5, e.x);
          if (p.track > step || ++n >= frames || Math.floor(dropped) > depth) {
            if (p.track === step) { p.track = NO_TRACK; p.carried = false; }
            held = false;
          } else {
            p.carried = true; p.xsp = 0; p.gsp = 0;
            fullHeight(p);
          }
        } else if ((p.carried && p.track < step) || step === 0) {
          const px = Math.floor(p.x), py = Math.floor(p.y);
          if (px >= e.x - 12 && px <= e.x + 12 && py >= e.y - 12 && py <= e.y + 12) {
            n = 0; dropped = 0;
            p.curled = true; p.carried = true;
            p.xsp = 0; p.ysp = 0; p.gsp = 0;
            fullHeight(p);
            ctx.world.playSound(SONG.SPRING);
            held = true;
            p.track = step;
          }
        }
      } else if (held) { held = false; p.carried = false; }
      if (!held && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

// the exit (Task_MarbleTrack_Exit): it keeps where it took him, (hx, hy), and moves him from there
function exit(e, slot, anims) {
  const left = e.d[2] !== 0 ? -24 : 0;
  const o = { x: e.x, y: e.y, ...makeSprite('marbleTrackExit') };
  animate(o, anims);
  let held = false, hx = 0, hy = 0;
  return {
    priority: 0x2100 + s8(e.d[1]),
    run(ctx) {
      const p = ctx.player;
      if (!p.dead) {
        if (held) {
          p.ysp += GRAVITY;
          hy += p.ysp;
          p.y = hy; p.x = hx;
          p.scale = Math.max(p.scale - GROW, SMALL);
          p.ignoreInput = true; p.carried = true;
          if (p.ysp > 0) {
            cancel(p);
            p.state = 'spin';
            p.ignoreInput = false; noPresses(ctx.input);
            p.carried = false;
            held = false;
            p.scale = FULL;
          }
        } else {
          const px = Math.floor(p.x), py = Math.floor(p.y);
          if (p.track !== NO_TRACK && px >= e.x + left && px <= e.x + left + 24 && py >= e.y - 24 && py <= e.y + 24) {
            hx = p.x; hy = p.y;
            cancel(p);
            p.airLock = true;   // MOVESTATE_FLIP_WITH_MOVE_DIR: no steering until he lands
            p.air = true; p.ignoreInput = true;
            takeIn(p, ctx.input);
            p.ysp = -LAUNCH;
            ctx.world.playSound(SONG.SPRING);
            p.track = NO_TRACK;
            held = true;
          }
          if (!p.ignoreInput) platform(o, o.boxes[0], p, ctx.world.terrain);
        }
      }
      if (offCam(e.x, e.y, ctx.cam)) {
        if (held) { p.ignoreInput = false; noPresses(ctx.input); p.carried = false; }
        slot.live = null;
        return false;
      }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

/** The task for a marble track entity, or null when `e` is not one. `level` is the act's (levels.js). */
export function createMarbleTrack(e, slot, anims, level) {
  switch (e.kind) {
    case MARBLE_TRACK_ENTRANCE: return entrance(e, slot, anims);
    case MARBLE_TRACK_DIR: return direction(e, slot);
    case MARBLE_TRACK_DROP: return drop(e, slot, level >> 1 === 1 || level === 15);
    case MARBLE_TRACK_EXIT: return exit(e, slot, anims);
    default: return null;
  }
}
