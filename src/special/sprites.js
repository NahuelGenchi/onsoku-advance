// How the special stage shows its sprites (SAT-R decompilation, src/game/sa1/special_stage/main.c): every one is
// scaled by its depth through an affine matrix of OAM, and sprites at the same depth share a matrix, of the 16
// the stage hands out each frame from the depths it meets (matrix 0 is the character's). Sprites of an animation
// another sprite already loads keep that one's tiles and colours instead of loading their own.

export const s8 = v => (v << 24) >> 24, s16 = v => (v << 16) >> 16;
/** C's division, which truncates, as __divsi3 and the BIOS's Div do. */
export const div = (a, b) => Math.trunc(a / b) | 0;
export const I = v => v >> 8;

export const NO_DEPTH = 0x7FFF;
// the frame flags: an affine sprite of priority 2, and one twice its size
export const AFFINE = 0x2020, DOUBLE_SIZE = 0x40;
const KEEP_GRAPHICS = 0xC0000;
// the one animation that always loads its own graphics: the bumper's
const BUMPER = { anim: 797, variant: 0 };

/** sub_802D58C: the matrix for sprites `depth` lines ahead, 1 to 16, or 17 once 16 depths are taken. */
export function depthMatrix(sp, depth) {
  const depths = sp.depths;
  let i = 0;
  for (; i < 16; i++) {
    if (depths[i] === NO_DEPTH) { depths[i] = depth; break; }
    if (depths[i] === depth) break;
  }
  return (i + 1) & 0xFF;
}

/** The matrix `index` scaling by (scaleX, scaleY) in 8.8, unless it is set this frame already. */
export function setMatrix(ctx, index, scaleX, scaleY) {
  const sp = ctx.special;
  if (sp.matrices[index] !== 0) return;
  sp.matrices[index] = -1;
  const oam = ctx.engine.oamBuffer, at = index * 16 + 3;
  oam[at] = div(0x10000, scaleX) & 0xFFFF;
  oam[at + 4] = 0;
  oam[at + 8] = 0;
  oam[at + 12] = div(0x10000, scaleY) & 0xFFFF;
}

/**
 * sub_802BE0C: sets the sprite's matrix, and places the sprite so that its frame is scaled around its middle at
 * the transform's (x, y).
 */
export function transform(ctx, s, tf) {
  const d = s.dimensions;
  if (d === -1) return;
  const rom = ctx.rom;
  setMatrix(ctx, s.frameFlags & 0x1F, tf.scaleX, tf.scaleY);
  const halfW = rom.u16(d + 4) >> 1, halfH = rom.u16(d + 6) >> 1;
  s.x = s16(tf.x - ((tf.scaleX * (rom.s16(d + 8) - halfW) + (halfW << 8)) >> 8));
  s.y = s16(tf.y - ((tf.scaleY * (rom.s16(d + 10) - halfH) + (halfH << 8)) >> 8));
}

/**
 * sub_802B5DC: the first sprite of an animation and variant since the list was last emptied takes its place in
 * it; the others keep the graphics that one loads, from then on.
 */
export function shareGraphics(sp, s) {
  const anim = s.graphics.anim, variant = s.variant, list = sp.loaded;
  if (anim === BUMPER.anim && variant === BUMPER.variant) return;
  for (let i = 0; i < 16; i++) {
    if (list[i * 2] === anim && list[i * 2 + 1] === variant) { s.frameFlags |= KEEP_GRAPHICS; return; }
  }
  for (let i = 0; i < 16; i++) {
    if (list[i * 2] === 0 && list[i * 2 + 1] === 0) { list[i * 2] = anim; list[i * 2 + 1] = variant; return; }
  }
}

/** sub_802D560: empties the list of animations being loaded. */
export const clearShared = sp => sp.loaded.fill(0);

/** HB_COLLISION: whether box `a` at (ax, ay) and box `b` at (bx, by) touch. */
export function touches(ax, ay, a, bx, by, b) {
  const al = ax + a.left, bl = bx + b.left, at = ay + a.top, bt = by + b.top;
  const x = (al <= bl && al + (a.right - a.left) >= bl) || (al >= bl && bl + (b.right - b.left) >= al);
  const y = (at <= bt && at + (a.bottom - a.top) >= bt) || (at >= bt && bt + (b.bottom - b.top) >= at);
  return x && y;
}
