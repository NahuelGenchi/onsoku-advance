// Angel Island Zone's run wheels (SAT-R decompilation, src/game/sa1/stage/interactables/run_wheel.c), kind
// 86: a wheel on a track that Sonic stands on and runs on the spot to drive. It goes along its track (d0 × 45°
// from the right, clockwise) as far as d2 × 16.875 px of travel allows; on the track that is 2 px for every
// 12.5 px of travel, and 1 px each way on a diagonal one, since the original rounds the direction down to a
// whole number of pixels first. Running forward drives it at twice his speed less 1/8 px, up to 11.125 px a
// frame; standing still or running back lets it roll back, and pulls him back with it a quarter pixel a
// frame faster every frame, up to 9 px a frame. Off it, it rolls back to its start, 12/256 px a frame faster
// every frame. It is solid when he isn't on it; landing on it gives him its speed, and jumping off it keeps
// at most 1.125 px a frame of his speed across. Knuckles climbing it finds it only solid, and while he stands on
// it climbing it doesn't move.

import { makeSprite, startAnim, animate, offCam, offDisplay } from './objects.js';
import { platform, LANDED } from './collide.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';
import { climbing } from './player.js';

export const RUN_WHEEL = 86;
const TRAVEL = 4320;   // d2's unit of travel, in 1/256 px
const MAX_SPEED = 2848, PULL = 64, MIN_GROUND = -2304, MAX_GROUND = 1152, ATTACK_MAX = 0x240, JUMP_MAX = 288;
const s16 = v => (v << 16) >> 16;

/** The task for a run wheel entity, or null when `e` is not one. */
export function createRunWheel(e, slot, anims) {
  if (e.kind !== RUN_WHEEL) return null;
  // variant 1 turns forward, variant 0 back
  const o = { ...makeSprite('runWheel'), x: e.x, y: e.y };
  animate(o, anims);
  const theta = (e.d[0] << 7) & 1023;
  const dx = Math.trunc(SINE[theta + 256] / 6000), dy = Math.trunc(SINE[theta] / 6000);
  const reach = e.d[2] * TRAVEL;
  // how far along it is and its speed (qUnk40, qUnk44), its speed on the last frame he drove it (unk48)
  // and the frames since he landed on it or left it (unk4C), which time its sound
  let along = 0, speed = 0, last = 0, count = 0;

  function turn(name) { startAnim(o, name, true); }

  // the sound of it turning: slow, medium and fast
  function sound(world) {
    count = (count + 1) & 0xFFFF;
    if ((speed + 1279) >>> 0 < 2559) {
      if (speed !== 0 && count % 25 === 0) world.playSound(SONG.RUN_WHEEL_SLOW);
    } else if ((speed + 0x81F) >>> 0 < 0x103F) {
      if (count % 16 === 0) world.playSound(SONG.RUN_WHEEL_MEDIUM);
    } else if (count % 8 === 0) world.playSound(SONG.RUN_WHEEL_FAST);
  }

  // Sonic not on it (sub_808EA80): it is solid, and rolls back
  function free(p, world) {
    // Knuckles climbing it finds it only solid
    if (!p.dead && climbing(p)) platform(o, o.boxes[0], p, world.terrain);
    else if (!p.dead && platform(o, o.boxes[0], p, world.terrain) & LANDED) {
      last = 0; count = 0;
      p.gsp = speed / 256;
      p.carried = false;
    }
    o.anim.speed = Math.abs(Math.trunc(speed / 28));
    speed -= 12;
    along += speed;
    if (along > reach) along = reach;
    if (along < 0) { along = 0; speed = 0; }
    const name = speed >= 0 ? 'runWheel' : 'runWheelBack';
    if (o.anim.name !== name) turn(name);
    sound(world);
  }

  // Sonic on it (sub_808EC84): he runs on the spot on its top, and drives it
  function driven(p, world) {
    if (p.state === 'hurt' || p.dead) { p.onObject = null; return; }
    // Knuckles climbing it finds it only solid, and it doesn't move
    if (climbing(p)) { platform(o, o.boxes[0], p, world.terrain); return; }
    p.y = o.y + o.boxes[0][1] - p.offsetY;
    if (p.air || p.attack !== 0) {
      count = 0;
      if (p.air) {
        p.onObject = null;
        p.xsp = Math.min(Math.max(Math.round(p.xsp * 256), -JUMP_MAX), JUMP_MAX) / 256;
      } else if (platform(o, o.boxes[0], p, world.terrain) & LANDED) {
        p.gsp = Math.min(Math.max(Math.round(p.gsp * 256), -ATTACK_MAX), ATTACK_MAX) / 256;
      }
    } else p.x = o.x - p.xsp;
    o.anim.speed = Math.abs(Math.trunc(speed / 28));
    const gsp = Math.round(p.gsp * 256);
    speed = gsp - 16;
    if (speed > 0) speed *= 2;
    if (speed > MAX_SPEED) speed = MAX_SPEED;
    along += speed;
    if (along > reach) {
      along = reach;
      if (speed < 0) speed = 0;
    }
    // rolling back, it pulls him back faster and faster, unless he is sliding
    let g = gsp;
    if (speed < 0 && g <= 0 && p.attack !== 3) g -= PULL;
    const before = s16(g);
    g = g < MIN_GROUND ? MIN_GROUND : before > MAX_GROUND ? MAX_GROUND : before;
    if (along < 0) {
      along = 0; speed = 0;
      if (p.attack === 0 && before < 0) g = 0;
      turn('runWheel');
    }
    p.gsp = g / 256;
    // it starts its turning over every frame its speed and its last are 0
    if (speed >= 0) { if (last <= 0) turn('runWheel'); }
    else if (last >= 0) turn('runWheelBack');
    sound(world);
    last = speed;
  }

  return {
    run(ctx) {
      const p = ctx.player, step = Math.trunc(along / 3200);
      o.x = e.x + dx * step; o.y = e.y + dy * step;
      if (offDisplay(e.x, e.y, ctx.cam) && offCam(o.x, o.y, ctx.cam)) { slot.live = null; return false; }
      if (p.onObject === o) driven(p, ctx.world);
      else free(p, ctx.world);
      if (speed !== 0) animate(o, anims);
      ctx.draw(o, o.x, o.y);
      return true;
    },
  };
}
