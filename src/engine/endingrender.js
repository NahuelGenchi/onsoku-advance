// Draws the true ending's frames (trueending.js) as the GBA puts them together: the backdrop, then each
// background and the sprites of its priority and above over it, back to front, and the brightness change
// across the screen. A semi-transparent sprite is blended with what is under it at full weight instead
// (BLDALPHA 16), so the fade leaves it as it is. The ending is the original 240 × 160 screen; the widescreen
// view shows it in its middle, with black round it.

import { SCREEN_W, SCREEN_H } from './constants.js';

// the backgrounds each scene shows, as BGxCNT has them: the night scene's BG0–BG2, the sky's BG0, and what the
// pictures leave of it
const LAYERS = { night: ['back', 'middle', 'front'], sky: ['back'], pictures: ['back'] };

const toCanvas = img => {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
};

export function createEndingRenderer(parts, art) {
  const scenes = Object.fromEntries(Object.keys(LAYERS).map(name => [name, {
    backdrop: `rgb(${art[name].palette[0].join()})`,
    layers: LAYERS[name].map(k => ({ ...art[name].layers[k], canvas: toCanvas(art[name].layers[k].image) })),
  }]));
  const blend = art.blend.map(({ img, anchorX, anchorY }) => ({ canvas: toCanvas(img), anchorX, anchorY }));

  function drawSprites(list, ox, oy) {
    for (const s of parts.stack(list)) {
      if (s.blend !== undefined) {
        const b = blend[s.blend];
        parts.ctx.drawImage(b.canvas, ox + s.x - b.anchorX, oy + s.y - b.anchorY);
      } else if (s.affine) parts.drawAffine(s.frame, ox + s.x, oy + s.y, s.affine);
      else parts.drawSprite(s.frame, ox + s.x, oy + s.y, false);
    }
  }

  // a background's lines from its vertical scroll down, its map repeating below its last line
  function drawLayer(layer, scroll, ox, oy) {
    const c = layer.canvas, h = c.height;
    for (let y = 0; y < SCREEN_H;) {
      const from = (y + scroll) % h, n = Math.min(SCREEN_H - y, h - from);
      parts.ctx.drawImage(c, 0, from, SCREEN_W, n, ox, oy + y, SCREEN_W, n);
      y += n;
    }
  }

  // mGBA's brightness increase and decrease on its 8-bit colours, by `y` sixteenths
  function fade(brighten, y, ox, oy) {
    if (!y) return;
    const img = parts.ctx.getImageData(ox, oy, SCREEN_W, SCREEN_H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (brighten) {
        for (let k = 0; k < 3; k++) d[i + k] += ((255 - d[i + k]) * y) >> 4;
      } else {
        d[i] -= (d[i] * y) >> 4;
        d[i + 1] = (d[i + 1] * (16 - y)) >> 4;
        d[i + 2] = (d[i + 2] * (16 - y)) >> 4;
      }
    }
    parts.ctx.putImageData(img, ox, oy);
  }

  return function render({ display, sprites, done }) {
    const ctx = parts.ctx, W = parts.w, H = parts.h, ox = (W - SCREEN_W) >> 1, oy = (H - SCREEN_H) >> 1;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (done) return;
    const scene = scenes[display.scene];
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, SCREEN_W, SCREEN_H); ctx.clip();
    ctx.fillStyle = scene.backdrop;
    ctx.fillRect(ox, oy, SCREEN_W, SCREEN_H);
    const solid = sprites.filter(s => !s.semi);
    // back to front by priority: the backgrounds of a priority, then that priority's sprites
    for (let prio = 3; prio >= 0; prio--) {
      scene.layers.forEach((layer, i) => {
        if (((layer.cnt & 3) === prio)) drawLayer(layer, display.scroll[i], ox, oy);
      });
      drawSprites(solid.filter(s => s.prio === prio), ox, oy);
    }
    fade(display.brighten, display.bldY, ox, oy);
    drawSprites(sprites.filter(s => s.semi), ox, oy);
    ctx.restore();
  };
}
