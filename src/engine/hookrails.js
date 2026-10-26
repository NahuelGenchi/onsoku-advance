// The hook rails (SAT-R decompilation, src/game/sa1/stage/interactables/hook_rail.c), kind 75: a hook hanging
// from a rail drawn into the act. When Sonic's body touches its box it takes him, standing him up, and he hangs
// from it (character state 38) while it slides down the rail, picking up speed, with its sound playing. d0
// picks the rail: 1 runs 480 px down to the right at half a pixel down for each across, and lets him go at its
// end with the hook's speed as his ground speed, 10 px above where he hung; 2 the same to the left; 0 first
// climbs to the left, slowing down, until it is 244 px from where it took him, then drops 116 px onto a lower
// rail and comes back to the right, letting him go once past where it turned. The hook stays at the rail's end
// once it has let him go (or, as the original draws it, 480 px across, 480 back for 2 and straight for 0, and
// 240 down from where it hung) until that leaves the screen's range, and then it can hang where it started
// again. Without him (he died on it) it carries on alone.

import { makeSprite, animate, offCam } from './objects.js';
import { overlap } from './collide.js';
import { endAttack, standUp } from './player.js';
import { SONG } from '../sound/songs.js';

export const HOOK_RAIL = 75;
const SOX = 6;         // Sonic's spriteOffsetX
const LENGTH = 480;    // HOOK_RAIL_TYPES_1_2_LENGTH
const TURN = 244;      // how far type 0 climbs before it drops onto its lower rail
const MAX_CLIMB = -6 * 256;
const q8 = v => Math.round(v * 256);
const I = v => v >> 8;

// Player_TransitionCancelFlyingAndBoost
function cancel(p) { endAttack(p); p.pushing = false; }

/** The task for a hook rail entity, or null when `e` is not one. */
export function createHookRail(e, slot, anims) {
  if (e.kind !== HOOK_RAIL) return null;
  const type = e.d[0] === 1 || e.d[0] === 2 ? e.d[0] : 0;
  const o = makeSprite('hookRail');
  animate(o, anims);   // UpdateSpriteAnimation when it's made sets its box
  const wx = e.x, wy = e.y;
  // waiting, holding Sonic, or done (Task_HookRail_Shared0, Shared1 and Type2_1: drawn where it stopped)
  let phase = 'waiting', acc = 0, vel = 0, startX = 0, lower = false, endX = 0, endY = 0;

  // it takes him (moveState = MOVESTATE_IA_OVERRIDE, then MOVESTATE_STOOD_ON_OBJ on it)
  function take(p, x, y, facing) {
    p.x = x; p.y = y;
    p.carried = true; p.air = false; p.facing = facing; p.airLock = false; p.pushing = false;
    p.grinding = false; p.ignoreInput = false;
    p.rotation = 0; p.ysp = 0; p.state = 'hook';
    standUp(p);   // PLAYERFN_CHANGE_SHIFT_OFFSETS(6, 14): out of a ball, his centre goes up 5 px
    p.onObject = o;
  }
  function takes(p) {
    if (p.dead || (p.onObject && p.onObject !== o) || !o.boxes[0]) return false;
    return overlap(wx, wy, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY]);
  }
  // it lets him go at the rail's end, walking at its speed
  function letGo(p, world, gsp, rise) {
    world.stopSound(SONG.HOOK_RAIL);
    cancel(p);
    p.carried = false; p.state = 'walk';
    standUp(p);
    p.gsp = gsp / 256; p.y -= rise;
    if (p.onObject === o) p.onObject = null;
  }
  const release = p => { if (p.onObject === o) p.onObject = null; };
  const done = (x, y) => { phase = 'done'; endX = x; endY = y; };

  // Task_HookRail_Type1_2 and Type2_0: down the rail to the right or the left
  function slide(p, world, dir) {
    if (!p.dead) {
      if (p.state !== 'hook') { cancel(p); p.state = 'hook'; }
      p.ysp = 0;
      if (I((q8(p.x) - startX) * dir) > LENGTH) {
        if (dir > 0) { letGo(p, world, acc, 10); p.rotation = 0; done(wx + LENGTH, wy + 240); }
        else { letGo(p, world, -acc, 2); p.facing = -1; done(wx - LENGTH, wy + 240); }
      } else {
        acc += 16; vel += acc;
        p.x = (dir > 0 ? (wx << 8) - (6 << 8) + vel : ((wx + 6) << 8) - vel) / 256;
        p.y = ((wy << 8) + ((dir > 0 ? 36 : 38) << 8) + (vel >> 1)) / 256;
        cancel(p); p.state = 'hook';
      }
      return [Math.floor(p.x) + (dir > 0 ? 5 : -4), Math.floor(p.y) - 36];
    }
    release(p);
    acc += 16; vel += acc;
    const at = [wx + I(vel) * dir, wy + (I(vel) >> 1)];
    if (dir > 0 ? I(vel) > LENGTH : I(startX - ((wx << 8) - vel)) > LENGTH) {
      world.stopSound(SONG.HOOK_RAIL);
      release(p);
      done(wx + LENGTH * dir, wy + 240);
    }
    return at;
  }

  // Task_HookRail_Type0_2: up to the left, then back along the lower rail
  function climb(p, world) {
    if (!p.dead) {
      if (p.state !== 'hook') { cancel(p); p.state = 'hook'; }
      p.ysp = 0;
      if (lower) {
        acc += 20; vel += acc;
        p.x = ((wx << 8) - (6 << 8) + vel) / 256;
        p.y = (((wy + 276) << 8) + (vel >> 1)) / 256;
        // Task_HookRail_Shared1 from here, in the asm (the decompilation's C has Shared0)
        if (I(vel) > 2) { letGo(p, world, acc, 10); done(wx, wy + 240); }
      } else {
        acc = Math.max(acc - 9, MAX_CLIMB);
        vel += acc;
        p.x = ((wx << 8) - (6 << 8) + vel) / 256;
        p.y = (((wy + 38) << 8) - (vel >> 1)) / 256;
        if (I(q8(p.x) - startX) < -TURN) lower = true;
      }
      return [Math.floor(p.x) + 5, Math.floor(p.y) - 36];
    }
    let y;
    if (lower) {
      acc += 20; vel += acc;
      y = wy + (I(vel) >> 1) + 240;
      if (I(vel) > 2) { world.stopSound(SONG.HOOK_RAIL); release(p); done(wx, wy + 240); }
    } else {
      acc = Math.max(acc - 9, MAX_CLIMB);
      vel += acc;
      if (I((wx << 8) + vel - startX) < -TURN) lower = true;
      y = wy - I(vel >> 1);
    }
    return [wx + I(vel), y];
  }

  return {
    run(ctx) {
      const p = ctx.player;
      let at = [wx, wy];
      if (phase === 'waiting') {
        if (takes(p)) {
          // Task_HookRail_Type0, Type1 and Type2
          cancel(p);
          const gsp = Math.abs(q8(p.gsp));
          if (type === 1) { take(p, wx - 6, wy + 36, 1); acc = Math.max(gsp, 256); }
          else if (type === 2) { take(p, wx, wy + 38, -1); acc = gsp; }
          else { take(p, wx, wy + 36, 1); acc = -gsp; }
          startX = q8(p.x);
          ctx.world.playSound(SONG.HOOK_RAIL);
          phase = 'holding';
        }
      } else if (phase === 'holding') at = type === 0 ? climb(p, ctx.world) : slide(p, ctx.world, type === 1 ? 1 : -1);
      else at = [endX, endY];
      if (offCam(at[0], at[1], ctx.cam)) {
        release(ctx.player);
        slot.live = null;
        return false;
      }
      ctx.draw(o, at[0], at[1]);
      return true;
    },
  };
}
