// Game rules, in pixels and 1/60 s frames. Values follow the original game as documented by the
// SAT-R decompilation (src/game/shared/stage/player.c, src/game/sa1/stage/player_sonic.c,
// src/game/shared/stage/camera.c) and were checked against the USA ROM's code (see docs/ROM.md).

export const SCREEN_W = 240, SCREEN_H = 160;   // Game Boy Advance screen
// The widescreen view's largest size. Objects and enemies exist up to 128 px past each edge of the original
// screen, so a view 64 px wider on each side and 24 px taller on each side never shows them appear or vanish.
export const VIEW_MAX_W = 368, VIEW_MAX_H = 208;
export const TICK_MS = 1000 / 60;

export const PHYSICS = {
  acceleration: 8 / 256,
  deceleration: 96 / 256,      // pressing against the direction of motion
  friction: 8 / 256,           // no direction held
  maxRunSpeed: 4.5,            // walking can't accelerate past this (faster speeds are kept)
  brakeMinSpeed: 3,            // still this fast after decelerating: skid
  reverseKick: 96 / 256,       // speed in the new direction after crossing zero
  airAcceleration: 16 / 256,   // twice the ground acceleration, same 4.5 cap
  airDragShift: 5,             // while rising, X speed loses 1/32 of itself every frame
  gravity: 42 / 256,
  jumpSpeed: 4.875,
  jumpReleaseCap: 3,           // letting go of jump while rising faster than this caps the rise
  riseCap: 11.8125,            // rising without having jumped never goes faster than this
  rollFriction: 4 / 256,       // half the acceleration
  rollDeceleration: 24 / 256,
  forcedRollSpeed: 3,          // a mini loop's roll picks up again at this when it would stop
  boredDelay: 360,             // 6 seconds without input
  // spin dash charge, in 1/256 units: each rev adds 2.0 and raises it to at least 8.0, and it decays by
  // 1/32 per frame. The release speed is read from the ROM's tables by the charge's integer part.
  dashRev: 0x200, dashRevMin: 0x800, dashDustBigAbove: 0x200,
  airDashBoost: 4.5 / 4,       // a quarter of the top speed, added by the mid-air dash
  airDashWindow: 10,           // the double tap's first press must lie 5–10 frames back
  airDashMinGap: 5,
  // B button on the ground: spin, then somersault kick, then slide kick or backflip
  spinAttackSpeed: 2, somersaultSpeed: 3, slideSpeed: 4,
  attackFriction: 8 / 256, slideFriction: 32 / 256,
  wallMinSpeed: 1.875,         // slower than this on a wall or ceiling, Sonic drops off
  slipLock: 30,                // grounded frames without control after dropping off
  springSpeeds: [7.5, 9, 10.5, 12], // a spring's launch speed, picked by its d0 (sData0Accel)
  springPeakSpeed: 1.5,        // rising slower than this off a spring, Sonic tops out (charState 21 to 18)
  // getting hurt (Coll_DamagePlayer) and dying (Task_PlayerDied, Task_PlayerHandleDeath)
  invulnerable: 120,           // frames of blinking after a hit, counted once he has landed
  hurtSpeedX: 1.5, hurtSpeedY: 3,
  deadBelowScreen: 240,        // gone once his centre is this far below the top of the screen
  deadRestart: 60,             // then the act restarts on the 61st frame
};

export const ANIMATION = {
  runSpeed: 4.5,               // walk animation below, figure-8 run at or above
  brakeTurnSpeed: 1.5,         // skid turns into the turn-after-braking animation below this
  normalSpeed: 0x10,           // animSpeed 0x10 = 1.0×
  minWalkSpeed: 0x08,          // walk animation never slower than 0.5×
};

export const CAMERA = {
  deadZoneX: 8,
  maxSpeedX: 16,
  maxSpeedY: 12,
  airDeadZoneY: 24,            // opens 4px per frame while airborne, closes 4px per frame on the ground
  lookDelay: 120,              // hold up/down this long before the view pans
  lookStep: 2,
  lookUp: 72,
  lookDown: 60,
  spinDashFreeze: 10,          // frames the camera target stays put after a spin dash release
};

// spriteOffsetY: the distance from Sonic's position (his centre) to the ground sensors, standing and
// curled up. The surface starts on the row below, and the camera eases toward spriteOffsetY - 4.
export const SPRITE_OFFSET_Y = 14, BALL_SPRITE_OFFSET_Y = 9;

// Sonic Rush's boost, an optional extra (off unless chosen): Rush keeps speeds in the same 8.8 pixels a
// frame at 60 frames a second, so its numbers carry over as they are. Read from Sonic Rush (USA): Sonic's
// physics table and the boost's start, end, movement and camera code in the stage overlay, and checked in
// an emulator. Speeds and accelerations in 1/256 px.
export const RUSH_BOOST = {
  acceleration: 0x30, deceleration: 0x50, topSpeed: 0xC00,   // while boosting, in place of Rush's 0x18, 0x40, 0x900
  jogSpeed: 691,               // the acceleration tapers off above 30% of the normal top speed
  slopeTop: 0x200,             // the top speed rises by up to 2.0 on slopes (by the angle's sine, when positive)
  startSpeed: 0xC00,           // a press sets the ground speed to at least 12.0 the way Sonic faces
  minSpeed: 0x600,             // moving less than 6 px a frame on the ground for more than 8 frames ends it
  slowFrames: 8,
  cooldown: 8,                 // frames before the next boost can start
  box: [-32, -32, 32, 32],     // the attack box around his centre while boosting
  // the camera: Sonic is shown off centre by a lead that eases toward a target. For 8 frames after the start
  // the target grows with his movement, so the view falls behind, eased by 1/4; then it is 16 times the
  // distance he moved ahead of him (8 times vertically), eased by 1/16, within these limits (8.8 px)
  scrollDelay: 8, leadX: 0x5800, leadUp: -0x4800, leadDown: 0x1600, leadMinX: 0x1000, leadMinY: 0x2800,
  // the screen shake at the start and on each hit: 8 frames of offsets, starting over on each
  shake: [[-2, 2], [2, -4], [2, -4], [-4, 4], [4, -2], [4, -2], [-2, 0], [4, 2]],
};

// Sonic Advance 2's Boost Mode, an optional extra (off unless chosen): Sonic Advance 2 keeps speeds in the same
// 8.8 pixels a frame at 60 frames a second, so its numbers carry over as they are. From the SAT-R decompilation
// of Sonic Advance 2 (src/game/shared/stage/player.c, boost_effect.c and camera.c), with the tables read from
// the USA ROM and the timings checked in an emulator. Speeds and accelerations in 1/256 px.
export const BOOST_MODE = {
  // the ring count picks a tier (Player_HandleBoostThreshold): 150 or more, 100, 50, more than 10, fewer
  tierRings: [150, 100, 50, 11],
  // by tier from the fewest rings: the acceleration while boosting, and the meter's rise each frame at top
  // speed; and how full the meter must be to start (from 256 frames of running to 60)
  acceleration: [8, 12, 14, 16, 18],
  threshold: [0x800, 0x7F8, 0x690, 0x5A0, 0x438],
  topSpeed: 12,                // walking accelerates up to this while boosting
  maxSpeed: 15,                // and the ground speed is capped at this
  minSpeed: 4.5,               // slower than this on the ground ends it
  sideSpring: 9,               // a side spring throwing Sonic faster than this on the ground starts it
  // the camera's horizontal speed limit (8.8 px a frame): it drops to 4 px as Boost Mode starts and
  // recovers by 1/8 px each frame up to the usual 16
  cameraStart: 0x400, cameraStep: 0x20,
  // the afterimages: three copies of Sonic as he was this many frames ago, one shown each frame in turn
  afterimages: [2, 4, 6],
  history: 16,
  // the start's particles: 10 frames of eight spreading out ahead of him, then 15 frames of sixteen, eight a
  // frame in turn, sweeping back past him
  particles: 16, burstFrames: 10, endFrame: 25,
};

// Sonic Advance 2's mid-air tricks, an optional extra (off unless chosen): Sonic Advance 2 keeps speeds in the
// same 8.8 pixels a frame at 60 frames a second, so its numbers carry over as they are. From the SAT-R
// decompilation of Sonic Advance 2 (src/game/shared/stage/player.c and src/game/sa2/stage/player_callbacks.c),
// with the tables read from the USA ROM and the timings checked in an emulator. Speeds in 1/256 px.
export const SA2_TRICKS = {
  // each character's tricks; one without them leaves them out. Sonic's launch speeds, [x, y] with x toward the
  // way he faces (sTrickAccel), and the Bound for R + down (his Stop 'n' Slam)
  sonic: { up: [0, -0x600], forward: [0x600, 0], back: [-0x500, -0x380], bound: true },
  spinFrames: 45,              // the Humming Top spins this long before he falls (unk72)
  boundStart: 0x200,           // the Bound's dive starts at 2 px a frame
  boundDrop: 0x38,             // and gains 7/32 px a frame, before and after it bounces (TRICK__STOP_N_SLAM__DROP_SPEED)
  boundBounce: 0x600,          // it bounces off the ground at 6 px a frame, away from the surface, half of it sideways
  maxFall: 15,                 // Sonic Advance 2 never moves him down faster than this (PLAYER_AIR_SPEED_MAX)
  springDelay: [4, 3, 2, 2],   // frames after a spring's launch before a trick can start, by its speed (disableTrickTimer)
  score: 100,                  // points for each trick (sTrickPoints)
};
