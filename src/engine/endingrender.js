// Draws the endings' frames (trueending.js, congratulations.js and credits.js) as the GBA puts them together:
// the backdrop, then each background and the sprites of its priority and above over it, back to front, and the
// brightness change. A semi-transparent sprite is blended with what is under it at full weight instead
// (BLDALPHA 16), so the fade leaves it as it is. The true ending's display has the change across the whole
// screen (`brighten`, `bldY`); the normal ending's has the registers (screenfade.js), and the change is on the
// lines of the windows that have it. The endings are the original 240 × 160 screen; the widescreen view shows
// them in its middle, with black round it.

import { SCREEN_W, SCREEN_H } from './constants.js';

// the backgrounds each scene shows, as BGxCNT has them: the night scene's BG0–BG2, the sky's BG0, and what the
// pictures leave of it; the congratulations' sky (BG0), the credits' black (BG1) and the message's (BG0)
const LAYERS = { night: ['back', 'middle', 'front'], sky: ['back'], pictures: ['back'], congrats: ['back'], credits: ['back'], message: ['back'] };

const toCanvas = img => {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
};

export function createEndingRenderer(parts, art) {
  const scenes = Object.fromEntries(Object.keys(LAYERS).filter(name => art[name]).map(name => [name, {
    backdrop: `rgb(${art[name].palette[0].join()})`,
    layers: LAYERS[name].map(k => ({ ...art[name].layers[k], canvas: toCanvas(art[name].layers[k].image) })),
  }]));
  const blend = (art.blend ?? []).map(({ img, anchorX, anchorY }) => ({ canvas: toCanvas(img), anchorX, anchorY }));
  // the credits' letters, 8 × 16, by palette row (14 and 15) and glyph
  const glyphs = (art.glyphs ?? []).map(row => row.map(toCanvas));

  function drawSprites(list, ox, oy) {
    for (const s of parts.stack(list)) {
      if (s.glyph) parts.ctx.drawImage(glyphs[s.glyph[0]][s.glyph[1]], ox + s.x, oy + s.y);
      else if (s.blend !== undefined) {
        const b = blend[s.blend];
        parts.ctx.drawImage(b.canvas, ox + s.x - b.anchorX, oy + s.y - b.anchorY);
      } else if (s.affine) parts.drawAffine(s.frame, ox + s.x, oy + s.y, s.affine);
      else drawObj(s, ox, oy);
    }
  }

  // DisplaySprite: nothing of a sprite wholly off the screen, and each OAM piece at its 9-bit x and 8-bit y, so
  // a piece far above the screen comes round at the bottom as on the GBA. A frame the extractor kept no pieces
  // for is drawn whole
  function drawObj(s, ox, oy) {
    const [sx, sy, w, h, ax, ay, pieces] = parts.frames[s.frame];
    const left = Math.floor(s.x) - ax, top = Math.floor(s.y) - ay;
    if (left + w < 0 || left > SCREEN_W || top + h < 0 || top > SCREEN_H) return;
    if (!pieces) { parts.drawSprite(s.frame, ox + s.x, oy + s.y, false); return; }
    for (const [px, py, pw, ph] of pieces) {
      let x = (left + px) & 0x1FF, y = (top + py) & 0xFF;
      if (x + pw > 512) x -= 512;
      else if (x >= SCREEN_W) continue;
      if (y + ph > 256) y -= 256;
      else if (y >= SCREEN_H) continue;
      parts.ctx.drawImage(parts.atlas, sx + px, sy + py, pw, ph, ox + x, oy + y, pw, ph);
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

  // mGBA's brightness increase and decrease on its 8-bit colours, by `y` sixteenths, on the lines `rows` has
  function fade(brighten, y, ox, oy, rows = null) {
    if (!y) return;
    const img = parts.ctx.getImageData(ox, oy, SCREEN_W, SCREEN_H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (rows && !rows[(i >> 2) / SCREEN_W | 0]) continue;
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

  // BLDCNT's brightening (2) or darkening (3) on the lines whose window has the effect on (bit 5 of its
  // WININ or WINOUT half); with neither window on, on every line. The windows here are as wide as the screen.
  // Every layer showing on those lines is one of the first targets.
  function effects({ bldCnt, bldY, win0, win1, winIn, winOut }, ox, oy) {
    const mode = (bldCnt >> 6) & 3;
    if (mode < 2 || !bldY) return;
    const inside = (w, r) => w && r >= w[0] && r < w[1];
    const rows = Array.from({ length: SCREEN_H }, (_, r) => {
      if (!win0 && !win1) return true;
      const bits = inside(win0, r) ? winIn : inside(win1, r) ? winIn >> 8 : winOut;
      return (bits & 0x20) !== 0;
    });
    fade(mode === 2, bldY, ox, oy, rows);
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
    if (display.bldCnt === undefined) fade(display.brighten, display.bldY, ox, oy);
    else effects(display, ox, oy);
    drawSprites(sprites.filter(s => s.semi), ox, oy);
    ctx.restore();
  };
}
