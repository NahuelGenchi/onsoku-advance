// Angel Island Zone's boss, Mecha Knuckles (SAT-R decompilation, src/game/sa1/stage/enemies/boss_5_mecha_knuckles.c),
// enemy 26 of act 2. It walls Sonic into a screen-wide arena from its spawn point, wakes up, and then picks one
// attack after another: a spin jump that turns into a glide, a spin dash across the arena, a punch up close, and
// once it is down to half its lives, a homing rocket from its arm. A hit from Sonic's attack box knocks it back;
// standing still it covers up instead. Beaten, it falls apart, Eggman flies off in the Eggmobile and the arena
// opens to the right, where the original makes the capsule that ends the act (CreateBossCapsule).
//
// Its position is kept in 1/256 px from its spawn point (qx, qy), its speeds and accelerations as the original's
// s16 values. Each state comes from the table below (sBoss5ProcData): what it does each frame, what it does as it
// starts, its speeds and timer, how it faces and moves (`flags`), its half width and height for the arena's edges
// and the floor, and its animation in each phase. A state's frame function returns false to go to `next`.
//
// The original's quirks are kept: the sixth of its parts, a second leg, is never made (an original-game bug, issue #56);
// Sonic's body on its box 1 hurts him, but even when he can't be hurt that frame it can't be hit back.

import { makeSprite, startAnim, animate } from './objects.js';
import { overlap } from './collide.js';
import { scan, PROBE_FLOOR, LAYER_BACK } from './terrain.js';
import { sin8, cos8 } from './trig.js';
import { screenShake, SCREEN_SHAKE, SHAKE } from './screenshake.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { SONG } from '../sound/songs.js';

export const MECHA_KNUCKLES = 26;

const Q = v => v * 256;
const I = v => v >> 8;
const s16 = v => (v << 16) >> 16;
const q8 = v => Math.round(v * 256);

const ACTIVATE = 0, WAIT = 1, WAITED = 2, ACTIVATE_2 = 3, IDLE = 4, IDLE_2 = 5, SPIN = 6, GLIDE = 7, LAND = 8,
  LAND_2 = 9, COVER = 10, SPINDASH = 11, SPIN_2 = 12, PUNCH = 13, PUNCH_2 = 14, LAUNCH_ROCKET = 15,
  LAUNCH_ROCKET_2 = 16, HIT = 17, HIT_2 = 18, DEFEATED = 19, DEFEATED_2 = 20, DEFEATED_3 = 21, EGGMOBILE = 22,
  EGGMOBILE_2 = 23, EGGMOBILE_3 = 24;

// flags88: what the frame found, and how the state moves
const GROUND = 0x1, CEILING = 0x2, LEFT_EDGE = 0x4, RIGHT_EDGE = 0x8;
const AIRBORNE = 0x10;          // the floor only catches it once it is inside it
const SHOWN = 0x20, EGGMAN = 0x40;   // its sprite, and Eggman's, are drawn
const FACE_SIDE = 0x100, FACE_SONIC = 0x200, KEEP_FACING = 0x400;   // faces away from its side of the arena, or Sonic
const AWAY_SIDE = 0x800, AWAY_SONIC = 0x1000, KEEP_SPEEDS = 0x2000;  // its speeds point that way too
const STOP_X = 0x4000, STOP_Y = 0x8000;   // a speed that changes sign stops, with its acceleration
const NO_TERRAIN = 0x02000000, NO_EDGES = 0x04000000;

// the music manager's states it sets (gMusicManagerState.unk1): the boss intro, then Mecha Knuckles' own
// song, and after the fight the act's music again
const MUSIC_INTRO = 0x11, MUSIC_FIGHT = 0x12, MUSIC_AFTER = 0x32;

const S = (fn, enter, vx, vy, ax, ay, timer, flags, w, h, a, b = a) => ({ fn, enter, vx, vy, ax, ay, timer, flags, w, h, anims: [a, b] });
const none = () => true;

// the frame functions (sub_804EEA8 and the rest), with `b` the boss and `c` the context
const STATES = [];
const DEFINE = () => [
  // ACTIVATE: the arena's left edge follows the camera and its top and bottom close in a pixel a frame on the
  // screen above the spawn point, until Sonic is 32 px past it
  S((b, c) => {
    const cam = c.world.camera;
    cam.minX = cam.x;
    closeIn(b, cam);
    if (Math.floor(c.player.x) >= b.spawnX + 32) return go(b, WAIT);
    return true;
  }, (b, c) => {
    const cam = c.world.camera;
    cam.maxX = b.spawnX; cam.minY = cam.y; cam.maxY = cam.y;
    // the arena's walls, which the widescreen view doesn't show past (camera.js viewOf): the screen right of the
    // spawn point and above it
    cam.arena = { minX: b.spawnX, maxX: b.spawnX + SCREEN_W, minY: b.spawnY - SCREEN_H, maxY: b.spawnY };
    b.flags |= SHOWN;
  }, 0, 0, 0, 0, 0, 0, 6, 14, 'mkActivate', null),
  // WAIT: Sonic stands still, facing right, while the left edge creeps up to the spawn point
  S((b, c) => {
    const cam = c.world.camera;
    if (cam.minX < b.spawnX) cam.minX++;
    closeIn(b, cam);
    if (b.spawnX <= cam.minX && b.spawnY >= cam.maxY + SCREEN_H) return go(b, WAITED);
    return true;
  }, (b, c) => {
    const p = c.player, cam = c.world.camera;
    cam.minX = cam.x;
    p.gsp = 0; p.xsp = 0; p.ysp = 0;
    p.ignoreInput = true; p.facing = 1; p.jumpPressed = false;
    clearPresses(c);
  }, 0, 0, 0, 0, 0, 0, 6, 14, null, null),
  S((b, c) => go(b, ACTIVATE_2), none, 0, 0, 0, 0, 0, 0, 6, 14, null, null),
  S((b, c) => (b.s.anim.done ? go(b, IDLE) : true), none, 0, 0, 0, 0, 0, 0, 6, 14, 'mkActivateEnd', null),
  // IDLE: Sonic is taken aback (charState 39) until his animation ends, and then has his controls back, the
  // jump and attack buttons he holds then not counting as presses
  S((b, c) => {
    const p = c.player;
    if (!p.anim.done) return true;
    p.ignoreInput = false; p.scripted = false; p.state = 'idle';
    clearPresses(c);
    return go(b, IDLE_2);
  }, (b, c) => {
    c.player.state = 'react'; c.player.scripted = true;
    c.world.musicState(MUSIC_INTRO);
  }, 0, 0, 0, 0, 0, 0, 6, 14, 'mkIdle', null),
  S((b, c) => (timer(b) ? go(b, choose(b, c)) : true), none, 0, 0, 0, 0, 0x5A, FACE_SONIC, 6, 14, 'mkIdle', 'mkIdleB'),
  S((b, c) => (b.vy >= 0 ? go(b, GLIDE) : true), (b, c) => c.world.playSound(SONG.JUMP),
    0, s16(0xFB20), 0, 42, 0, FACE_SONIC | AIRBORNE, 6, 9, 'mkSpin', 'mkSpinB'),
  // GLIDE: its fall eases toward 0.5 px a frame; it lands at an edge of the arena or 32 px past Sonic
  S((b, c) => {
    b.vy = s16(b.vy < 0x80 ? b.vy + 0x18 : b.vy - 0x18);
    const dx = Math.floor(c.player.x) - (b.spawnX + I(b.qx));
    if ((b.flags & (LEFT_EDGE | RIGHT_EDGE)) || (b.vx < 0 && dx > 32) || (b.vx > 0 && dx < -32)) return go(b, LAND);
    return true;
  }, none, 0x300, 0x180, 3, 0, 0, AWAY_SONIC | FACE_SONIC | AIRBORNE, 6, 6, 'mkGlide', 'mkGlideB'),
  S((b, c) => (b.flags & GROUND ? go(b, LAND_2) : true), none, 0, 0, 0, 42, 0, AIRBORNE, 6, 14, 'mkLand', 'mkLandB'),
  S((b, c) => (b.s.anim.done ? go(b, choose(b, c)) : true), none, 0, 0, 0, 0, 0, 0, 6, 14, 'mkLandEnd', 'mkLandEndB'),
  S((b, c) => (b.s.anim.done ? go(b, choose(b, c)) : true), none, 0, 0, 0, 0, 0, AWAY_SONIC | FACE_SONIC, 6, 14, 'mkCover', 'mkCoverB'),
  S((b, c) => (timer(b) ? go(b, SPIN_2) : true), (b, c) => c.world.playSound(SONG.SPIN),
    0, 0, 0, 0, 0x3C, AWAY_SIDE | FACE_SIDE, 6, 9, 'mkSpinDash', 'mkSpinDashB'),
  S((b, c) => (b.flags & (LEFT_EDGE | RIGHT_EDGE) ? go(b, IDLE_2) : true), (b, c) => c.world.playSound(SONG.SPIN_DASH_RELEASE),
    0x480, 0, 0, 0, 0, KEEP_SPEEDS | KEEP_FACING, 6, 9, 'mkSpin', 'mkSpinB'),
  S((b, c) => (b.s.anim.done ? go(b, PUNCH_2) : true), none, 0, 0, 0, 0, 0, FACE_SONIC, 6, 14, 'mkPunch'),
  S((b, c) => (b.s.anim.done ? go(b, choose(b, c)) : true), none, 0, 0, 0, 0, 0, FACE_SONIC, 6, 14, 'mkPunchEnd'),
  S((b, c) => (b.s.anim.done ? go(b, LAUNCH_ROCKET_2) : true), none, 0, 0, 0, 0, 0, AWAY_SONIC | FACE_SONIC, 6, 14, 'mkLaunch'),
  // the rocket goes off with its sound and two screen shakes, up and down and side to side, and the recoil
  // pushes Mecha Knuckles back until it stops
  S((b, c) => (b.s.anim.done ? go(b, choose(b, c)) : true), (b, c) => {
    c.add(rocket(b, c), 0x2001);
    c.world.playSound(SONG.ROCKET);
    c.add(screenShake(0x200, 0x10, 0x100, -1, SHAKE.VERTICAL), SCREEN_SHAKE);
    c.add(screenShake(0x400, 0x10, 0x80, -1, SHAKE.HORIZONTAL), SCREEN_SHAKE);
  }, s16(0xFB80), 0, 96, 0, 0, STOP_X | KEEP_SPEEDS | KEEP_FACING, 6, 14, 'mkLaunchEnd'),
  // HIT: knocked up and away from Sonic; on the hit that leaves it at half its lives it flies at half the
  // gravity, smoking, and the second phase starts as it lands
  S((b, c) => {
    if (b.lives === b.half) debris(b, c);
    return b.flags & GROUND ? go(b, HIT_2) : true;
  }, b => {
    if (b.lives === b.half) { b.ax >>= 1; b.ay >>= 1; }
  }, s16(0xFE80), s16(0xFD00), 0, 42, 0, AWAY_SONIC | FACE_SONIC | AIRBORNE, 6, 9, 'mkHit', 'mkHitB'),
  S((b, c) => {
    if (b.lives === b.half) debris(b, c);
    return b.s.anim.done ? go(b, choose(b, c)) : true;
  }, (b, c) => {
    if (b.lives === b.half) { b.phase = 1; c.world.musicState(MUSIC_FIGHT); }
  }, 0, 0, 0, 0, 0, 0, 6, 9, 'mkGround', 'mkHitB'),
  // DEFEATED: 1000 points; it bounces off the arena's sides as it falls, smoking
  S((b, c) => {
    debris(b, c);
    if (b.flags & LEFT_EDGE) b.vx = -b.vx;
    if (b.flags & RIGHT_EDGE) b.vx = -b.vx;
    return b.flags & GROUND ? go(b, DEFEATED_2) : true;
  }, (b, c) => c.world.addScore(1000),
  s16(0xFE80), s16(0xFD00), 0, 21, 0, AWAY_SONIC | FACE_SONIC | AIRBORNE, 6, 9, 'mkDefeated'),
  S((b, c) => {
    debris(b, c);
    return timer(b) ? go(b, DEFEATED_3) : true;
  }, none, 0, 0, 0, 0, 0x78, 0, 6, 9, 'mkDefeatedEnd'),
  // it falls apart on the next explosion
  S((b, c) => {
    if (!debris(b, c)) return true;
    for (let v = 0; v < 5; v++) c.add(part(b, v, c), 0x4001);
    return go(b, EGGMOBILE);
  }, none, 0, 0, 0, 0, 0x78, 0, 6, 14, 'mkDefeatedEnd'),
  // EGGMOBILE: Eggman comes in from the right of the arena, which opens up to the act's end as the left edge
  // follows the camera; he laughs once it is all on screen, and turns and flies off to the right
  S((b, c) => {
    const cam = c.world.camera;
    opening(cam);
    if (b.spawnX + I(b.qx) + 32 <= cam.x + SCREEN_W && cam.minX >= cam.maxX) return go(b, EGGMOBILE_2);
    return true;
  }, (b, c) => {
    b.qx = Q(272); b.qy = -Q(100);
    const cam = c.world.camera;
    cam.maxX = c.world.terrain.width - SCREEN_W;
    if (cam.arena) cam.arena.maxX = c.world.terrain.width;
    b.s.flipX = false; b.s2.flipX = false;
    startAnim(b.s2, 'eggmanSeated', true);
    b.flags |= EGGMAN;
  }, 0, 0, 0, 0, 0, NO_TERRAIN | NO_EDGES, 0, 0, 'eggMobile'),
  S((b, c) => {
    opening(c.world.camera);
    if (!b.s.anim.done) return true;
    c.world.bossDefeated(b.spawnX + I(b.qx), b.spawnY + I(b.qy));
    c.world.musicState(MUSIC_AFTER);
    return go(b, EGGMOBILE_3);
  }, b => {
    b.s.flipX = false;
    startAnim(b.s2, 'eggmanLaugh', true);
  }, 0, 0, 0, 0, 0, NO_TERRAIN | NO_EDGES, 0, 0, 'eggMobileEnd'),
  S((b, c) => {
    const cam = c.world.camera;
    opening(cam);
    if (b.spawnX + I(b.qx) >= cam.maxX + SCREEN_W + 32) { b.flags &= ~(SHOWN | EGGMAN); b.ended = true; }
    return true;
  }, b => {
    b.s.flipX = true;
    startAnim(b.s2, 'eggmanTurn', true);
  }, 0x400, 0, 0, 0, 0, NO_TERRAIN | NO_EDGES, 0, 0, 'eggMobile'),
];

const go = (b, state) => { b.next = state; return false; };
// a timer state's countdown: it goes on once the timer has run down past 0
function timer(b) {
  const t = s16(b.timer);
  b.timer = (b.timer - 1) & 0xFFFF;
  return t <= 0;
}
// the top and bottom of the arena close in a pixel a frame on the screen above the spawn point
function closeIn(b, cam) {
  if (cam.maxY + SCREEN_H > b.spawnY) cam.maxY--;
  else if (cam.maxY + SCREEN_H < b.spawnY) cam.maxY++;
  if (cam.minY > b.spawnY - SCREEN_H) cam.minY--;
  else if (cam.minY < b.spawnY - SCREEN_H) cam.minY++;
}
// the left edge moves a pixel a frame toward the act's right end, and never shows more than the camera does;
// the widescreen view's left wall goes with it
function opening(cam) {
  if (cam.minX < cam.maxX) cam.minX++;
  if (cam.minX < cam.x) cam.minX = cam.x;
  if (cam.arena) cam.arena.minX = cam.minX;
}
// what the player reads once his controls change hands: no fresh press of jump or attack
function clearPresses(c) {
  c.input.jumpPressed = false; c.input.attackPressed = false; c.input.boostPressed = false;
}

// sub_804ED80: the next attack, by how far Sonic is and the game's random numbers
function choose(b, c) {
  const p = c.player, dx = Math.abs(Math.floor(p.x) - (b.spawnX + I(b.qx))), r = c.world.random();
  if (b.phase === 0) {
    if (dx < 80) {
      if (dx < 32) return p.air ? SPIN : PUNCH;
      if (r & 0x1000) return IDLE_2;
    }
    return r & 0x100 ? SPINDASH : SPIN;
  }
  if (dx >= 80 && (r & 0x3000)) return LAUNCH_ROCKET;
  if (dx < 80 && p.air) return SPIN;
  return r & 0x100 ? SPINDASH : SPIN;
}

// sub_804E8D4: a state starts. Its flags replace the old ones, but for the facing and speed modes a state
// that keeps them leaves as they were; its speeds point away from its side of the arena or from Sonic, and it
// turns to face that way. A new animation starts over, with both hitboxes cleared until its script sets them.
function enter(b, state, c) {
  const d = STATES[state], t = d.flags, p = c.player;
  let f = b.flags;
  if (!(t & KEEP_FACING)) f = (f & ~0x700) | (t & 0x300);
  if (!(t & KEEP_SPEEDS)) f = (f & ~0x3800) | (t & 0x1800);
  f |= t & (KEEP_FACING | KEEP_SPEEDS);
  const copied = AIRBORNE | STOP_X | STOP_Y | NO_TERRAIN | NO_EDGES;
  f = (f & ~copied) | (t & copied);
  if (f & AIRBORNE) f &= ~GROUND;
  b.flags = f;
  b.timer = d.timer;
  b.w = d.w;
  // its height changes about its feet
  if (d.h !== b.h) { b.qy -= Q(b.h - d.h); b.h = d.h; }
  const bx = b.spawnX + I(b.qx), px = Math.floor(p.x);
  let vx = d.vx, ax = d.ax;
  const side = f & (AWAY_SIDE | AWAY_SONIC);
  if ((side === AWAY_SIDE && I(b.qx) > 0x77) || (side === AWAY_SONIC && bx >= px)) { vx = -vx; ax = -ax; }
  b.vx = vx; b.vy = d.vy; b.ax = ax; b.ay = d.ay;
  const facing = f & (FACE_SIDE | FACE_SONIC);
  if (facing === FACE_SIDE) b.s.flipX = !(I(b.qx) > 0x77);
  else if (facing === FACE_SONIC) b.s.flipX = !(bx >= px);
  const anim = d.anims[b.phase];
  if (anim !== null && anim !== b.s.anim.name) { startAnim(b.s, anim, true); b.s.boxes = [null, null]; }
  d.enter(b, c);
}

// sub_804EB04: it moves, then its speeds change by their accelerations
function move(b) {
  b.qx += b.vx; b.qy += b.vy;
  let vx = b.vx + b.ax;
  if ((b.flags & STOP_X) && (b.vx < 0) !== (vx < 0)) { vx = 0; b.ax = 0; }
  b.vx = s16(vx);
  let vy = b.vy + b.ay;
  if ((b.flags & STOP_Y) && (b.vy < 0) !== (vy < 0)) { vy = 0; b.ay = 0; }
  b.vy = s16(vy);
}

// sub_804FDD4: it stays inside the arena, the screen-wide strip from its spawn point, 6 px in from its sides
function edges(b) {
  b.flags &= ~(LEFT_EDGE | RIGHT_EDGE);
  let d = I(b.qx) - b.w - 6;
  if (d < 0) { b.qx -= Q(d); b.flags |= LEFT_EDGE; }
  d = I(b.qx) + b.w - 234;
  if (d > 0) { b.qx -= Q(d); b.flags |= RIGHT_EDGE; }
}

// sub_804EB90: the back layer's floor under its feet catches it within 10 px, or once it is in it while it is
// airborne; rising, a ceiling above its head stops it going further
function terrain(b, c) {
  const t = c.world.terrain, x = b.spawnX + I(b.qx), y = b.spawnY + I(b.qy);
  b.flags &= ~GROUND;
  let d = scan(t, y + b.h, x, LAYER_BACK, 8, PROBE_FLOOR).d;
  if (b.flags & AIRBORNE ? d < 0 : d <= 10) { b.qy += d << 8; b.flags |= GROUND; }
  b.flags &= ~CEILING;
  if (b.vy < 0) {
    d = scan(t, y - b.h, x, LAYER_BACK, -8, PROBE_FLOOR).d;
    if (d < 0) { b.qy -= Q(d); b.flags |= CEILING; }
  }
}

// sub_8017540: an explosion that runs its animation once where it is (a nuts-and-bolts task that doesn't
// move), flipped by the game's random numbers
function explosion(qx, qy, order, c) {
  const r = c.world.random();
  const s = makeSprite('explosion', { flipX: (r & 0x400) !== 0, flipY: (r & 0x800) !== 0, order });
  return {
    run(c) {
      const x = I(qx), y = I(qy), sx = x - c.cam.x, sy = y - c.cam.y;
      if (sx < -32 || sx > SCREEN_W + 32 || sy - 32 > SCREEN_H) return false;
      if (animate(s, c.anims)) return false;
      c.draw(s, x, y);
      return true;
    },
  };
}

// sub_804EE20: on every eighth frame of the stage clock, an explosion within 16 px of it, just in front of it
function debris(b, c) {
  if (c.world.tick & 7) return false;
  const ox = ((c.world.random() & 0x1FFF00) >> 8) - 4096, oy = ((c.world.random() & 0x1FFF00) >> 8) - 4096;
  c.add(explosion(b.qx + Q(b.spawnX) + ox, b.qy + Q(b.spawnY) + oy, 19, c));
  return true;
}

// the rocket (CreateMechaKnucklesRocket): off the arm the way Mecha Knuckles faces at 0.25 px a frame, it
// speeds up along its heading after 16 frames, at one of two rates, and from its 25th frame turns 3/256 of a
// turn a frame toward where it would cross Sonic. It leaves brake dust behind it, explodes on his body, and
// goes once it is off the screen; its sound stops as it goes.
function rocket(b, c) {
  const flipped = b.s.flipX;
  let qx = Q(b.spawnX) + b.qx, qy = Q(b.spawnY) + b.qy - Q(6);
  let vx = flipped ? 0x40 : -0x40, vy = 0, turn = c.world.random() & 0x1000 ? 0x20 : 0x40, age = 0, heading = flipped ? 0 : 0x80;
  const s = makeSprite('mkRocket', { order: 21 }), scaleX = flipped ? -256 : 256;
  return {
    run(c) {
      const p = c.player;
      let a = heading & 0xFF;
      if (age > 0x18) {
        // the height it would be at across the distance to Sonic, against how far below it he is (C's
        // truncating division, of a product that can overflow; a zero divisor is taken as giving 0, unchecked)
        const dy = q8(p.y) - qy;
        const num = Math.imul(vy + sin8(a) * 8, Math.abs(q8(p.x) - qx)), den = Math.abs(vx + cos8(a) * 8);
        const at = den === 0 ? 0 : Math.trunc(num / den);
        if (at < dy - Q(8)) a += vx > 0 ? 3 : -3;
        else if (at > dy) a += vx > 0 ? -3 : 3;
        heading = a &= 0xFF;
      }
      qx += vx; qy += vy;
      if (age > 16) {
        vx = s16(vx + ((turn * cos8(a)) >> 8));
        vy = s16(vy + ((turn * sin8(a)) >> 8));
      }
      const x = I(qx), y = I(qy);
      if (s.boxes[0] && !p.dead && p.boxes[0] && overlap(x, y, s.boxes[0], Math.floor(p.x), Math.floor(p.y), p.boxes[0])) {
        c.world.damage();
        c.add(explosion(qx + ((Q(21) * cos8(a)) >> 8), qy + ((Q(21) * sin8(a)) >> 8), 20, c));
        c.world.stopSound(SONG.ROCKET);
        return false;
      }
      const sx = x - c.cam.x, sy = y - c.cam.y;
      const back = (c.world.random() & 0x3FF) - Q(26);
      c.world.brakeDust(I(qx + ((back * cos8(a)) >> 8)), I(qy + ((back * sin8(a)) >> 8)));
      if ((sx + 32) >>> 0 >= SCREEN_W + 64 || (sy + 64) >>> 0 >= SCREEN_H + 128) { c.world.stopSound(SONG.ROCKET); return false; }
      age++;
      const rotation = (((scaleX < 0 ? a + 0x80 : a) + 0x80) * 4) & 0x3FF;
      animate(s, c.anims);
      c.draw(s, x, y, { rotation, scaleX, scaleY: 256, double: false });
      return true;
    },
  };
}

// one of the pieces it falls apart into (CreateMechaKnucklesParts): thrown up and to either side with its own
// gravity and spin, the spin slowing by 8 a frame, until it leaves the screen's sides or bottom
function part(b, variant, c) {
  const R = () => c.world.random();
  let qx = Q(b.spawnX) + b.qx, qy = Q(b.spawnY) + b.qy;
  let vx = ((R() << 13) >>> 21) - Q(4);
  let vy = -((R() << 15) >>> 23) - Q(2);
  const ay = s16(42 - ((R() & 0x1F00) >> 8));
  let rot = s16(R() >>> 8);
  let spin = ((R() << 12) >>> 20) - Q(8);
  const s = makeSprite(`mkPart${variant}`, { order: 19 });
  return {
    run(c) {
      qx += vx; qy += vy;
      vy = s16(vy + ay);
      rot = s16(rot + spin);
      if (spin > 0) spin = Math.max(0, spin - 8);
      else if (spin < 0) spin = Math.min(0, spin + 8);
      const sx = I(qx) - c.cam.x, sy = I(qy) - c.cam.y;
      if ((sx + 32) >>> 0 > 0x12F || sy > 0xDF) return false;
      animate(s, c.anims);
      c.draw(s, I(qx), I(qy), { rotation: (rot & 0xFFFF) >> 6, scaleX: 256, scaleY: 256, double: false });
      return true;
    },
  };
}

/**
 * CreateEntity_MechaKnuckles: the boss's task for enemy 26, at 208 px right of its spawn point and 32 px above
 * it, with 8 lives (on the normal difficulty, the only one this game has: the original takes 2 off for each
 * level of its difficulty setting) and its second phase from 4 lives. It makes scattered rings bounce off
 * ceilings until the act starts over. Once spawned it never spawns again in the act.
 */
export function createMechaKnuckles(e, slot, anims, ctx) {
  if (!STATES.length) STATES.push(...DEFINE());
  const b = {
    spawnX: e.x, spawnY: e.y, qx: Q(208), qy: -Q(32), vx: 0, vy: 0, ax: 0, ay: 0, timer: 0, flags: 0,
    phase: 0, lives: 8, half: 4, blink: 0, w: 0, h: 0, state: ACTIVATE, next: ACTIVATE, ended: false,
    hidden: false,   // drawn as an OBJ window this frame: the hit blink, which shows nothing in its place
    s: makeSprite(null, { order: 20 }), s2: makeSprite(null, { order: 20 }),
  };
  enter(b, b.state, ctx);
  ctx.world.scatterOffCeilings();
  slot.gone = true;

  return {
    boss: b,
    run(c) {
      const p = c.player;
      if (!p.dead) b.hidden = false;
      let going = STATES[b.state].fn(b, c);
      move(b);
      if (!(b.flags & NO_EDGES)) edges(b);
      if (!(b.flags & NO_TERRAIN)) terrain(b, c);

      // Sonic's body on its box 1 hurts him (sub_800BFEC), and only when that found nothing, and it isn't
      // blinking, his attack box on its box 0 knocks him back (sub_800C0E0) and hits it, unless it stands
      // guard and he is on the ground, when it covers up
      const bx = b.spawnX + I(b.qx), by = b.spawnY + I(b.qy), px = Math.floor(p.x), py = Math.floor(p.y), s = b.s;
      const touches = (box, pbox) => box && pbox && !p.dead && overlap(bx, by, box, px, py, pbox);
      if (touches(s.boxes[1], p.boxes[0])) c.world.damage();
      else if (b.blink <= 0 && touches(s.boxes[0], p.boxes[1])) {
        p.xsp = -p.xsp; p.ysp = -p.ysp;
        if ((b.state === IDLE_2 || b.state === COVER) && !p.air) {
          if (b.state !== COVER) { going = false; b.next = COVER; p.xsp = -p.xsp; p.gsp = -p.gsp; }
        } else {
          going = false;
          b.next = --b.lives <= 0 ? DEFEATED : HIT;
          b.blink = 0x20;
        }
      }
      // after a hit it blinks for 32 frames, 2 shown and 2 not with the stage clock, the count held while it
      // is knocked back
      if (b.blink !== 0) {
        if (!(c.world.tick & 2) && !p.dead) b.hidden = true;
        if (b.next !== HIT && b.next !== HIT_2) b.blink--;
      }
      if (b.flags & SHOWN) {
        animate(s, c.anims);
        if (!b.hidden) c.draw(s, bx, by);
      }
      if (b.flags & EGGMAN) {
        animate(b.s2, c.anims);
        c.draw(b.s2, bx, by);
      }
      if (!going) { b.state = b.next; enter(b, b.state, c); }
      return !b.ended;
    },
  };
}
