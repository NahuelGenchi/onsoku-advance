// Draws an act's map layers from the metatile atlas, and its collision as an overlay for checking.

import { solidPixel } from './terrain.js';

// how many steps the stage's animated tiles have
const animFrames = stage => (stage.atlas.indexed ? stage.atlas.frames.length : stage.atlas.slots.length);

/**
 * The stage's animated tiles for one frame (UpdateBgAnimationTiles, which the camera runs every frame): a step
 * every animDelay frames, counted from when the camera is made. A step's tiles are queued for VRAM and copied as
 * the next frame starts, so the screen shows each step a frame late. `tiles` is the camera's count.
 */
export function animateStageTiles(stage, tiles) {
  tiles.shown = tiles.frame;
  if (++tiles.delay < stage.animDelay) return;
  tiles.delay = 0;
  if (++tiles.frame >= animFrames(stage)) tiles.frame = 0;
}

/** Animation frame of the stage's animated tiles after `n` steps of their counter (one every animDelay). */
export function stageAnimFrame(stage, n) {
  const frames = animFrames(stage);
  return frames > 1 && n > 0 ? Math.floor(n / stage.animDelay) % frames : 0;
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
 * palette animations' frames `shown` give it, and below the water line in `under`'s (drawIndexedLayer).
 */
export function drawLayer(ctx, stage, layer, x, y, w, h, animFrame = 0, shown = [], under = null) {
  if (stage.atlas.indexed) { drawIndexedLayer(ctx, stage, layer, x, y, w, h, animFrame, shown, under); return; }
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

// a palette as the 32-bit pixels ImageData holds (RGBA in memory order), opaque
const packed = new WeakMap();
export function packPalette(colors) {
  let out = packed.get(colors);
  if (!out) {
    out = new Uint32Array(colors.length);
    colors.forEach(([r, g, b], i) => { out[i] = (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0; });
    packed.set(colors, out);
  }
  return out;
}

// what an indexed layer is put together in before it goes onto the frame, in blocks of at most this size
const BLOCK = 1024;
let scratch = null;

/**
 * Draws a layer kept as colour indices (an indexed atlas) in the colours of the palette animations' frames
 * `shown`. From view line `under.line` down it takes the colours `under.colors` (256 packed colours) instead.
 */
export function drawIndexedLayer(ctx, stage, layer, x, y, w, h, animFrame = 0, shown = [], under = null) {
  const { size, frames, palettes, follows } = stage.atlas, map = stage.layers[layer], src = frames[animFrame] ?? frames[0];
  const colors = packPalette(palettes[shown.length ? paletteVariant(stage, follows, shown) : 0]);
  const levelW = stage.levelX * size, levelH = stage.levelY * size;
  scratch ??= document.createElement('canvas');
  for (let by = 0; by < h; by += BLOCK) {
    for (let bx = 0; bx < w; bx += BLOCK) {
      const bw = Math.min(BLOCK, w - bx), bh = Math.min(BLOCK, h - by);
      const img = new ImageData(bw, bh), out = new Uint32Array(img.data.buffer);
      let any = false;
      for (let row = 0; row < bh; row++) {
        const wy = y + by + row;
        if (wy < 0 || wy >= levelH) continue;
        const my = Math.floor(wy / size), line = (wy - my * size) * size, o = row * bw;
        const pal = under && by + row >= under.line ? under.colors : colors;
        for (let col = 0; col < bw;) {
          const wx = x + bx + col;
          if (wx < 0) { col = Math.min(bw, -x - bx); continue; }
          if (wx >= levelW) break;
          const mx = Math.floor(wx / size), px = wx - mx * size, n = Math.min(size - px, bw - col);
          const at = map[my * stage.levelX + mx] * size * size + line + px;
          for (let k = 0; k < n; k++) {
            const c = src[at + k];
            if (c) { out[o + col + k] = pal[c]; any = true; }
          }
          col += n;
        }
      }
      if (!any) continue;
      if (scratch.width < bw || scratch.height < bh) { scratch.width = Math.max(scratch.width, bw); scratch.height = Math.max(scratch.height, bh); }
      const g = scratch.getContext('2d');
      g.clearRect(0, 0, bw, bh);
      g.putImageData(img, 0, 0);
      ctx.drawImage(scratch, 0, 0, bw, bh, bx, by, bw, bh);
    }
  }
}
