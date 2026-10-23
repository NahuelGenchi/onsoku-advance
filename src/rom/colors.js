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
