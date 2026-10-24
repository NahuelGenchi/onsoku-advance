// Draws one 240 × 160 frame: the zone background with its per-line scrolling, the act's back layer, the
// sprites behind the front layer, the front layer, the sprites in front of it, and the HUD on top. The
// sprites are the act's rings and the step's list, stacked as the GBA stacks OAM entries: a lower OAM order
// in front, and within an order the one put in first.

import { SCREEN_W, SCREEN_H } from './constants.js';
import { drawLayer, stageAnimFrame, collisionImage } from './stage.js';

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
  const { atlas, frames } = assets.sprites, hud = assets.hud;
  const stage = assets.stage, { background } = stage;
  const bgW = background.width;

  // sprites face left in the ROM; a flip mirrors them around their anchor like the GBA does
  // `angle` (0–255 per turn) turns the sprite around its anchor like the GBA's rotation hardware, and `scale`
  // grows it around the same point
  function drawSprite(index, x, y, flipX, flipY = false, angle = 0, scale = 1) {
    if (index < 0) return;
    const [sx, sy, w, h, ax, ay] = frames[index];
    const px = Math.floor(x), py = Math.floor(y);   // the integer part, like the original's I(qWorldX)
    if (!flipX && !flipY && !angle && scale === 1) { ctx.drawImage(atlas, sx, sy, w, h, px - ax, py - ay, w, h); return; }
    ctx.save(); ctx.translate(px, py);
    if (angle) ctx.rotate(angle * Math.PI / 128);
    ctx.scale(flipX ? -scale : scale, flipY ? -scale : scale);
    ctx.drawImage(atlas, sx, sy, w, h, -ax, -ay, w, h);
    ctx.restore();
  }

  // debug overlay: the collision under the view, drawn through a scratch canvas so it blends
  const overlay = document.createElement('canvas');
  overlay.width = SCREEN_W; overlay.height = SCREEN_H;
  function drawCollision(terrain, cx, cy) {
    overlay.getContext('2d').putImageData(collisionImage(terrain, cx, cy, SCREEN_W, SCREEN_H), 0, 0);
    ctx.drawImage(overlay, 0, 0);
  }

  // the HUD's sprites have priority 0: in front of the layers and every other sprite
  function drawHud(sprites) {
    for (const [what, x, y] of sprites) {
      const [sx, sy, w, h] = what === 'ring' ? hud.ring : what === 'face' ? hud.face : hud.glyphs[what];
      ctx.drawImage(hud.sheet, sx, sy, w, h, x, y, w, h);
    }
  }

  // back to front: higher orders first, and the later entries of an order before the earlier ones
  function stack(list) {
    return list.map((s, i) => [s, i]).sort((a, b) => b[0].order - a[0].order || b[1] - a[1]).map(([s]) => s);
  }

  return function render({ tick, cam, rings, sprites, terrain, hud: hudState, showCollision }) {
    ctx.imageSmoothingEnabled = false;
    // on the act's first frame the camera isn't kept inside the act yet: the original's title card covers
    // that frame, and until this game has one the view is kept inside
    const cx = Math.min(Math.max(Math.floor(cam.x), 0), cam.maxX), cy = Math.min(Math.max(Math.floor(cam.y), 0), cam.maxY);
    for (let line = 0; line < SCREEN_H; line++) {
      const off = mod(backgroundOffset(line, tick, cx), bgW);
      ctx.drawImage(background, off, line, bgW - off, 1, 0, line, bgW - off, 1);
      if (bgW - off < SCREEN_W) ctx.drawImage(background, 0, line, off, 1, bgW - off, line, off, 1);
    }
    const frame = stageAnimFrame(stage, tick);
    drawLayer(ctx, stage, 'back', cx, cy, SCREEN_W, SCREEN_H, frame);
    // the rings manager runs first among the tasks that draw, so its rings (OAM order 20) come first
    const shown = rings.visible(cam);
    const list = stack([...shown.list.map(r => ({ frame: shown.frame, x: r.x, y: r.y, order: 20, prio: 2 })), ...sprites]);
    const drawAll = behind => {
      for (const s of list) if ((s.prio >= 2) === behind) drawSprite(s.frame, s.x - cx, s.y - cy, s.flipX, s.flipY, s.angle, s.scale);
    };
    drawAll(true);
    drawLayer(ctx, stage, 'front', cx, cy, SCREEN_W, SCREEN_H, frame);
    drawAll(false);
    if (showCollision) drawCollision(terrain, cx, cy);
    drawHud(hudState.sprites);
  };
}
