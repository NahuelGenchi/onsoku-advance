// What the character meets in a special stage (SAT-R decompilation, src/game/sa1/special_stage/main.c, from
// Task_802B3E4 on): the layout's rings, drawn by one task, and its other objects, a task each, made as the
// character comes within 768 lines of them; the checkpoint and the goal; the messages; the rings a bomb knocks out
// of the character; and the character falling away when they haven't enough rings.
//
// An object's state is the original's struct (SpStage74), with its fields named:
//   x, y, depth (unk3C, unk40, unk44)   where it is, in 1/256 px and 1/256 lines
//   offX, offY (unk48, unk4A)           how far from the middle it shows, scaled by its depth
//   screenX, screenY (unk4C, unk4E)     where it shows
//   ahead (unk50)                       how far ahead of the character it is, in lines (negative ahead)
//   vx, vy, vdepth (unk52, unk54, unk56) and ax, ay, adepth (unk58, unk5A, unk5C)   its speeds and what is added
//   kind (unk60)                        what it is (the KIND below)
//   anim, variant (anim62, variant64), matrix (unk66), touched (unk67)
//   entry (unk68)                       its layout entry
//   ring, rings (unk6A, unk6B)          a dropped ring's place among those dropped, and how many
//   blink (unk6C), timer (unk6D), fall (unk6E), wait (unk70)

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { SINE } from '../engine/trig.js';
import { SONG } from '../sound/songs.js';
import { random } from './intro.js';
import { s16, div, I, NO_DEPTH, AFFINE, DOUBLE_SIZE, depthMatrix, setMatrix, transform, shareGraphics, touches } from './sprites.js';
import { FLAG, STATE } from './player.js';

export const KIND = {
  RING: 0, SPARKLE: 1, BUMPER: 2, BUMPER_RING: 3, BACK_PAD: 4, FORWARD_PAD: 5, /* 6 to 9: the diagonal pads */
  TOKEN: 10, BOMB: 11, EXPLOSION: 12, SPARK: 13, FALL: 14,
};
export const MESSAGE = { COOL: 0, AAARGH: 1, NOT_ENOUGH_RINGS: 2 };
const GOAL = 1, CHECKPOINT = 2;
const END = 0xFFFF, CHECKPOINT_ENTRY = 0x7FFF;
const ANIM = { RINGS: 0x31B, MESSAGES: 812, SPEECH: 813, FALL: 34 };
const OBJ_VRAM = 0x10000, ANIM_OVER = 0x4000;
const AHEAD = 0x300, BEHIND = 0xC0, GONE = 576;
const order = n => n << 6;

const se = (ctx, song) => ctx.special.music.se(song);

function object(ctx, fields) {
  return {
    ctx, s: createSprite(), tf: { rotation: 0, scaleX: 0, scaleY: 0, x: 0, y: 0 },
    x: 0, y: 0, depth: 0, offX: 0, offY: 0, screenX: 0, screenY: 0, ahead: 0, vx: 0, vy: 0, vdepth: 0, ax: 0, ay: 0, adepth: 0,
    kind: 0, anim: 0, variant: 0, matrix: 0, touched: 0, entry: 0, ring: 0, rings: 0, blink: 0, timer: 0, fall: 0, wait: 0,
    parent: null, ...fields,
  };
}
// sub_802D6FC: the sprite showing the object's animation from its kind's tiles
function setGraphics(o) {
  const s = o.s;
  s.graphics.dest = OBJ_VRAM + (o.ctx.tables.objectTiles[o.kind] << 5);
  s.graphics.size = 0;
  s.graphics.anim = o.anim;
  s.variant = o.variant & 0xFF;
  s.prevVariant = 0xFF;
  s.qAnimDelay = 0;
  s.animSpeed = 0x10;
}
function setKind(o, kind) {
  o.kind = kind;
  [o.anim, o.variant] = o.ctx.tables.objectAnims[kind];
}
const update = o => updateSprite(o.ctx.engine, o.ctx.sprites, o.s);
const display = o => displaySprite(o.ctx.engine, o.ctx.sprites, o.s);
function show(o) {
  shareGraphics(o.ctx.special, o.s);
  update(o);
  transform(o.ctx, o.s, o.tf);
  display(o);
}

/** sub_802D1D8: the task making the layout's objects (Task_802B3E4). */
export function createSpawner(ctx) {
  ctx.engine.createTask(spawn, { ctx, next: 0, depth: 0, done: 0 }, 0x1400);
}

// Task_802B3E4: everything up to 768 lines ahead, once; the goal stops it, and nothing comes out while the
// character is at the goal
function spawn(t) {
  const d = t.data, ctx = d.ctx, sp = ctx.special, layout = sp.data.layout, e = ctx.engine;
  if (d.done || sp.checkpoint.kind === GOAL) return;
  while (layout[d.next].depth < I(sp.player.depth) + AHEAD) {
    const entry = layout[d.next];
    if (entry.type === END || entry.type === CHECKPOINT_ENTRY) {
      e.createTask(marker, object(ctx, { kind: entry.type === END ? GOAL : CHECKPOINT, depth: entry.depth << 8 }), 0x1F00);
      d.depth = entry.depth;
      d.next++;
      if (entry.type === END) { d.done = 1; break; }
    } else if (entry.type === 0) d.next++;
    else {
      e.createTask(appear, object(ctx, { kind: entry.type, x: entry.x << 8, y: entry.y << 8, depth: entry.depth << 8, entry: d.next, timer: 0xB }), 0x1500);
      d.depth = entry.depth;
      d.next++;
    }
  }
}

// sub_802D33C: the checkpoint or the goal, reached
function marker(t) {
  const o = t.data, sp = o.ctx.special;
  if (sp.player.depth >= o.depth) {
    sp.checkpoint.kind = o.kind;
    o.ctx.engine.destroyTask(t);
  }
}

// Task_802BEDC: an object's first frame, shrunk to a quarter
function appear(t) {
  const o = t.data, ctx = o.ctx, s = o.s, sp = ctx.special;
  o.ahead = 0; o.vx = 0; o.vy = 0; o.vdepth = 0; o.ax = 0; o.ay = 0; o.adepth = 0;
  setKind(o, o.kind);
  o.touched = 0;
  setGraphics(o);
  o.matrix = depthMatrix(sp, s16(I(sp.player.depth) - I(o.depth)));
  s.x = s16(120 + I(o.x)); s.y = s16(80 - I(o.y));
  s.oamFlags = 0x7C0; s.palId = 0;
  s.frameFlags = o.matrix | AFFINE;
  Object.assign(o.tf, { rotation: 0, scaleX: 0x40, scaleY: 0x40, x: s.x, y: s.y });
  t.main = objectStep;
  shareGraphics(sp, s);
  update(o);
  transform(ctx, s, o.tf);
}

// Task_802D37C: an object's frames
function objectStep(t) {
  const o = t.data;
  followBumper(t);
  advance(o);
  if (!place(t)) return;
  if (o.wait !== 0) o.wait = s16(o.wait - 1);
  else touch(t);
  show(o);
}

// sub_802BBF0
function advance(o) {
  o.vx = s16(o.vx + o.ax); o.vy = s16(o.vy + o.ay); o.vdepth = s16(o.vdepth + o.adepth);
  o.x = (o.x + o.vx) | 0; o.y = (o.y + o.vy) | 0; o.depth = (o.depth + o.vdepth) | 0;
}

/**
 * sub_802BC6C: where the object shows and how big, by how far ahead it is: from a quarter of its size 768 lines
 * ahead, nearer the middle, to twice its size 192 lines behind. Further behind it is gone (but the bumper's rings
 * stay); further ahead, or behind, it isn't shown. Returns whether it is shown.
 */
function place(t) {
  const o = t.data, ctx = o.ctx, sp = ctx.special, s = o.s, tf = o.tf, bg = sp.bg;
  o.ahead = s16((sp.player.depth - o.depth) >> 8);
  if (o.kind !== KIND.BUMPER_RING && o.ahead > GONE) {
    ctx.engine.destroyTask(t);
    return false;
  }
  if (o.ahead > BEHIND || o.ahead < -AHEAD) return false;
  o.matrix = depthMatrix(sp, o.ahead);
  const k = perspective(o.ahead), f = div(k, 512) + 0x38;
  o.offX = s16(div(o.x * f, 640) >> 8);
  o.offY = s16(div(o.y * f, 640) >> 8);
  o.screenX = s16(s16(o.offX + 120) + bg.x);
  o.screenY = s16(s16(80 - o.offY) - bg.y);
  s.x = o.screenX; s.y = o.screenY;
  tf.x = s.x; tf.y = s.y;
  tf.scaleX = tf.scaleY = s16(div(k, 1024) + 0x40);
  s.frameFlags = o.matrix | AFFINE;
  if (tf.scaleX > 0x100) s.frameFlags |= DOUBLE_SIZE;
  s.oamFlags = order(-div(o.ahead - BEHIND, 32)) & 0xFFFF;
  return true;
}

// the depth's curve: (lines from 768 ahead / 8)⁴ / 408
function perspective(ahead) {
  let k = (ahead + AHEAD) >> 3;
  if (k === 0) k = 1;
  return div(Math.imul(Math.imul(Math.imul(k, k), k), k), 408);
}

// sub_802B66C: whether the character touches the object, within 64 lines in front of it; dash pads and bombs
// by a box of their own around the character, smaller while they are fast
function touching(o) {
  const sp = o.ctx.special, p = sp.player, box = o.s.hitboxes[0], T = o.ctx.tables;
  if (box.index === -1) return false;
  if (p.depth < o.depth - 0x4000 || p.depth > o.depth) return false;
  const kind = o.kind;
  if (kind >= 4 && (kind < 10 || kind === KIND.BOMB)) {
    return touches(o.offX, o.offY, box, I(p.x), I(p.y), p.flags & FLAG.FAST ? T.boostHit : T.wideHit);
  }
  return touches(o.offX, o.offY, box, I(p.x), I(p.y), p.s.hitboxes[0]);
}

// sub_802B884: what touching it does
function touch(t) {
  const o = t.data, ctx = o.ctx, sp = ctx.special, p = sp.player;
  if (o.touched & 1 || p.flags & FLAG.STILL || p.state === STATE.HIT || !touching(o)) return;
  switch (o.kind) {
    case KIND.RING:
    case KIND.BUMPER_RING: {
      const bumperRing = o.kind === KIND.BUMPER_RING;
      setKind(o, KIND.SPARKLE);
      o.touched |= 1;
      o.vx = 0; o.vy = 0; o.ax = 0; o.ay = 0;
      if (!bumperRing) { o.vdepth = 0; o.adepth = 0; }
      setGraphics(o);
      collect(ctx);
      t.main = bumperRing ? sparkleFollowing : flash;
      break;
    }
    case KIND.BUMPER:
      o.touched |= 1;
      se(ctx, SONG.SPECIAL_BUMPER);
      createSparks(t);
      createBumperRings(t);
      t.main = bumperMessage;
      p.window = 0xA;
      o.timer = 0xB;
      break;
    case 4: case 5: case 6: case 7: case 8: case 9:
      p.flags |= FLAG.ON_PAD;
      p.pad = o.entry & 0xFFFF;
      p.padKind = o.kind;
      break;
    case KIND.TOKEN:
      ctx.engine.destroyTask(t);
      se(ctx, SONG.SPECIAL_TOKEN);
      sp.extra = (sp.extra + 1) & 0xFF;
      break;
    case KIND.BOMB:
      setKind(o, KIND.EXPLOSION);
      o.touched |= 1;
      o.vx = 0; o.vy = 0; o.vdepth = 0; o.ax = 0; o.ay = 0; o.adepth = 0;
      setGraphics(o);
      p.flags |= FLAG.HIT;
      se(ctx, SONG.EXPLOSION);
      t.main = flash;
      break;
  }
}

// gSpecialStageCollectedRings + 1, with the ring's sound, left and right by turns (SpStage_PlayRingSoundeffect)
function collect(ctx) {
  const sp = ctx.special;
  sp.collected = (sp.collected + 1) & 0xFFFF;
  const odd = sp.collected & 1;
  ctx.sound?.playOn(odd ? 2 : 1, SONG.RING, 0x80, odd ? -0x40 : 0x40);
}

// sub_802D3E4: an animation through once (a sparkle, an explosion, a spark), moving as it was set to
function flash(t) {
  const o = t.data;
  advance(o);
  if (!place(t)) return;
  if (o.s.frameFlags & ANIM_OVER) { t.main = destroy; return; }
  shareGraphics(o.ctx.special, o.s);
  if (update(o) === 0) t.main = destroy;
  transform(o.ctx, o.s, o.tf);
  display(o);
}
// sub_802D450, sub_802D66C
function destroy(t) { t.data.ctx.engine.destroyTask(t); }

// the depth a bumper's ring or its sparkle keeps up with the character by: up to 14 lines a frame, and back level
// with them when more than a line past
function keepUp(o) {
  const p = o.ctx.special.player;
  o.adepth = s16((p.depth - o.depth) >> 8);
  const v = s16(o.vdepth + o.adepth);
  o.vdepth = v > 14 * 256 ? 14 * 256 : v < -14 * 256 ? -14 * 256 : v;
  o.depth = (o.depth + o.vdepth) | 0;
  if (p.depth + 0x100 < o.depth) o.depth = p.depth;
}

// sub_802C224: a bumper's ring, taken: its sparkle keeps up with the character
function sparkleFollowing(t) {
  const o = t.data;
  if (o.s.frameFlags & ANIM_OVER) { t.main = destroy; return; }
  keepUp(o);
  if (place(t)) show(o);
}

// sub_802C2DC: the 8 sparks flying out of a bumper and slowing down
function createSparks(t) {
  const b = t.data, ctx = b.ctx;
  ctx.tables.sparks.forEach(([dx, dy]) => {
    const o = object(ctx, { x: (b.x + (dx << 8)) | 0, y: (b.y + (dy << 8)) | 0, depth: b.depth, matrix: b.matrix, touched: 1 });
    setKind(o, KIND.SPARK);
    o.vx = s16(dx * 8); o.vy = s16(dy * 8);
    o.ax = s16(-div(o.vx, 32)); o.ay = s16(-div(o.vy, 32));
    setGraphics(o);
    o.s.palId = 0;
    o.s.frameFlags = o.matrix | AFFINE;
    o.s.oamFlags = order(31);
    ctx.engine.createTask(flash, o, 0x1510);
  });
}

// sub_802C04C: the 12 rings around a bumper, which can't be taken for their first 15 frames
function createBumperRings(t) {
  const b = t.data, ctx = b.ctx;
  ctx.tables.bumperRings.forEach(([dx, dy]) => {
    ctx.engine.createTask(appear, object(ctx, {
      kind: KIND.BUMPER_RING, x: (b.x + (dx << 6)) | 0, y: (b.y + (dy << 6)) | 0, depth: b.depth, entry: b.entry, wait: 0xF, parent: b,
    }), 0x1510);
  });
}

// sub_802D464: a bumper's ring flies to the character if they do the bumper trick while the bumper's message is
// still to come or showing, and is an ordinary ring once it has gone
function followBumper(t) {
  const o = t.data;
  if (o.kind !== KIND.BUMPER_RING) return;
  if (o.parent.timer !== 0) {
    if (o.ctx.special.player.state === STATE.BUMPER_TRICK) {
      t.main = pulled;
      o.vx = -0x300;
    }
  } else o.kind = KIND.RING;
}

// sub_8004418: an angle of 1024 a turn, straight within each eighth, from (x, y) as s16, −1 for (0, 0)
const OCTANT = [1, 0, 2, 3, 6, 7, 5, 4];
function quickAngle(x, y) {
  x = s16(x); y = s16(y);
  if ((x | y) === 0) return -1;
  let i = 0, f;
  if (x <= 0) { x = s16(-x); i = 4; }
  if (y <= 0) { y = s16(-y); i += 2; }
  if (x >= y) { const n = s16(y * 128); f = x === 0 ? n : div(n, x); }
  else { i++; const n = s16(x * 128); f = y === 0 ? n : div(n, y); }
  f = s16(f);
  if (OCTANT[i] & 1) f = s16(128 - f);
  return (f + OCTANT[i] * 128) & 0x3FF;
}

// sub_802C0CC: a bumper's ring flying to the character, faster each frame, keeping up with them
function pulled(t) {
  const o = t.data, p = o.ctx.special.player;
  // (0, 0) gives −1, and the original reads the entry before the table for its sine
  const a = quickAngle(s16(p.screenY - o.screenY), s16(p.screenX - o.screenX));
  o.vx = s16(o.vx + 0x15);
  o.x = (o.x + ((o.vx * SINE[a + 256]) >> 14)) | 0;
  o.y = (o.y - ((o.vx * (SINE[a] ?? 0)) >> 14)) | 0;
  keepUp(o);
  if (!place(t)) return;
  if (o.wait !== 0) o.wait = s16(o.wait - 1);
  else touch(t);
  show(o);
}

// sub_802C488: 11 frames after it is touched, the bumper becomes its message for a second, of the bumper
// trick done or not
function bumperMessage(t) {
  const o = t.data, s = o.s;
  o.timer = (o.timer - 1) & 0xFF;
  if (o.timer !== 0) return;
  o.timer = 60;
  o.anim = ANIM.MESSAGES;
  o.variant = o.ctx.special.player.state === STATE.BUMPER_TRICK ? 1 : 2;
  setGraphics(o);
  s.x = 120; s.y = 40;
  s.oamFlags = order(1);
  s.frameFlags = 0x2000;
  t.main = message;
}

/** CreateCheckpointMessage: COOL!, AAARGH! or NOT ENOUGH RINGS. */
export function createMessage(ctx, msg) {
  const o = object(ctx, {});
  const s = o.s;
  if (msg === MESSAGE.NOT_ENOUGH_RINGS) {
    s.y = 136; o.anim = ANIM.MESSAGES; o.variant = 0; o.kind = msg; o.timer = 0x78;
  } else {
    s.y = 40; o.anim = ANIM.SPEECH; o.variant = msg; o.kind = 5; o.timer = 0xB4;
  }
  setGraphics(o);
  s.x = 120; s.oamFlags = 0x40; s.frameFlags = 0x2000; s.palId = 0; s.animCursor = 0;
  s.hitboxes[0].index = -1;
  ctx.engine.createTask(message, o, 0x1500);
}

// sub_802D4C4
function message(t) {
  const o = t.data;
  update(o);
  display(o);
  o.timer = (o.timer - 1) & 0xFF;
  if (o.timer === 0) t.main = destroy;
}

/** sub_802AAF0: up to 10 of the character's rings, knocked out of them. */
export function createLostRings(ctx) {
  const sp = ctx.special, p = sp.player;
  let n;
  if (sp.collected > 9) { n = 10; sp.collected -= 10; } else { n = sp.collected; sp.collected = 0; }
  for (const rings = n; n !== 0; n--) {
    ctx.engine.createTask(lostRing, object(ctx, { ring: n - 1, rings, x: p.x, y: p.y, depth: p.depth, kind: KIND.RING, entry: -1 }), 0x1500);
  }
}

// sub_802C6C4: a dropped ring's first frame: thrown out its way and on ahead, slowing down
function lostRing(t) {
  const o = t.data, ctx = o.ctx, sp = ctx.special, s = o.s;
  o.ahead = 0;
  [o.vx, o.vy] = ctx.tables.lostRings[o.ring];
  o.vdepth = 0x800;
  o.ax = s16(-div(o.vx, 32)); o.ay = s16(-div(o.vy, 32)); o.adepth = s16(-div(o.vdepth, 64));
  [o.anim, o.variant] = ctx.tables.objectAnims[KIND.RING];
  o.touched = 0;
  o.matrix = depthMatrix(sp, s16(I(sp.player.depth) - I(o.depth)));
  setGraphics(o);
  s.x = s16(120 + I(o.x)); s.y = s16(80 - I(o.y));
  s.oamFlags = 0x180; s.palId = 0;
  s.frameFlags = o.matrix | AFFINE;
  Object.assign(o.tf, { rotation: 0, scaleX: 0x100, scaleY: 0x100, x: s.x, y: s.y });
  t.main = lostRingStep;
  shareGraphics(sp, s);
  update(o);
  transform(ctx, s, o.tf);
}

// sub_802C89C: shown every other frame
function lostRingStep(t) {
  const o = t.data;
  o.ax = s16(-div(o.vx, 32)); o.ay = s16(-div(o.vy, 32));
  advance(o);
  if (!place(t)) return;
  shareGraphics(o.ctx.special, o.s);
  update(o);
  transform(o.ctx, o.s, o.tf);
  const blink = o.blink;
  o.blink = (o.blink + 1) & 0xFF;
  if (blink & 1) display(o);
}

/** sub_802B214: the character's fall at the checkpoint or the goal, without the rings for it. */
export function createFallEffect(ctx) {
  const sp = ctx.special, p = sp.player;
  const o = object(ctx, { x: p.x, y: p.y, depth: (p.depth - 0x100) | 0, ahead: s16(p.lift), kind: KIND.FALL });
  const r = random(ctx);
  o.ax = r & 0xF; o.ay = -((r & 0x70) >> 4); o.adepth = -0x10;
  if (r & 0x80) o.ax = -o.ax;
  o.anim = (ctx.tables.characterAnims[p.character] + ANIM.FALL) & 0xFFFF; o.variant = 1;
  const s = o.s;
  s.graphics.dest = OBJ_VRAM + 0x1400; s.graphics.size = 0; s.graphics.anim = o.anim;
  s.variant = 1; s.prevVariant = 0xFF; s.qAnimDelay = 0; s.animSpeed = 0x10;
  o.matrix = depthMatrix(sp, s16(I(p.depth) - I(o.depth)));
  s.x = s16(I(o.x) + 120); s.y = s16(80 - I(o.y));
  s.oamFlags = order(4); s.palId = 0;
  s.frameFlags = o.matrix | AFFINE;
  Object.assign(o.tf, { rotation: 0, scaleX: 0x40, scaleY: 0x40, x: s.x, y: s.y });
  ctx.engine.createTask(falling, o, 0x10FF);
}

// Task_802D508: for 160 frames
function falling(t) {
  const o = t.data;
  if (o.fall <= -160) return;
  o.fall = s16(o.fall - 1);
  advance(o);
  if (!place(t)) return;
  o.s.oamFlags = order(5);
  update(o);
  transform(o.ctx, o.s, o.tf);
  display(o);
}

/**
 * sub_802C934: the task drawing the layout's rings (UpdateObjectsAndRender), one sprite for them all: it shows
 * the first that is on screen, then copies its OAM entry for the others. It runs before the objects, and starts
 * the frame's matrices over.
 */
export function createRings(ctx) {
  const sp = ctx.special, layout = sp.data.layout;
  let at = 0;
  for (let i = 0; i < 16; i++) {
    while (i << 12 > layout[at].depth + AHEAD && layout[at].type !== END) at++;
    sp.chunks[i] = at;
  }
  const s = createSprite({
    x: 0, y: 0, oamFlags: 0x500, variant: 0, animCursor: 0, qAnimDelay: 0, prevVariant: 0xFF, animSpeed: 0x10, palId: 0, frameFlags: 0x2030,
  });
  s.graphics.dest = OBJ_VRAM + 0x800; s.graphics.anim = ANIM.RINGS;
  // a bit for each layout entry, set once its ring is taken
  const taken = new Uint8Array(((at >> 3) + 4) & ~3);
  ctx.engine.createTask(drawRings, { ctx, s, taken, tf: { rotation: 0, scaleX: 0, scaleY: 0, x: 0, y: 0 } }, 0x1300);
}

function drawRings(t) {
  const d = t.data, ctx = d.ctx, sp = ctx.special, p = sp.player, s = d.s, tf = d.tf, e = ctx.engine, rom = ctx.rom;
  const layout = sp.data.layout;
  sp.depths.fill(NO_DEPTH);
  sp.matrices.fill(0, 0, 16);
  updateSprite(e, ctx.sprites, s);
  const dims = s.dimensions, here = I(p.depth), ahead = here + AHEAD, behind = here - BEHIND;
  let shown = 0;
  for (let i = sp.chunks[(ahead >> 12) & 0xFF]; layout[i].depth < ahead; i = (i + 1) & 0xFFFF) {
    const entry = layout[i];
    if (entry.type === END) return;
    if (entry.type !== 0 || entry.depth < behind || (d.taken[i >> 3] >> (i & 7)) & 1) continue;
    const x = entry.x << 8, y = entry.y << 8, depth = entry.depth << 8;
    const away = s16(here - entry.depth);
    const k = perspective(away), f = div(k, 512) + 0x38;
    const offX = s16(div(x * f, 640) >> 8), offY = s16(div(y * f, 640) >> 8);
    if (!(p.flags & FLAG.STILL) && p.state !== STATE.HIT && here >= entry.depth - 32 && here <= entry.depth
      && touches(offX, offY, s.hitboxes[0], I(p.x), I(p.y), p.s.hitboxes[0])) {
      // taken: a sparkle in its place
      const o = object(ctx, { kind: KIND.SPARKLE, x, y, depth });
      setKind(o, KIND.SPARKLE);
      o.matrix = depthMatrix(sp, away);
      o.touched = 1;
      setGraphics(o);
      o.s.palId = 0;
      o.s.frameFlags = o.matrix | AFFINE;
      o.s.oamFlags = 0x7C0;
      e.createTask(flash, o, 0x1500);
      collect(ctx);
      d.taken[i >> 3] |= 1 << (i & 7);
      continue;
    }
    const matrix = depthMatrix(sp, away);
    tf.x = s16(offX + sp.bg.x + 0x78);
    tf.y = s16(0x50 - sp.bg.y - offY);
    tf.scaleX = tf.scaleY = s16(div(k, 1024) + 0x40);
    s.frameFlags = AFFINE | matrix;
    if (tf.scaleX > 0x100) s.frameFlags |= DOUBLE_SIZE;
    const halfW = rom.u16(dims + 4) >> 1, halfH = rom.u16(dims + 6) >> 1;
    s.x = s16(tf.x - ((tf.scaleX * (rom.s16(dims + 8) - halfW) + (halfW << 8)) >> 8));
    s.y = s16(tf.y - ((tf.scaleY * (rom.s16(dims + 10) - halfH) + (halfH << 8)) >> 8));
    if (shown === 0 || s.oamBaseIndex === 0xFF) {
      s.oamBaseIndex = 0xFF;
      setMatrix(ctx, s.frameFlags & 0x1F, tf.scaleX, tf.scaleY);
      displaySprite(e, ctx.sprites, s);
    } else {
      if (s.frameFlags & DOUBLE_SIZE) { s.x = s16(s.x - halfW); s.y = s16(s.y - halfH); }
      setMatrix(ctx, s.frameFlags & 0x1F, tf.scaleX, tf.scaleY);
      if (!copyOam(e, s)) return;
    }
    shown = (shown + 1) & 0xFF;
  }
}

// the first ring's OAM entry again, at the sprite's place and with its matrix; false once OAM is full
function copyOam(e, s) {
  const at = (s.oamFlags & 0x7C0) >> 6, k = e.allocOam(at);
  if (k < 0) return false;
  const m = e.oamMalloc, from = s.oamBaseIndex * 4;
  const a = (m[from] & 0xFD00) | (s.y & 0xFF) | ((s.frameFlags & DOUBLE_SIZE) << 3);
  const b = (m[from + 1] & 0xC000) | (s.x & 0x1FF) | ((s.frameFlags & 0x1F) << 9);
  m[k * 4] = a; m[k * 4 + 1] = b; m[k * 4 + 2] = m[from + 2];
  e.wideOam.push({ a, b, c: m[from + 2], trueX: s.x, trueY: s.y, order: at, sprite: s, x: s.x });
  return true;
}
