// The original's integer trigonometry. The sine table is 1.25 turns of 1024 steps in Q2.14, each entry
// truncated toward zero (SAT-R decompilation, src/trig.c), so it is rebuilt from the formula instead of the ROM.
// ArcTan2 is the GBA BIOS call (SWI 0x0A), after mGBA's reimplementation of it.

export const SINE = Int16Array.from({ length: 1280 }, (_, i) => Math.trunc(Math.sin(i * 2 * Math.PI / 1024) * 16384));

/** sin and cos of a 0–255 angle as 8.8 fixed point (−256 … 256), like SIN_24_8 and COS_24_8. */
export const sin8 = angle => SINE[(angle & 0xFF) * 4] >> 6;
export const cos8 = angle => SINE[(angle & 0xFF) * 4 + 256] >> 6;

/** s8 view of an angle byte. */
export const s8 = a => ((a & 0xFF) ^ 0x80) - 0x80;

function arcTan(i) {
  const a = -((i * i) >> 14);
  let b = ((0xA9 * a) >> 14) + 0x390;
  b = ((b * a) >> 14) + 0x91C;
  b = ((b * a) >> 14) + 0xFB6;
  b = ((b * a) >> 14) + 0x16AA;
  b = ((b * a) >> 14) + 0x2081;
  b = ((b * a) >> 14) + 0x3651;
  b = ((b * a) >> 14) + 0xA2F9;
  return (i * b) >> 16;
}

const div = (a, b) => Math.trunc(a / b);

/** Angle of (x, y) in 65536 steps per turn, y pointing down; x and y are s16. */
export function arcTan2(x, y) {
  let r;
  if (!y) r = x >= 0 ? 0 : 0x8000;
  else if (!x) r = y >= 0 ? 0x4000 : 0xC000;
  else if (y >= 0) {
    if (x >= 0 && x >= y) r = arcTan(div(y << 14, x));
    else if (x < 0 && -x >= y) r = arcTan(div(y << 14, x)) + 0x8000;
    else r = 0x4000 - arcTan(div(x << 14, y));
  } else {
    if (x <= 0 && -x > -y) r = arcTan(div(y << 14, x)) + 0x8000;
    else if (x > 0 && x >= -y) r = arcTan(div(y << 14, x)) + 0x10000;
    else r = 0xC000 - arcTan(div(x << 14, y));
  }
  return r & 0xFFFF;
}

const s16 = v => (v << 16) >> 16;
const OCTANTS = [1, 0, 2, 3, 6, 7, 5, 4];

/**
 * The angle (0–1023 per turn) the sprite code finds for a vector from its octant and the ratio of its smaller
 * part to its larger one (sub_8004418), −1 for (0, 0). Its callers pass the vector's y first. The parts are s16
 * and the arithmetic keeps to s16, as the original's does.
 */
export function vectorAngle(x, y) {
  if ((x | y) === 0) return -1;
  let i = 0, f;
  if (x <= 0) { x = s16(-x); i = 4; }
  if (y <= 0) { y = s16(-y); i += 2; }
  if (x >= y) { y = s16(y * 128); f = x === 0 ? y : s16(Math.trunc(y / x)); }
  else { i++; x = s16(x * 128); f = y === 0 ? x : s16(Math.trunc(x / y)); }
  if (OCTANTS[i] & 1) f = s16(128 - f);
  return (f + OCTANTS[i] * 128) & 0x3FF;
}
