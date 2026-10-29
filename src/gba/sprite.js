// Sprites as the engine runs them (SAT-R decompilation, src/sprite.c: UpdateSpriteAnimation, DisplaySprite): a
// sprite steps through its animation script, which queues its tiles for VRAM and loads its colours, and each
// frame it is shown puts its frame's OAM pieces into the engine's OAM, flipped, placed and given its tiles,
// palette, priority and order. The scripts and frames are the ROM's sprite tables (rom/sprites.js).

import { SINE } from '../engine/trig.js';

const OBJ_SIZES = [[8, 8], [16, 16], [32, 32], [64, 64], [16, 8], [32, 8], [32, 16], [64, 32], [8, 16], [8, 32], [16, 32], [32, 64]];
export const SPRITE = {
  ROT_SCALE: 0x1F, ROT_SCALE_ENABLE: 0x20, DOUBLE_SIZE: 0x40, OBJ_MODE: 0x180, X_FLIP: 0x400, Y_FLIP: 0x800,
  PRIORITY: 0x3000, ANIM_OVER: 0x4000, GLOBAL_OFFSET: 0x20000, KEEP_PALETTE: 0x40000, KEEP_TILES: 0x80000,
};
const OBJ_VRAM = 0x10000;
const RUNNING = 1, ANIM_CHANGED = -1, ENDED = 0;
const s8 = v => (v << 24) >> 24, s16 = v => (v << 16) >> 16;

/** A sprite (struct Sprite) with its fields at their defaults; `graphics.dest` is a VRAM offset. Its hitbox, as
 *  its animation sets it, is hitboxes[0]: { index, left, top, right, bottom }, index −1 for none. */
export function createSprite(fields = {}) {
  return {
    graphics: { src: 0, dest: OBJ_VRAM, size: 0, anim: 0 }, dimensions: -1, frameFlags: 0, animCursor: 0,
    x: 0, y: 0, oamFlags: 0, qAnimDelay: 0, prevAnim: 0xFFFF, variant: 0, prevVariant: 0xFF, animSpeed: 0x10,
    oamBaseIndex: 0, numSubFrames: 0, palId: 0, hitboxes: [{ index: -1, left: 0, top: 0, right: 0, bottom: 0 }], ...fields,
  };
}

/** UpdateSpriteAnimation: returns 1 while the animation runs, 0 once it has ended. With `background`,
 *  UpdateSpriteAnimation_BG instead, which the palette animations run on: an ended animation stays ended even
 *  if it is changed, and its colours load into the backgrounds' palette. */
export function updateSprite(e, tables, s, background = false) {
  const rom = e.rom;
  if (background && s.frameFlags & SPRITE.ANIM_OVER) return ENDED;
  if (s.prevVariant !== s.variant || s.prevAnim !== s.graphics.anim) {
    s.graphics.size = 0;
    s.prevVariant = s.variant;
    s.prevAnim = s.graphics.anim;
    s.animCursor = 0;
    s.qAnimDelay = 0;
    s.frameFlags &= ~SPRITE.ANIM_OVER;
  }
  if (s.frameFlags & SPRITE.ANIM_OVER) return ENDED;
  if (s.qAnimDelay > 0) {
    s.qAnimDelay = s16(s.qAnimDelay - s.animSpeed * 16);
    return RUNNING;
  }
  const scriptOf = () => rom.u32(rom.u32(tables.anims + s.graphics.anim * 4) - 0x08000000 + s.variant * 4) - 0x08000000;
  let script = scriptOf();
  for (let at = script + s.animCursor * 4; rom.s32(at) < 0; at = script + s.animCursor * 4) {
    const result = command(e, tables, s, at, background);
    if (result === RUNNING) continue;
    if (result !== ANIM_CHANGED) return result;
    script = scriptOf();
    s.animCursor = 0;
  }
  const at = script + s.animCursor * 4;
  s.qAnimDelay = s16(s.qAnimDelay + (rom.s32(at) << 8) - s.animSpeed * 0x10);
  const frame = rom.s32(at + 4);
  s.dimensions = frame === -1 ? -1 : rom.u32(tables.dims + s.graphics.anim * 4) - 0x08000000 + frame * 12;
  s.animCursor = (s.animCursor + 2) & 0xFFFF;
  return RUNNING;
}

// the animation commands, by their negative ids
function command(e, tables, s, at, background) {
  const rom = e.rom, id = rom.s32(at);
  switch (id) {
    case -1: {   // GetTiles
      s.animCursor += 3;
      if (!(s.frameFlags & SPRITE.KEEP_TILES)) {
        const index = rom.s32(at + 4), count = rom.u32(at + 8);
        if (index < 0) { s.graphics.src = tables.tiles8 + ((index * 64) >>> 0); s.graphics.size = (count * 64) & 0xFFFF; }
        else { s.graphics.src = tables.tiles4 + index * 32; s.graphics.size = (count * 32) & 0xFFFF; }
        e.queueGraphics(s.graphics);
      }
      return RUNNING;
    }
    case -2: {   // GetPalette: a 32-bit copy, so an odd colour count leaves its last colour out
      s.animCursor += 3;
      if (!(s.frameFlags & SPRITE.KEEP_PALETTE)) {
        const pal = tables.palettes + rom.s32(at + 4) * 32, count = rom.u16(at + 8), insert = rom.u16(at + 10);
        const n = (count * 2) >> 2 << 1, colours = background ? e.bgPalette : e.objPalette;
        for (let i = 0; i < n; i++) colours[(s.palId * 16 + insert + i) & 0xFF] = rom.u16(pal + i * 2);
        e.flags |= background ? 0x1 : 0x2;
      }
      return RUNNING;
    }
    case -3: s.animCursor = (s.animCursor - rom.s32(at + 4)) & 0xFFFF; return RUNNING;   // JumpBack
    case -4: s.frameFlags |= SPRITE.ANIM_OVER; return ENDED;                             // End
    case -5: s.animCursor += 2; e.playSong(rom.u16(at + 4)); return RUNNING;             // PlaySoundEffect
    case -6: {   // AddHitbox: none if it is all 0, else turned with the sprite
      s.animCursor += 3;
      const b = { index: rom.s32(at + 4), left: s8(rom.u8(at + 8)), top: s8(rom.u8(at + 9)), right: s8(rom.u8(at + 10)), bottom: s8(rom.u8(at + 11)) };
      if (!b.left && !b.top && !b.right && !b.bottom) b.index = -1;
      else {
        if (s.frameFlags & SPRITE.Y_FLIP) [b.top, b.bottom] = [s8(-b.bottom), s8(-b.top)];
        if (s.frameFlags & SPRITE.X_FLIP) [b.left, b.right] = [s8(-b.right), s8(-b.left)];
      }
      s.hitboxes[rom.u32(at + 4) & 0xF] = b;
      return RUNNING;
    }
    case -7: s.animCursor += 2; s.x = s16(s.x + rom.s16(at + 4)); s.y = s16(s.y + rom.s16(at + 6)); return RUNNING;
    case -8: s.animCursor += 3; return RUNNING;
    case -9:     // SetIdAndVariant
      s.animCursor += 2;
      s.graphics.anim = rom.u16(at + 4); s.prevVariant = 0xFF; s.variant = rom.u16(at + 6) & 0xFF;
      return ANIM_CHANGED;
    case -10: s.animCursor += 4; return at;   // returns its own address, which ends the frame's commands
    case -11: s.animCursor += 2; s.frameFlags = (s.frameFlags & ~SPRITE.PRIORITY) | (rom.u32(at + 4) << 12); return RUNNING;
    case -12: s.animCursor += 2; s.oamFlags = (rom.u32(at + 4) << 6) & 0xFFFF; return RUNNING;
    default: throw new Error(`Unknown animation command ${id}.`);
  }
}

/**
 * TransformSprite's rotation matrix: `tf` = { rotation (0–1023 a turn), qScaleX, qScaleY (8.8) } into the sprite's
 * affine parameters (its frameFlags' ROT_SCALE) in the OAM buffer.
 */
export function rotateSprite(e, s, tf) {
  const angle = tf.rotation & 1023, cos = SINE[angle + 256] >> 6, sin = SINE[angle] >> 6;
  const index = s.frameFlags & SPRITE.ROT_SCALE;
  const put = (k, v) => { e.oamBuffer[(index * 4 + k) * 4 + 3] = v & 0xFFFF; };
  const rx = s16(Math.trunc(0x10000 / s16(tf.qScaleX))), ry = s16(Math.trunc(0x10000 / s16(tf.qScaleY)));
  put(0, (cos * rx) >> 8);
  put(1, (sin * rx) >> 8);
  put(2, (-sin * ry) >> 8);
  put(3, (cos * ry) >> 8);
}

/**
 * TransformSprite: `tf` = { rotation, qScaleX, qScaleY, x, y } as the sprite's rotation matrix (rotateSprite), and the
 * sprite placed so that its frame's anchor stays at (x, y) once turned and scaled. It reads the frame the sprite last
 * showed; without one it does nothing.
 */
export function transformSprite(e, s, tf) {
  if (s.dimensions === -1) return;
  rotateSprite(e, s, tf);
  const rom = e.rom, d = s.dimensions;
  const w = rom.u16(d + 4), h = rom.u16(d + 6), offsetX = rom.s16(d + 8), offsetY = rom.s16(d + 10);
  const angle = tf.rotation & 1023, cos = SINE[angle + 256] >> 6, sin = SINE[angle] >> 6;
  const kx = Math.abs(s16(tf.qScaleX)), ky = Math.abs(s16(tf.qScaleY));
  const u0 = s16((cos * kx) >> 8), u1 = s16((-sin * kx) >> 8), u2 = s16((sin * ky) >> 8), u3 = s16((cos * ky) >> 8);
  const ax = (tf.qScaleX > 0 ? offsetX : w - offsetX) - (w >> 1), ay = (tf.qScaleY > 0 ? offsetY : h - offsetY) - (h >> 1);
  s.x = s16(tf.x - ((u0 * ax + u1 * ay + ((w >> 1) << 8)) >> 8));
  s.y = s16(tf.y - ((u2 * ax + u3 * ay + ((h >> 1) << 8)) >> 8));
}

/**
 * DisplaySprite: the sprite's frame into OAM at (x, y), if any of it is on screen. For the widescreen view, every
 * piece also goes into e.wideOam where it really is, on screen or not.
 */
export function displaySprite(e, tables, s) {
  if (s.dimensions === -1) return;
  const rom = e.rom, d = s.dimensions;
  const flip = rom.u8(d), oamIndex = rom.u8(d + 1), pieces = rom.u16(d + 2);
  let w = rom.u16(d + 4), h = rom.u16(d + 6);
  const offsetX = rom.s16(d + 8), offsetY = rom.s16(d + 10);
  s.numSubFrames = pieces & 0xFF;
  let x = s.x, y = s.y;
  const ff = s.frameFlags;
  if (ff & SPRITE.ROT_SCALE_ENABLE) {
    if (ff & SPRITE.DOUBLE_SIZE) { x -= w >> 1; y -= h >> 1; w *= 2; h *= 2; }
  } else {
    y -= ff & SPRITE.Y_FLIP ? h - offsetY : offsetY;
    x -= ff & SPRITE.X_FLIP ? w - offsetX : offsetX;
  }
  let shown = x + w >= 0 && x <= 240 && y + h >= 0 && y <= 160;
  const oamData = rom.u32(tables.oam + s.graphics.anim * 4) - 0x08000000;
  const m = e.oamMalloc, order = (s.oamFlags & 0x7C0) >> 6;
  for (let i = 0; i < pieces; i++) {
    const src = oamData + ((oamIndex & 0x3FFF) + i) * 6;
    let a0 = rom.u16(src), a1 = rom.u16(src + 2), a2 = rom.u16(src + 4);
    let sprX = a1 & 0x1FF, sprY = a0 & 0xFF;
    a1 &= 0xFE00; a0 &= 0xFE00;
    a2 = (a2 + (s.palId << 12)) & 0xFFFF;
    if (ff & SPRITE.ROT_SCALE_ENABLE) {
      a0 |= 0x100;
      if (ff & SPRITE.DOUBLE_SIZE) a0 |= 0x200;
      a1 |= (ff & SPRITE.ROT_SCALE) << 9;
    } else {
      const [sw, sh] = OBJ_SIZES[((a0 & 0xC000) >> 12) | ((a1 & 0xC000) >> 14)];
      if ((((flip >> 1) ^ (ff >> 11)) & 1) !== 0) { a1 ^= 0x2000; sprY = h - sh - sprY; }
      if (((ff >> 10) & 1) !== (flip & 1)) { a1 ^= 0x1000; sprX = w - sw - sprX; }
    }
    a0 |= (ff & SPRITE.OBJ_MODE) * 8;
    a2 |= (ff & SPRITE.PRIORITY) >> 2;
    a0 = (a0 + ((y + sprY) & 0xFF)) & 0xFFFF;
    a1 = (a1 + ((x + sprX) & 0x1FF)) & 0xFFFF;
    if (a0 & 0x2000) a2 = (a2 + (a2 & 0x3FF)) & 0xFFFF;
    a2 = (a2 + ((s.graphics.dest - OBJ_VRAM) >> 5)) & 0xFFFF;
    e.wideOam.push({ a: a0, b: a1, c: a2, trueX: x + sprX, trueY: y + sprY, order, sprite: s, x: s.x });
    if (!shown) continue;
    const k = e.allocOam(order);
    if (k < 0) { shown = false; continue; }
    if (i === 0) s.oamBaseIndex = e.oamFreeIndex - 1;
    m[k * 4] = a0; m[k * 4 + 1] = a1; m[k * 4 + 2] = a2;
  }
}
