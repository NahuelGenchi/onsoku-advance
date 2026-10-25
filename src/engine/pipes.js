// Cosmic Angel's tubes (SAT-R decompilation, src/game/sa1/stage/interactables/pipe.c, track.c and
// maze_air_corner.c). A pipe entrance (kind 110) catches Sonic curled up, pulls him into its mouth and carries
// him a first stretch; tracks (106), each a straight stretch, take him on one after another; a pipe exit (111)
// throws him out. The air corners (112) are the tubes' bends, which he can also land on from outside.
//
// The player's `track` (unk99[0]) is the step of the chain holding him: an entrance sets it to 0, each track to
// its own d3, and a track or exit only takes him while it is below theirs; the exit and the player's start set
// it to 0x7F, which no track takes. Each piece's task has priority 0x2000 plus its step, so along a chain they
// run in order within the frame, and a track whose start he reaches is the next to move him that same frame.
// Positions here are worked in 1/256 px, as the original's Q24.8.

import { makeSprite, animate, offCam, OBJECTS } from './objects.js';
import { platform, platformTop, overlap, LANDED, FROM_BELOW, LEFT_FACE, RIGHT_FACE } from './collide.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';
import { SPRITE_OFFSET_Y } from './constants.js';
import { s8 } from './trig.js';
import { SONG } from '../sound/songs.js';

export const TRACK = 106, PIPE_ENTRANCE = 110, PIPE_EXIT = 111, TRACK_AIR_CORNER = 112;
const COSMIC_ANGEL = 11, EGG_ROCKET = 10;   // zone 6's acts, whose pipes have their own looks
const NEAR = 10;        // how close to a track's start Sonic must be for it to take him
const PULL = 90, PULL_SOUND = 45, PULL_SPEED = 384;   // the entrance's pull: frames, when it sounds, 1.5 px a frame
const ENTRANCE_STEPS = 20, EXIT_FRAMES = 15;
const SOX = 6;          // Sonic's spriteOffsetX

const q = v => Math.round(v * 256);
const s16 = v => (v << 16) >> 16;
const Div = (a, b) => Math.trunc(a / b);

// Player_TransitionCancelFlyingAndBoost
function cancel(p) { endAttack(p); p.pushing = false; }

// curled up and held, standing tall: PLAYERFN_CHANGE_SHIFT_OFFSETS(p, 6, 14) keeps his feet where they were
function hold(p) {
  p.carried = true; p.state = 'spin';
  setOffsetY(p, SPRITE_OFFSET_Y);
}

// one frame of a carry along a straight stretch, from (x, y) by (dx, dy) in `steps` frames, `k` frames in: the
// speeds are what he moved since the last frame this stretch moved him (from 0 on its first use, so wild).
// Returns true once he is at its end.
function carry(p, c, x, y, dx, dy, steps) {
  const qx = (x + Div(c.k * dx, steps)) * 256, qy = (y + Div(c.k * dy, steps)) * 256;
  p.x = qx / 256; p.y = qy / 256;
  p.ysp = s16(qy - c.prevY) / 256;
  p.gsp = p.xsp = s16(qx - c.prevX) / 256;
  c.k = (c.k + 1) & 0xFF;
  c.prevX = qx; c.prevY = qy;
  return Math.floor(p.x) === x + dx && Math.floor(p.y) === y + dy;
}

// 1.5 px a frame toward (x, y) on each axis, stopping on it (Task_8095D28)
function pull(p, x, y) {
  const tx = x * 256, ty = y * 256;
  let px = q(p.x), py = q(p.y);
  if (py < ty) py = Math.min(py + PULL_SPEED, ty); else if (py > ty) py = Math.max(py - PULL_SPEED, ty);
  if (px < tx) px = Math.min(px + PULL_SPEED, tx); else if (px > tx) px = Math.max(px - PULL_SPEED, tx);
  p.x = px / 256; p.y = py / 256;
}

// a track (Task_Track): d0 and d1 tiles across and down, in d2 frames, as step d3. It takes Sonic when he is
// alive, within 10 px of its start, and on no step of a chain at or past its own (step 0 takes him whatever
// holds him). It leaves him in the air at its end; it only goes off screen while it holds no one.
function createTrack(e, slot) {
  const dx = s8(e.d[0]) * 8, dy = s8(e.d[1]) * 8, steps = e.d[2], step = e.d[3];
  const c = { k: 0, prevX: 0, prevY: 0 };
  let held = false;
  return {
    priority: OBJECTS | step,
    run(ctx) {
      const p = ctx.player;
      if (held) {
        if (p.dead) { p.carried = false; held = false; }
        else if (p.track !== step) held = false;   // the next step has him
        else if (carry(p, c, e.x, e.y, dx, dy, steps)) { p.carried = false; p.air = true; held = false; }
        else { cancel(p); p.facing = 1; hold(p); }
      } else if (!p.dead && (p.track < step || step === 0)
        && Math.abs(Math.floor(p.x) - e.x) <= NEAR && Math.abs(Math.floor(p.y) - e.y) <= NEAR) {
        c.k = 0;
        cancel(p);
        p.curled = true;
        p.x = e.x; p.y = e.y;
        p.xsp = p.ysp = p.gsp = 0;
        hold(p);
        ctx.world.playSound(SONG.TUBE);
        held = true;
        p.track = step;
      }
      if (!held && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

// an air corner (Task_TrackAirCorner): drawn as d0 flips it (1 across, 2 upside down, 3 both); Sonic not held
// by a tube can land on its top, and sinks 2 px into it on every frame he stands there. It never animates.
function createAirCorner(e, slot, anims) {
  const o = Object.assign(makeSprite('airCorner', { flipX: e.d[0] === 1 || e.d[0] === 3, flipY: e.d[0] === 2 || e.d[0] === 3 }), { x: e.x, y: e.y });
  animate(o, anims);
  return {
    run(ctx) {
      const p = ctx.player;
      if (!p.dead && !p.carried && (platformTop(o, e.x, e.y, o.boxes[0], p) & LANDED)) p.y += 2;
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

// the look of a pipe end, by zone 6's two acts and the other levels: [vertical, across] animation names
function pipeSprite(level, exit, vertical) {
  const zone = level === COSMIC_ANGEL ? 'Cosmic' : level === EGG_ROCKET ? 'Rocket' : '';
  return `pipe${exit ? 'Exit' : ''}${vertical ? 'V' : 'H'}${zone}`;
}

// a pipe entrance (Task_PipeEntrance, then Task_8095D28 and Task_8095E90). d2 is which way it faces: 0 and 1
// up and down (which is which depends on the level and the gravity), 2 and 3 across, taking Sonic as he runs
// into its right or left side. It is solid otherwise. Once it takes him it pulls him to its point for 90 frames,
// then carries him d0, d1 tiles in 20 frames if no track took him on the way.
function createPipeEntrance(e, slot, anims, level) {
  const face = e.d[2], step = e.d[3], dx = s8(e.d[0]) * 8, dy = s8(e.d[1]) * 8;
  const vertical = face === 0 || face === 1, cosmic = level === COSMIC_ANGEL;
  const flipY = vertical && (cosmic ? face === 0 : face !== 0);
  const o = Object.assign(makeSprite(pipeSprite(level, false, vertical), { flipX: !vertical && (face & 1) !== 0, flipY, order: 5, prio: 0 }), { x: e.x, y: e.y });
  animate(o, anims);
  const c = { k: 0, prevX: 0, prevY: 0 };
  let phase = 'waiting', t = 0, carrying = false;

  // the side that takes him, as a Coll_Player_Platform result: landing on it (0x100008 in one player) or
  // bumping it from below (0x10000)
  function mouth(p) {
    const toward = cosmic ? !p.inverted : p.inverted;
    return (face !== 0) === toward ? FROM_BELOW : LANDED;
  }

  function take(p, x, y, air) {
    cancel(p);
    t = PULL;
    p.onObject = null; p.air = air; p.airLock = false; p.pushing = false;
    p.curled = true;
    p.x = x; p.y = y;   // where he was before the collision put him out of it
    p.ysp = p.xsp = p.gsp = 0;
    p.track = 0;
    hold(p);
    phase = 'pulling';
  }

  return {
    priority: OBJECTS | step,
    run(ctx) {
      const p = ctx.player;
      if (phase === 'waiting') {
        // dead, it sets what Sonic's own death step sets
        if (!p.dead) {
          const x = p.x, y = p.y, hit = platform(o, o.boxes[0], p, ctx.world.terrain);
          if (vertical ? hit & mouth(p) : (hit & RIGHT_FACE && face === 2) || (hit & LEFT_FACE && face === 3)) take(p, x, y, !vertical);
        }
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      } else if (phase === 'pulling') {
        if (!p.dead) {
          if (t !== 0) {
            pull(p, e.x, e.y);
            if (--t === PULL_SOUND) ctx.world.playSound(SONG.SPIN);
          } else {
            carrying = true;
            p.onObject = null;
            phase = 'carrying';
          }
          cancel(p); p.state = 'spin';
        } else p.carried = false;
      } else if (carrying) {
        if (p.dead) { carrying = false; p.carried = false; }
        else if (p.track !== step) carrying = false;   // a track has him
        else if (carry(p, c, e.x, e.y, dx, dy, ENTRANCE_STEPS)) { p.carried = false; carrying = false; }
        else { cancel(p); hold(p); }
      } else {
        phase = 'waiting';
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

// a pipe exit (Task_PipeExit, then Task_809656C and Task_8096724): d2 is which way it throws, 0 down, 1 up,
// 2 right, 3 left, at d1 / 4 px a frame. It takes Sonic when a tube holds him on a step below its d3 and his
// body touches it, and is solid to him otherwise. On the next frame it gives him his speed, then moves him for
// 15 frames and lets him go, curled up in the air; a jump or attack pressed on that last frame doesn't count.
function createPipeExit(e, slot, anims, level) {
  const face = e.d[2], step = e.d[3], speed = s8(e.d[1]) * 64 / 256;
  const vertical = face === 0 || face === 1;
  const o = Object.assign(makeSprite(pipeSprite(level, true, vertical), { flipX: !vertical && (face & 1) !== 0, flipY: vertical && face !== 0, order: 5, prio: 0 }), { x: e.x, y: e.y });
  animate(o, anims);
  let phase = 'waiting', t = 0;
  return {
    priority: OBJECTS | step,
    run(ctx) {
      const p = ctx.player;
      if (phase === 'waiting') {
        if (p.dead) { /* it sets what Sonic's own death step sets */ }
        else if (!p.carried) platform(o, o.boxes[0], p, ctx.world.terrain);
        else if (p.track < step && o.boxes[0] && overlap(e.x, e.y, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) {
          // its pull toward its point (unk3E) never runs: it puts him there and zeroes the count
          t = 0;
          cancel(p);
          p.onObject = null; p.air = false; p.airLock = false; p.pushing = false;
          p.curled = true;
          p.x = e.x; p.y = e.y;
          p.ysp = p.xsp = p.gsp = 0;
          p.jumpPressed = false;
          p.track = 0x7F;
          hold(p);
          phase = 'holding';
        }
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      } else if (phase === 'holding') {
        if (!p.dead) {
          const v = face & 1 ? -speed : speed;
          if (vertical) { p.ysp = v; p.xsp = p.gsp = 0; }
          else { p.facing = face & 1 ? -1 : 1; p.ysp = 0; p.xsp = p.gsp = v; }
          t = EXIT_FRAMES;
          phase = 'throwing';
          cancel(p); p.state = 'spin'; p.air = true;
        }
      } else if (t !== 0) {
        // dead, it stays here
        if (!p.dead) {
          t--;
          p.x += p.xsp; p.y += p.ysp;
          if (t === 0) {
            // heldInput |= jump | attack: what he holds then isn't a press on this frame
            p.ignoreInput = false;
            ctx.input.jumpPressed = false; ctx.input.attackPressed = false;
            p.track = 0x7F;
            p.carried = false;
          }
        }
      } else {
        phase = 'waiting';
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

/** The task for a tube entity, or null when `e` is not one. `level` picks the pipes' looks and sides. */
export function createTube(e, slot, anims, level) {
  switch (e.kind) {
    case TRACK: return createTrack(e, slot);
    case TRACK_AIR_CORNER: return createAirCorner(e, slot, anims);
    case PIPE_ENTRANCE: return createPipeEntrance(e, slot, anims, level);
    case PIPE_EXIT: return createPipeExit(e, slot, anims, level);
    default: return null;
  }
}
