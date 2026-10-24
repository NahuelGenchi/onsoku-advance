// Draws an act's map layers from the metatile atlas, and its collision as an overlay for checking.

import { solidPixel } from './terrain.js';

/** Animation frame of the stage's animated tiles at `tick` (one step every animDelay frames). */
export function stageAnimFrame(stage, tick) {
  const frames = stage.atlas.slots.length;
  return frames > 1 ? Math.floor(tick / stage.animDelay) % frames : 0;
}

/**
 * Which of the palettes rendered for the palette animations in `follows` their states pick: `shown` holds
 * the frame each animation has loaded, -1 for the stage's own colours.
 */
export function paletteVariant(stage, follows, shown) {
  return follows.reduce((v, k) => v * (stage.paletteAnimations[k].delays.length + 1) + shown[k] + 1, 0);
}

/**
 * Draws `layer` ('front' or 'back') with the view's top-left corner at world (x, y), in the colours the
 * palette animations' frames `shown` give it.
 */
export function drawLayer(ctx, stage, layer, x, y, w, h, animFrame = 0, shown = []) {
  const { canvas, size, slots, follows } = stage.atlas, map = stage.layers[layer];
  const slot = slots[animFrame][shown.length ? paletteVariant(stage, follows, shown) : 0];
  const mx0 = Math.max(0, Math.floor(x / size)), mx1 = Math.min(stage.levelX - 1, Math.floor((x + w - 1) / size));
  const my0 = Math.max(0, Math.floor(y / size)), my1 = Math.min(stage.levelY - 1, Math.floor((y + h - 1) / size));
  for (let my = my0; my <= my1; my++) {
    for (let mx = mx0; mx <= mx1; mx++) {
      const s = slot[map[my * stage.levelX + mx]];
      ctx.drawImage(canvas, (s % 16) * size, Math.floor(s / 16) * size, size, size, mx * size - x, my * size - y, size, size);
    }
  }
}

/**
 * Collision of a world rectangle as an image: solid pixels of the front layer in red and of the back layer
 * in blue (purple where both are solid), jump-through tiles lighter.
 */
export function collisionImage(terrain, x0, y0, w, h) {
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x0 + x, py = y0 + y;
      if (px < 0 || py < 0 || px >= terrain.width || py >= terrain.height) continue;
      const front = solidPixel(terrain, px, py, 0), back = solidPixel(terrain, px, py, 1);
      if (!front && !back) continue;
      const k = (y * w + x) * 4;
      const ghost = !solidPixel(terrain, px, py, front ? 0x80 : 0x81);
      img.data[k] = front ? 255 : 40; img.data[k + 1] = ghost ? 200 : 40; img.data[k + 2] = back ? 255 : 40;
      img.data[k + 3] = 150;
    }
  }
  return img;
}
