// Super Sonic, the Moon Zone's player (SAT-R decompilation, src/game/sa1/stage/player_super_sonic.c, checked in
// the USA ROM). He flies over the ground the stage scrolls under him, slows to a stop when the pad is let go,
// jumps, and dashes forward with B. The ground he stands on and the ground he lands on are read where the
// scrolling has taken it. His rings run down by one a second from the end of the title card while the Super
// Egg Robo is still standing, and he dies when they are gone. A hit doesn't take rings: it throws him back,
// spinning. He leaves a trail of afterimages and gives off sparkles, and a dash leaves its own trail.
//
// Positions and speeds are the original's 8.8 fixed point integers (`qx`, `qy`, `vx`, `vy`, `gsp`), and his
// input is the GBA's key bits, as his code reads them.

import { makeSprite, startAnim, animate } from './objects.js';
import { scan, PROBE_FLOOR } from './terrain.js';
import { SONG, EXTRA_SONG } from '../sound/songs.js';

// moveState bits
export const IN_AIR = 0x2, DEAD = 0x80, JUMPED = 0x100, HIDDEN = 0x100000, IGNORE_INPUT = 0x200000, IA_OVERRIDE = 0x400000;
export const GOAL_REACHED = 0x8000000;
// the GBA's keys, as heldInput and frameInput hold them
export const KEY_A = 0x1, KEY_B = 0x2, KEY_RIGHT = 0x10, KEY_LEFT = 0x20, KEY_UP = 0x40, KEY_DOWN = 0x80;
// charState: 0 the first frame, 1 dead, 2 flying, 3 dashing, 4 thrown back by a hit (gUnknown_084AE1B0 picks
// the animation by it)
export const CHAR_START = 0, CHAR_DEAD = 1, CHAR_FLY = 2, CHAR_DASH = 3, CHAR_HURT = 4;
const ANIMS = ['superStart', 'superDead', 'superFly', 'superDash', 'superHurt'];

export const START_RINGS = 50;              // EXTRA_BOSS__INITIAL_RING_COUNT
const MAX_X = 480 << 8;                     // he stays in x 0–480
const FLY_ACCEL = 36, FLY_DECEL = 96, AIR_ACCEL = 72, MAX_SPEED = 2 << 8;
const JUMP = 1088, JUMP_RELEASE_CAP = -384, GRAVITY = 32;
const DASH_SPEED = 4 << 8, DASH_DECEL = 64, DASH_WAIT = 8;
const STEP_DOWN = 11;                       // the furthest the ground can drop away under him before he is in the air
const HURT_SPEED = -3 << 8, HURT_FRAMES = 24, HURT_BLINK = 30, HURT_SPIN = 12;
const OFFSET_X = 6, OFFSET_Y = 14;          // spriteOffsetX and Y
const DEAD_GRAVITY = 42, DEAD_BELOW = 240, DEAD_RESTART = 60;   // as Sonic's death (player.c)
const MAX_SPARKLES = 4;
const TRAIL = 16;

// how far the stage has scrolled the ground under a camera at x (RenderMetatileLayers): 8 px a frame, wrapping
// round in the 28 metatiles after the first 72 px
const SCROLL_WRAP = 28 * 96, SCROLL_FROM = 72;
export function groundScroll(camX, tick) {
  let x = camX + tick * 8;
  if (x - SCROLL_FROM >= SCROLL_WRAP) x = ((x - SCROLL_FROM) % SCROLL_WRAP) + SCROLL_FROM;
  return x;
}

export function createSuperSonic({ x, y }) {
  const qx = x << 8, qy = y << 8;
  return {
    qx, qy, vx: 0, vy: 0, gsp: 0,
    rotation: 0,        // u8, turning only while thrown back
    moveState: IGNORE_INPUT,
    charState: CHAR_START,
    knockback: 0,       // unk2A: the frames he is thrown back for
    invulnerable: 0,    // timerInvulnerability
    invincible: 0,      // timerInvincibility, never set on this stage
    drain: 0,           // timerSpeedup: the frames to the next ring lost
    dashWait: 0,        // unk61: the frames before another dash
    dashing: false,     // unk62
    held: KEY_A | KEY_B, pressed: 0,   // as InitializePlayer leaves them
    layer: 1,
    trail: { i: 0, xs: new Array(TRAIL).fill(qx), ys: new Array(TRAIL).fill(qy) },   // the afterimages' ring of positions
    sprite: makeSprite(ANIMS[CHAR_START], { flipX: true, order: 16, prio: 1 }),
    death: null,        // 'falling', then 'gone' with `countdown` frames to the restart
    countdown: 0,
    // what the camera, the HUD's stats and the stage read
    get x() { return this.qx / 256; },
    get y() { return this.qy / 256; },
    get air() { return (this.moveState & IN_AIR) !== 0; },
    get dead() { return (this.moveState & DEAD) !== 0; },
    get xsp() { return this.vx / 256; },
    get state() { return ANIMS[this.charState]; },
    get anim() { return this.sprite.anim; },
    get boxes() { return this.sprite.boxes; },
    offsetY: OFFSET_Y, boost: false,
  };
}

const I = q => q >> 8;

// the lower of the two floor sensors under his feet (sub_801E4E4 down from each), with the ground where the
// scrolling has put it
function floor(p, w) {
  const x = I(p.qx - ((w.cam.x - groundScroll(w.cam.x, w.tick)) << 8)), y = I(p.qy) + OFFSET_Y;
  const a = scan(w.terrain, y, x - 2 - OFFSET_X, p.layer, 8, PROBE_FLOOR).d;
  const b = scan(w.terrain, y, x + 2 + OFFSET_X, p.layer, 8, PROBE_FLOOR).d;
  return Math.min(a, b);
}

// Player_804A0B8: he follows the ground up and down, up to 11 px a frame down; further, he is in the air
export function followGround(p, w) {
  const d = floor(p, w);
  if (d < 0) { if (d >= -STEP_DOWN) p.qy += d << 8; return; }
  if (d > STEP_DOWN) { if (!(p.moveState & GOAL_REACHED)) p.moveState |= IN_AIR; return; }
  p.qy += d << 8;
}

// sub_8049FD0: falling, he lands where a sensor is in the ground (sub_8021BE0 ends the jump and the dash)
function land(p, w) {
  const d = floor(p, w);
  if (d >= 0) return;
  p.qy += d << 8;
  p.gsp = p.vx; p.vy = 0;
  const wait = p.dashWait;
  p.moveState &= ~(JUMPED | IN_AIR);
  p.dashing = false;
  p.dashWait = wait;
}

// x stays in 0–480; at an edge he stops
function clampX(p) {
  const x = Math.min(Math.max(p.qx, 0), MAX_X);
  if (x !== p.qx) { if (!(p.moveState & IN_AIR)) p.gsp = 0; p.vx = 0; }
  p.qx = x;
}

// his code moves him by his speed twice a frame
function move(p) { p.qx += 2 * p.vx; p.qy += 2 * p.vy; }

// sub_8049BAC: B dashes, 8 frames at least after the last
function startDash(p, w) {
  if (p.dashWait !== 0 && --p.dashWait !== 0) return false;
  if (!(p.pressed & KEY_B)) return false;
  p.dashWait = DASH_WAIT; p.dashing = true;
  p.gsp = DASH_SPEED; p.vx = 0; p.vy = 0;
  w.add(dashTrail(p, w), w.priority + 1);
  w.play(SONG.AIR_DASH);
  return true;
}

// a dash slows down by 1/4 px a frame until it stops
function dashStep(p, w) {
  p.gsp -= DASH_DECEL;
  if (p.gsp <= 0) { p.dashing = false; p.vx = 0; p.vy = 0; } else p.vx = p.gsp;
  clampX(p); move(p);
  followGround(p, w);
  p.charState = CHAR_DASH;
}

// Player_SuperSonic_8049AB8: on the ground
function groundStep(p, w) {
  if (p.dashing) { dashStep(p, w); return; }
  if (startDash(p, w)) return;
  if (p.pressed & KEY_A) {
    p.moveState |= IN_AIR | JUMPED;
    p.vy -= JUMP;
    w.play(SONG.JUMP);
    return;
  }
  switch (p.held & (KEY_LEFT | KEY_RIGHT)) {
    case 0:
      if (p.gsp > 0) p.gsp = Math.max(0, p.gsp - FLY_DECEL);
      else if (p.gsp < 0) p.gsp = Math.min(0, p.gsp + FLY_DECEL);
      break;
    case KEY_LEFT: p.gsp = Math.max(-MAX_SPEED, p.gsp - FLY_ACCEL); break;
    case KEY_RIGHT: p.gsp = Math.min(MAX_SPEED, p.gsp + FLY_ACCEL); break;
  }
  p.vx = p.gsp;
  clampX(p); move(p);
  followGround(p, w);
  p.charState = CHAR_FLY;
}

// Player_SuperSonic_8049C0C: in the air; letting go of A cuts a jump short
function airStep(p, w) {
  if (p.dashing) { dashStep(p, w); return; }
  if (startDash(p, w)) return;
  if (!(p.held & KEY_A) && (p.moveState & JUMPED)) p.vy = Math.max(p.vy, JUMP_RELEASE_CAP);
  switch (p.held & (KEY_LEFT | KEY_RIGHT)) {
    case KEY_LEFT: p.vx = Math.max(-MAX_SPEED, p.vx - AIR_ACCEL); break;
    case KEY_RIGHT: p.vx = Math.min(MAX_SPEED, p.vx + AIR_ACCEL); break;
  }
  clampX(p); move(p);
  p.vy += GRAVITY;
  const rot = (p.rotation << 24) >> 24;
  p.rotation = (rot < 0 ? Math.min(0, rot + 2) : rot > 0 ? Math.max(0, rot - 2) : 0) & 0xFF;
  if (p.vy >= 0) land(p, w);
  p.charState = CHAR_FLY;
}

// sub_8049D7C: thrown back, he spins and drifts; otherwise he flies, and every 4th frame may give off a sparkle
// at a random spot near him
function moveStep(p, w) {
  if (p.knockback !== 0) {
    p.rotation = (p.rotation - HURT_SPIN) & 0xFF;
    move(p);
    followGround(p, w);
    return;
  }
  if (p.moveState & IN_AIR) airStep(p, w);
  else groundStep(p, w);
  if (w.tick % 4 !== 0 || !(w.random() & 0x10000)) return;
  const x = p.qx + ((w.random() & 0xF0000) >> 8), y = p.qy + ((w.random() & 0xF0000) >> 8) - (8 << 8);
  sparkle(x, y, (w.random() & 0x10000) !== 0, w);
}

/**
 * Coll_DamageSuperSonic: a hit throws him back for 24 frames, spinning, and he blinks for 30 more frames, in
 * which nothing hurts him. Returns false while he can't be hurt.
 */
export function hurtSuperSonic(p, w) {
  if (p.invincible > 0 || p.invulnerable > 0) return false;
  p.invulnerable = HURT_BLINK;
  p.vx = HURT_SPEED; p.gsp = HURT_SPEED; p.vy = 0;
  p.knockback = HURT_FRAMES;
  p.charState = CHAR_HURT;
  p.dashWait = 0; p.dashing = false;
  w.play(SONG.LIFE_LOST);
  return true;
}

// Player_8049E3C: his sprite (anim and hitboxes always flipped to face right), not drawn while a capsule holds
// him or every other 2 frames while he blinks after a hit; thrown back, he is drawn through the rotation
// hardware, turned by his rotation and mirrored. Every other 2 frames three afterimages follow him, each 8 px
// further back and two positions older on his trail.
function drawSuperSonic(p, w) {
  const s = p.sprite;
  animate(s, w.anims);
  if (!p.dead && ((p.moveState & HIDDEN) || (p.knockback === 0 && p.invulnerable !== 0 && (w.tick & 2)))) return;
  const affine = p.charState === CHAR_HURT ? { rotation: p.rotation * 4, scaleX: -256, scaleY: 256, double: false } : null;
  w.draw(s, I(p.qx), I(p.qy), affine);
  if (w.tick & 2) return;
  for (let k = 1; k < 4; k++) {
    const i = (p.trail.i - 2 * k) & (TRAIL - 1);
    w.draw(s, I(p.trail.xs[i]) - k * 8, I(p.trail.ys[i]), affine);
  }
}

// Task_PlayerDied, then Task_PlayerHandleDeath: he falls through everything until he is 240 px below the top of
// the screen, then the stage starts over 60 frames later
function deadStep(p, w) {
  if (p.death === 'gone') {
    if (p.countdown !== 0) p.countdown--;
    else w.lifeLost();
    return;
  }
  if (p.qy >= ((w.cam.y + DEAD_BELOW) << 8) - 1) { p.death = 'gone'; p.countdown = DEAD_RESTART; return; }
  p.qx += p.vx; p.qy += p.vy;
  p.vy += DEAD_GRAVITY;
  animate(p.sprite, w.anims);
  w.draw(p.sprite, I(p.qx), I(p.qy));
}

/**
 * Super Sonic's task (Task_8049898), at the player's priority. `w` is what the stage gives him: terrain, cam (this
 * frame's), tick, anims, input (GBA key bits), random(), play(song), stop(song), add(task, priority), priority (his
 * own), draw(sprite, x, y, affine), rings (get and set), actStart (the title card is running), bossDown (the
 * robot is defeated) and lifeLost().
 */
export function superSonicTask(p, w) {
  return {
    run() {
      if (p.death) { deadStep(p, w); return true; }
      // the camera keeps him 64 px left of the screen's middle, over the bottom 200 px of the stage, in x 0–480
      w.camLimits(w.terrain.height - 200, 480, 64, 0);
      const old = p.held;
      if (!(p.moveState & IGNORE_INPUT)) p.held = w.input();
      p.pressed = (old ^ p.held) & p.held;
      // the frame he dies he is still drawn by this task, in his dying animation; Task_PlayerDied takes over
      // from the next
      if (p.dead) {
        p.death = 'falling'; p.charState = CHAR_DEAD; p.vx = 0; p.invulnerable = 2;
        w.died();
        w.stop(SONG.INVINCIBILITY); w.stop(EXTRA_SONG.DROWNING); w.stop(EXTRA_SONG.TAILS_FLYING);
      } else if (!(p.moveState & IA_OVERRIDE)) moveStep(p, w);
      startAnim(p.sprite, ANIMS[p.charState]);
      p.trail.i = (p.trail.i + 1) & (TRAIL - 1);
      p.trail.xs[p.trail.i] = p.qx; p.trail.ys[p.trail.i] = p.qy;
      drawSuperSonic(p, w);
      if (p.knockback !== 0) p.knockback--;
      else if (p.invulnerable > 0) p.invulnerable--;
      drainRings(p, w);
      return true;
    },
  };
}

// Player_SuperSonic_80499CC: a ring less every second, beeping from 10 down; at none he dies
function drainRings(p, w) {
  if (w.actStart || p.death || w.bossDown) return;
  if (++p.drain < 60) return;
  p.drain -= 60;
  if (--w.rings <= 10) w.play(SONG.TIMER);
  if (w.rings === 0) p.moveState |= DEAD;
}

// Task_804A3C0: the dash's trail follows him, in front of the robot's body and behind it by turns of 2 frames,
// and finishes its animation once the dash is over
function dashTrail(p, w) {
  const s = makeSprite('superTrail', { flipX: true, order: 8, prio: 1 });
  let ending = false;
  return {
    run() {
      if (p.dead || (ending && s.anim.done)) return false;
      if (!p.dashing || (p.moveState & GOAL_REACHED)) { ending = true; startAnim(s, 'superTrailEnd'); }
      s.prio = w.tick & 2 ? 2 : 1;
      animate(s, w.anims);
      w.draw(s, I(p.qx), I(p.qy));
      return true;
    },
  };
}

// sub_804A498 and Task_804A54C: up to four sparkles at once, each drifting left faster and faster until its
// animation ends or it leaves the screen's sides
let sparkles = MAX_SPARKLES;
export function resetSparkles() { sparkles = MAX_SPARKLES; }
function sparkle(qx, qy, small, w) {
  if (sparkles <= 0) return;
  sparkles--;
  const s = makeSprite(small ? 'superSparkleSmall' : 'superSparkle', { flipX: true, order: 8, prio: 1 });
  let speed = 0;
  w.add({
    run() {
      const x = I(qx) - w.cam.x;
      if (s.anim.done || x < -16 || x >= 256) { sparkles++; return false; }
      animate(s, w.anims);
      w.draw(s, I(qx), I(qy));
      qx += (speed << 16) >> 16;
      speed = (speed - 64) & 0xFFFF;
      return true;
    },
  }, w.priority + 1);
}
