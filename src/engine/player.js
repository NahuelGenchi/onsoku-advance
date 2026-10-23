// Sonic's movement and animation state, one call per 1/60 s frame.
// Ground movement follows the original's walk/brake/turn rules, rolling its friction rules, and the air
// its jump cap and air control. The platform is flat, so ground speed and world X speed are the same.

import { PHYSICS as K, ANIMATION } from './constants.js';
import { makeAnimator, setAnim } from './animator.js';

// states: idle | walk | turn | brake | crouch | lookUp | spinDash | roll | air
export function createPlayer({ x, groundY, spinDashSpeeds }) {
  return {
    x, y: groundY, groundY, gsp: 0, xsp: 0, ysp: 0, facing: 1, ground: true, jumping: false,
    state: 'idle', dashAccel: 0, idleT: K.boredDelay, anim: makeAnimator(), spinDashSpeeds,
  };
}

export const isCurled = p => p.state === 'air' || p.state === 'roll' || p.state === 'spinDash';

// walking left (dir -1) or right (dir 1) on the ground
function walk(p, dir) {
  if (p.gsp * dir >= 0) {
    if (p.facing !== dir) { p.facing = dir; p.state = 'turn'; setAnim(p.anim, 'turn', true); }
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
    if (g * dir > -K.brakeMinSpeed) return;
    p.state = 'brake';
  }
}

function jump(p) {
  p.xsp = p.gsp; p.ysp = -K.jumpSpeed; p.ground = false; p.jumping = true; p.state = 'air';
}

function groundStep(p, input, dir, jumpPressed, world) {
  switch (p.state) {
    case 'spinDash':
      if (!input.down) {
        p.gsp = p.spinDashSpeeds[Math.min(8, Math.floor(p.dashAccel))] * p.facing;
        p.state = 'roll'; p.dashAccel = 0;
        world.freezeCamera();
        p.x += p.gsp;
        return;
      }
      if (p.dashAccel !== 0) p.dashAccel = Math.max(0, p.dashAccel - p.dashAccel / 32);
      if (jumpPressed) {
        p.dashAccel = Math.max(p.dashAccel + 2, 8);   // the original uses MAX here, so one rev reaches the top speed
        setAnim(p.anim, 'spinDashRev', true);
      }
      return;
    case 'crouch':
      if (!input.down) { p.state = 'idle'; break; }
      if (jumpPressed) {
        p.state = 'spinDash'; p.dashAccel = 0;
        world.spawnEffect('dashDust', p.x, p.y, p.facing, 'spinDash');
      }
      return;
    case 'lookUp':
      if (!input.up) { p.state = 'idle'; break; }
      if (jumpPressed) jump(p);
      return;
    case 'roll':
      if (dir && p.gsp * dir < 0) {
        p.gsp += K.rollDeceleration * dir;
        if (p.gsp * dir > 0) p.gsp = K.reverseKick * dir;
      } else if (dir) p.facing = dir;
      if (p.gsp > 0) p.gsp = Math.max(0, p.gsp - K.rollFriction);
      else if (p.gsp < 0) p.gsp = Math.min(0, p.gsp + K.rollFriction);
      if (p.gsp === 0) p.state = input.down ? 'crouch' : 'idle';
      if (jumpPressed) { jump(p); return; }
      p.x += p.gsp;
      return;
  }

  if (dir) walk(p, dir);
  else if (p.gsp > 0) p.gsp = Math.max(0, p.gsp - K.friction);
  else if (p.gsp < 0) p.gsp = Math.min(0, p.gsp + K.friction);

  if (p.gsp === 0 && (p.state === 'walk' || (p.state === 'brake' && !dir))) p.state = 'idle';
  if (p.state === 'brake' && (!dir || p.gsp * dir > 0)) p.state = p.gsp === 0 ? 'idle' : 'walk';
  if (p.state === 'turn' && p.anim.done) p.state = p.gsp === 0 ? 'idle' : 'walk';

  if (!dir && input.down) {
    if (Math.abs(p.gsp) >= K.rollMinSpeed) p.state = 'roll';
    else if (p.gsp === 0) p.state = 'crouch';
  } else if (!dir && input.up && p.gsp === 0) p.state = 'lookUp';

  if (jumpPressed && p.state !== 'crouch') { jump(p); return; }

  if (p.state === 'brake' && world.tick % 4 === 0) world.spawnEffect('brakeDust', p.x, p.y, p.facing);
  p.x += p.gsp;
}

function airStep(p, input, dir) {
  if (p.jumping && !input.jump && p.ysp < -K.jumpReleaseCap) p.ysp = -K.jumpReleaseCap;
  if (dir) {
    p.facing = dir;
    let v = p.xsp + K.airAcceleration * dir;
    if (v * dir > K.maxRunSpeed) {
      v -= K.airAcceleration * dir;
      if (v * dir < K.maxRunSpeed) v = K.maxRunSpeed * dir;
    }
    p.xsp = v;
  }
  p.x += p.xsp; p.y += p.ysp;
  p.ysp = Math.min(p.ysp + K.gravity, K.maxFallSpeed);
  if (p.y >= p.groundY) {
    p.y = p.groundY; p.ground = true; p.jumping = false; p.gsp = p.xsp; p.ysp = 0;
    p.state = p.gsp === 0 ? 'idle' : 'walk';
  }
}

function chooseAnimation(p) {
  const a = p.anim, speed = Math.abs(p.gsp);
  a.speed = ANIMATION.normalSpeed;
  switch (p.state) {
    case 'air': case 'roll': return 'spin';
    case 'spinDash': return a.name === 'spinDashRev' && !a.done ? 'spinDashRev' : 'spinDash';
    case 'crouch': return 'crouch';
    case 'lookUp': return 'lookUp';
    case 'turn': return 'turn';
    case 'brake': return speed < ANIMATION.brakeTurnSpeed ? 'brakeTurn' : 'brake';
    case 'walk':
      if (speed >= ANIMATION.runSpeed) return 'run';
      // the walk cycle plays at |speed| × 1.0, never slower than 0.5×
      a.speed = Math.max(ANIMATION.minWalkSpeed, Math.min(ANIMATION.normalSpeed, Math.floor(speed * 256) >> 4));
      return 'walk';
    default:
      return p.idleT === 0 ? 'bored' : 'idle';
  }
}

/** Advances the player one frame. `world` provides tick, spawnEffect() and freezeCamera(). */
export function stepPlayer(p, input, world) {
  const left = input.left && !input.right, right = input.right && !input.left;
  const dir = left ? -1 : right ? 1 : 0;
  const jumpPressed = input.jumpPressed;
  input.jumpPressed = false;

  if (p.ground) groundStep(p, input, dir, jumpPressed, world);
  else airStep(p, input, dir);

  // the bored timer restarts whenever Sonic moves or any button is held
  if (p.gsp !== 0 || !p.ground || dir || input.up || input.down || input.jump) p.idleT = K.boredDelay;
  else if (p.idleT > 0) p.idleT--;

  setAnim(p.anim, chooseAnimation(p));
}
