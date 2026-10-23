// Draws one 240 × 160 frame: the zone background with its per-line scrolling, the platform, Sonic and effects.

import { SCREEN_W, SCREEN_H } from './constants.js';
import { frameOf } from './animator.js';

const mod = (a, n) => ((a % n) + n) % n;

// Neo Green Hill's background scrolls each line on its own: three cloud bands drift with time,
// the big clouds and islands stay still, and the sea scrolls faster toward the bottom of the screen.
function backgroundOffset(line, tick, cameraX) {
  if (line < 8) return (tick >> 4) & 0xFF;
  if (line < 24) return (tick >> 5) & 0xFF;
  if (line < 40) return (tick >> 6) & 0xFF;
  if (line < 88) return 0;
  return ((line - 86) * cameraX) >> 8;
}

export function createRenderer(canvas, assets) {
  canvas.width = SCREEN_W; canvas.height = SCREEN_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const { atlas, frames, anims } = assets.sprites;
  const { platform, background } = assets.stage;
  const bgW = background.width;

  // sprites face left in the ROM; a flip mirrors them around their anchor like the GBA does
  function drawSprite(index, x, y, flipX, flipY = false) {
    if (index < 0) return;
    const [sx, sy, w, h, ax, ay] = frames[index];
    const px = Math.floor(x), py = Math.floor(y);   // the integer part, like the original's I(qWorldX)
    if (!flipX && !flipY) { ctx.drawImage(atlas, sx, sy, w, h, px - ax, py - ay, w, h); return; }
    ctx.save(); ctx.translate(px, py); ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(atlas, sx, sy, w, h, -ax, -ay, w, h);
    ctx.restore();
  }

  return function render({ tick, cam, player, effects }) {
    ctx.imageSmoothingEnabled = false;
    const cx = Math.floor(cam.x), cy = Math.floor(cam.y);
    for (let line = 0; line < SCREEN_H; line++) {
      const off = mod(backgroundOffset(line, tick, cx), bgW);
      ctx.drawImage(background, off, line, bgW - off, 1, 0, line, bgW - off, 1);
      if (bgW - off < SCREEN_W) ctx.drawImage(background, 0, line, off, 1, bgW - off, line, off, 1);
    }
    for (let x = -mod(cx, platform.width); x < SCREEN_W; x += platform.width) ctx.drawImage(platform, x, -cy);

    // facing left, the original shifts Sonic 1px right, except in the walk and run frames, which it
    // draws through the rotation hardware instead
    const nudge = player.facing < 0 && player.state !== 'walk' ? 1 : 0;
    drawSprite(frameOf(player.anim, anims), player.x - cx + nudge, player.y - (player.offsetY + 1) - cy, player.facing > 0);
    for (const e of effects) drawSprite(frameOf(e.anim, anims), e.x - cx, e.y - cy, e.flipX, e.flipY);
  };
}
