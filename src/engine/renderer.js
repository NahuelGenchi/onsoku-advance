// Draws one 240 × 160 frame: the zone background with its per-line scrolling, the platform, Sonic and effects.

import { SCREEN_W, SCREEN_H, FEET, BALL_FEET } from './constants.js';
import { frameOf } from './animator.js';

const mod = (a, n) => ((a % n) + n) % n;
const CURLED_ANIMATIONS = new Set(['spin', 'spinDash', 'spinDashRev']);

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

  function drawSprite(index, x, y, facing) {
    if (index < 0) return;
    const [sx, sy, w, h, ax, ay] = frames[index];
    const px = Math.round(x), py = Math.round(y);
    if (facing < 0) {
      ctx.drawImage(atlas, sx, sy, w, h, px - ax, py - ay, w, h);   // sprites face left in the ROM
    } else {
      ctx.save(); ctx.translate(px, 0); ctx.scale(-1, 1);
      ctx.drawImage(atlas, sx, sy, w, h, -ax, py - ay, w, h);
      ctx.restore();
    }
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

    const feet = CURLED_ANIMATIONS.has(player.anim.name) ? BALL_FEET : FEET;
    drawSprite(frameOf(player.anim, anims), player.x - cx, player.y - feet - cy, player.facing);
    for (const e of effects) drawSprite(frameOf(e.anim, anims), e.x - cx, e.y - cy - (e.follow ? 3 : 0), e.facing);
  };
}
