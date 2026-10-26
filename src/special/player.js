// The character in a special stage (SAT-R decompilation, src/game/sa1/special_stage/main.c, gUnknown_03005690 and
// the tasks from Task_802A560 on). They fly down the tunnel at 8 lines a frame, steered across it with the D-pad
// in 1/256 px, the jump button speeding them up to 12 a frame, and the attack button doing a trick. A dash pad
// throws them a fixed way for a while, a bomb makes them drop up to 10 rings, and a trick done just after a
// bumper (the window it opens) pulls in the rings around it. At the checkpoint and the goal they glide back to
// the middle and cheer or fall.
//
// The character's state is the original's struct, with its fields named:
//   x, y (unk0, unk4)     where they are across the tunnel, in 1/256 px, right and up from its middle
//   depth (unk8)          how far down the tunnel, in 1/256 lines
//   screenX, screenY      where they show (unkC, unkE)
//   lift (unk10)          the bob, which scales them by up to 1/16; phase (unk12) steps it
//   vx, vy, speed         their speeds across and down (unk14, unk16, unk18); ax, ay, accel what is added to
//                         them each frame (unk1C, unk1E, unk20)
//   state (unk28)         0 flying, 1 thrown by a dash pad, 2 hit, 3 a trick, 4 the trick after a bumper
//   flags (unk29)         1 held still, 2 faster than 8, 4 on a dash pad, 8 hit by a bomb, 0x10 and 0x20 the tricks
//   end (unk2A)           0x40 the checkpoint, 0x80 the goal: the glide back to the middle
//   timer (unk32), blink (unk34), trickTime (unk3A), turn (unk3C), window (unk3D), cooldown (unk3E)
//   held, pressed (unk42, unk44)    the keys
//   anim, variant (anim48, variant4A), character (unk4C)
//   pad, lastPad (unk50, unk52)     the layout entry of the dash pad touched, and the last one that threw them
//   padKind (unk54)       the kind of that pad, 4 to 9

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { SINE } from '../engine/trig.js';
import { SONG } from '../sound/songs.js';
import { s8, s16, div, I, AFFINE, transform } from './sprites.js';
import { createMessage, MESSAGE, createLostRings, createFallEffect } from './objects.js';

export const FLAG = { STILL: 0x1, FAST: 0x2, ON_PAD: 0x4, HIT: 0x8, TRICK: 0x10, BUMPER_TRICK: 0x20 };
export const STATE = { FLYING: 0, THROWN: 1, HIT: 2, TRICK: 3, BUMPER_TRICK: 4 };
const END = { CHECKPOINT: 0x40, GOAL: 0x80 };
const ANIM = { STAND: 27, FLY: 29, TRICK: 30, BUMPER_TRICK: 31, HIT: 32, COOL: 33, FALL: 34 };
const NORMAL_SPEED = 0x800, TOP_SPEED = 0xC00, MAX_SIDEWAYS = 0x400;
const EDGE_X = 134 * 256, EDGE_Y = 94 * 256;
const L = 0x200;

// the bob: SIN_24_8 / 16u and the like all come to this
const bob = phase => SINE[phase] >> 10;
const se = (ctx, song) => ctx.special.music.se(song);
const characterAnim = (ctx, p) => ctx.tables.characterAnims[p.character];

/** sub_8029E0C, sub_8029EA8 and the character's task (Task_802A560). */
export function createPlayer(ctx) {
  const sp = ctx.special, p = sp.player;
  // the fields CreateSpecialStage leaves are as the last special stage left them (phase, the sprite's hitbox)
  Object.assign(p, {
    character: ctx.game.character & 0xFF, x: 0, y: 0, depth: 0, lift: -52, vx: 0, vy: 0, speed: NORMAL_SPEED, unk1A: 0,
    unk2B: 0, state: STATE.FLYING, flags: FLAG.STILL, end: 0, unk2E: 0, unk30: 0, unk31: 0, unk40: 1, held: 0, pressed: 0,
    variant: 4, blink: 0, unk3F: 0, pad: 0, lastPad: 0, window: 0, cooldown: 0, timer: 0,
  });
  p.anim = (ANIM.STAND + characterAnim(ctx, p)) & 0xFFFF;
  const s = p.s;
  Object.assign(s, {
    x: s16(120 + I(p.x)), y: s16(80 - I(p.y)), oamFlags: 0x180, qAnimDelay: 0, animSpeed: 0x10, palId: 0, frameFlags: AFFINE,
    variant: p.variant, prevVariant: 0xFF,
  });
  s.graphics.dest = 0x10000; s.graphics.size = 0; s.graphics.anim = p.anim;
  Object.assign(p.tf, { rotation: 0, scaleX: 0x100, scaleY: 0x100, x: 0, y: 0 });
  ctx.engine.createTask(fly, ctx, 0x1100);
}

const update = (ctx, p) => updateSprite(ctx.engine, ctx.sprites, p.s);
const display = (ctx, p) => displaySprite(ctx.engine, ctx.sprites, p.s);
// what most of the tasks end with: move, place, animate, show
function step(ctx, p, shown = true) {
  move(p);
  place(ctx, p);
  update(ctx, p);
  transform(ctx, p.s, p.tf);
  if (shown) display(ctx, p);
}
function readKeys(ctx, p) { p.held = ctx.engine.input; p.pressed = ctx.engine.pressed; }
function countDown(p) { if (p.window !== 0) p.window = s8(p.window - 1); }
function setAnim(p, anim, variant) {
  p.anim = anim & 0xFFFF; p.variant = variant;
  p.s.graphics.anim = p.anim; p.s.variant = variant; p.s.prevVariant = 0xFF;
}
function fasterBrakes(p) { p.accel = p.flags & FLAG.FAST ? -0x100 : 0; }

// Task_802A560: flying
function fly(t) {
  const ctx = t.data, p = ctx.special.player;
  readKeys(ctx, p);
  if (p.end & (END.CHECKPOINT | END.GOAL)) {
    p.timer = 0x78;
    p.vx = s16(div(-p.x, 120)); p.vy = s16(div(-p.y, 120));
    p.ax = 0; p.ay = 0;
    t.main = glide;
    glide(t);
    return;
  }
  if (checkHits(t, p) || checkTrick(t, p)) return;
  p.phase = (p.phase + 0x10) & 0x3FF;
  p.lift = bob(p.phase);
  if ((p.held & ctx.special.controls.jump) && !(p.flags & FLAG.STILL)) p.accel = 0x100;
  else fasterBrakes(p);
  steer(ctx, p);
  animate(ctx, p);
  step(ctx, p);
}

// sub_8029F30: a bomb's hit, or a dash pad other than the last one
function checkHits(t, p) {
  if (p.flags & FLAG.STILL) return false;
  if (p.flags & FLAG.HIT) {
    p.state = STATE.HIT;
    p.flags &= ~FLAG.HIT;
    hit(t);
    return true;
  }
  if (p.flags & FLAG.ON_PAD && p.lastPad !== p.pad) {
    p.state = STATE.THROWN;
    p.flags &= ~FLAG.ON_PAD;
    p.lastPad = p.pad;
    dash(t);
    return true;
  }
  return false;
}

// sub_8029FA4: the attack button. Within a bumper's window it does the bumper trick, which stops the music for the
// trick's own; otherwise a trick, after 12 frames since the last.
function checkTrick(t, p) {
  const ctx = t.data, attack = ctx.special.controls.attack;
  if (p.cooldown !== 0) {
    p.cooldown = s8(p.cooldown - 1);
    p.window = 0;
  } else if (p.window !== 0) {
    p.window = s8(p.window - 1);
    if (p.pressed & attack) {
      bumperTrick(t);
      ctx.special.music.trick();
      return true;
    }
  } else if (p.pressed & attack && !(p.flags & FLAG.STILL)) {
    p.turn = p.pressed & L ? 0 : -1;
    trick(t);
    return true;
  }
  return false;
}

// sub_802A068: the D-pad pushes them its way; let go, they slow by a quarter a frame
function steer(ctx, p) {
  const push = ctx.tables.steer[(p.held & 0xF0) >> 4];
  if (p.held & 0xC0) {
    p.ay = push[1];
    if ((p.vy > 0 && p.ay < 0) || (p.vy < 0 && p.ay > 0)) p.vy = 0;
  } else {
    p.ay = s16(-div(p.vy, 4));
    if (p.ay === 0) p.ay = s16(-p.vy);
  }
  if (p.held & 0x30) {
    p.ax = push[0];
    if ((p.vx > 0 && p.ax < 0) || (p.vx < 0 && p.ax > 0)) p.vx = 0;
  } else {
    p.ax = s16(-div(p.vx, 4));
    if (p.ax === 0) p.ax = s16(-p.vx);
  }
}

// sub_802D2F4: which of the nine areas of the tunnel they are in, 1 to 9, top left first
function area(p) {
  let i = p.x < -40 * 256 ? 1 : p.x <= 40 * 256 ? 2 : 3;
  if (p.y < 30 * 256) i += p.y > -30 * 256 ? 3 : 6;
  return i;
}

// sub_802A134: flying fast, holding a direction, or the area they are in
function animate(ctx, p) {
  const base = characterAnim(ctx, p), T = ctx.tables;
  if (p.flags & FLAG.FAST) {
    p.anim = (ANIM.FLY + base) & 0xFFFF;
    p.variant = p.speed <= 12 * 256 ? 0 : 1;
  } else {
    const [anim, variant] = p.held & 0xF0 ? T.dpadAnims[(p.held & 0xF0) >> 4] : T.areaAnims[area(p)];
    p.anim = (anim + base) & 0xFFFF;
    p.variant = variant & 0xFFFF;
  }
  const s = p.s;
  if (s.graphics.anim !== p.anim || s.variant !== p.variant) {
    s.graphics.anim = p.anim; s.variant = p.variant & 0xFF; s.prevVariant = 0xFF;
  }
}

const clamp = (v, lim) => (v > lim ? lim : v < -lim ? -lim : v);

// sub_802A248: the speeds, then the move, then the tunnel's edges
function move(p) {
  const x0 = p.x, y0 = p.y;
  p.vx = s16(p.vx + p.ax);
  p.vy = s16(p.vy + p.ay);
  p.speed = s16(p.speed + p.accel);
  if (p.state === STATE.THROWN) {
    if (p.padKind === 4 || p.padKind === 5) {
      p.vx = clamp(s16(p.vx + p.ax), MAX_SIDEWAYS);
      p.vy = clamp(s16(p.vy + p.ay), MAX_SIDEWAYS);
      // the backward pad scales the speeds across by the speed down, the forward one by its inverse
      if (p.padKind === 4) { p.vx = s16(div(p.vx * I(p.speed), 8)); p.vy = s16(div(p.vy * I(p.speed), 8)); }
      else { p.vx = s16(div(p.vx * 8, I(p.speed))); p.vy = s16(div(p.vy * 8, I(p.speed))); }
      p.x = (p.x + p.vx) | 0;
      p.y = (p.y + p.vy) | 0;
    } else {
      p.x = (x0 + p.vx) | 0;
      p.y = (y0 + p.vy) | 0;
    }
  } else {
    p.vx = clamp(p.vx, MAX_SIDEWAYS);
    p.vy = clamp(p.vy, MAX_SIDEWAYS);
    if (p.speed > TOP_SPEED) p.speed = TOP_SPEED;
    else if (p.speed < NORMAL_SPEED) p.speed = NORMAL_SPEED;
    if (p.speed === NORMAL_SPEED) p.flags &= ~FLAG.FAST;
    else p.flags |= FLAG.FAST;
    if (p.flags & FLAG.FAST) {
      // faster, they steer less, drift back to the middle, and can't move away from it faster than 1/32 of
      // how far they are
      const lim = p.y >> 5;
      if (lim >= 0 ? lim < p.vy : lim > p.vy) p.vy = s16(lim);
      p.x = (p.x + div(p.vx * 8, I(p.speed))) | 0;
      p.y = (p.y + div(p.vy * 8, I(p.speed))) | 0;
      p.x = (p.x - (p.x >> 5)) | 0;
      p.y = (p.y - (p.y >> 5)) | 0;
    } else {
      p.x = (p.x + p.vx) | 0;
      p.y = (p.y + p.vy) | 0;
    }
  }
  if (!(p.flags & FLAG.STILL)) p.depth = (p.depth + p.speed) | 0;
  p.x = clamp(p.x, EDGE_X);
  p.y = clamp(p.y, EDGE_Y);
}

// sub_802A4C4: where they show, nearer the middle when the bob takes them further away, and how big
function place(ctx, p) {
  const s = p.s, tf = p.tf, bg = ctx.special.bg, f = p.lift + 0x240;
  const x = s16(div(p.x * f, 576) >> 8), y = s16(div(p.y * f, 576) >> 8);
  p.screenX = s16(x + 120 + bg.x);
  p.screenY = s16(80 - y - bg.y);
  s.x = p.screenX; s.y = p.screenY;
  tf.x = s.x; tf.y = s.y; tf.rotation = 0;
  tf.scaleX = tf.scaleY = s16(p.lift + 0x100);
  s.frameFlags = AFFINE;
}

// sub_802A688: a dash pad throws them: its speeds (a third more when they were fast) and its animation; the
// diagonal ones half as much again, slowing down three times as fast
function dash(t) {
  const ctx = t.data, p = ctx.special.player, T = ctx.tables;
  const i = (p.padKind - 4) & 0xFFFF, [vx, vy, speed] = T.dashSpeeds[i];
  setAnim(p, T.dashAnims[i][0] + characterAnim(ctx, p), T.dashAnims[i][1]);
  if (p.flags & FLAG.FAST) { p.vx = s16(div(vx * 4, 3)); p.vy = s16(div(vy * 4, 3)); p.speed = s16(div(speed * 4, 3)); }
  else { p.vx = vx; p.vy = vy; p.speed = speed; }
  if (i === 0) { p.ax = 0; p.ay = 0; p.accel = 0x40; }
  else if (i === 1) { p.ax = 0; p.ay = 0; p.accel = -0x40; }
  else {
    // the original multiplies by 1.5 and 3 in floating point, which truncates as these do
    p.ax = s16(-(vx >> 7) * 3); p.ay = s16(-(vy >> 7) * 3);
    p.vx = s16(Math.trunc(p.vx * 1.5)); p.vy = s16(Math.trunc(p.vy * 1.5)); p.speed = s16(Math.trunc(p.speed * 1.5));
    p.accel = -0x60;
  }
  se(ctx, SONG.SPECIAL_DASH);
  p.flags &= ~(FLAG.FAST | FLAG.ON_PAD);
  step(ctx, p);
  t.main = dashing;
}

// sub_802A890: thrown, steering only on the forward and backward pads, until back to normal speed
function dashing(t) {
  const ctx = t.data, p = ctx.special.player;
  readKeys(ctx, p);
  countDown(p);
  if (p.padKind === 4 ? p.speed > 0 : p.padKind === 5) steer(ctx, p);
  if (checkHits(t, p)) return;
  if (p.padKind === 4 ? p.speed >= NORMAL_SPEED : p.speed <= NORMAL_SPEED) {
    t.main = fly;
    p.state = STATE.FLYING; p.speed = NORMAL_SPEED; p.accel = 0; p.cooldown = 0;
  }
  step(ctx, p);
}

// sub_802A988: a bomb: they drop up to 10 rings and blink for a second, steering again for its last half
function hit(t) {
  const ctx = t.data, sp = ctx.special, p = sp.player;
  if (sp.collected !== 0) {
    createLostRings(ctx);
    se(ctx, SONG.RINGS_LOST);
  }
  setAnim(p, characterAnim(ctx, p) + ANIM.HIT, 0);
  p.vx = 0; p.vy = 0; p.speed = NORMAL_SPEED; p.ax = 0; p.ay = 0; p.accel = 0;
  p.flags &= 0xFE;
  p.blink = 0x3C;
  step(ctx, p);
  t.main = blinking;
}

// Task_802AA48
function blinking(t) {
  const ctx = t.data, p = ctx.special.player;
  readKeys(ctx, p);
  countDown(p);
  p.blink = s16(p.blink - 1);
  if (p.blink === 0) {
    t.main = fly;
    p.state = STATE.FLYING;
    p.cooldown = 0;   // the byte 0x16 after unk28
  }
  if (p.blink <= 30) steer(ctx, p);
  move(p);
  place(ctx, p);
  update(ctx, p);
  transform(ctx, p.s, p.tf);
  if (!(p.blink & 2)) display(ctx, p);
}

// sub_802ABA0: a trick, 45 frames of their trick animation, still across the tunnel
function trick(t) {
  const ctx = t.data, p = ctx.special.player;
  setAnim(p, characterAnim(ctx, p) + ANIM.TRICK, 0);
  p.vx = 0; p.vy = 0; p.ax = 0; p.ay = 0; p.accel = 0;
  p.state = STATE.TRICK;
  p.flags |= FLAG.TRICK;
  p.trickTime = 0x2D;
  se(ctx, SONG.SPECIAL_TRICK);
  step(ctx, p);
  t.main = tricking;
}

// Task_802AC50
function tricking(t) {
  const ctx = t.data, p = ctx.special.player;
  countDown(p);
  if (checkHits(t, p)) return;
  p.accel = p.flags & FLAG.FAST ? -0x80 : 0;
  p.trickTime = s16(p.trickTime - 1);
  if (p.trickTime === 0) {
    t.main = fly;
    p.flags &= ~FLAG.TRICK;
    p.state = STATE.FLYING;
    p.cooldown = 0xC;
  }
  step(ctx, p);
}

// sub_802ACF0: the trick after a bumper, its own animation through once
function bumperTrick(t) {
  const ctx = t.data, p = ctx.special.player;
  setAnim(p, characterAnim(ctx, p) + ANIM.BUMPER_TRICK, 0);
  p.vx = 0; p.vy = 0; p.ax = 0; p.ay = 0; p.accel = 0;
  p.state = STATE.BUMPER_TRICK;
  p.flags |= FLAG.BUMPER_TRICK;
  se(ctx, SONG.SPECIAL_TRICK);
  step(ctx, p);
  t.main = bumperTricking;
}

// Task_802AD9C
function bumperTricking(t) {
  const ctx = t.data, p = ctx.special.player;
  countDown(p);
  if (checkHits(t, p)) return;
  p.accel = p.flags & FLAG.FAST ? -0x80 : 0;
  if (p.s.frameFlags & 0x4000) {
    t.main = fly;
    p.flags &= ~FLAG.BUMPER_TRICK;
    p.state = STATE.FLYING;
    p.cooldown = 0xC;
  }
  step(ctx, p);
}

// Task_802AE40: 120 frames gliding back to the middle, then the checkpoint's or the goal's outcome
function glide(t) {
  const ctx = t.data, sp = ctx.special, p = sp.player;
  p.held = 0; p.pressed = 0;
  p.phase = (p.phase + 0x10) & 0x3FF;
  p.lift = bob(p.phase);
  p.accel = p.flags & FLAG.FAST ? -0x100 : 0;
  animate(ctx, p);
  step(ctx, p);
  p.timer = s16(p.timer - 1);
  if (p.timer !== 0) return;
  const base = characterAnim(ctx, p);
  const fall = () => {
    p.timer = 0;
    p.anim = (base + ANIM.FALL) & 0xFFFF; p.variant = 0;
    t.main = falling;
    createFallEffect(ctx);
    createMessage(ctx, MESSAGE.AAARGH);
  };
  if (p.end === END.CHECKPOINT) {
    if (sp.targets[0] <= sp.collected) {
      p.timer = 0x14A;
      p.anim = (base + ANIM.COOL) & 0xFFFF; p.variant = 0;
      t.main = cheering;
      createMessage(ctx, MESSAGE.COOL);
    } else fall();
  } else if (sp.targets[1] <= sp.collected) {
    p.anim = (base + ANIM.COOL) & 0xFFFF; p.variant = 0;
    t.main = cleared;
    sp.music.play(SONG.SPECIAL_STAGE_CLEAR);
    createMessage(ctx, MESSAGE.COOL);
  } else fall();
  p.s.graphics.anim = p.anim; p.s.variant = p.variant; p.s.prevVariant = 0xFF;
}

// sub_802B008: not enough rings: they shrink away for 120 frames, then stay out of sight
function falling(t) {
  const ctx = t.data, p = ctx.special.player;
  if (p.timer <= -120) return;
  p.timer = s16(p.timer - 1);
  p.lift = p.timer;
  p.held = 0; p.pressed = 0;
  fasterBrakes(p);
  steer(ctx, p);
  step(ctx, p);
}

// sub_802B07C: past the checkpoint: the goal's target and its title card 151 frames in, the cheer's second half
// at the end of the count, and on once the cheer's animation ends
function cheering(t) {
  const ctx = t.data, sp = ctx.special, p = sp.player;
  p.held = 0; p.pressed = 0;
  p.phase = (p.phase + 0x10) & 0x3FF;
  p.lift = bob(p.phase);
  p.accel = p.flags & FLAG.FAST ? -0x100 : 0;
  steer(ctx, p);
  step(ctx, p);
  if (p.timer === 0xB4) {
    sp.target = sp.targets[1];
    ctx.engine.destroyTasks(0x1180, 0x1181);
    sp.hudBlink = 0;
    ctx.titleCard(0);
  }
  if (p.timer !== 0) {
    p.timer = s16(p.timer - 1);
    if (p.timer === 0) { p.variant = 1; p.s.variant = 1; p.s.prevVariant = 0xFF; }
  }
  if (p.s.frameFlags & 0x4000) {
    t.main = fly;
    p.flags = 0;
    p.end = 0;
    p.cooldown = 0xC;
  }
}

// sub_802B18C: past the goal, cheering until the stage fades out
function cleared(t) {
  const ctx = t.data, p = ctx.special.player;
  p.held = 0; p.pressed = 0;
  p.phase = (p.phase + 0x10) & 0x3FF;
  p.lift = bob(p.phase);
  p.accel = p.flags & FLAG.FAST ? -0x100 : 0;
  steer(ctx, p);
  step(ctx, p);
}

/** The character's state as the original keeps it across special stages (gUnknown_03005690, gUnknown_030055F0). */
export function createPlayerState() {
  return {
    character: 0, x: 0, y: 0, depth: 0, screenX: 0, screenY: 0, lift: 0, phase: 0, vx: 0, vy: 0, speed: 0, unk1A: 0,
    ax: 0, ay: 0, accel: 0, state: 0, flags: 0, end: 0, unk2B: 0, unk2E: 0, unk30: 0, unk31: 0, timer: 0, blink: 0,
    trickTime: 0, turn: 0, window: 0, cooldown: 0, unk3F: 0, unk40: 0, held: 0, pressed: 0, anim: 0, variant: 0,
    pad: 0, lastPad: 0, padKind: 0,
    s: createSprite({ prevAnim: 0, prevVariant: 0, animSpeed: 0, hitboxes: [{ index: 0, left: 0, top: 0, right: 0, bottom: 0 }] }),
    tf: { rotation: 0, scaleX: 0, scaleY: 0, x: 0, y: 0 },
  };
}

