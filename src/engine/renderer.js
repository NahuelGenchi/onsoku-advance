// Draws one 240 × 160 frame: the zone background with its per-line scrolling, the act's back layer, the
// rings, objects, Sonic, ring sparkles and effects, then the front layer over them, and the HUD on top.

import { SCREEN_W, SCREEN_H } from './constants.js';
import { frameOf } from './animator.js';
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
  const { atlas, frames, anims } = assets.sprites, hud = assets.hud;
  const stage = assets.stage, { background } = stage;
  const bgW = background.width;

  // sprites face left in the ROM; a flip mirrors them around their anchor like the GBA does
  // `angle` (0–255 per turn) turns the sprite around its anchor like the GBA's rotation hardware
  function drawSprite(index, x, y, flipX, flipY = false, angle = 0) {
    if (index < 0) return;
    const [sx, sy, w, h, ax, ay] = frames[index];
    const px = Math.floor(x), py = Math.floor(y);   // the integer part, like the original's I(qWorldX)
    if (!flipX && !flipY && !angle) { ctx.drawImage(atlas, sx, sy, w, h, px - ax, py - ay, w, h); return; }
    ctx.save(); ctx.translate(px, py);
    if (angle) ctx.rotate(angle * Math.PI / 128);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
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

  return function render({ tick, cam, player, rings, objects, sparkles, effects, terrain, hud: hudState, showCollision }) {
    ctx.imageSmoothingEnabled = false;
    const cx = Math.floor(cam.x), cy = Math.floor(cam.y);
    for (let line = 0; line < SCREEN_H; line++) {
      const off = mod(backgroundOffset(line, tick, cx), bgW);
      ctx.drawImage(background, off, line, bgW - off, 1, 0, line, bgW - off, 1);
      if (bgW - off < SCREEN_W) ctx.drawImage(background, 0, line, off, 1, bgW - off, line, off, 1);
    }
    const frame = stageAnimFrame(stage, tick);
    drawLayer(ctx, stage, 'back', cx, cy, SCREEN_W, SCREEN_H, frame);
    // rings, objects, Sonic and the sparkles share a priority; the sprite list orders them back to front
    // (OAM orders 20, 18, 16 and 15), and the dust and shield effects come in front of them all
    const shown = rings.visible(cam);
    for (const r of shown.list) drawSprite(shown.frame, r.x - cx, r.y - cy, false);
    for (const o of objects.live()) drawSprite(o.frame, o.x - cx, o.y - cy, o.flipX, o.flipY);

    // the walk and run frames go through the rotation hardware and follow the slope; facing left, the
    // original shifts the other frames 1px right
    const turning = player.state === 'walk';
    const nudge = player.facing < 0 && !turning ? 1 : 0;
    drawSprite(frameOf(player.anim, anims), player.x - cx + nudge, player.y - cy, player.facing > 0, false, turning ? player.rotation : 0);
    for (const s of sparkles) drawSprite(frameOf(s.anim, anims), s.x - cx, s.y - cy, false);
    for (const e of effects) drawSprite(frameOf(e.anim, anims), e.x - cx, e.y - cy, e.flipX, e.flipY);
    drawLayer(ctx, stage, 'front', cx, cy, SCREEN_W, SCREEN_H, frame);
    if (showCollision) drawCollision(terrain, cx, cy);
    drawHud(hudState.sprites);
  };
}
