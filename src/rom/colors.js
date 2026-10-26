// GBA colors are 15-bit BGR555; expand each 5-bit channel to 8 bits.

export function bgr555ToRgb(color) {
  const r = color & 31, g = (color >> 5) & 31, b = (color >> 10) & 31;
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)];
}

export function readColors(rom, at, count) {
  const colors = [];
  for (let i = 0; i < count; i++) colors.push(bgr555ToRgb(rom.u16(at + i * 2)));
  return colors;
}

/** An expanded colour back as the 15-bit colour it came from. */
export function rgbToBgr555([r, g, b]) {
  return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);
}

/**
 * The colour under water of 15-bit colour `c` (SAT-R decompilation, src/game/shared/stage/water_effects.c,
 * MaskPaletteWithUnderwaterColor_inline): half of it, each channel's lowest bit dropped, plus half of its mix with the water's colour
 * `blend`. The original masks a palette two colours at a time, with no carry between them.
 */
export function waterTint(c, blend) {
  return ((c & 0x7BDE) + (((c & 0x739C) + (0x739C & blend)) >> 1)) >> 1;
}

/** An expanded colour under water. */
export const tintRgb = (rgb, blend) => bgr555ToRgb(waterTint(rgbToBgr555(rgb), blend));

/** A copy of `img` with every opaque pixel's colour as it is under water. */
export function tintImage(img, blend) {
  const out = new ImageData(img.width, img.height), d = img.data, o = out.data;
  for (let k = 0; k < d.length; k += 4) {
    if (!d[k + 3]) continue;
    [o[k], o[k + 1], o[k + 2]] = tintRgb([d[k], d[k + 1], d[k + 2]], blend);
    o[k + 3] = d[k + 3];
  }
  return out;
}
