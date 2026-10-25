// The eight spring kinds, following SA1's spring code (SAT-R decompilation,
// src/game/sa1/stage/interactables/spring.c). Each spring waits until Sonic triggers it, then plays its
// launch animation, still launching him if he touches it again, and goes back to waiting when it ends.

import { PHYSICS as K, BOOST_MODE as B } from './constants.js';
import { platform, springSide, overlap, LANDED, FROM_BELOW, LEFT_FACE, RIGHT_FACE, PUSHING } from './collide.js';
import { land, standUp, endAttack, enterBoostMode } from './player.js';
import { SONG } from '../sound/songs.js';

// interactable kinds
export const SPRING_UP = 8, SPRING_DOWN = 9, SPRING_LEFT = 10, SPRING_RIGHT = 11;
export const SPRING_BIG_UPLEFT = 12, SPRING_BIG_UPRIGHT = 13, SPRING_SMALL_UPLEFT = 14, SPRING_SMALL_UPRIGHT = 15;

// [idle animation, launch animation, flipX, flipY] by kind; up springs are yellow unless d0 bit 1 is set
const LOOKS = {
  [SPRING_UP]: ['springUp', 'springUpLaunch', false, false],
  [SPRING_DOWN]: ['springUp', 'springUpLaunch', false, true],
  [SPRING_LEFT]: ['springSide', 'springSideLaunch', true, false],
  [SPRING_RIGHT]: ['springSide', 'springSideLaunch', false, false],
  [SPRING_BIG_UPLEFT]: ['springBig', 'springBigLaunch', true, false],
  [SPRING_BIG_UPRIGHT]: ['springBig', 'springBigLaunch', false, false],
  [SPRING_SMALL_UPLEFT]: ['springSmall', 'springSmallLaunch', true, false],
  [SPRING_SMALL_UPRIGHT]: ['springSmall', 'springSmallLaunch', false, false],
};

const s8 = v => (v << 24) >> 24;

// d0 picks one of four speeds; above 3 the speed is d1 × 16 in 1/256 px
function launchSpeed([d0, d1]) {
  return s8(d0) > 3 ? (d1 << 4) / 256 : K.springSpeeds[d0 & 3];
}

// thrown into the air by a spring that points up: no jump moves until he lands, and the spring's d0 bit 0
// picks the rise-and-fall animations over the somersault
function throwUp(p, o) {
  p.onObject = null; p.air = true;
  endAttack(p);
  p.state = o.d[0] & 1 ? 'springRise' : 'spring';
  p.animRestart = true;
  standUp(p);
}

// up (sub_8022640): landing on it launches him straight up, keeping his X speed
function up(o, p, { terrain: t }) {
  if (!(platform(o, o.boxes[0], p, t) & LANDED)) return false;
  land(p);
  p.ysp = -o.speed;
  throwUp(p, o);
  return true;
}

// down (sub_8022804): bumping it from below throws him down as he is; standing on it counts as ground
function down(o, p, { terrain: t }) {
  const r = platform(o, o.boxes[0], p, t);
  if (r & FROM_BELOW) {
    p.air = true; p.jumped = false; p.midAir = 0;
    p.ysp = o.speed;
    return true;
  }
  if (r & (LANDED | PUSHING)) land(p);
  return false;
}

// left and right (sub_80228D0): its face sends him running (or rolling) away, even from a standstill; its
// back is a wall, and touching it counts as touching the ground, even in mid-air. With the optional Boost
// Mode, a throw faster than 9 px a frame from the ground puts him in it, as Sonic Advance 2's springs do
// (Player_TouchNormalSpring).
function side(o, p, world) {
  const r = springSide(o, o.boxes[0], p);
  const face = r & LEFT_FACE ? -1 : r & RIGHT_FACE ? 1 : 0;
  if (!face) return false;
  const dir = o.kind === SPRING_LEFT ? -1 : 1;
  if (face === dir) {
    if (world.boostMode && !p.air && o.speed > B.sideSpring) enterBoostMode(p);
    p.xsp = p.gsp = o.speed * dir;
    endAttack(p);
    p.state = p.curled ? 'spin' : 'walk';
    p.rotation = 0; p.facing = dir;
    return true;
  }
  land(p);
  if (r & PUSHING) { p.pushing = true; p.xsp = p.gsp = 0; standUp(p); }
  return false;
}

// diagonal (sub_8022AB4 big, sub_8022E14 small): its second hitbox is the trigger, but only once Sonic's
// centre is more than 20 px out on the side it points to; otherwise it is solid
function diagonal(o, p, { terrain: t }) {
  const probe = [-12, -(p.offsetY + 1), 12, p.offsetY + 1];
  if (!overlap(o.x, o.y, o.boxes[1], Math.floor(p.x), Math.floor(p.y), probe)) { platform(o, o.boxes[0], p, t); return false; }
  p.curled = false; p.airLock = false;   // even without a launch, and without standing him up
  const px = Math.floor(p.x), upLeft = o.kind === SPRING_BIG_UPLEFT || o.kind === SPRING_SMALL_UPLEFT;
  const dir = upLeft && px < o.x - 20 ? -1 : px > o.x + 20 ? 1 : 0;
  if (!dir) { platform(o, o.boxes[0], p, t); return false; }
  p.ysp = -o.speed; p.xsp = o.speed * dir;
  throwUp(p, o);
  return true;
}

const COLLIDE = {
  [SPRING_UP]: up, [SPRING_DOWN]: down, [SPRING_LEFT]: side, [SPRING_RIGHT]: side,
  [SPRING_BIG_UPLEFT]: diagonal, [SPRING_BIG_UPRIGHT]: diagonal, [SPRING_SMALL_UPLEFT]: diagonal, [SPRING_SMALL_UPRIGHT]: diagonal,
};

/** The object for a spring entity, or null when `kind` is not a spring. */
export function createSpring(e) {
  const look = LOOKS[e.kind];
  if (!look) return null;
  const yellow = e.kind === SPRING_UP && !(e.d[0] & 2) ? 'Yellow' : '';
  const [idle, launch, flipX, flipY] = look;
  return {
    kind: e.kind, x: e.x, y: e.y, d: e.d, flipX, flipY, speed: launchSpeed(e.d),
    idle: idle.replace('springUp', 'springUp' + yellow), launch: launch.replace('springUp', 'springUp' + yellow),
    // the diagonal kinds only restart their launch animation when it isn't already playing
    restarts: e.kind <= SPRING_RIGHT,
    collide: COLLIDE[e.kind],
    sound: SONG.SPRING,   // every launch plays it
  };
}
