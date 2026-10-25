// Sonic's movement and animation state, one call per 1/60 s frame, in the order the original runs it.
// `state` is the original's character state (charState): it picks the animation, and some animations
// hand over to the next state when they end. (x, y) is Sonic's centre; on the ground he moves along the
// surface's angle (`rotation`, 256 steps per turn) at ground speed `gsp`.

import { PHYSICS as K, ANIMATION, SPRITE_OFFSET_Y, BALL_SPRITE_OFFSET_Y, RUSH_BOOST as R } from './constants.js';
import { makeAnimator, setAnim, tickAnim } from './animator.js';
import { groundSensors, wallPush, airCollision, clearance, setOffsetY } from './sensors.js';
import { LAYER_BACK, scan, PROBE_FLOOR } from './terrain.js';
import { sin8, cos8, s8 } from './trig.js';
import { SONG } from '../sound/songs.js';

// d-pad bits for the input history the mid-air dash reads
const LEFT = 1, RIGHT = 2, UP = 4, DOWN = 8;
const HISTORY = 16;
const SOX = 6;   // spriteOffsetX, half his width

// states: idle | walk | turn | brake | crouch | crouchEnd | lookUp | lookUpEnd | spinDash | spinDashRev |
//         spin (jump, roll) | instaShield | airDash | spinAttack | somersault | slide | slideEnd | backflip |
//         spring (somersault off a spring) | springRise | springPeak | springFall | bounce (off a bounce block) |
//         push | balanceForward (facing over an edge) | balanceBack (his back to it) | pole (swinging on a wall
//         pole) | grind | grindSteep (grinding down a steep part of a rail) | railJump (jumping off a rail
//         before its end) | halfPipeLow | halfPipeMid | halfPipeHigh (running up a half-pipe's side) | hook (hanging
//         from a hook rail) | hurt | dead
export function createPlayer({ x, y, spinDashSpeeds }) {
  return {
    x, y, gsp: 0, xsp: 0, ysp: 0, facing: 1, state: 'idle',
    rotation: 0,       // angle of the surface he is on, decaying toward 0 in the air
    rotA: 0, rotB: 0,  // the last angles the two ground sensors saw (the original's unk28/unk29)
    layer: LAYER_BACK, // which of the act's two collision layers he touches
    lock: 0,           // frames of control lock left after slipping off a wall (unk2A)
    air: false,        // MOVESTATE_IN_AIR
    onObject: null,    // the object he stands on (MOVESTATE_STOOD_ON_OBJ and stoodObj)
    curled: false,     // MOVESTATE_SPIN_ATTACK: rolling or jumping as a ball
    pushing: false,    // MOVESTATE_20: walked into a wall or a solid object; it shows the push animation
    prevState: 'idle', // the state his animation was last picked for (prevCharState)
    jumped: false,     // left the ground with the jump button (allows the jump cap and mid-air moves)
    airLock: false,    // jumped out of a roll: no air control until the insta-shield
    spinDashing: false, dashAccel: 0,
    offsetY: SPRITE_OFFSET_Y,
    midAir: 0,         // mid-air move used this jump: 1 insta-shield, 2 dash
    attack: 0, attackNext: 0,   // step of the B-button combo, and the move queued after the somersault
    idleT: K.boredDelay, anim: makeAnimator(), spinDashSpeeds,
    animRestart: false, // an object asked for his animation to start over
    boxes: [null, null], // his sprite's hitboxes: 0 his body, 1 the attack box of the moves that destroy enemies
    invulnerable: 0,   // frames of blinking after a hit (timerInvulnerability)
    shield: null,      // 'normal' or 'magnetic' (the itemEffect shield bits)
    invincible: 0,     // frames of invincibility left (timerInvincibility)
    speedUp: 0,        // frames of speed shoes left (timerSpeedup)
    hidden: false,     // left out of this frame's drawing: blinking, or gone below the screen after dying
    dead: false,       // MOVESTATE_DEAD
    carried: false,    // MOVESTATE_IA_OVERRIDE: an object moves him, and his own movement doesn't run
    grinding: false,   // MOVESTATE_1000000: on a grind rail, on the layer it put him on
    front: false,      // drawn in front of the front layer (his sprite's priority 1), as on a grind rail
    halfPipe: false,   // MOVESTATE_8000: a half-pipe lifts him as he runs across it (halfpipes.js)
    ignoreInput: false, // MOVESTATE_IGNORE_INPUT: an object holds his controls, as the forced slide does
    jumpPressed: false, // the jump press his last frame read (frameInput), which objects look at on the next
    death: null,       // after dying: 'falling', then 'gone' with `countdown` frames to the restart
    countdown: 0,
    chain: 0,          // enemies defeated since he last touched the ground (defeatScoreIndex)
    // Sonic Rush's boost, an extra that only runs with its setting on (world.rush)
    boost: false,      // boosting
    boostBox: null,    // its attack box, while it lasts
    boostSlow: 0,      // grounded frames in a row he moved less than its minimum speed
    boostCool: 0,      // frames before the next boost can start
    lastX: x, lastY: y, // where he was a frame ago
    held: new Array(HISTORY).fill(0), pressed: new Array(HISTORY).fill(0),
  };
}

const sign = p => p.facing;
const toward0 = (v, step) => v > 0 ? Math.max(0, v - step) : v < 0 ? Math.min(0, v + step) : 0;

// curling up lowers the centre toward the surface so the feet stay put
function curl(p) { p.curled = true; setOffsetY(p, BALL_SPRITE_OFFSET_Y); }
function uncurl(p) { p.curled = false; setOffsetY(p, SPRITE_OFFSET_Y); }

/** Stands Sonic up out of a ball, keeping his feet in place (PLAYERFN_CHANGE_SHIFT_OFFSETS). */
export function standUp(p) { uncurl(p); }

// standing on an object, the object holds him up and the ground sensors rest (sub_8022D6C)
function followGround(p, t) {
  if (p.onObject) { p.rotA = p.rotB = 0; return; }
  groundSensors(p, t);
}

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

// the act's edges (sub_80232D0): Sonic stops at the sides, and falling out of the bottom kills him, thrown
// up as high as a jump
function bounds(p, world) {
  const t = world.terrain, maxX = t.width - 1 / 256, maxY = t.height - 1 / 256;
  if (p.y >= maxY && !p.dead) { p.dead = true; p.ysp = -K.jumpSpeed; p.y = maxY; }
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
  p.air = true; p.jumped = true; p.pushing = false; p.grinding = false; p.state = 'spin';
  const a = (p.rotation - 0x40) & 0xFF, jump = q8(K.jumpSpeed);
  p.xsp = (q8(p.xsp) + ((jump * cos8(a)) >> 8)) / 256;
  p.ysp = (q8(p.ysp) + ((jump * sin8(a)) >> 8)) / 256;
  if (p.curled) p.airLock = true;   // jumping out of a roll keeps the roll's momentum
  else curl(p);
  world.playSound(SONG.JUMP);
  return true;
}

// spin dash: starts from a crouch with jump, revs with jump, releases when down is let go
function trySpinDash(p, c, world) {
  if (!p.spinDashing) {
    if (p.state !== 'crouch' || !c.jumpPressed) return false;
    p.state = 'spinDash'; p.spinDashing = true; p.dashAccel = 0;
    setOffsetY(p, BALL_SPRITE_OFFSET_Y);
    world.playSound(SONG.SPIN);
    world.spawnDashDust();
    return true;
  }
  if (!c.down) {
    p.spinDashing = false;
    // charge past 8 runs off the end of the first speed table into the second one, as in the original
    const i = Math.min(p.spinDashSpeeds.length - 1, p.dashAccel >> 8);
    p.gsp = p.spinDashSpeeds[i] * sign(p);
    p.curled = true; p.state = 'spin';
    world.playSound(SONG.SPIN_DASH_RELEASE);
    world.freezeCamera();
    return true;   // the release frame doesn't move
  }
  let a = p.dashAccel;
  if (a !== 0) { a -= (a << 3) >> 8; if (a <= 0) a = 0; }
  if (p.state !== 'spinDashRev') p.state = 'spinDash';
  if (c.jumpPressed) {
    // each rev replays the spin sound, raised by the decayed charge in semitones
    world.playSoundPitched(SONG.SPIN, a & ~0x7F);
    p.state = 'spinDashRev'; a = Math.max(a + K.dashRev, K.dashRevMin);
  }
  p.dashAccel = a;
  return true;
}

// speed shoes double the top speed, the acceleration and the deceleration, which the other speeds are not
// derived from (the speed up block after sub_80232D0's water checks)
const pace = p => (p.speedUp > 0 ? 2 : 1);

function walk(p, dir, world) {
  const acc = K.acceleration * pace(p), max = K.maxRunSpeed * pace(p);
  if (p.gsp * dir >= 0) {
    if (p.facing !== dir) { p.state = 'turn'; p.pushing = false; }
    p.facing = dir;
    let g = p.gsp + acc * dir;
    if (g * dir > max) {
      g -= acc * dir;
      if (g * dir < max) g = max * dir;
    }
    p.gsp = g;
    // on a half-pipe he keeps the state it gives him
    if (p.state !== 'turn' && !p.halfPipe) p.state = 'walk';
  } else {
    let g = p.gsp + K.deceleration * pace(p) * dir;
    if (g * dir > 0) g = K.reverseKick * dir;
    p.gsp = g;
    // the skid sound restarts on every frame Sonic is still this fast
    if (g * dir <= -K.brakeMinSpeed) { world.playSound(SONG.BRAKE); p.state = 'brake'; }
  }
}

// standing or running, not curled up (Player_8044F7C); the control lock skips left and right, not up and down
function walkStep(p, c, world) {
  if (!p.lock) walkInput(p, c, world);
  lookInput(p, c, world);
  if (!c.sideways) p.gsp = toward0(p.gsp, K.friction);
  alongSurface(p);
  wallPush(p, world.terrain);
}

function walkInput(p, c, world) {
  if (c.dir) walk(p, c.dir, world);
  else if (!c.sideways) {
    if (p.gsp !== 0) {
      if (p.state === 'brake' || p.state === 'idle') p.state = 'walk';
    } else if (p.state === 'crouch') p.state = 'crouchEnd';
    else if (p.state === 'lookUp') p.state = 'lookUpEnd';
    else if (p.state !== 'crouchEnd' && p.state !== 'lookUpEnd') p.state = 'idle';
  }
  // standing still on level ground stops the push, and at an edge he balances
  if (!((p.rotation + 0x20) & 0xC0) && p.gsp === 0) {
    p.pushing = false;
    if (p.state !== 'crouchEnd' && p.state !== 'lookUpEnd') p.state = 'idle';
    if (p.onObject) balanceOnObject(p);
    else balanceOnTerrain(p, world.terrain);
  }
}

// up and down (sub_80448D0): they only count while no direction is held, cancel each other out, and do
// nothing while he balances at an edge
function lookInput(p, c, world) {
  if (p.state === 'balanceForward' || p.state === 'balanceBack') return;
  if (c.up && !c.down) { if (p.gsp === 0) p.state = 'lookUp'; }
  else if (c.down && !c.up) {
    p.state = 'crouch';
    if (p.gsp !== 0) { curl(p); p.state = 'spin'; world.playSound(SONG.SPIN); }
  } else if (!c.up && !c.down) {
    if (p.state === 'crouch') p.state = 'crouchEnd';
    else if (p.state === 'lookUp') p.state = 'lookUpEnd';
  }
}

// facing the drop (character state 12) or with his back to it (13), from the side the edge is on
const balance = (p, edge) => { p.state = edge === p.facing ? 'balanceForward' : 'balanceBack'; };

// at the side of the object he stands on (Player_8044D74): his centre more than a pixel past the side of its
// box, less his half-width; a side at 0 never counts. Once balancing, he keeps on a pixel further in.
function balanceOnObject(p) {
  const o = p.onObject, [l, , r] = o.boxes[0];
  if (l !== 0 && p.x < o.x + l - SOX + 1) return balance(p, -1);
  if (r !== 0 && p.x > o.x + r + SOX - 2) return balance(p, 1);
  if ((p.x < o.x + l - SOX + 2 || p.x > o.x + r + SOX - 3) && (p.prevState === 'balanceForward' || p.prevState === 'balanceBack')) {
    p.state = p.prevState;
  }
}

// at a ledge (Player_8044E48): no ground within 8 px under his centre, none under one side of him (2 px
// past his half-width) and ground right under the other
function balanceOnTerrain(p, t) {
  const x = Math.floor(p.x), feet = Math.floor(p.y) + p.offsetY;
  if (scan(t, feet, x, p.layer, 8, PROBE_FLOOR).d <= 8) return;
  const left = scan(t, feet, x - 2 - SOX, p.layer, 8, PROBE_FLOOR).d, right = scan(t, feet, x + 2 + SOX, p.layer, 8, PROBE_FLOOR).d;
  if (left > 8 && right === 0) balance(p, -1);
  else if (left === 0 && right > 8) balance(p, 1);
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
  p.gsp = toward0(p.gsp, K.rollFriction * pace(p));
  if (p.gsp === 0) { uncurl(p); p.state = c.down ? 'crouch' : 'walk'; }
  alongSurface(p);
  // a wall to the side stops the roll and stands him up
  if (wallPush(p, world.terrain, true) && p.curled) { uncurl(p); p.state = 'walk'; }
}

// the B-button combo on the ground (sub_8047668): returns true while it owns the frame. It doesn't start
// while Sonic revs a spin dash, pushes, or stands on a wall or the ceiling (Player_Sonic_StartRoll).
function attackStep(p, c, world) {
  switch (p.attack) {
    case 0: {
      const floor = (p.rotation + 0x40) & 0xFF;
      if (p.spinDashing || p.pushing || floor === 0 || floor >= 0x80 || !c.attackPressed) return false;
      p.gsp = K.spinAttackSpeed * sign(p); p.xsp = 0;
      p.attack = 1; p.state = 'spinAttack';
      world.playSound(SONG.SPIN);
      return true;
    }
    case 1:
      p.gsp = toward0(p.gsp, K.attackFriction);
      alongSurface(p);   // before a somersault's speed, which moves him from the next frame
      if (p.gsp === 0) { p.state = 'idle'; p.attack = 0; }
      if (c.attackPressed) {
        p.gsp = K.somersaultSpeed * sign(p); p.attack++; p.attackNext = 0; p.state = 'somersault';
        world.playSound(SONG.SOMERSAULT);
      }
      break;
    case 2:
      p.gsp = toward0(p.gsp, K.attackFriction);
      alongSurface(p);
      if (p.attackNext === 0 && c.attackPressed) p.attackNext = 1;        // then slide
      else if (p.attackNext === 0 && c.jumpPressed) p.attackNext = 2;     // then backflip
      break;
    case 3:
      p.gsp = toward0(p.gsp, K.slideFriction);
      alongSurface(p);
      if (p.gsp === 0) { p.state = 'slideEnd'; p.attack = 4; }
      break;
  }
  return true;
}

/** Ends the combo, the mid-air moves and the spin dash (also Player_TransitionCancelFlyingAndBoost). */
export function endAttack(p) { p.attack = 0; p.attackNext = 0; p.midAir = 0; p.jumped = false; p.spinDashing = false; p.halfPipe = false; }

// jumping off a grind rail (sub_8044434), if there are at least 4 px of room that way on the layer he came
// from, back on which he lands: straight up from the rail as fast as a jump, keeping his X speed
function tryRailJump(p, c, world) {
  if (!c.jumpPressed) return false;
  p.layer ^= 1;
  if (clearance(p, world.terrain, p.rotation + 0x80) < 4) { p.layer ^= 1; return false; }
  world.stopSound(SONG.GRINDING);
  p.air = true; p.jumped = true; p.pushing = false; p.grinding = false; p.state = 'spin';
  p.ysp = ((q8(K.jumpSpeed) * sin8((p.rotation - 0x40) & 0xFF)) >> 8) / 256;
  world.playSound(SONG.JUMP);
  p.front = false;
  curl(p);
  return true;
}

// grinding down a rail (sub_80449D8): down or right (even with left) pulls him down its slope at 5/32 of
// the slope's sine, more than a walk, left brakes, and he always slows down, but never below 0.75 px a frame
function grindStep(p, c, input) {
  if ((c.down || input.right) && ((p.rotation + 0x60) & 0xFF) < 0xC0) p.gsp = (q8(p.gsp) + ((sin8(p.rotation) * 5) >> 5)) / 256;
  let g = q8(p.gsp);
  if (input.left) g = Math.max(g - 8, 0xC0);
  p.gsp = Math.max(g - 8, 0xC0) / 256;
  p.state = 'grind';
  alongSurface(p);
}

// Sonic Rush's ObjSpdUpSet and ObjSpdDownSet on 8.8 speeds: add, capped only on the side it adds toward;
// slow down toward 0 without crossing it
const spdUp = (v, a, max) => { v += a; return a >= 0 ? Math.min(v, max) : Math.max(v, -max); };
const spdDown = (v, d) => (v > 0 ? Math.max(0, v - d) : Math.min(0, v + d));
const clampTo = (v, max) => Math.min(Math.max(v, -max), max);

// the boost's acceleration, tapering off above jogging speed until 8/256 of it is left at the top speed
function rushAcceleration(speed, top) {
  const a = Math.abs(speed);
  if (a <= R.jogSpeed) return R.acceleration;
  const s = Math.min(0x100, Math.trunc((a - R.jogSpeed) * 0x100 / (top - R.jogSpeed)));
  return R.acceleration - ((R.acceleration * ((s * 0xF800) >> 16)) >> 8);
}

// left or right held: right wins when both are, as in Rush
const rushDir = c => c.dir || (c.sideways ? 1 : 0);

// boosting on the ground (Rush's ground movement with the boost's numbers): a held direction turns him,
// brakes against his motion and accelerates up to the top speed, which slopes raise; none keeps him under
// the top speed and slows him on floors within 45° of level
function rushWalk(p, c) {
  const dir = rushDir(c), bonus = (R.slopeTop * sin8(p.rotation)) >> 8;
  const top = R.topSpeed + Math.max(bonus, 0);
  let g = q8(p.gsp);
  if (!dir) {
    g = clampTo(g, top);
    if (((p.rotation + 0x20) & 0xFF) <= 0x40) g = spdDown(g, R.deceleration);
  } else {
    const acc = rushAcceleration(g, top);
    p.facing = dir;
    if (g * dir < 0) g = spdDown(g, R.deceleration);
    g = spdUp(g, acc * dir, top);
  }
  p.gsp = g / 256;
}

// boosting in the air (Rush's air movement with the boost's numbers): the same, braking twice as hard, and
// without a direction he slows down; the braking is a quarter as strong while he is tilted
function rushAir(p, c) {
  const dir = rushDir(c), top = R.topSpeed;
  let v = q8(p.xsp), dec = R.deceleration;
  if (((p.rotation + 0x20) & 0xC0) || p.rotation === 0xE0) dec >>= 2;
  if (!dir) v = spdDown(clampTo(v, top), dec);
  else {
    const acc = rushAcceleration(v, top);
    if (p.state !== 'bounce') p.facing = dir;
    if (v * dir < 0) v = spdDown(v, dec * 2);
    v = spdUp(v, acc * dir, top);
  }
  p.xsp = v / 256;
}

function boostWalkStep(p, c, world) {
  rushWalk(p, c);
  if (!p.halfPipe) p.state = 'walk';
  lookInput(p, c, world);
  alongSurface(p);
  wallPush(p, world.terrain);
}

const canBoost = p => !p.air && !p.dead && !p.carried && !p.ignoreInput && !p.curled && !p.grinding && p.attack === 0
  && !p.spinDashing && p.state !== 'hurt';

// a press starts it on the ground: he turns to the held direction and runs at least 12 px a frame that way,
// with Sonic Rush's boost sound, a screen shake and the camera falling behind (game.js boosted)
function startBoost(p, c, world) {
  if (c.dir) p.facing = c.dir;
  p.boost = true; p.boostBox = R.box; p.boostSlow = 0;
  p.gsp = p.facing * Math.max(Math.abs(q8(p.gsp)), R.startSpeed) / 256;
  p.pushing = false;
  if (!p.halfPipe) p.state = 'walk';
  world.boosted();
}

function stopBoost(p) { p.boost = false; p.boostBox = null; p.boostCool = R.cooldown; }

// Sonic Rush's boost (its HandleSuperBoost): it starts on a press, and lasts while the button is held, until
// he has moved less than 6 px a frame on the ground for more than 8 frames, or is knocked out of it. Then
// the next one can't start for 8 frames.
function rushBoost(p, c, world) {
  const moved = Math.abs(q8(p.x - p.lastX)) + Math.abs(q8(p.y - p.lastY));
  p.lastX = p.x; p.lastY = p.y;
  if (!p.boost) {
    if (c.boostPressed && p.boostCool === 0 && canBoost(p)) startBoost(p, c, world);
  } else {
    let slow = false;
    if (!p.air) {
      if (moved >= R.minSpeed) p.boostSlow = 0;
      else if (++p.boostSlow > R.slowFrames) slow = true;
    }
    if (slow || !c.boost || p.dead || p.carried || p.state === 'hurt') stopBoost(p);
  }
  if (p.boostCool > 0) p.boostCool--;
}

// on the frame a jump or a B move starts nothing else runs; while revving a spin dash Sonic stays put but
// still follows the ground (Player_Sonic_80473AC)
function groundStep(p, c, world, input) {
  const t = world.terrain;
  if (p.curled) {
    if (tryJump(p, c, world)) return;
    rollSlope(p);
    rollStep(p, c, world);
  } else if (p.grinding) {
    // on a rail he can't slip off it, and the control lock doesn't count down (sub_80472B8)
    if (tryRailJump(p, c, world)) return;
    grindStep(p, c, input);
    bounds(p, world);
    p.x += p.xsp; p.y += p.ysp;
    followGround(p, t);
    return;
  } else if (p.boost) {
    // boosting, B does nothing
    if (tryJump(p, c, world)) return;
    slope(p);
    boostWalkStep(p, c, world);
  } else if (p.attack !== 0) {
    slope(p);
    attackStep(p, c, world);
    wallPush(p, t, true);   // the rolling check: a wall stops the combo's moves without starting a push
  } else {
    if (attackStep(p, c, world)) return;
    if (trySpinDash(p, c, world)) { bounds(p, world); followGround(p, t); return; }
    if (tryJump(p, c, world)) return;
    slope(p);
    walkStep(p, c, world);
  }
  bounds(p, world);
  p.x += p.xsp; p.y += p.ysp;
  followGround(p, t);
  fallOff(p);
}

function airStep(p, c, world) {
  // knocked back, he flies on as he was thrown: no moves, no control and no drag (Player_AirInputControls)
  if (p.state === 'hurt') {
    bounds(p, world);
    p.x += p.xsp; p.y += p.ysp;
    p.ysp += K.gravity;
    airCollision(p, world.terrain, () => land(p));
    return;
  }

  // double-tap dash, only while curled up (sub_8047714)
  if (p.curled && p.jumped && p.midAir === 0) {
    const tap = doubleTap(p);
    if (tap) { p.midAir = 2; p.state = 'airDash'; p.xsp += K.airDashBoost * pace(p) * tap; p.ysp = 0; world.playSound(SONG.AIR_DASH); }
  }

  // jump cap, or the insta-shield once the rise has slowed (Player_8044670)
  if (p.jumped) {
    if (p.ysp < -K.jumpReleaseCap) { if (!c.jump) p.ysp = -K.jumpReleaseCap; }
    else if (p.midAir === 0 && c.jumpPressed) {
      p.airLock = false; p.midAir = 1; p.state = 'instaShield';
      world.playSound(SONG.INSTA_SHIELD);
      world.spawnInstaShield();
    }
  } else if (p.ysp < -K.riseCap) p.ysp = -K.riseCap;

  // air control and drag (Player_AirInputControls); boosting, Rush's air movement instead
  if (p.boost) rushAir(p, c);
  else if (!p.airLock && c.dir) {
    const dir = c.dir, acc = K.airAcceleration * pace(p), max = K.maxRunSpeed * pace(p);
    if (p.state !== 'bounce') p.facing = dir;   // off a bounce block he keeps facing the way he went up
    let v = p.xsp + acc * dir;
    if (v * dir > max) {
      v -= acc * dir;
      if (v * dir < max) v = max * dir;
    }
    p.xsp = v;
  }
  if (p.ysp < 0 && !p.boost) {
    const drag = Math.floor(p.xsp * 256 / 32) / 256;   // arithmetic shift of the 8.8 value
    p.xsp = p.xsp > 0 ? Math.max(0, p.xsp - drag) : p.xsp < 0 ? Math.min(0, p.xsp - drag) : 0;
  }

  bounds(p, world);
  p.x += p.xsp; p.y += p.ysp;
  p.ysp += K.gravity;
  // the angle he left the ground at eases back to upright; off a bounce block he tumbles the way he faces
  // instead (Player_8047224)
  const r = s8(p.rotation);
  if (p.state === 'bounce') p.rotation = (p.rotation + 4 * p.facing) & 0xFF;
  else p.rotation = (r > 0 ? Math.max(0, r - 2) : Math.min(0, r + 2)) & 0xFF;
  airCollision(p, world.terrain, () => land(p));
}

/** Touching down on the ground or an object (sub_8021BE0); the caller sets the ground speed. */
export function land(p) {
  p.air = false; p.pushing = false;
  p.state = 'walk';
  if (p.curled) uncurl(p);
  p.offsetY = SPRITE_OFFSET_Y;   // set outright, even when something uncurled him without moving him
  p.airLock = false;
  p.chain = 0;
  endAttack(p);
}

/**
 * Hurts Sonic, unless he is invincible or still blinking from the last hit (Coll_DamagePlayer, without the
 * rings and the shield, which the caller handles): knocked up and away from the way he was moving, or facing when standing still, wherever
 * the hazard is. On a grind rail he leaves it for the layer he came from, unless that has less than 4 px of
 * room above him. Returns false when he is protected, as he is while boosting.
 */
export function hurt(p, terrain) {
  if (p.invulnerable > 0 || p.invincible > 0 || p.boost) return false;
  p.invulnerable = K.invulnerable;
  p.xsp = p.xsp < 0 || (p.xsp === 0 && p.facing < 0) ? K.hurtSpeedX : -K.hurtSpeedX;
  p.ysp = -K.hurtSpeedY;
  p.onObject = null; p.air = true; p.pushing = false;
  endAttack(p);
  p.airLock = false;
  p.state = 'hurt';
  uncurl(p);   // the feet stay put
  if (p.grinding) {
    p.layer ^= 1;
    if (clearance(p, terrain, p.rotation + 0x80) < 4) p.layer ^= 1;
    else { p.grinding = false; p.front = false; }
  }
  return true;
}

// dead (Task_PlayerMain's death block, then Task_PlayerDied and Task_PlayerHandleDeath): on the first frame he
// stops moving sideways and the camera and clock stop; then he falls through everything until he is 80 px
// below the screen, and the act restarts 61 frames later
function deadStep(p, world) {
  if (!p.death) {
    p.death = 'falling'; p.state = 'dead';
    p.xsp = 0; p.gsp = 0; p.invulnerable = 2; p.onObject = null; p.pushing = false;
    endAttack(p);
    world.died();
    return;
  }
  if (p.death === 'falling') {
    if (p.y >= world.cameraY + K.deadBelowScreen - 1 / 256) { p.death = 'gone'; p.countdown = K.deadRestart; p.hidden = true; return; }
    p.y += p.ysp;
    p.ysp += K.gravity;
    return;
  }
  if (p.countdown !== 0) p.countdown--;
  else world.lifeLost();
}

/**
 * Advances the player one frame. `world` provides tick, cameraY, terrain, died(), lifeLost(), spawnDashDust(),
 * spawnInstaShield(), freezeCamera(), playSound(song) and playSoundPitched(song, pitch), and for the Rush boost
 * rush (its setting) and boosted().
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
    boost: input.boost, boostPressed: input.boostPressed,
  };
  input.jumpPressed = false; input.attackPressed = false; input.boostPressed = false;
  p.jumpPressed = c.jumpPressed;

  if (world.rush) rushBoost(p, c, world);
  else if (p.boost) stopBoost(p);

  if (p.dead) deadStep(p, world);
  else if (p.carried) return;
  else if (p.air) airStep(p, c, world);
  else groundStep(p, c, world, input);
}

// state -> animation, with the walk cycle's speed and the idle timer (sub_802486C)
function chooseAnimation(p, input) {
  const a = p.anim, speed = Math.abs(p.gsp);
  a.speed = ANIMATION.normalSpeed;
  if (p.gsp !== 0 || input.left || input.right || input.up || input.down || input.jump || input.attack || input.boost) p.idleT = K.boredDelay;
  if (p.pushing) p.state = 'push';
  switch (p.state) {
    case 'idle':
      if (p.idleT !== 0) { p.idleT--; return 'idle'; }
      return 'bored';
    case 'walk':
      if (speed >= ANIMATION.runSpeed) return 'run';
      // the walk cycle plays at |speed| × 1.0, never slower than 0.5×
      a.speed = Math.max(ANIMATION.minWalkSpeed, Math.min(ANIMATION.normalSpeed, Math.floor(speed * 256) >> 4));
      return 'walk';
    // up a half-pipe's side, at the walk cycle's speed
    case 'halfPipeLow': case 'halfPipeMid': case 'halfPipeHigh':
      a.speed = Math.max(ANIMATION.minWalkSpeed, Math.min(ANIMATION.normalSpeed, Math.floor(speed * 256) >> 4));
      return p.state;
    case 'brake': return speed < ANIMATION.brakeTurnSpeed ? 'brakeTurn' : 'brake';
    // on a steep part of a rail he always faces down it, to the right
    case 'grind':
      if (!((p.rotation + 0x20) & 0xC0)) return 'grind';
      p.facing = 1;
      return 'grindSteep';
    case 'springRise':
      // the animation was picked before the state changes, so the top-out one starts on the next frame
      if (p.ysp >= -K.springPeakSpeed) p.state = 'springPeak';
      return 'springRise';
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
    case 'spring': case 'springPeak': p.state = 'springFall'; break;
    case 'spinAttack': case 'slideEnd':
      endAttack(p); p.state = p.gsp !== 0 ? 'walk' : 'idle'; break;
    case 'somersault':
      if (p.attackNext === 1) {
        p.gsp = K.slideSpeed * sign(p); p.attack++; p.attackNext = 0; p.state = 'slide';
        world.playSound(SONG.SLIDE);
      } else if (p.attackNext === 2) {
        endAttack(p);
        p.xsp = -p.xsp; p.ysp = -K.jumpSpeed;   // flips backwards, away from the way he was going
        p.air = true; curl(p); p.state = 'backflip';
        world.playSound(SONG.JUMP);
      } else { endAttack(p); p.state = 'idle'; p.gsp = 0; }
      break;
  }
}

// a hitbox under his facing, as the sprite system applies it when the box is set
const flipBox = (box, flip) => (box && flip ? [-box[2], box[1], -box[0], box[3]] : box);

// a new animation clears both his hitboxes until its script sets them (sub_802486C)
function choose(p, name, restart = false) {
  if (p.anim.name !== name) p.boxes = [null, null];
  setAnim(p.anim, name, restart);
}

// steps his animation; the hitboxes set before a frame take effect when it appears, and stay until the
// script sets them again
function stepAnim(p, anims) {
  const i = p.anim.i, ended = tickAnim(p.anim, anims);
  const boxes = p.anim.i !== i && anims[p.anim.name].frames[p.anim.i][2];
  if (boxes) for (const [slot, box] of Object.entries(boxes)) if (slot < 2) p.boxes[slot] = flipBox(box, p.facing > 0);
  return ended;
}

/**
 * Picks and steps Sonic's animation after his frame of movement, like the original sprite update, then
 * decides whether he is drawn: after a hit he blinks, 2 frames hidden and 2 shown in step with the stage
 * clock, and the blink timer runs down once he has landed. Then the speed shoes and invincibility count down.
 */
export function animatePlayer(p, input, anims, world) {
  if (p.death === 'gone') return;
  choose(p, chooseAnimation(p, input), p.animRestart);
  p.animRestart = false;
  if (p.state === 'brake' && world.tick % 4 === 0) world.spawnBrakeDust();
  for (let guard = 0; guard < 4; guard++) {
    if (!stepAnim(p, anims)) break;
    const before = p.state;
    afterAnimation(p, world);
    if (p.state === before) break;
    choose(p, chooseAnimation(p, input));
  }
  p.prevState = p.state;
  p.hidden = !p.dead && p.invulnerable > 0 && (world.tick & 2) !== 0;
  // dead, the timers count down only on the frame he dies: the tasks that take over from then on leave them
  if (p.dead && p.invulnerable === 1) return;
  if (p.state !== 'hurt' && p.invulnerable > 0) p.invulnerable--;
  // the speed shoes and invincibility run out
  if (p.speedUp > 0 && --p.speedUp === 0) world.speedUpOver();
  if (p.invincible > 0 && --p.invincible === 0) world.invincibilityOver();
}
