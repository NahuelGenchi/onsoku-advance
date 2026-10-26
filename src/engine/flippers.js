// Casino Paradise's flippers (SAT-R decompilation, src/game/sa1/stage/interactables/flippers.c and
// flipper_small_blue.c).
//
// - the lying flipper (kind 54) points right from its pivot, or left when d0 is 0. Coming down onto it, Sonic
//   is held curled up on its slope, half a pixel down for each pixel out from the pivot, rolling out at
//   0.3125 px a frame, with his controls taken; a jump press flips him off, the faster the farther out he
//   is, at -1984/256 px a frame up less 1/16 px for each pixel out, and 1/8 px across for each. Rolling off
//   its end lets him go at 1 px a frame. From below it holds him under it.
// - the standing flipper (56) is solid; walking or rolling into it from below its pivot bats him back the way
//   he came at 10 px a frame.
// - the small blue flipper (73) is part of a marble track, as step d1: taking him from an earlier step, it
//   throws him up at 12.5625 px a frame with gravity for d0 frames, then lets him go. Its art turns into the
//   lying flipper's 24 frames after it throws him, until it next spawns: it switches to that animation where
//   it means its own (the original's bug).
//
// After a flip the lying and standing ones play their flip for 8 frames, then rest; they do nothing to him
// meanwhile.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { overlap, platform, LANDED } from './collide.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';
import { SPRITE_OFFSET_Y, BALL_SPRITE_OFFSET_Y } from './constants.js';
import { s8 } from './trig.js';
import { SONG } from '../sound/songs.js';

export const FLIPPER = 54, FLIPPER_STANDING = 56, FLIPPER_BLUE = 73;
const SOX = 6;                 // Sonic's spriteOffsetX
const FLIP_FRAMES = 8;
const ROLL = 80 / 256;         // Q(0.3125)
const BAT = 10;
const BLUE_THROW = -3216 / 256, GRAVITY = 42 / 256, BLUE_ART = 24;

const s16 = v => (v << 16) >> 16;

// Coll_Player_Entity_Intersection: his body's box against the flipper's
function touches(s, x, y, p) {
  return !p.dead && s.boxes[0] && overlap(x, y, s.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY]);
}
// Player_TransitionCancelFlyingAndBoost
function cancel(p) { endAttack(p); p.pushing = false; }
// the buttons he holds don't count as presses (heldInput)
function noPresses(input) { input.jumpPressed = false; input.attackPressed = false; input.boostPressed = false; }

// the lying flipper (Task_Flipper_Horizontal, and Task_Flipper_Horizontal_2 while `flipping`); it only updates
// its animation while flipping
function lying(e, slot, anims) {
  const left = e.d[0] === 0;
  const o = { x: e.x, y: e.y, ...makeSprite('flipper', { flipX: left }) };
  animate(o, anims);
  let holding = false, flipping = 0;
  return {
    run(ctx) {
      const p = ctx.player, input = ctx.input;
      if (flipping) {
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        if (--flipping === 0) startAnim(o, 'flipper', true);
        animate(o, anims);
        ctx.draw(o, e.x, e.y);
        return true;
      }
      // how far out from the pivot he is, and the height it holds him at there
      const out = s16(left ? e.x - Math.floor(p.x) : Math.floor(p.x) - e.x);
      const top = e.y + (out >> 1) - 17;
      // held: curled up on the slope, rolling out, his presses dropped (heldInput and frameInput cleared)
      const hold = () => {
        p.y = top + 1 / 256; p.ysp = 0; p.xsp = left ? -ROLL : ROLL;
        p.jumpPressed = false; noPresses(input);
        p.ignoreInput = true;
      };
      if (touches(o, e.x, e.y, p)) {
        if (p.ysp >= 0 && p.y < e.y + 19 && p.air) {
          if (input.jumpPressed && holding) {
            holding = false;
            p.onObject = null; p.air = true; p.jumped = false; p.curled = true; p.airLock = false;
            if (input.left) p.facing = -1;
            else if (input.right) p.facing = 1;
            p.ysp = (-0x7C0 - out * 16) / 256;
            p.xsp = (left ? -out : out) * 32 / 256; p.gsp = p.xsp;
            cancel(p);
            p.state = 'spin';
            flipping = FLIP_FRAMES;
            setOffsetY(p, BALL_SPRITE_OFFSET_Y);
            p.ignoreInput = false; noPresses(input);
            startAnim(o, 'flipperFlip', true);
            ctx.world.playSound(SONG.BUMPER_A);
          } else if (p.y > top) {
            // caught: his height changes after he is put on the slope, so he lands lower by it
            hold();
            holding = true;
            p.rotation = 0;
            cancel(p);
            p.curled = true;
            setOffsetY(p, BALL_SPRITE_OFFSET_Y);
            p.state = 'spin';
          } else if (holding) {
            cancel(p);
            p.air = true; p.jumped = false; p.curled = true; p.airLock = false;
            p.state = 'spin';
            setOffsetY(p, BALL_SPRITE_OFFSET_Y);
            hold();
          } else {
            p.ignoreInput = false; noPresses(input);
          }
        } else if (p.y <= e.y) p.air = true;
        else if (p.y < e.y + 24) { p.y = e.y + 24; p.ysp = 10 / 256; p.xsp = 0; p.gsp = 0; }
      } else {
        // off its end
        if (holding) { p.ignoreInput = false; noPresses(input); p.xsp = left ? -1 : 1; }
        holding = false;
      }
      if (offCam(e.x, e.y, ctx.cam)) {
        if (holding) { p.ignoreInput = false; noPresses(input); }
        slot.live = null;
        return false;
      }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

// the standing flipper (Task_Flipper_Vertical, and Task_Flipper_Vertical_2 while `flipping`); its first
// frame, and with it its hitbox, comes with its first run's animation update, after its collision
function standing(e, slot, anims) {
  const o = { x: e.x, y: e.y, ...makeSprite('flipperStanding') };
  let on = false, flipping = 0;
  // it bats him toward `dir`, turning that way
  function bat(p, dir, world) {
    p.facing = dir;
    p.xsp = BAT * dir; p.gsp = p.xsp;
    o.flipX = dir < 0;
    flipping = FLIP_FRAMES;
    startAnim(o, 'flipperStandingFlip', true);
    world.playSound(SONG.BUMPER_A);
  }
  return {
    run(ctx) {
      const p = ctx.player;
      if (flipping) {
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        if (--flipping === 0) startAnim(o, 'flipperStanding', true);
        animate(o, anims);
        ctx.draw(o, e.x, e.y);
        return true;
      }
      if (p.dead) {
        if (on) { on = false; p.onObject = null; }
      } else if (p.air || on) {
        if (platform(o, o.boxes[0], p, ctx.world.terrain) & LANDED) {
          on = true;
          // on its top but not touching its box: he slips off
          if (!touches(o, e.x, e.y, p) && p.onObject === o) p.onObject = null;
        } else if (on) { on = false; p.onObject = null; }
      } else if (e.y < p.y) {
        if (e.x > p.x) { if (touches(o, e.x - 6, e.y, p)) bat(p, -1, ctx.world); }
        else if (touches(o, e.x + 7, e.y, p)) bat(p, 1, ctx.world);
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

// the small blue flipper (Task_Flipper_SmallBlue), mirrored when d2 is set: (hx, hy) is where it holds him,
// `vy` his speed up, `n` the frames it has thrown him for, `art` the frames until its art changes
function blue(e, slot, anims) {
  const frames = e.d[0], step = e.d[1];
  const o = makeSprite('blueFlipper', { flipX: e.d[2] !== 0 });
  animate(o, anims);
  let holding = false, n = 0, vy = 0, hx = 0, hy = 0, art = 0;
  return {
    priority: 0x2000 + s8(e.d[1]),
    run(ctx) {
      const p = ctx.player;
      if (!p.dead) {
        if (holding) {
          if (art !== 0 && --art === 0) startAnim(o, 'flipper', true);
          vy += GRAVITY;
          hy += vy;
          p.y = hy; p.x = hx; p.ysp = vy; p.xsp = 0; p.gsp = 0;
          if (++n >= frames) {
            if (p.track === step) p.carried = false;
            holding = false;
            art = 0;
          } else {
            cancel(p);
            p.carried = true;
            p.state = 'marbleTrack';
            setOffsetY(p, SPRITE_OFFSET_Y);
          }
        } else if (art !== 0) {
          if (--art === 0) startAnim(o, 'blueFlipper', true);
        } else if (p.carried && p.track < step && touches(o, e.x, e.y, p)) {
          n = 0;
          cancel(p);
          p.curled = true; p.carried = true;
          p.track = step;
          hy = p.y; hx = p.x; vy = BLUE_THROW;
          p.ysp = 0; p.xsp = 0; p.gsp = 0;
          p.state = 'marbleTrack';
          setOffsetY(p, SPRITE_OFFSET_Y);
          ctx.world.playSound(SONG.BUMPER_A);
          holding = true;
          art = BLUE_ART;
          startAnim(o, 'blueFlipperFlip', true);
        }
      }
      if (!holding && offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

/** The task for a flipper entity, or null when `e` is not one. */
export function createFlipper(e, slot, anims) {
  switch (e.kind) {
    case FLIPPER: return lying(e, slot, anims);
    case FLIPPER_STANDING: return standing(e, slot, anims);
    case FLIPPER_BLUE: return blue(e, slot, anims);
    default: return null;
  }
}
