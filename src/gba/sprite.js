// Sprites as the engine runs them (SAT-R decompilation, src/sprite.c: UpdateSpriteAnimation, DisplaySprite): a
// sprite steps through its animation script, which queues its tiles for VRAM and loads its colours, and each
// frame it is shown puts its frame's OAM pieces into the engine's OAM, flipped, placed and given its tiles,
// palette, priority and order. The scripts and frames are the ROM's sprite tables (rom/sprites.js).

const OBJ_SIZES = [[8, 8], [16, 16], [32, 32], [64, 64], [16, 8], [32, 8], [32, 16], [64, 32], [8, 16], [8, 32], [16, 32], [32, 64]];
export const SPRITE = {
  ROT_SCALE: 0x1F, ROT_SCALE_ENABLE: 0x20, DOUBLE_SIZE: 0x40, OBJ_MODE: 0x180, X_FLIP: 0x400, Y_FLIP: 0x800,
  PRIORITY: 0x3000, ANIM_OVER: 0x4000, GLOBAL_OFFSET: 0x20000, KEEP_PALETTE: 0x40000, KEEP_TILES: 0x80000,
};
const OBJ_VRAM = 0x10000;
const RUNNING = 1, ANIM_CHANGED = -1, ENDED = 0;
const s16 = v => (v << 16) >> 16;

/** A sprite (struct Sprite) with its fields at their defaults; `graphics.dest` is a VRAM offset. */
export function createSprite(fields = {}) {
  return {
    graphics: { src: 0, dest: OBJ_VRAM, size: 0, anim: 0 }, dimensions: -1, frameFlags: 0, animCursor: 0,
    x: 0, y: 0, oamFlags: 0, qAnimDelay: 0, prevAnim: 0xFFFF, variant: 0, prevVariant: 0xFF, animSpeed: 0x10,
    oamBaseIndex: 0, numSubFrames: 0, palId: 0, ...fields,
  };
}

/** UpdateSpriteAnimation: returns 1 while the animation runs, 0 once it has ended. */
export function updateSprite(e, tables, s) {
  const rom = e.rom;
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
    const result = command(e, tables, s, at);
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
function command(e, tables, s, at) {
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
        const n = (count * 2) >> 2 << 1;
        for (let i = 0; i < n; i++) e.objPalette[(s.palId * 16 + insert + i) & 0xFF] = rom.u16(pal + i * 2);
        e.flags |= 0x2;
      }
      return RUNNING;
    }
    case -3: s.animCursor = (s.animCursor - rom.s32(at + 4)) & 0xFFFF; return RUNNING;   // JumpBack
    case -4: s.frameFlags |= SPRITE.ANIM_OVER; return ENDED;                             // End
    case -5: s.animCursor += 2; e.playSong(rom.u16(at + 4)); return RUNNING;             // PlaySoundEffect
    case -6: s.animCursor += 3; return RUNNING;                                          // AddHitbox
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
