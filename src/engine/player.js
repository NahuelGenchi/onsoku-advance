// The player's movement and animation state, one call per 1/60 s frame, in the order the original runs it.
// `state` is the original's character state (charState): it picks the animation, and some animations
// hand over to the next state when they end. (x, y) is the player's centre; on the ground he moves along the
// surface's angle (`rotation`, 256 steps per turn) at ground speed `gsp`. The characters share the moves but
// their own: Sonic's mid-air moves and B combo (player_sonic.c), Tails' flight and tail swipe (player_tails.c),
// Knuckles' glide, climb, punches and float (player_knuckles.c).

import { PHYSICS as K, TAILS as F, KNUCKLES as N, ANIMATION, SPRITE_OFFSET_Y, BALL_SPRITE_OFFSET_Y, RUSH_BOOST as R, BOOST_MODE as B, SA2_TRICKS as T, SCREEN_W, SCREEN_H } from './constants.js';
import { makeAnimator, setAnim, tickAnim } from './animator.js';
import { groundSensors, wallPush, airCollision, glideCollision, clearance, setOffsetY, actAngle, floorUnder, actFloor, actCeiling, wallBeside } from './sensors.js';
import { LAYER_BACK, scan, PROBE_FLOOR, PROBE_WALL } from './terrain.js';
import { sin8, cos8, s8 } from './trig.js';
import { SONG } from '../sound/songs.js';
import { SA2_SE } from '../rom/sa2tricks.js';

// d-pad bits for the input history the mid-air dash reads
export const LEFT = 1, RIGHT = 2, UP = 4, DOWN = 8;
const HISTORY = 16;
const SOX = 6;   // spriteOffsetX, half his width
// the characters (CHARACTER_SONIC, CHARACTER_TAILS and CHARACTER_KNUCKLES)
export const SONIC = 0, TAILS = 1, KNUCKLES = 2;
// the tail swipe's frame whose commands play its sound (animCmd_PlaySoundEffect)
const SWIPE_SOUND_FRAME = 2;

// states: idle | walk | turn | brake | crouch | crouchEnd | lookUp | lookUpEnd | spinDash | spinDashRev |
//         spin (jump, roll) | instaShield | airDash | spinAttack | somersault | slide | slideEnd | backflip |
//         spring (somersault off a spring) | springRise | springPeak | springFall | bounce (off a bounce block) |
//         push | balanceForward (facing over an edge) | balanceBack (his back to it) | pole (swinging on a wall
//         pole) | flagSwing (round a red flag) | grind | grindSteep (grinding down a steep part of a rail) | railJump (jumping off a rail
//         before its end) | halfPipeLow | halfPipeMid | halfPipeHigh (running up a half-pipe's side) | hook (hanging
//         from a hook rail, a swinging hook or a crane claw) | swingRope (swinging round a rope) |
//         breathe (an air bubble under water) |
//         marbleTrack (carried through a marble track) | react (taken aback as Mecha Knuckles
//         wakes up) | hang | hangMove (on a hang bar) | hurt | dead | actClearRun (past the goal, charState 28)
//         and, with Sonic Advance 2's tricks on, that game's: trickUp | trickUpRise | trickUpFall (Hop Jump) |
//         trickForward | trickForwardSpin | trickFall (Humming Top) | trickBack | trickBackFlip (Back Star) |
//         bound | boundDive | boundRise (Bound)
// Tails' own: fly | flyTurn | flyTired (in flight, turning, and tired out) | swim | swimTurn (flying under
//         water) | tailSwipe
// Knuckles' own (charStates 62–84): glide | glideTurn0–3 (turning round in a glide) | swim (gliding under water) |
//         glideDrop (falling after letting go) | dropLand | glideSlide (sliding on after landing) | wallGrab |
//         climb | climbUp | climbDown | ledgeClimb | ledgeTop | punch1 | punch2 | punch3 | uppercut |
//         waterFloat | waterFloatUp (floating on water, looking up)
// `stopPropeller()` stops the sound of Tails' flight (game.js).
export function createPlayer({ x, y, spinDashSpeeds, character = SONIC, stopPropeller = () => {} }) {
  return {
    character,         // SONIC, TAILS or KNUCKLES
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
    midAir: 0,         // mid-air move used this jump (unk61): 1 insta-shield, 2 dash; Tails' flight, 2–31 rising after
                       // a press and 1 otherwise; Knuckles' 1 glide, 2 drop, 3 slide, 4 climb, 5 onto a ledge, 9 float
    attack: 0, attackNext: 0,   // step of the B-button combo, and the move queued after the somersault (unk62 and
                                // unk63); 1 in Tails' tail swipe; Knuckles' punch, and the next one queued
    glideShift: 0,     // Knuckles' glide heading (w.kf.shift): 0 right, 0x80 left, and between them turning round
    glideFlags: 0,     // and its flags (w.kf.flags): 0x2 not yet down, 0x20 a wall stopped him (glideCollision)
    lookEase: '',      // this frame's extra easing of the camera's look, Knuckles' (camera.js)
    flyTime: 0,        // Tails: frames of flight left, counted down every other frame (flyingDuration)
    stopPropeller,
    idleT: K.boredDelay, anim: makeAnimator(), spinDashSpeeds,
    animRestart: false, // an object asked for his animation to start over
    boxes: [null, null], // his sprite's hitboxes: 0 his body, 1 the attack box of the moves that destroy enemies
    order: 16,         // his sprite's OAM order, which holding on to a carousel changes from frame to frame
    invulnerable: 0,   // frames of blinking after a hit (timerInvulnerability)
    shield: null,      // 'normal' or 'magnetic' (the itemEffect shield bits)
    invincible: 0,     // frames of invincibility left (timerInvincibility)
    speedUp: 0,        // frames of speed shoes left (timerSpeedup)
    water: false,      // MOVESTATE_IN_WATER: his centre 4 px or more below the water line
    waterCrossed: false, // MOVESTATE_1000: he went into the water or out of it this frame
    drownSeconds: K.drownSeconds, drownFrames: 60,   // secondsUntilDrown, framesUntilDrownCountDecrement
    surfaceT: K.surfaceEffectDelay,   // framesUntilWaterSurfaceEffect: frames before the next splash can show
    hidden: false,     // left out of this frame's drawing: blinking, or gone below the screen after dying
    invisible: false,  // MOVESTATE_100000: made invisible, inside a pipe (visibility.js); never while dead
    dead: false,       // MOVESTATE_DEAD
    carried: false,    // MOVESTATE_IA_OVERRIDE: an object moves him, and his own movement doesn't run
    grinding: false,   // MOVESTATE_1000000: on a grind rail, on the layer it put him on
    front: false,      // drawn in front of the front layer (his sprite's priority 1), as on a grind rail
    prio: 2,           // his sprite's priority otherwise, as his animation's SetSpritePriority commands leave it
    halfPipe: false,   // MOVESTATE_8000: a half-pipe lifts him as he runs across it (halfpipes.js), or the water
                       // bridge has splashed (waterbridges.js)
    ignoreInput: false, // MOVESTATE_IGNORE_INPUT: an object holds his controls, as the forced slide does
    heldInput: null,   // what he reads while it does (heldInput): nothing, the right the goal holds, or the way a beaten boss walks him
    forcedRoll: false, // MOVESTATE_200: a mini loop keeps him rolling (miniloops.js)
    actClear: false,   // MOVESTATE_800000: past the goal, running in his act-clear pose until the results count up
    plainSprings: false, // unk99[1]: back from a special stage, the special springs are plain springs until the act starts over
    track: 0x7F,       // unk99[0]: the step of the track carrying him, 0x7F none (marbletrack.js)
    scale: 0x100,      // unk80 and unk82: his size through the rotation hardware (8.8), smaller in a marble track
    drawRotation: 0,   // the rotation his sprite was last drawn with, which a marble track keeps
    scripted: false,   // MOVESTATE_800000: an object sets his state, which walking, standing and landing leave alone
    jumpPressed: false, // the jump press his last frame read (frameInput), which objects look at on the next
    attackPressed: false, // and its attack press
    heldDirs: 0,       // the d-pad his last frame read (heldInput): up and down dropped while left or right is held
    pressedDirs: 0,    // the directions it found newly pressed against the frame before's heldDirs (frameInput): up
                       // and down dropped when left or right is among them, so holding down with right or left
                       // presses down again every frame
    death: null,       // after dying: 'falling', then 'gone' with `countdown` frames to the restart
    countdown: 0,
    chain: 0,          // enemies defeated since he last touched the ground (defeatScoreIndex)
    // Sonic Rush's boost, an extra that only runs with its setting on (world.rush)
    boost: false,      // boosting
    boostBox: null,    // its attack box, while it lasts
    boostSlow: 0,      // grounded frames in a row he moved less than its minimum speed
    boostCool: 0,      // frames before the next boost can start
    lastX: x, lastY: y, // where he was a frame ago
    // Sonic Advance 2's Boost Mode, an extra that only runs with its setting on (world.boostMode)
    boostMode: false,  // in Boost Mode (isBoosting)
    boostMeter: 0,     // how far it has filled, in 1/256 px (boostSpeed)
    boostTier: 0,      // the ring count's tier (boostThreshold)
    // Sonic Advance 2's tricks, an extra that only runs with its setting on (world.tricks)
    tricks: T.sonic,   // the tricks he has; null leaves them out
    trick: null,       // the one under way: { kind: 'up' | 'forward' | 'back' | 'bound', phase, spin }
    trickUsed: false,  // one trick each time he leaves the ground
    trickDelay: 0,     // frames after a spring before one can start (disableTrickTimer)
    // gravity flipped (gStageFlags' GRAVITY_INVERTED), and as it was when the stage clock last ran (gPrevStageFlags'):
    // see sensors.js
    inverted: false, wasInverted: false,
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
/** Curls Sonic into a ball, keeping his feet in place (PLAYERFN_CHANGE_SHIFT_OFFSETS(p, 6, 9)). */
export function curlUp(p) { curl(p); }
// the walk's states put his hitbox back at its standing height (PLAYERFN_CHANGE_SHIFT_OFFSETS(p, 6, 14)): it
// only moves him when something uncurled him without it, as Angel Island's waterfalls do
const standHeight = p => setOffsetY(p, SPRITE_OFFSET_Y);

// standing on an object, the object holds him up and the ground sensors rest (sub_8022D6C)
function followGround(p, t) {
  if (p.onObject) { p.rotA = p.rotB = 0; return; }
  groundSensors(p, t);
}

// fixed-point helpers: speeds are multiples of 1/256, and the original does this arithmetic on 8.8 integers
const q8 = v => Math.round(v * 256);

// a frame's move (PLAYERFN_UPDATE_POSITION): gravity flipped since the stage clock last ran turns his Y speed
// around, and flipped, it moves him up the act
function move(p) {
  p.x += p.xsp;
  if (p.inverted !== p.wasInverted) p.ysp = -p.ysp;
  p.y += p.inverted ? -p.ysp : p.ysp;
}

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

// the camera's bounds, the act's edges unless a boss has set its arena (sub_80232D0): past the point near its
// end where an act loops back (act 1's run after the goal), Sonic and the camera go back by the act's distance,
// while the camera moves; Sonic stops at the sides (the right one short of the act's own on act 2) and the top,
// and falling out of the bottom kills him, thrown up as high as a jump; under flipped gravity he stops at the
// bottom and dies out of the top
function bounds(p, world) {
  p.x += world.loopBack(p.x);
  const c = world.camera, maxX = world.rightEdge - 1 / 256, maxY = c.maxY + SCREEN_H - 1 / 256;
  if (!p.dead && (p.inverted ? p.y <= c.minY : p.y >= maxY)) { p.dead = true; p.ysp = -rules(p).jumpSpeed; p.y = p.inverted ? c.minY : maxY; }
  if (p.x < c.minX || p.x > maxX) { p.x = Math.min(Math.max(p.x, c.minX), maxX); p.xsp = 0; p.gsp = 0; }
  if (p.y < c.minY) { p.y = c.minY; p.ysp = 0; p.gsp = 0; }
  if (p.inverted && p.y > maxY) { p.y = maxY; p.ysp = 0; p.gsp = 0; }
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
  if (!c.jumpPressed || clearance(p, world.terrain, actAngle(p) + 0x80) < 4) return false;
  p.air = true; p.jumped = true; p.pushing = false; p.grinding = false; p.state = 'spin';
  const a = (p.rotation - 0x40) & 0xFF, jump = q8(rules(p).jumpSpeed);
  p.xsp = (q8(p.xsp) + ((jump * cos8(a)) >> 8)) / 256;
  p.ysp = (q8(p.ysp) + ((jump * sin8(a)) >> 8)) / 256;
  if (p.curled) p.airLock = true;   // jumping out of a roll keeps the roll's momentum
  else curl(p);
  world.playSound(SONG.JUMP);
  return true;
}

// spin dash: starts from a crouch with jump, revs with jump, releases when down is let go; only Sonic has a
// rev's animation
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
    if (p.character !== TAILS) p.state = 'spinDashRev';
    a = Math.max(a + K.dashRev, K.dashRevMin);
  }
  p.dashAccel = a;
  return true;
}

// speed shoes double the top speed, the acceleration and the deceleration, which the other speeds are not
// derived from (the speed up block at the end of Player_HandleWater)
const pace = p => (p.speedUp > 0 ? 2 : 1);
// what Player_HandleWater sets each frame: the numbers on land or under water (K.water)
const rules = p => (p.water ? K.water : K);
const accel = p => rules(p).acceleration * pace(p);
// in Boost Mode, Sonic Advance 2's top speed and its acceleration for the ring count, which speed shoes leave
// as they are (they double it only after the movement that uses it)
const topSpeed = p => (p.boostMode ? B.topSpeed : rules(p).maxRunSpeed * pace(p));

// each state it sets also sets his standing height, which matters only when something uncurled him without
// moving him (a red flag's throw)
function walk(p, dir, world) {
  const acc = p.boostMode ? B.acceleration[p.boostTier] / 256 : accel(p), max = topSpeed(p);
  if (p.gsp * dir >= 0) {
    if (p.facing !== dir) { p.state = 'turn'; p.pushing = false; standHeight(p); }
    p.facing = dir;
    // running at the top speed fills Boost Mode's meter (Player_HandleGroundMovement)
    if (world.boostMode && !world.actOver && p.gsp * dir >= max) p.boostMeter += B.acceleration[p.boostTier];
    let g = p.gsp + acc * dir;
    if (g * dir > max) {
      g -= acc * dir;
      if (g * dir < max) g = max * dir;
    }
    p.gsp = g;
    // on a half-pipe he keeps the state it gives him, and past the goal his act-clear run
    if (p.state !== 'turn' && !p.halfPipe && !p.actClear && !p.scripted) { p.state = 'walk'; standHeight(p); }
  } else {
    let g = p.gsp + rules(p).deceleration * pace(p) * dir;
    if (g * dir > 0) g = K.reverseKick * dir;
    p.gsp = g;
    // the skid sound restarts on every frame Sonic is still this fast
    if (g * dir <= -K.brakeMinSpeed) { world.playSound(SONG.BRAKE); p.state = 'brake'; standHeight(p); }
  }
}

// standing or running, not curled up (Player_8044F7C); the control lock, taking a breath and Knuckles' landing
// from a drop skip left and right, not up and down
function walkStep(p, c, world) {
  if (!p.lock && p.state !== 'breathe' && p.state !== 'dropLand') walkInput(p, c, world);
  lookInput(p, c, world);
  if (!c.sideways) p.gsp = toward0(p.gsp, K.friction);
  capBoostMode(p);
  alongSurface(p);
  wallPush(p, world.terrain);
}

// in Boost Mode the ground speed is capped at 15 before he moves (sub_8023260)
function capBoostMode(p) {
  if (p.boostMode) p.gsp = Math.min(Math.max(p.gsp, -B.maxSpeed), B.maxSpeed);
}

function walkInput(p, c, world) {
  if (c.dir) walk(p, c.dir, world);
  else if (!c.sideways) {
    if (p.gsp !== 0) {
      if (p.state === 'brake' || p.state === 'idle') { p.state = 'walk'; standHeight(p); }
    } else if (!p.actClear && !p.scripted) {
      if (p.state === 'crouch') p.state = 'crouchEnd';
      else if (p.state === 'lookUp') p.state = 'lookUpEnd';
      else if (p.state !== 'crouchEnd' && p.state !== 'lookUpEnd') p.state = 'idle';
      standHeight(p);
    }
  }
  // standing still on level ground stops the push, and at an edge he balances; not in his act-clear pose
  if (!((p.rotation + 0x20) & 0xC0) && p.gsp === 0) {
    p.pushing = false;
    if (p.actClear || p.scripted) return;
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
// past his half-width) and ground right under the other. Under flipped gravity the sides look up, but the
// first look is still down the act, as in the original.
function balanceOnTerrain(p, t) {
  const x = Math.floor(p.x), y = Math.floor(p.y), up = p.inverted ? -1 : 1, feet = y + up * p.offsetY;
  if (scan(t, y + p.offsetY, x, p.layer, 8, PROBE_FLOOR).d <= 8) return;
  const left = scan(t, feet, x - 2 - SOX, p.layer, 8 * up, PROBE_FLOOR).d, right = scan(t, feet, x + 2 + SOX, p.layer, 8 * up, PROBE_FLOOR).d;
  if (left > 8 && right === 0) balance(p, -1);
  else if (left === 0 && right > 8) balance(p, 1);
}

// rolling (Player_8043DDC): a roll that stops stands him up, unless an object keeps him curled (MOVESTATE_200):
// then it starts again at 3 px a frame the way he faces, with the rolling sound
function rollStep(p, c, world) {
  if (c.dir && !p.lock) {
    if (p.gsp * c.dir >= 0) p.facing = c.dir;
    else {
      p.gsp += K.rollDeceleration * c.dir;
      if (p.gsp * c.dir > 0) p.gsp = K.reverseKick * c.dir;
    }
  }
  p.gsp = toward0(p.gsp, accel(p) / 2);   // half the acceleration
  // in a mini loop he doesn't stop: he rolls on at 3 px a frame the way he faces
  if (p.gsp === 0 && p.forcedRoll) { p.gsp = K.forcedRollSpeed * sign(p); world.playSound(SONG.SPIN); }
  else if (p.gsp === 0) { uncurl(p); p.state = c.down ? 'crouch' : 'walk'; }
  capBoostMode(p);
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

/**
 * Ends the combo, the mid-air moves, the spin dash and a trick (also Player_TransitionCancelFlyingAndBoost), and
 * stops the sound of Tails' flight, unless `keepPropeller`.
 */
export function endAttack(p, keepPropeller = false) {
  p.attack = 0; p.attackNext = 0; p.midAir = 0; p.jumped = false; p.spinDashing = false; p.halfPipe = false; p.trick = null;
  if (p.character === TAILS && !keepPropeller) p.stopPropeller();
}

// Tails' tail swipe on the ground (sub_80480C4): as Sonic's combo, not while he revs a spin dash, pushes, or
// stands on a wall or the ceiling; its first frame is his whole frame. Its effect comes with it.
function trySwipe(p, c, world) {
  const floor = (p.rotation + 0x40) & 0xFF;
  if (p.spinDashing || p.pushing || floor === 0 || floor >= 0x80 || !c.attackPressed) return false;
  p.attack = 1; p.state = 'tailSwipe';
  world.spawnTailSwipe();
  return true;
}

// the swipe's frames (sub_8048110): the ground speed eases off by half the deceleration
function swipeStep(p) {
  p.gsp = toward0(p.gsp, rules(p).deceleration * pace(p) / 2);
  alongSurface(p);
}

// jumping off a grind rail (sub_8044434), if there are at least 4 px of room that way on the layer he came
// from, back on which he lands: straight up from the rail as fast as a jump, keeping his X speed
function tryRailJump(p, c, world) {
  if (!c.jumpPressed) return false;
  p.layer ^= 1;
  if (clearance(p, world.terrain, actAngle(p) + 0x80) < 4) { p.layer ^= 1; return false; }
  world.stopSound(SONG.GRINDING);
  p.air = true; p.jumped = true; p.pushing = false; p.grinding = false; p.state = 'spin';
  p.ysp = ((q8(rules(p).jumpSpeed) * sin8((p.rotation - 0x40) & 0xFF)) >> 8) / 256;
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

// the ring count's tier, which sets Boost Mode's acceleration and how full its meter must be
// (Player_HandleBoostThreshold)
const boostTier = rings => {
  const t = B.tierRings.findIndex(n => rings >= n);
  return t < 0 ? 0 : B.tierRings.length - t;
};

// Sonic Advance 2's Boost Mode (Player_HandleBoostState), before he moves: on the ground at the top speed with
// the meter full for the ring count, it starts, with its particles, its sound and the camera falling behind
// (game.js boostModeStarted). In the air, or slower, the meter empties, as it does while the Rush boost is
// held, which keeps to its own rules. In Boost Mode the meter stays full on the ground, and slower than
// 4.5 px a frame there it ends. Once the act is over (world.actOver: past the goal, or a boss beaten) Sonic
// runs on his own, so the meter stays empty and Boost Mode ends where it was running: Sonic Advance 2 has no
// such check, as Sonic brakes to a stop after its goal and Boost Mode ends by itself there.
function boostModeState(p, world) {
  p.boostTier = boostTier(world.ringCount);
  const full = B.threshold[p.boostTier];
  if (world.actOver) { p.boostMode = false; p.boostMeter = 0; }
  else if (p.boostMode) {
    if (p.air) return;
    p.boostMeter = full;
    if (Math.abs(p.gsp) < B.minSpeed) { p.boostMode = false; p.boostMeter = 0; }
  } else if (!p.air && !p.boost && Math.abs(p.gsp) >= topSpeed(p)) {
    if (p.boostMeter >= full) { p.boostMode = true; world.boostModeStarted(); }
  } else p.boostMeter = 0;
}

/** Puts Sonic straight into Boost Mode, as a booster or a fast side spring does, with no particles or sound. */
export function enterBoostMode(p) { p.boostMode = true; }

// on the frame a jump or a B move starts nothing else runs; while revving a spin dash Sonic stays put but
// still follows the ground (Player_Sonic_80473AC, and Player_Tails_8047BA0, which has no rails)
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
    move(p);
    followGround(p, t);
    return;
  } else if (p.boost) {
    // boosting, B does nothing
    if (tryJump(p, c, world)) return;
    slope(p);
    boostWalkStep(p, c, world);
  } else if (p.character === KNUCKLES) {
    const started = knucklesGround(p, c, world);
    if (started === 'jump') return;
    if (started === 'spinDash') { bounds(p, world); followGround(p, t); return; }
  } else if (p.attack !== 0) {
    slope(p);
    if (p.character === TAILS) swipeStep(p);
    else attackStep(p, c, world);
    wallPush(p, t, true);   // the rolling check: a wall stops the combo's moves without starting a push
  } else {
    if (p.character === TAILS ? trySwipe(p, c, world) : attackStep(p, c, world)) return;
    if (trySpinDash(p, c, world)) { bounds(p, world); followGround(p, t); return; }
    if (tryJump(p, c, world)) return;
    slope(p);
    walkStep(p, c, world);
  }
  bounds(p, world);
  move(p);
  followGround(p, t);
  fallOff(p);
}

function airStep(p, c, world) {
  if (p.character === KNUCKLES) { knucklesAir(p, c, world); return; }
  // knocked back, he flies on as he was thrown: no moves, no control and no drag (Player_AirInputControls), but
  // his tilt still eases back
  if (p.state === 'hurt') {
    bounds(p, world);
    move(p);
    p.ysp += rules(p).gravity;
    tumble(p);
    airCollision(p, world.terrain, () => land(p));
    return;
  }

  // Sonic's double-tap dash, only while curled up (sub_8047714)
  if (p.character === SONIC && p.curled && p.jumped && p.midAir === 0) {
    const tap = doubleTap(p);
    if (tap) { p.midAir = 2; p.state = 'airDash'; p.xsp += (q8(topSpeed(p)) >> 2) / 256 * tap; p.ysp = 0; world.playSound(SONG.AIR_DASH); }
  }

  // jump cap, or once the rise has slowed Sonic's insta-shield or Tails' flight (Player_8044670); in flight,
  // its own step instead (Player_Tails_8047A3C)
  const flying = p.character === TAILS && p.midAir !== 0 && !p.curled;
  if (flying) flyStep(p, c, world);
  else if (p.jumped) {
    const cap = rules(p).jumpReleaseCap;
    if (p.ysp < -cap) { if (!c.jump) p.ysp = -cap; }
    else if (p.midAir === 0 && c.jumpPressed) {
      p.airLock = false; p.midAir = 1;
      if (p.character === TAILS) startFlying(p, world);
      else {
        p.state = 'instaShield';
        world.playSound(SONG.INSTA_SHIELD);
        world.spawnInstaShield();
      }
    }
  } else if (!p.forcedRoll && p.ysp < -K.riseCap) p.ysp = -K.riseCap;

  // air control and drag (Player_AirInputControls); boosting, Rush's air movement instead, and in Boost Mode
  // twice its acceleration up to its top speed (in airControl). Off a bounce block he keeps facing the way he
  // went up.
  if (p.boost) rushAir(p, c);
  else airControl(p, c, p.state !== 'bounce');
  if (p.ysp < 0 && !p.boost) airDrag(p);

  bounds(p, world);
  move(p);
  if (!flying) p.ysp += rules(p).gravity;
  tumble(p);
  airCollision(p, world.terrain, () => land(p));
}

// Tails takes off (Player_Tails_InitFlying), uncurling with his feet in place, with 8 seconds of flight; this
// frame's gravity still pulls him
function startFlying(p, world) {
  if (p.curled) uncurl(p);
  p.flyTime = F.flyTime;
  flightState(p, world);
}

// a frame of flight (Player_Tails_8047A3C): the time runs down every other frame; a press lifts him while he
// rises slower than 0.75, until 31 frames have lifted him or he rises faster, and otherwise he sinks. He stops at
// the camera's top edge.
function flyStep(p, c, world) {
  if ((world.tick & 1) !== 0 && p.flyTime !== 0) p.flyTime--;
  if (p.midAir !== 1) {
    if (p.ysp >= -F.flyRiseMax) {
      p.ysp -= F.flyLift;
      if (++p.midAir === F.flyLiftFrames) p.midAir = 1;
    } else p.midAir = 1;
  } else {
    if (c.jumpPressed && p.ysp >= -F.flyRiseMax && p.flyTime !== 0) p.midAir = 2;
    p.ysp += F.flyFall;
  }
  const top = world.camera.minY;
  if (p.y < top) { p.y = top; if (p.ysp < 0) p.ysp = 0; }
  flightState(p, world);
}

// how he flies (Player_Tails_8047990): tired out once the time is up; under water swimming, turning while left
// or right is held against the way he faces, and letting bubbles out; in the air flying the same way, with the
// propeller's sound going. A turn in the air plays out once begun; the water's turn is checked as the air's is,
// as in the original, so it lasts one frame, and a turn from the air goes on in the water.
function flightState(p, world) {
  const held = p.held[0], against = ((held & LEFT) !== 0 && p.facing > 0) || ((held & RIGHT) !== 0 && p.facing < 0);
  if (p.flyTime === 0) {
    p.state = 'flyTired';
    world.stopSound(SONG.TAILS_FLYING);
  } else if (p.water) {
    if (against) p.state = 'swimTurn';
    else if (p.state !== 'flyTurn') p.state = 'swim';
    swimBubbles(p, world);
    world.stopSound(SONG.TAILS_FLYING);
  } else {
    if (against) p.state = 'flyTurn';
    else if (p.state !== 'flyTurn') p.state = 'fly';
    world.playSoundOrChange(SONG.TAILS_FLYING);
  }
}

// RandomlySpawnAirBubbles: on every 8th frame of the stage clock, one time in four, a bubble at his centre,
// moving with him, small or a group. The original's random offsets, up to 15 px across and 8 px up or down, are
// taken off his 8.8 position, so they move it by as many 1/256 px.
function swimBubbles(p, world) {
  if (world.tick % 8 !== 0 || (world.random() & 0x300) !== 0) return;
  const dx = (world.random() & 0xF00) >> 8, dy = ((world.random() & 0xF00) >> 8) - 8;
  world.airBubble(q8(p.x) - (p.facing > 0 ? -dx : dx), q8(p.y) - dy, q8(p.xsp), (world.random() & 0x100) !== 0);
}

// Knuckles' states (charState 62 and up), which standing up from a glide ends (sub_8022318)
const KNUCKLES_STATES = new Set(['glide', 'glideTurn0', 'glideTurn1', 'glideTurn2', 'glideTurn3', 'swim', 'glideDrop', 'dropLand',
  'glideSlide', 'wallGrab', 'climb', 'climbUp', 'climbDown', 'ledgeClimb', 'ledgeTop', 'punch1', 'punch2', 'punch3', 'uppercut',
  'waterFloat', 'waterFloatUp']);

// Knuckles on a wall, grabbing it, climbing or pulling himself up its ledge (charStates 70 to 75)
export const CLIMBING_STATES = new Set(['wallGrab', 'climb', 'climbUp', 'climbDown', 'ledgeClimb', 'ledgeTop']);
export const climbing = p => p.character === KNUCKLES && CLIMBING_STATES.has(p.state);   // sub_80549FC

// Knuckles on his feet, not rolling (sub_8048CB0): B starts his punches, each slowing him by 96/256 a frame,
// and the third becomes an uppercut. The frame a punch starts he moves as he did. Returns 'jump' or 'spinDash'
// when one started.
function knucklesGround(p, c, world) {
  if (p.attack === 0) {
    if (tryPunch(p, c)) return null;
    if (trySpinDash(p, c, world)) return 'spinDash';
    if (tryJump(p, c, world)) return 'jump';
    slope(p);
    walkStep(p, c, world);
    return null;
  }
  slope(p);
  // sub_8048C3C: B during the first two punches queues the next; the third tries the uppercut each frame
  if (p.attack === 3) { uppercut(p, world); return null; }
  if (c.attackPressed) p.attackNext = 1;
  p.gsp = toward0(p.gsp, N.punchFriction);
  alongSurface(p);
  wallPush(p, world.terrain, true);
  return null;
}

// the first punch (sub_8048ADC), not while he revs a spin dash, pushes, or stands on a wall or the ceiling
function tryPunch(p, c) {
  if (p.spinDashing || s8(p.rotation + 0x40) <= 0 || p.pushing || !c.attackPressed) return false;
  p.gsp += N.punchSpeed * sign(p);
  p.attack = 1; p.state = 'punch1';
  return true;
}

// the uppercut (sub_8048B38), if there are at least 4 px of room above him, and otherwise he stops as on landing:
// up from the surface and forward along it, with its flame
function uppercut(p, world) {
  if (clearance(p, world.terrain, actAngle(p) + 0x80) < 4) { land(p); return; }
  p.air = true; p.grinding = false; p.pushing = false;
  const push = (speed, a) => {
    p.xsp = (q8(p.xsp) + ((speed * cos8(a)) >> 8)) / 256;
    p.ysp = (q8(p.ysp) + ((speed * sin8(a)) >> 8)) / 256;
  };
  push(q8(p.water ? N.uppercutWaterUp : N.uppercutUp), p.rotation - 0x40);
  push(q8(N.uppercutForward) * sign(p), p.rotation);
  p.state = 'uppercut';
  world.spawnUppercutFlame();
}

// Knuckles in the air (sub_8048E34, and Player_Knuckles_8049000's case for a jump), by p.midAir: going into the
// water not rising floats him; the glide, the drop from it, the slide after it and the climb move first and then
// run their own step; the ledge climb only waits for its animation
function knucklesAir(p, c, world) {
  if (p.curled || p.midAir === 0) {
    // after the uppercut, none of the jump's control
    if (p.curled || p.attack === 0) {
      knucklesJumpCap(p, c);
      tryFloat(p, world);
      airInput(p, c);
    } else tryFloat(p, world);
    bounds(p, world);
    move(p);
    p.ysp += rules(p).gravity;
    tumble(p);
    airCollision(p, world.terrain, () => land(p));
    return;
  }
  if (p.midAir === 9) {
    // a jump off the water goes half as high, and leaves the camera's look as it is this frame
    if (tryJump(p, c, world)) { p.ysp = (q8(p.ysp) >> 1) / 256; p.midAir = 0; p.lookEase = 'still'; return; }
    airInput(p, c);
    bounds(p, world);
    move(p);
    floatStep(p, c, world);
    p.ysp += rules(p).gravity;
    tumble(p);
    airCollision(p, world.terrain, () => land(p));
    return;
  }
  if (p.midAir === 2) tryFloat(p, world);
  glidePhysics(p, c);
  bounds(p, world);
  move(p);
  if (p.midAir === 1) glideStep(p, c, world);
  else if (p.midAir === 2) dropStep(p, c, world);
  else if (p.midAir === 3) slideStep(p, c, world);
  else if (p.midAir === 4) climbStep(p, c, world);
}

// the jump cap, or once the rise has slowed his glide (Player_8044670)
function knucklesJumpCap(p, c) {
  if (p.jumped) {
    const cap = rules(p).jumpReleaseCap;
    if (p.ysp < -cap) { if (!c.jump) p.ysp = -cap; }
    else if (p.midAir === 0 && c.jumpPressed && p.state !== 'hurt') { p.airLock = false; p.midAir = 1; startGlide(p); }
  } else if (!p.forcedRoll && p.ysp < -K.riseCap) p.ysp = -K.riseCap;
}

// left or right and the drag in the air (Player_AirInputControls), none while knocked back
function airInput(p, c) {
  if (p.state === 'hurt') return;
  airControl(p, c, p.state !== 'bounce');
  if (p.ysp < 0) airDrag(p);
}

// the frame he goes into the water not rising, he floats (MOVESTATE_1000), uncurled with his centre where it is
function tryFloat(p, world) {
  if (!p.waterCrossed || !p.water || p.ysp < 0) return;
  p.midAir = 9; p.curled = false; p.airLock = false;
  p.state = 'waterFloat';
  world.spawnFloatSplash();
}

// floating (Player_Knuckles_SwimFloat_8048D74): down lets him sink; under water he rises by 24/256 a frame up to
// 1, and at 4 px under the line he stops there, his breath back and the drowning music stopped; up looks up
function floatStep(p, c, world) {
  if (c.down) { p.state = 'springPeak'; p.midAir = 0; return; }
  if (p.water) p.ysp = Math.max(p.ysp - N.floatRise, -N.floatMaxRise);
  const level = world.waterLevel;
  if (Math.floor(p.y) - 4 < level) {
    p.y = level + 4; p.ysp = 0; p.water = true;
    p.drownFrames = 60; p.drownSeconds = K.drownSeconds;
    world.stopSound(SONG.DROWNING);
  }
  if (c.up) p.state = 'waterFloatUp';
  else {
    if (p.state !== 'waterFloat') world.spawnFloatSplash();
    p.state = 'waterFloat';
  }
}

// his glide heads left from a quarter turn round from right
const glidesLeft = p => s8(p.glideShift + 0x40) <= 0;

// the glide starts (Player_Knuckles_InitGlide): uncurled at 6 px from his centre to his feet, his centre where
// it is, slowing his fall by 1.5, at 3 the way he faces (1.5 under water)
function startGlide(p) {
  p.curled = false; p.offsetY = N.glideOffsetY;
  p.ysp = Math.max(0, p.ysp + N.glideSlow);
  let g = q8(N.glideSpeed);
  if (p.water) g >>= 1;
  p.gsp = p.xsp = g * sign(p) / 256;
  p.glideShift = p.facing < 0 ? 0x80 : 0;
  p.rotation = 0;
  p.glideFlags = 2;
}

// a frame of glide (sub_8048980): its speed and heading, held left or right turning him round 2/256 of a turn a
// frame, a turn begun going on to its end; his X speed follows the heading and his fall eases toward 0.5. On
// each of these frames the camera's look also eases back (camera.js).
function glidePhysics(p, c) {
  p.lookEase = 'glide';
  if (p.midAir !== 1) return;
  let g = Math.abs(q8(p.gsp)), s = p.glideShift;
  const shoes = pace(p) === 2;
  if (g < q8(N.glideSpeed)) g += q8(N.glideAccel);
  else if (g < q8(N.glideMax) && (s & 0x7F) === 0) g += q8(N.glideStraightAccel) + (shoes ? q8(N.glideShoesAccel) : 0);
  if (p.water && g > q8(N.glideSpeed)) {
    g -= q8(N.glideWaterDecel) + (shoes ? q8(N.glideWaterShoesDecel) : 0);
    g = Math.max(g, q8(N.glideSpeed));
  }
  p.gsp = (glidesLeft(p) ? -g : g) / 256;
  if (c.left) { if (s !== 0x80) s = (Math.abs(s8(s)) + 2) & 0xFF; }
  else if (c.right) { if (s !== 0) s = (-Math.abs(s8(s)) + 2) & 0xFF; }
  else if (s & 0x7F) s = (s + 2) & 0xFF;
  p.glideShift = s;
  p.xsp = ((cos8(s) * g) >> 8) / 256;
  p.ysp = (q8(p.ysp) + (q8(p.ysp) < q8(N.glideFall) ? 1 : -1) * q8(N.glideFallStep)) / 256;
}

// how he glides (Player_Knuckles_GlideUpdateAnim): straight, or under water swimming and letting bubbles out,
// facing left only when heading straight left; turning, one of four frames by how far round
function glideAnim(p, world) {
  const s = p.glideShift;
  p.pushing = false; p.facing = 1;
  if ((s & 0x7F) === 0) {
    if (p.water) { p.state = 'swim'; swimBubbles(p, world); }
    else p.state = 'glide';
    if (s === 0x80) p.facing = -1;
  } else p.state = 'glideTurn' + ((Math.abs(s8(s)) & 0x7F) >> 5);
}

// stood up out of the glide or the climb (sub_8022318), his feet 14 px under his centre: curled, he uncurls
// keeping his feet in place; otherwise his centre stays where it is
function standFromGlide(p) {
  if (p.curled) {
    p.curled = false; p.state = 'idle';
    let dy = p.offsetY - SPRITE_OFFSET_Y;
    if (p.inverted) dy = -dy;
    if (s8(p.rotation + 0x40) <= 0) dy = -dy;
    p.y += dy;
  }
  p.offsetY = SPRITE_OFFSET_Y;
  p.air = false; p.pushing = false; p.airLock = false; p.jumped = false; p.halfPipe = false;
  p.chain = 0; p.midAir = 0;
  if (KNUCKLES_STATES.has(p.state)) p.state = 'idle';
}

// letting go of the glide or losing the wall: he drops, standing height from his centre
function startDrop(p) {
  p.midAir = 2; p.state = 'glideDrop';
  p.offsetY = SPRITE_OFFSET_Y;
  p.glideFlags |= 2;
}

// the glide's frame after it moves (sub_8048230): touching down on a steep slope stands him up, on flatter
// ground he slides on with the slide's sound; a wall he grabs, if it is flat for his height and the ground under
// its foot leaves room, and otherwise he drops; letting go of jump drops him with a quarter of his X speed
function glideStep(p, c, world) {
  const t = world.terrain;
  glideCollision(p, t);
  if (!(p.glideFlags & 2)) {
    p.facing = p.xsp <= 0 ? -1 : 1;
    if ((p.rotation + 0x20) & 0xC0) {
      p.facing = glidesLeft(p) ? -1 : 1;
      p.ysp = 0;
      standFromGlide(p);
      p.state = p.gsp !== 0 ? 'walk' : 'idle';
    } else {
      p.midAir = 3; p.state = 'glideSlide';
      world.playSound(SONG.SLIDE);
    }
  } else if (p.glideFlags & 0x20) {
    const dir = glidesLeft(p) ? -1 : 1, w = wallBeside(p, t, dir);
    p.facing = dir;
    if (w.d !== w.out) { startDrop(p); return; }
    if (w.d !== 0) {
      // the ground at the wall's foot, a pixel past his feet; not looked at to the right under flipped gravity
      if (dir < 0 || !p.inverted) {
        const up = p.inverted ? -1 : 1;
        const foot = scan(t, Math.floor(p.y) + up * (1 + p.offsetY), Math.floor(p.x) + dir * (1 + SOX), p.layer, 8 * up, PROBE_FLOOR).d;
        if (foot < 0) { startDrop(p); return; }
      }
      p.x += dir * w.d;
    }
    p.gsp = 0; p.xsp = 0; p.ysp = 0;
    p.midAir = 4; p.glideShift = 3; p.state = 'wallGrab';
  } else if (!c.jump) {
    p.midAir = 2; p.state = 'glideDrop';
    p.facing = p.xsp <= 0 ? -1 : 1;
    p.xsp = (q8(p.xsp) >> 2) / 256;
    p.offsetY = SPRITE_OFFSET_Y;
  } else glideAnim(p, world);
}

// the drop (sub_80484CC): air control and gravity after he moves; landing stops him, and on flat ground he lands
// into a crouch that holds left and right for 15 frames
function dropStep(p, c, world) {
  airInput(p, c);
  p.ysp += rules(p).gravity;
  glideCollision(p, world.terrain);
  if (p.glideFlags & 2) return;
  p.gsp = 0; p.xsp = 0; p.ysp = 0;
  p.offsetY = SPRITE_OFFSET_Y;
  standFromGlide(p);
  if (!((p.rotation + 0x20) & 0xC0)) { p.lock = N.landLock; p.state = 'dropLand'; }
}

// the slide after a glide (sub_80485CC): while jump is held and he hasn't stopped he slides on, slowing, and
// otherwise he gets up at standing height, into the end of a crouch, holding left and right for 15 frames
function slideStep(p, c, world) {
  if (c.jump) {
    if (p.xsp <= 0) { p.xsp += N.slideFriction; if (p.xsp < 0) { slideOn(p, world); return; } }
    else { p.xsp -= N.slideFriction; if (p.xsp > 0) { slideOn(p, world); return; } }
  }
  p.gsp = 0; p.xsp = 0; p.ysp = 0;
  p.y += (p.inverted ? -1 : 1) * (p.offsetY - SPRITE_OFFSET_Y);
  standFromGlide(p);
  p.lock = N.landLock; p.state = 'crouchEnd';
}

// sliding on (sub_8048524): dust at his feet every 4th frame; he follows the ground less than 12 px under him,
// and with none, unless he is on an object, he drops at standing height
function slideOn(p, world) {
  const t = world.terrain;
  if (world.tick % 4 === 0) world.brakeDust(Math.floor(p.x), Math.floor(p.y) + (p.inverted ? -p.offsetY : p.offsetY));
  glideCollision(p, t);
  const f = floorUnder(p, t);
  if (f.d < 12) { p.y += p.inverted ? -f.d : f.d; p.rotation = f.rot; }
  else if (!p.onObject) { p.midAir = 2; setOffsetY(p, SPRITE_OFFSET_Y); p.glideFlags |= 2; }
}

// the wall he climbs, 2 px past his side at his centre's height (sub_8048650), whose angle he takes (a quarter
// turn where it has none); the original reads its angle from an unset byte when nothing is there, which here
// leaves his angle as it was
function climbWall(p, t) {
  const dir = p.facing, r = scan(t, Math.floor(p.x) + dir * (2 + SOX), Math.floor(p.y), p.layer, 8 * dir, PROBE_WALL);
  if (r.rot !== undefined) p.rotation = r.rot & 1 ? (dir < 0 ? 0x40 : 0xC0) : r.rot;
  return r.d;
}

// climbing (sub_80486E8), standing on nothing: up climbs while the wall reaches his head, and onto the ledge where
// it ends, stopped by a ceiling 9 px over him; down climbs while it reaches his feet, until the ground; still, he
// keeps to it until the ground. Off the wall, or on an object, he drops. Jump leaps off it, 2.625 up and 3 away,
// curled up.
function climbStep(p, c, world) {
  const t = world.terrain, up = p.inverted ? -1 : 1;
  if (p.onObject) { startDrop(p); return; }
  p.gsp = 0; p.xsp = 0; p.ysp = 0;
  if (p.state !== 'wallGrab') p.state = 'climb';
  let s = q8(p.water ? N.climbWaterSpeed : N.climbSpeed);
  if (pace(p) === 2) s <<= 1;
  const stand = f => {
    p.y += f.d; p.rotation = f.rot;
    standFromGlide(p);
    p.state = 'glideDrop';
  };
  if (c.up || c.down) {
    const dy = up * p.offsetY * (c.up ? -1 : 1);
    p.y += dy;
    const d = climbWall(p, t);
    p.y -= dy;
    if (c.up) {
      if (d > 2) {
        p.state = 'ledgeClimb';
        p.y -= up * p.offsetY;
        p.midAir = 5; p.glideShift = 0;
        return;
      }
      if (d >= 0) {
        p.y -= up * 9;
        const ceiling = actCeiling(p, t).d;
        p.y += up * 9;
        p.state = 'climbUp';
        if (ceiling < 0) p.y -= ceiling;
        else p.ysp = -s / 256;
        p.lookEase = 'glide2';
      }
    } else {
      if (d > 0) { startDrop(p); return; }
      const f = actFloor(p, t);
      if (f.d < 0) { stand(f); return; }
      p.state = 'climbDown'; p.ysp = s / 256;
      p.lookEase = 'glide2';
    }
  } else {
    if (climbWall(p, t) > 0) { startDrop(p); return; }
    const f = actFloor(p, t);
    if (f.d < 0) { stand(f); return; }
  }
  if (c.jumpPressed) {
    p.facing = -p.facing;
    p.ysp = -N.wallJumpY; p.xsp = N.wallJumpX * p.facing;
    p.curled = true; p.air = true; p.jumped = true; p.offsetY = BALL_SPRITE_OFFSET_Y;
    p.state = 'spin'; p.midAir = 0;
  }
}

// the angle he left the ground at eases back to upright; off a bounce block he tumbles the way he faces
// instead (Player_8047224)
function tumble(p) {
  if (p.state === 'bounce') p.rotation = (p.rotation + 4 * p.facing) & 0xFF;
  else upright(p);
}

// left or right in the air (Player_AirInputControls): twice the walking acceleration up to the top speed,
// turning him to face that way unless `turn` is false; not after a jump out of a roll
function airControl(p, c, turn) {
  if (p.airLock || !c.dir) return;
  const dir = c.dir, acc = p.boostMode ? 2 * B.acceleration[p.boostTier] / 256 : accel(p) * 2, max = topSpeed(p);
  if (turn) p.facing = dir;
  let v = p.xsp + acc * dir;
  if (v * dir > max) {
    v -= acc * dir;
    if (v * dir < max) v = max * dir;
  }
  p.xsp = v;
}

// while rising, X speed loses 1/32 of itself (sub_80236C8)
function airDrag(p) {
  const drag = Math.floor(p.xsp * 256 / 32) / 256;   // arithmetic shift of the 8.8 value
  p.xsp = p.xsp > 0 ? Math.max(0, p.xsp - drag) : p.xsp < 0 ? Math.min(0, p.xsp - drag) : 0;
}

// the angle he left the ground at eases back to upright, 2/256 of a turn a frame
function upright(p) {
  const r = s8(p.rotation);
  p.rotation = (r > 0 ? Math.max(0, r - 2) : Math.min(0, r + 2)) & 0xFF;
}

// Sonic Advance 2's mid-air tricks, an extra on top of the original game (SAT-R decompilation of Sonic Advance
// 2: DoTrickIfButtonPressed, Player_InitDefaultTrick, Player_WindupDefaultTrick and Player_DefaultTrick in
// src/game/shared/stage/player.c, and the Stop 'n' Slam in src/game/sa2/stage/player_callbacks.c). They run on
// Sonic Advance 2's code: each frame its bounds check, gravity, then the move, as that game's trick callbacks
// do it. Each trick has a wind-up, in which he hangs in the air until its animation ends.
const TRICK_STATES = {
  up: ['trickUp', 'trickUpRise'], forward: ['trickForward', 'trickForwardSpin'], back: ['trickBack', 'trickBackFlip'],
  bound: ['bound', 'boundDive'],
};

// in the air, free to move, once each time he leaves the ground and not just after a spring
const canTrick = p => p.tricks && p.air && !p.trickUsed && p.trickDelay === 0 && p.state !== 'hurt' && !p.grinding
  && !p.halfPipe && !p.ignoreInput;

// a press picks the trick from the d-pad, up first, then down, then the way he faces, and otherwise (alone or
// back) the Back Star. It scores 100 and starts on the next frame; this one goes on as it would.
function tryTrick(p, c, world) {
  if (!c.trickPressed || !canTrick(p)) return;
  const held = p.held[0], ahead = p.facing > 0 ? RIGHT : LEFT;
  const kind = held & UP ? 'up' : held & DOWN ? (p.tricks.bound ? 'bound' : null) : held & ahead ? 'forward' : 'back';
  if (!kind) return;
  p.trick = { kind, phase: 'start', spin: 0 };
  p.trickUsed = true;
  world.trickScore(T.score);
}

// his movement in a trick, Sonic Advance 2's (sub_80283C4 and Player_DefaultTrick): no gravity unless asked
function trickMove(p, world, gravity) {
  bounds(p, world);
  if (gravity) p.ysp += rules(p).gravity;
  p.ysp = Math.min(p.ysp, T.maxFall);
  p.x += p.xsp; p.y += p.ysp;
  upright(p);
  airCollision(p, world.terrain, () => land(p));
}

// a trick's first frame (Player_InitDefaultTrick, Player_SonicAmy_InitStopNSlam): it ends what he was doing, stops
// him, stands him up (curled up for the Bound) and plays the jump and trick sounds (none for the Bound)
function startTrick(p, t, world) {
  endAttack(p);
  p.trick = t;
  if (p.boost) stopBoost(p);
  p.pushing = false;
  p.xsp = 0; p.ysp = 0;
  p.state = TRICK_STATES[t.kind][0];
  if (t.kind === 'bound') setOffsetY(p, BALL_SPRITE_OFFSET_Y);
  else {
    setOffsetY(p, SPRITE_OFFSET_Y);
    if (t.kind === 'forward') t.spin = T.spinFrames;
    world.playSa2(SA2_SE.jump);
    world.playSa2(SA2_SE.trick);
  }
  t.phase = 'windup';
}

// the Bound off the ground: back up at 6 px a frame away from the surface, half of its sideways part kept, in the
// dive's animation (charState INVALID leaves it as it is)
function bounce(p, t, world) {
  const a = p.rotation, push = -T.boundBounce;
  p.xsp = (-((push * sin8(a)) >> 8) >> 1) / 256;
  p.ysp = -Math.abs((push * cos8(a)) >> 8) / 256;
  p.air = true; p.onObject = null; p.trickUsed = true;
  p.trick = t; t.phase = 'up';
  p.state = 'boundDive';
  world.playSa2(SA2_SE.boundImpact);
}

function trickStep(p, c, world) {
  const t = p.trick, ended = p.anim.name === TRICK_STATES[t.kind][0] && p.anim.done;
  switch (t.phase) {
    case 'start':
      startTrick(p, t, world);
      if (t.kind === 'bound') { trickMove(p, world, false); return; }
      // falls through: the wind-up's first frame
    case 'windup':
      if (t.kind === 'bound') {
        // Player_SonicAmy_WindupStopNSlam: it moves first, then dives at 2 px a frame as the wind-up ends,
        // leaving afterimages
        trickMove(p, world, false);
        if (p.trick !== t || !ended) return;
        p.ysp = T.boundStart / 256;
        p.state = 'boundDive'; t.phase = 'dive';
        world.trickEffect('bound');
        return;
      }
      // Player_WindupDefaultTrick: as the wind-up ends he is thrown, and the Humming Top's spin effect starts
      if (ended) {
        const [vx, vy] = p.tricks[t.kind];
        p.xsp = vx * p.facing / 256; p.ysp = vy / 256;
        p.state = TRICK_STATES[t.kind][1]; t.phase = 'trick';
        if (t.kind === 'forward') world.trickEffect('spin');
      }
      trickMove(p, world, false);
      return;
    case 'trick':
      // Player_DefaultTrick: the Hop Jump turns to its fall once he comes down, and the Humming Top ends in a
      // fall after its spin; he steers without turning round, and the drag and gravity work as usual
      if (t.kind === 'up' && p.state === 'trickUpRise' && p.ysp > 0) p.state = 'trickUpFall';
      if (t.spin !== 0) t.spin--;
      else if (t.kind === 'forward') p.state = 'trickFall';
      airControl(p, c, false);
      if (p.ysp < 0) airDrag(p);
      trickMove(p, world, true);
      return;
    case 'dive':
      // Player_SonicAmy_StopNSlam: faster each frame, until he hits the ground and bounces
      p.ysp += T.boundDrop / 256;
      trickMove(p, world, false);
      if (p.trick?.phase === 'landed') bounce(p, p.trick, world);
      return;
    case 'landed':
      // his dive met an object, which stood him on it
      bounce(p, t, world);
      return;
    case 'up':
      // Player_SonicAmy_StopNSlam_AfterGroundCollision: slowing the same way, and rising, then he falls
      p.ysp += T.boundDrop / 256;
      if (p.ysp >= 0) { p.state = 'boundRise'; t.phase = 'fall'; }
      trickMove(p, world, false);
      return;
    case 'fall':
      // Player_SonicAmy_StopNSlam_FallAfterCollision: as in any fall
      airControl(p, c, true);
      if (p.ysp < 0) airDrag(p);
      trickMove(p, world, true);
  }
}

/** Touching down on the ground or an object (sub_8021BE0); the caller sets the ground speed. A Bound's dive
 *  bounces off it instead, on his next movement (trickStep). */
export function land(p) {
  const bound = p.trick?.phase === 'dive';
  p.trickUsed = false;
  p.air = false; p.pushing = false;
  // in a mini loop he lands rolling, as he was
  if (!p.forcedRoll) {
    if (!p.actClear && !p.scripted) p.state = 'walk';
    if (p.curled) uncurl(p);
    p.offsetY = SPRITE_OFFSET_Y;   // set outright, even when something uncurled him without moving him
  }
  p.airLock = false;
  p.chain = 0;
  endAttack(p);
  if (bound) p.trick = { kind: 'bound', phase: 'landed' };
}

/** On the ground past the goal and fast enough, Sonic lands into his act-clear run (Task_ShowResults). */
export function startActClear(p) {
  land(p);
  p.state = 'actClearRun'; p.actClear = true;
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
  p.boostMode = false;   // a hit ends Boost Mode (Player_InitHurt)
  p.xsp = p.xsp < 0 || (p.xsp === 0 && p.facing < 0) ? K.hurtSpeedX : -K.hurtSpeedX;
  p.ysp = -K.hurtSpeedY;
  if (p.water) { p.xsp = (q8(p.xsp) >> 1) / 256; p.ysp = (q8(p.ysp) >> 1) / 256; }
  p.onObject = null; p.air = true; p.pushing = false;
  endAttack(p, true);   // Tails' propeller goes on
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

/**
 * Knocks Sonic off at the given speeds in his hurt state, blinking as after a hit but keeping his rings, as
 * the boss capsule does when it lands on him (Task_801623C).
 */
export function knockAside(p, xsp, ysp) {
  p.invulnerable = K.invulnerable;
  p.xsp = xsp; p.ysp = ysp;
  p.onObject = null; p.air = true; p.pushing = false;
  endAttack(p, true);   // as a hit, Tails' propeller goes on
  p.airLock = false;
  p.state = 'hurt';
  uncurl(p);
}

// dead (Task_PlayerMain's death block, then Task_PlayerDied and Task_PlayerHandleDeath): on the first frame he
// stops moving sideways (his ground speed is left as it was), loses a shield or invincibility, and the camera
// and clock stop; then he falls through everything until he is 80 px below the screen (above it under flipped
// gravity), and the act restarts 61 frames later. Drowned, the death has its own sound, and he sinks as slowly
// as anything under water.
function deadStep(p, world) {
  if (!p.death) {
    p.death = 'falling'; p.state = 'dead';
    p.xsp = 0; p.invulnerable = 2; p.onObject = null; p.pushing = false;
    // itemEffect cleared: a shield and invincibility's stars go (the speed shoes' timer is left)
    p.shield = null; p.invincible = 0;
    endAttack(p);
    world.died(p.drownSeconds < 0);
    return;
  }
  if (p.death === 'falling') {
    const gone = p.inverted ? p.y <= world.cameraY - K.deadBelowScreen + SCREEN_H : p.y >= world.cameraY + K.deadBelowScreen - 1 / 256;
    if (gone) { p.death = 'gone'; p.countdown = K.deadRestart; p.hidden = true; return; }
    move(p);
    p.ysp += rules(p).gravity;
    return;
  }
  if (p.countdown !== 0) p.countdown--;
  else world.lifeLost();
}

/**
 * Advances the player one frame. `world` provides tick, cameraY, camera, terrain, died(drowned), lifeLost(),
 * spawnDashDust(), spawnInstaShield(), spawnTailSwipe(), freezeCamera(), playSound(song), playSoundOrChange(song),
 * stopSound(song) and playSoundPitched(song, pitch), the water's waterLevel, surfaceSplash(x), drownCountdown(n),
 * drowningMusic(), drowned(), breathOut(x, y), airBubble(x, y, dx, group) (8.8) and random(), for the Rush boost
 * rush (its setting) and boosted(), for Boost Mode boostMode (its setting), ringCount, boostModeStarted()
 * and actOver (true once the act's end has taken Sonic's controls; absent before an act can end), and for
 * Sonic Advance 2's tricks tricks (their setting), trickScore(points), playSa2(song) and
 * trickEffect('spin' | 'bound').
 */
export function stepPlayer(p, input, world) {
  const left = input.left, right = input.right, sideways = left || right;
  const bits = (left ? LEFT : 0) | (right ? RIGHT : 0) | (input.up ? UP : 0) | (input.down ? DOWN : 0);
  p.pressed.pop(); p.pressed.unshift(bits & ~p.held[0]);
  p.held.pop(); p.held.unshift(bits);
  // Player_HandleInputs: while an object holds his controls heldInput stays as it was and nothing is pressed
  if (p.ignoreInput) p.pressedDirs = 0;
  else {
    const mask = v => v & (LEFT | RIGHT) ? v & ~(UP | DOWN) : v;
    p.pressedDirs = mask(bits & ~p.heldDirs);
    p.heldDirs = mask(bits);
  }

  // holding left or right hides up and down from the movement code
  const c = {
    dir: left && !right ? -1 : right && !left ? 1 : 0, sideways, left, right,
    up: input.up && !sideways, down: input.down && !sideways,
    jump: input.jump, jumpPressed: input.jumpPressed, attackPressed: input.attackPressed,
    boost: input.boost, boostPressed: input.boostPressed, trickPressed: input.trickPressed,
  };
  input.jumpPressed = false; input.attackPressed = false; input.boostPressed = false; input.trickPressed = false;
  p.jumpPressed = c.jumpPressed; p.attackPressed = c.attackPressed;
  p.lookEase = '';

  if (!world.boostMode) { p.boostMode = false; p.boostMeter = 0; }
  else if (!p.dead) boostModeState(p, world);
  if (world.rush) rushBoost(p, c, world);
  else if (p.boost) stopBoost(p);

  if (p.dead) { deadStep(p, world); return; }
  handleWater(p, world);
  if (p.carried) return;
  if (p.trick) trickStep(p, c, world);
  else if (p.air) {
    if (world.tricks) tryTrick(p, c, world);
    airStep(p, c, world);
  } else groundStep(p, c, world, input);
}

// the countdown's numbers, by the second they show at (SpawnDrowningCountdownNum)
const COUNTDOWN = { 12: 5, 10: 4, 8: 3, 6: 2, 4: 1, 2: 0 };

// Player_HandleWater, before he moves: he is in the water while his centre is 4 px or more below its line
// (world.waterLevel, -1 in an act without water). Going in halves his X speed and quarters his Y speed,
// coming out doubles his Y speed, and each makes a splash at the line with its sound, at most one every
// 10 frames. Under water a second goes every 60 frames: at 12, 10, 8, 6, 4 and 2 a number counts down over
// him, at 11 the drowning music starts and below 0 he drowns; every 16th frame of the stage clock he lets a
// bubble out, one time in four. Out of the water the count starts over and the drowning music stops.
function handleWater(p, world) {
  const level = world.waterLevel;
  p.waterCrossed = false;
  if (level >= 0 && Math.floor(p.y) - 4 >= level) {
    if (!p.water) {
      p.water = true; p.waterCrossed = true;
      p.xsp = (q8(p.xsp) >> 1) / 256; p.ysp = (q8(p.ysp) >> 2) / 256;
      surfaceSplash(p, world);
    }
    if (--p.drownFrames < 1) {
      const second = p.drownSeconds--;
      if (second === 11) world.drowningMusic();
      else if (second in COUNTDOWN) world.drownCountdown(COUNTDOWN[second]);
      if (p.drownSeconds < 0) { p.dead = true; p.ysp = 0; world.drowned(); }
      p.drownFrames = 60;
    }
    if (world.tick % 16 === 0 && (world.random() & 0x300) === 0) world.breathOut(p.x + (p.facing < 0 ? -4 : 4), p.y - 4);
  } else {
    if (p.water) {
      p.water = false; p.waterCrossed = true;
      p.ysp = (((q8(p.ysp) << 17) >> 16)) / 256;
      surfaceSplash(p, world);
    }
    p.drownFrames = 60; p.drownSeconds = K.drownSeconds;
    if (level >= 0) world.stopSound(SONG.DROWNING);
  }
  if (p.surfaceT !== 0) p.surfaceT--;
}

// none while Knuckles floats on the water
function surfaceSplash(p, world) {
  if (p.surfaceT >= 1 || (p.character === KNUCKLES && p.midAir === 9)) return;
  p.surfaceT = K.surfaceEffectDelay;
  world.surfaceSplash(Math.floor(p.x));
}

/**
 * A breath from an air bubble (Task_BubbleContainingAir): his moves end, he uncurls (in the air without
 * moving his centre), stops dead, and the drowning count starts over.
 */
export function breathe(p) {
  endAttack(p);
  p.state = 'breathe';
  if (p.curled) {
    if (p.air) { p.curled = false; p.offsetY = SPRITE_OFFSET_Y; } else uncurl(p);
  }
  p.xsp = 0; p.ysp = 0; p.gsp = 0; p.pushing = false;
  p.drownFrames = 60; p.drownSeconds = K.drownSeconds;
}

// state -> animation, with the walk cycle's speed and the idle timer (sub_802486C); under water every
// animation plays at half its speed, rounded up
function chooseAnimation(p, input) {
  const name = pickAnimation(p, input);
  if (p.water) p.anim.speed -= p.anim.speed >> 1;
  return name;
}

function pickAnimation(p, input) {
  const a = p.anim, speed = Math.abs(p.gsp);
  a.speed = ANIMATION.normalSpeed;
  if (p.gsp !== 0 || input.left || input.right || input.up || input.down || input.jump || input.attack || input.boost || input.trick) p.idleT = K.boredDelay;
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
    case 'turn': case 'breathe': p.state = 'walk'; break;
    case 'flyTurn': p.state = 'fly'; break;
    case 'swimTurn': p.state = 'swim'; break;
    case 'tailSwipe':
      p.attack = 0; p.attackNext = 0; p.chain = 0;
      p.state = p.gsp !== 0 ? 'walk' : 'idle';
      break;
    case 'spring': case 'springPeak': p.state = 'springFall'; break;
    // Knuckles' punches: another queued goes on to the next, 3 faster with its sound, and otherwise he stands
    case 'punch1': case 'punch2':
      if (p.attackNext !== 0) {
        p.attack++; p.attackNext = 0;
        world.playSound(p.state === 'punch2' ? SONG.PUNCH_3 : SONG.PUNCH_2);
        p.state = p.state === 'punch1' ? 'punch2' : 'punch3';
        p.gsp += N.punchSpeed * sign(p);
      } else { p.attack = 0; p.attackNext = 0; p.state = 'idle'; p.chain = 0; p.gsp = 0; }
      break;
    // up onto the ledge: 9 px onto it and stood up, 14 px up (down the act under flipped gravity, by his new height)
    case 'ledgeClimb':
      p.x += (SOX + 3) * sign(p);
      p.offsetY = SPRITE_OFFSET_Y;
      p.y += p.inverted ? p.offsetY : -SPRITE_OFFSET_Y;
      p.state = 'ledgeTop'; p.attack++;
      break;
    case 'ledgeTop': p.rotation = 0; land(p); break;
    case 'dropLand': land(p); break;
    case 'wallGrab': p.state = 'climb'; break;
    case 'spinAttack': case 'slideEnd':
      endAttack(p); p.state = p.gsp !== 0 ? 'walk' : 'idle'; break;
    case 'somersault':
      if (p.attackNext === 1) {
        p.gsp = K.slideSpeed * sign(p); p.attack++; p.attackNext = 0; p.state = 'slide';
        world.playSound(SONG.SLIDE);
      } else if (p.attackNext === 2) {
        endAttack(p);
        p.xsp = -p.xsp; p.ysp = -rules(p).jumpSpeed;   // flips backwards, away from the way he was going
        p.air = true; curl(p); p.state = 'backflip';
        world.playSound(SONG.JUMP);
      } else { endAttack(p); p.state = 'idle'; p.gsp = 0; }
      break;
  }
}

// a hitbox under his facing, and turned over under flipped gravity, as the sprite system applies his
// sprite's flips when the box is set
function flipBox(box, flipX, flipY) {
  if (!box) return box;
  let [l, t, r, b] = box;
  if (flipY) [t, b] = [-b, -t];
  if (flipX) [l, r] = [-r, -l];
  return [l, t, r, b];
}

// a new animation clears both his hitboxes until its script sets them (sub_802486C); true if it starts one.
// Bouncing off a bounce block shows the walk animation (4, variant 0): only a new animation or variant
// restarts the sprite, so between the two states the cycle carries on where it was.
const SAME_ANIMATION = { bounce: 'walk' };
function choose(p, name, restart = false) {
  const was = p.anim.name;
  if (!restart && was !== name && (SAME_ANIMATION[was] ?? was) === (SAME_ANIMATION[name] ?? name)) { p.anim.name = name; return false; }
  const fresh = was !== name || restart;
  if (was !== name) p.boxes = [null, null];
  setAnim(p.anim, name, restart);
  return fresh;
}

// steps his animation; the hitboxes set before a frame take effect when it appears, and stay until the
// script sets them again, and the tail swipe's commands play its sound
function stepAnim(p, anims, world) {
  const i = p.anim.i, ended = tickAnim(p.anim, anims);
  const f = p.anim.i !== i && anims[p.anim.name].frames[p.anim.i];
  if (f && p.anim.name === 'tailSwipe' && p.anim.i === SWIPE_SOUND_FRAME) world.playSound(SONG.TAIL_SWIPE);
  if (f?.[2]) for (const [slot, box] of Object.entries(f[2])) if (slot < 2) p.boxes[slot] = flipBox(box, p.facing > 0, p.inverted);
  // it keeps the order a frame sets (animCmd_SetOamOrder) after the animation
  if (f?.[3] !== undefined) p.order = f[3];
  return ended;
}

/**
 * Picks and steps Sonic's animation after his frame of movement, like the original sprite update, then
 * decides whether he is drawn: alive, he isn't while an object hides him, and after a hit he blinks, 2 frames
 * hidden and 2 shown in step with the stage clock; the blink timer runs down once he has landed. Then the speed shoes and invincibility count down.
 */
export function animatePlayer(p, input, anims, world) {
  if (p.death === 'gone') return;
  // whether this frame's pick starts an animation, which a multiplayer packet tells the others; the original
  // reads it as its sprite routine starts, so the picks after an animation ends below don't count
  p.newAnim = choose(p, chooseAnimation(p, input), p.animRestart);
  p.animRestart = false;
  if (p.state === 'brake' && world.tick % 4 === 0) world.spawnBrakeDust();
  for (let guard = 0; guard < 4; guard++) {
    if (!stepAnim(p, anims, world)) break;
    const before = p.state;
    afterAnimation(p, world);
    if (p.state === before) break;
    choose(p, chooseAnimation(p, input));
  }
  p.prevState = p.state;
  if (p.trickDelay > 0) p.trickDelay--;
  p.hidden = !p.dead && (p.invisible || (p.invulnerable > 0 && (world.tick & 2) !== 0));
  // the timers as they were before this frame's countdown, which a multiplayer packet sends
  p.sent = { invulnerable: p.invulnerable, invincible: p.invincible, speedUp: p.speedUp };
  // dead, the timers count down only on the frame he dies: the tasks that take over from then on leave them
  if (p.dead && p.invulnerable === 1) return;
  if (p.state !== 'hurt' && p.invulnerable > 0) p.invulnerable--;
  // the speed shoes and invincibility run out
  if (p.speedUp > 0 && --p.speedUp === 0) world.speedUpOver();
  if (p.invincible > 0 && --p.invincible === 0) world.invincibilityOver();
}
