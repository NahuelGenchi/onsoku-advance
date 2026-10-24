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
