// Sonic's movement and animation state, one call per 1/60 s frame, in the order the original runs it.
// `state` is the original's character state (charState): it picks the animation, and some animations
// hand over to the next state when they end. (x, y) is Sonic's centre; on the ground he moves along the
// surface's angle (`rotation`, 256 steps per turn) at ground speed `gsp`.

import { PHYSICS as K, ANIMATION, SPRITE_OFFSET_Y, BALL_SPRITE_OFFSET_Y } from './constants.js';
import { makeAnimator, setAnim, tickAnim } from './animator.js';
import { groundSensors, wallPush, airCollision, clearance, setOffsetY } from './sensors.js';
import { LAYER_BACK } from './terrain.js';
import { sin8, cos8, s8 } from './trig.js';

// d-pad bits for the input history the mid-air dash reads
const LEFT = 1, RIGHT = 2, UP = 4, DOWN = 8;
const HISTORY = 16;

// states: idle | walk | turn | brake | crouch | crouchEnd | lookUp | lookUpEnd | spinDash | spinDashRev |
//         spin (jump, roll) | instaShield | airDash | spinAttack | somersault | slide | slideEnd | backflip
export function createPlayer({ x, y, spinDashSpeeds }) {
  return {
    x, y, gsp: 0, xsp: 0, ysp: 0, facing: 1, state: 'idle',
    rotation: 0,       // angle of the surface he is on, decaying toward 0 in the air
    rotA: 0, rotB: 0,  // the last angles the two ground sensors saw (the original's unk28/unk29)
    layer: LAYER_BACK, // which of the act's two collision layers he touches
    lock: 0,           // frames of control lock left after slipping off a wall (unk2A)
    air: false,        // MOVESTATE_IN_AIR
    curled: false,     // MOVESTATE_SPIN_ATTACK: rolling or jumping as a ball
    jumped: false,     // left the ground with the jump button (allows the jump cap and mid-air moves)
    airLock: false,    // jumped out of a roll: no air control until the insta-shield
    spinDashing: false, dashAccel: 0,
    offsetY: SPRITE_OFFSET_Y,
    midAir: 0,         // mid-air move used this jump: 1 insta-shield, 2 dash
    attack: 0, attackNext: 0,   // step of the B-button combo, and the move queued after the somersault
    idleT: K.boredDelay, anim: makeAnimator(), spinDashSpeeds,
    held: new Array(HISTORY).fill(0), pressed: new Array(HISTORY).fill(0),
  };
}

const sign = p => p.facing;
const toward0 = (v, step) => v > 0 ? Math.max(0, v - step) : v < 0 ? Math.min(0, v + step) : 0;

// curling up lowers the centre toward the surface so the feet stay put
function curl(p) { p.curled = true; setOffsetY(p, BALL_SPRITE_OFFSET_Y); }
function uncurl(p) { p.curled = false; setOffsetY(p, SPRITE_OFFSET_Y); }

// fixed-point helpers: speeds are multiples of 1/256, and the original does this arithmetic on 8.8 integers
const q8 = v => Math.round(v * 256);

// ground speed along the surface (sub_8029CA0 walking, sub_8029D14 rolling): not on ceilings, never from a
// standstill, and rolling uphill only gets a quarter of the pull
function slope(p) {
  if (((p.rotation + 0x60) & 0xFF) >= 0xC0 || p.gsp === 0) return;
  p.gsp = (q8(p.gsp) + ((sin8(p.rotation) * 3) >> 5)) / 256;
}
function rollSlope(p) {
  if (((p.rotation + 0x60) & 0xFF) >= 0xC0 || p.gsp === 0) return;
  let acc = (sin8(p.rotation) * 60) >> 8;
  if ((p.gsp > 0 && acc <= 0) || (p.gsp < 0 && acc >= 0)) acc >>= 2;
  p.gsp = (q8(p.gsp) + acc) / 256;
}

// ground speed to X and Y speed along the surface
function alongSurface(p) {
  const g = q8(p.gsp);
  p.xsp = ((g * cos8(p.rotation)) >> 8) / 256;
  p.ysp = ((g * sin8(p.rotation)) >> 8) / 256;
}

// the act's edges (sub_80232D0): Sonic stops at the sides, and falling out of the bottom ends the run,
// which restarts him at the act's start for now
function bounds(p, world) {
  const t = world.terrain, maxX = t.width - 1 / 256, maxY = t.height - 1 / 256;
  if (p.y >= maxY) { world.respawn(); return; }
  if (p.x < 0 || p.x > maxX) { p.x = Math.min(Math.max(p.x, 0), maxX); p.xsp = 0; p.gsp = 0; }
  if (p.y < 0) { p.y = 0; p.ysp = 0; p.gsp = 0; }
}

// walls, ceilings and steep slopes drop Sonic when he is too slow for them, and lock his controls for
// 30 grounded frames (sub_8029ED8)
function fallOff(p) {
  if (p.lock) { p.lock--; return; }
  if (((p.rotation + 0x20) & 0xC0) && Math.abs(p.gsp) < K.wallMinSpeed) {
    p.gsp = 0; p.air = true; p.lock = K.slipLock;
  }
}

// a fresh press of left or right now, after an earlier press of the same direction 5–10 frames back,
// with no other direction held in between (GetAirDashDirection)
function doubleTap(p) {
  const now = p.pressed[0] & (LEFT | RIGHT);
  if (now !== LEFT && now !== RIGHT) return 0;
  const others = (LEFT | RIGHT | UP | DOWN) & ~now;
  for (let i = 0; i < K.airDashWindow; i++) {
    if (p.held[i] & others) return 0;
    if (i >= K.airDashMinGap - 1 && p.pressed[i + 1] & now) return now === LEFT ? -1 : 1;
  }
  return 0;
}

// jumps away from the surface, if there are at least 4 px of room that way
function tryJump(p, c, world) {
  if (!c.jumpPressed || clearance(p, world.terrain, p.rotation + 0x80) < 4) return false;
  p.air = true; p.jumped = true; p.state = 'spin';
  const a = (p.rotation - 0x40) & 0xFF, jump = q8(K.jumpSpeed);
  p.xsp = (q8(p.xsp) + ((jump * cos8(a)) >> 8)) / 256;
  p.ysp = (q8(p.ysp) + ((jump * sin8(a)) >> 8)) / 256;
  if (p.curled) p.airLock = true;   // jumping out of a roll keeps the roll's momentum
  else curl(p);
  return true;
}

// spin dash: starts from a crouch with jump, revs with jump, releases when down is let go
function trySpinDash(p, c, world) {
  if (!p.spinDashing) {
    if (p.state !== 'crouch' || !c.jumpPressed) return false;
    p.state = 'spinDash'; p.spinDashing = true; p.dashAccel = 0;
    setOffsetY(p, BALL_SPRITE_OFFSET_Y);
    world.spawnDashDust();
    return true;
  }
  if (!c.down) {
    p.spinDashing = false;
    // charge past 8 runs off the end of the first speed table into the second one, as in the original
    const i = Math.min(p.spinDashSpeeds.length - 1, p.dashAccel >> 8);
    p.gsp = p.spinDashSpeeds[i] * sign(p);
    p.curled = true; p.state = 'spin';
    world.freezeCamera();
    return true;   // the release frame doesn't move
  }
  let a = p.dashAccel;
  if (a !== 0) { a -= (a << 3) >> 8; if (a <= 0) a = 0; }
  if (p.state !== 'spinDashRev') p.state = 'spinDash';
  if (c.jumpPressed) { p.state = 'spinDashRev'; a = Math.max(a + K.dashRev, K.dashRevMin); }
  p.dashAccel = a;
  return true;
}

function walk(p, dir) {
  if (p.gsp * dir >= 0) {
    if (p.facing !== dir) p.state = 'turn';
    p.facing = dir;
    let g = p.gsp + K.acceleration * dir;
    if (g * dir > K.maxRunSpeed) {
      g -= K.acceleration * dir;
      if (g * dir < K.maxRunSpeed) g = K.maxRunSpeed * dir;
    }
    p.gsp = g;
    if (p.state !== 'turn') p.state = 'walk';
  } else {
    let g = p.gsp + K.deceleration * dir;
    if (g * dir > 0) g = K.reverseKick * dir;
    p.gsp = g;
    if (g * dir <= -K.brakeMinSpeed) p.state = 'brake';
  }
}

// standing or running, not curled up (Player_8044F7C); the control lock skips the d-pad
function walkStep(p, c, world) {
  if (!p.lock) walkInput(p, c);
  if (!c.sideways) p.gsp = toward0(p.gsp, K.friction);
  alongSurface(p);
  wallPush(p, world.terrain);
}

function walkInput(p, c) {
  if (c.dir) walk(p, c.dir);
  else if (!c.sideways) {
    if (p.gsp !== 0) {
      if (p.state === 'brake' || p.state === 'idle') p.state = 'walk';
    } else if (p.state === 'crouch') p.state = 'crouchEnd';
    else if (p.state === 'lookUp') p.state = 'lookUpEnd';
    else if (p.state !== 'crouchEnd' && p.state !== 'lookUpEnd') p.state = 'idle';
  }
  if (p.gsp === 0 && p.state !== 'crouchEnd' && p.state !== 'lookUpEnd') p.state = 'idle';

  // up and down only count while no direction is held, and cancel each other out
  if (c.up && !c.down) { if (p.gsp === 0) p.state = 'lookUp'; }
  else if (c.down && !c.up) {
    p.state = 'crouch';
    if (p.gsp !== 0) { curl(p); p.state = 'spin'; }
  } else if (!c.up && !c.down) {
    if (p.state === 'crouch') p.state = 'crouchEnd';
    else if (p.state === 'lookUp') p.state = 'lookUpEnd';
  }
}

// rolling (Player_8043DDC)
function rollStep(p, c, world) {
  if (c.dir && !p.lock) {
    if (p.gsp * c.dir >= 0) p.facing = c.dir;
    else {
      p.gsp += K.rollDeceleration * c.dir;
      if (p.gsp * c.dir > 0) p.gsp = K.reverseKick * c.dir;
    }
  }
  p.gsp = toward0(p.gsp, K.rollFriction);
  if (p.gsp === 0) { uncurl(p); p.state = c.down ? 'crouch' : 'walk'; }
  alongSurface(p);
  // a wall to the side stops the roll and stands him up
  if (wallPush(p, world.terrain) && p.curled) { uncurl(p); p.state = 'walk'; }
}

// the B-button combo on the ground (sub_8047668): returns true while it owns the frame
function attackStep(p, c) {
  switch (p.attack) {
    case 0:
      if (p.spinDashing || !c.attackPressed) return false;
      p.gsp = K.spinAttackSpeed * sign(p); p.xsp = 0;
      p.attack = 1; p.state = 'spinAttack';
      return true;
    case 1:
      p.gsp = toward0(p.gsp, K.attackFriction);
      if (p.gsp === 0) { p.state = 'idle'; p.attack = 0; }
      if (c.attackPressed) { p.gsp = K.somersaultSpeed * sign(p); p.attack++; p.attackNext = 0; p.state = 'somersault'; }
      break;
    case 2:
      p.gsp = toward0(p.gsp, K.attackFriction);
      if (p.attackNext === 0 && c.attackPressed) p.attackNext = 1;        // then slide
      else if (p.attackNext === 0 && c.jumpPressed) p.attackNext = 2;     // then backflip
      break;
    case 3:
      p.gsp = toward0(p.gsp, K.slideFriction);
      if (p.gsp === 0) { p.state = 'slideEnd'; p.attack = 4; }
      break;
  }
  return true;
}

function endAttack(p) { p.attack = 0; p.attackNext = 0; p.midAir = 0; p.jumped = false; p.spinDashing = false; }

// on the frame a jump or a B move starts nothing else runs; while revving a spin dash Sonic stays put but
// still follows the ground (Player_Sonic_80473AC)
function groundStep(p, c, world) {
  const t = world.terrain;
  if (p.curled) {
    if (tryJump(p, c, world)) return;
    rollSlope(p);
    rollStep(p, c, world);
  } else if (p.attack !== 0) {
    slope(p);
    attackStep(p, c);
    alongSurface(p);
    wallPush(p, t);
  } else {
    if (attackStep(p, c)) return;
    if (trySpinDash(p, c, world)) { bounds(p, world); groundSensors(p, t); return; }
    if (tryJump(p, c, world)) return;
    slope(p);
    walkStep(p, c, world);
  }
  bounds(p, world);
  p.x += p.xsp; p.y += p.ysp;
  groundSensors(p, t);
  fallOff(p);
}

function airStep(p, c, world) {
  // double-tap dash, only while curled up (sub_8047714)
  if (p.curled && p.jumped && p.midAir === 0) {
    const tap = doubleTap(p);
    if (tap) { p.midAir = 2; p.state = 'airDash'; p.xsp += K.airDashBoost * tap; p.ysp = 0; }
  }

  // jump cap, or the insta-shield once the rise has slowed (Player_8044670)
  if (p.jumped) {
    if (p.ysp < -K.jumpReleaseCap) { if (!c.jump) p.ysp = -K.jumpReleaseCap; }
    else if (p.midAir === 0 && c.jumpPressed) {
      p.airLock = false; p.midAir = 1; p.state = 'instaShield';
      world.spawnInstaShield();
    }
  } else if (p.ysp < -K.riseCap) p.ysp = -K.riseCap;

  // air control and drag (Player_AirInputControls)
  if (!p.airLock && c.dir) {
    const dir = c.dir;
    p.facing = dir;
    let v = p.xsp + K.airAcceleration * dir;
    if (v * dir > K.maxRunSpeed) {
      v -= K.airAcceleration * dir;
      if (v * dir < K.maxRunSpeed) v = K.maxRunSpeed * dir;
    }
    p.xsp = v;
  }
  if (p.ysp < 0) {
    const drag = Math.floor(p.xsp * 256 / 32) / 256;   // arithmetic shift of the 8.8 value
    p.xsp = p.xsp > 0 ? Math.max(0, p.xsp - drag) : p.xsp < 0 ? Math.min(0, p.xsp - drag) : 0;
  }

  bounds(p, world);
  p.x += p.xsp; p.y += p.ysp;
  p.ysp += K.gravity;
  // the angle he left the ground at eases back to upright (Player_8047224)
  const r = s8(p.rotation);
  p.rotation = (r > 0 ? Math.max(0, r - 2) : Math.min(0, r + 2)) & 0xFF;
  airCollision(p, world.terrain, () => land(p));
}

// touching down (sub_8021BE0); the caller sets the ground speed from the landing angle
function land(p) {
  p.air = false;
  p.state = 'walk';
  if (p.curled) uncurl(p);
  p.airLock = false;
  endAttack(p);
}

/**
 * Advances the player one frame. `world` provides tick, terrain, respawn(), spawnDashDust(),
 * spawnInstaShield() and freezeCamera().
 */
export function stepPlayer(p, input, world) {
  const left = input.left, right = input.right, sideways = left || right;
  const bits = (left ? LEFT : 0) | (right ? RIGHT : 0) | (input.up ? UP : 0) | (input.down ? DOWN : 0);
  p.pressed.pop(); p.pressed.unshift(bits & ~p.held[0]);
  p.held.pop(); p.held.unshift(bits);

  // holding left or right hides up and down from the movement code
  const c = {
    dir: left && !right ? -1 : right && !left ? 1 : 0, sideways,
    up: input.up && !sideways, down: input.down && !sideways,
    jump: input.jump, jumpPressed: input.jumpPressed, attackPressed: input.attackPressed,
  };
  input.jumpPressed = false; input.attackPressed = false;

  if (p.air) airStep(p, c, world);
  else groundStep(p, c, world);
}

// state -> animation, with the walk cycle's speed and the idle timer (sub_802486C)
function chooseAnimation(p, input) {
  const a = p.anim, speed = Math.abs(p.gsp);
  a.speed = ANIMATION.normalSpeed;
  if (p.gsp !== 0 || input.left || input.right || input.up || input.down || input.jump || input.attack) p.idleT = K.boredDelay;
  switch (p.state) {
    case 'idle':
      if (p.idleT !== 0) { p.idleT--; return 'idle'; }
      return 'bored';
    case 'walk':
      if (speed >= ANIMATION.runSpeed) return 'run';
      // the walk cycle plays at |speed| × 1.0, never slower than 0.5×
      a.speed = Math.max(ANIMATION.minWalkSpeed, Math.min(ANIMATION.normalSpeed, Math.floor(speed * 256) >> 4));
      return 'walk';
    case 'brake': return speed < ANIMATION.brakeTurnSpeed ? 'brakeTurn' : 'brake';
    default: return p.state;
  }
}

// what comes after an animation that ends (sub_8024B10)
function afterAnimation(p, world) {
  switch (p.state) {
    case 'spinDashRev': p.state = 'spinDash'; break;
    case 'crouchEnd': p.state = p.gsp !== 0 ? 'walk' : 'idle'; break;
    case 'lookUpEnd': p.state = 'idle'; break;
    case 'turn': p.state = 'walk'; break;
    case 'spinAttack': case 'slideEnd':
      endAttack(p); p.state = p.gsp !== 0 ? 'walk' : 'idle'; break;
    case 'somersault':
      if (p.attackNext === 1) {
        p.gsp = K.slideSpeed * sign(p); p.attack++; p.attackNext = 0; p.state = 'slide';
      } else if (p.attackNext === 2) {
        endAttack(p);
        p.xsp = -p.xsp; p.ysp = -K.jumpSpeed;   // flips backwards, away from the way he was going
        p.air = true; curl(p); p.state = 'backflip';
      } else { endAttack(p); p.state = 'idle'; p.gsp = 0; }
      break;
  }
}

/** Picks and steps Sonic's animation after his frame of movement, like the original sprite update. */
export function animatePlayer(p, input, anims, world) {
  setAnim(p.anim, chooseAnimation(p, input));
  if (p.state === 'brake' && world.tick % 4 === 0) world.spawnBrakeDust();
  for (let guard = 0; guard < 4; guard++) {
    if (!tickAnim(p.anim, anims)) return;
    const before = p.state;
    afterAnimation(p, world);
    if (p.state === before) return;
    setAnim(p.anim, chooseAnimation(p, input));
  }
}
