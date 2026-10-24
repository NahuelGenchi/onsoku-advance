// Draws one 240 × 160 frame: the zone background with its per-line scrolling, the act's back layer, the
// sprites behind the front layer, the front layer, the sprites in front of it, and the HUD or the title card on
// top, the background and the layers in the colours the act's palette animations have loaded. The
// sprites are the act's rings and the step's list, stacked as the GBA stacks OAM entries: a lower OAM order
// in front, and within an order the one put in first. While the title card fades the screen in, everything but
// its semi-transparent sprites is darkened.

import { SCREEN_W, SCREEN_H } from './constants.js';
import { drawLayer, stageAnimFrame, paletteVariant, collisionImage } from './stage.js';
import { SINE } from './trig.js';

const mod = (a, n) => ((a % n) + n) % n;
const s16 = v => (v << 16) >> 16;

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
  const { atlas, frames } = assets.sprites, hud = assets.hud, card = assets.titleCard;
  const stage = assets.stage, { backgrounds } = stage;
  const bgW = stage.background.width;

  // sprites face left in the ROM; a flip mirrors them around their anchor like the GBA does
  function drawSprite(index, x, y, flipX, flipY = false) {
    if (index < 0) return;
    const [sx, sy, w, h, ax, ay] = frames[index];
    const px = Math.floor(x), py = Math.floor(y);   // the integer part, like the original's I(qWorldX)
    if (!flipX && !flipY) { ctx.drawImage(atlas, sx, sy, w, h, px - ax, py - ay, w, h); return; }
    ctx.save(); ctx.translate(px, py);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(atlas, sx, sy, w, h, -ax, -ay, w, h);
    ctx.restore();
  }

  // the rotation hardware's sprites are put together here pixel by pixel, then drawn over the frame
  const atlasPixels = atlas.getContext('2d').getImageData(0, 0, atlas.width, atlas.height).data;
  const objLayer = new ImageData(SCREEN_W, SCREEN_H), objCanvas = document.createElement('canvas');
  objCanvas.width = SCREEN_W; objCanvas.height = SCREEN_H;
  const objCtx = objCanvas.getContext('2d');

  // a sprite through the rotation hardware (`affine`: rotation 0–1023 per turn, 8.8 scales, double size).
  // TransformSprite builds the matrix and moves the sprite so its anchor stays at (x, y) once turned;
  // DisplaySprite puts each OAM piece where the frame has it, in a box twice its size with the double-size
  // flag, and every piece turns around its own centre
  function drawAffine(index, x, y, { rotation, scaleX, scaleY, double }) {
    if (index < 0) return;
    const [, , w, h, ax, ay, pieces] = frames[index];
    if (!pieces) { drawSprite(index, x, y, scaleX < 0, scaleY < 0); return; }   // a frame the extractor kept no pieces for
    const cos = SINE[(rotation & 1023) + 256] >> 6, sin = SINE[rotation & 1023] >> 6;
    const rx = s16(Math.trunc(0x10000 / scaleX)), ry = s16(Math.trunc(0x10000 / scaleY));
    const mat = [s16((cos * rx) >> 8), s16((sin * rx) >> 8), s16((-sin * ry) >> 8), s16((cos * ry) >> 8)];
    const kx = Math.abs(scaleX), ky = Math.abs(scaleY);
    const u0 = s16((cos * kx) >> 8), u1 = s16((-sin * kx) >> 8), u2 = s16((sin * ky) >> 8), u3 = s16((cos * ky) >> 8);
    const hw = w >> 1, hh = h >> 1, ox = (scaleX > 0 ? ax : w - ax) - hw, oy = (scaleY > 0 ? ay : h - ay) - hh;
    let sx = s16(Math.floor(x) - ((u0 * ox + u1 * oy + (hw << 8)) >> 8));
    let sy = s16(Math.floor(y) - ((u2 * ox + u3 * oy + (hh << 8)) >> 8));
    let sw = w, sh = h;
    if (double) { sx -= hw; sy -= hh; sw *= 2; sh *= 2; }
    if (sx + sw < 0 || sx > SCREEN_W || sy + sh < 0 || sy > SCREEN_H) return;
    const box = [SCREEN_W, SCREEN_H, -1, -1];
    for (const [px, py, pw, ph, tx, ty] of pieces) drawPiece((sx + px) & 0x1FF, (sy + py) & 0xFF, pw, ph, tx, ty, mat, double, box);
    if (box[2] < 0) return;
    const [x0, y0] = box, bw = box[2] - x0 + 1, bh = box[3] - y0 + 1;
    objCtx.putImageData(objLayer, 0, 0, x0, y0, bw, bh);
    ctx.drawImage(objCanvas, x0, y0, bw, bh, x0, y0, bw, bh);
    for (let row = y0; row <= box[3]; row++) objLayer.data.fill(0, (row * SCREEN_W + x0) * 4, (row * SCREEN_W + box[2] + 1) * 4);
  }

  // one rotated OAM entry at (ox, oy), sampled line by line the way mGBA 0.10.5's software renderer does
  // (src/gba/renderers/software-obj.c): 8.8 steps from the box's centre, the nearest texel, and the line's
  // run stopping at the first one outside the piece once its start is skipped ahead. A piece earlier in the
  // frame has the lower OAM index and stays in front of a later one.
  function drawPiece(ox, oy, pw, ph, tx, ty, [pa, pb, pc, pd], double, box) {
    const tw = double ? pw * 2 : pw, th = double ? ph * 2 : ph;
    if ((oy >= SCREEN_H && oy + th < 228) || (ox >= SCREEN_W && ox + tw < 512)) return;
    const x = (ox << 23) >> 23, endY = oy + th, px = objLayer.data;
    for (let line = 0; line < SCREEN_H; line++) {
      if ((line < oy && (endY - 256 < 0 || line >= endY - 256)) || line >= endY) continue;
      const inY = line < oy ? line - oy + 256 : line - oy;
      let outX = Math.max(x, 0), inX = outX - x;
      const end = Math.min(x + tw, SCREEN_W);
      let xAcc = pa * (inX - 1 - (tw >> 1)) + pb * (inY - (th >> 1)) + (pw << 7);
      let yAcc = pc * (inX - 1 - (tw >> 1)) + pd * (inY - (th >> 1)) + (ph << 7);
      const skip = n => { xAcc += pa * n; yAcc += pc * n; outX += n; inX += n; };
      if (pa) {
        if ((xAcc >> 8) < 0) skip(Math.trunc((-xAcc - 1) / pa));
        else if ((xAcc >> 8) >= pw) skip(Math.trunc(((pw << 8) - xAcc) / pa));
      }
      if (pc) {
        if ((yAcc >> 8) < 0) skip(Math.trunc((-yAcc - 1) / pc));
        else if ((yAcc >> 8) >= ph) skip(Math.trunc(((ph << 8) - yAcc) / pc));
      }
      if (outX < 0 || outX >= end) continue;
      for (; outX < end; outX++) {
        xAcc += pa; yAcc += pc;
        const lx = xAcc >> 8, ly = yAcc >> 8;
        if (lx < 0 || lx >= pw || ly < 0 || ly >= ph) break;
        const k = ((ty + ly) * atlas.width + tx + lx) * 4, o = (line * SCREEN_W + outX) * 4;
        if (!atlasPixels[k + 3] || px[o + 3]) continue;
        px[o] = atlasPixels[k]; px[o + 1] = atlasPixels[k + 1]; px[o + 2] = atlasPixels[k + 2]; px[o + 3] = 255;
        if (outX < box[0]) box[0] = outX;
        if (line < box[1]) box[1] = line;
        if (outX > box[2]) box[2] = outX;
        if (line > box[3]) box[3] = line;
      }
    }
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

  // the title card's sprites from their OAM attributes; they have priority 0 and the lowest OAM orders, so
  // they are in front of everything. A sprite off the right or the bottom edge wraps round to the left or the top.
  function drawCard(sprites) {
    for (const s of stack(sprites)) {
      if ((s.a0 & 0x300) === 0x200) continue;   // hidden
      const { w, h, glyphs } = card.slots[s.slot], [sx, sy] = glyphs[s.glyph];
      const x = s.a1 & 0x1FF, y = s.a0 & 0xFF;
      for (const dx of [x, x - 512]) for (const dy of [y, y - 256]) ctx.drawImage(card.sheet, sx, sy, w, h, dx, dy, w, h);
    }
  }

  // the brightness decrease by bldY sixteenths, as mGBA (the reference) applies it to its 8-bit colours: the
  // red channel keeps what a sixteenth-rounded-down decrease leaves, green and blue round down after it
  function darken(bldY) {
    const img = ctx.getImageData(0, 0, SCREEN_W, SCREEN_H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] -= (d[i] * bldY) >> 4;
      d[i + 1] = (d[i + 1] * (16 - bldY)) >> 4;
      d[i + 2] = (d[i + 2] * (16 - bldY)) >> 4;
    }
    ctx.putImageData(img, 0, 0);
  }

  // back to front: higher orders first, and the later entries of an order before the earlier ones
  function stack(list) {
    return list.map((s, i) => [s, i]).sort((a, b) => b[0].order - a[0].order || b[1] - a[1]).map(([s]) => s);
  }

  return function render({ tick, cam, rings, sprites, terrain, palettes, hud: hudState, card: titleCard, showCollision }) {
    ctx.imageSmoothingEnabled = false;
    // on the act's first frame the camera isn't kept inside the act yet; the title card's fade has the
    // screen black then, and the view is kept inside
    const cx = Math.min(Math.max(Math.floor(cam.x), 0), cam.maxX), cy = Math.min(Math.max(Math.floor(cam.y), 0), cam.maxY);
    const background = backgrounds.canvases[paletteVariant(stage, backgrounds.follows, palettes)];
    for (let line = 0; line < SCREEN_H; line++) {
      const off = mod(backgroundOffset(line, tick - 1, cx), bgW);
      ctx.drawImage(background, off, line, bgW - off, 1, 0, line, bgW - off, 1);
      if (bgW - off < SCREEN_W) ctx.drawImage(background, 0, line, off, 1, bgW - off, line, off, 1);
    }
    const frame = stageAnimFrame(stage, tick);
    drawLayer(ctx, stage, 'back', cx, cy, SCREEN_W, SCREEN_H, frame, palettes);
    // the rings manager runs first among the tasks that draw, so its rings (OAM order 20) come first
    const shown = rings.visible(cam);
    const list = stack([...shown.list.map(r => ({ frame: shown.frame, x: r.x, y: r.y, order: 20, prio: 2 })), ...sprites]);
    const drawAll = behind => {
      for (const s of list) {
        if ((s.prio >= 2) !== behind) continue;
        if (s.affine) drawAffine(s.frame, s.x - cx, s.y - cy, s.affine);
        else drawSprite(s.frame, s.x - cx, s.y - cy, s.flipX, s.flipY);
      }
    };
    drawAll(true);
    drawLayer(ctx, stage, 'front', cx, cy, SCREEN_W, SCREEN_H, frame, palettes);
    drawAll(false);
    if (showCollision) drawCollision(terrain, cx, cy);
    drawHud(hudState.sprites);
    if (!titleCard) return;
    // the card's sprites are semi-transparent all together, and blending them at full weight over what's
    // behind keeps them out of the fade
    const semi = titleCard.sprites.length > 0 && (titleCard.sprites[0].a0 & 0xC00) === 0x400;
    if (!semi) drawCard(titleCard.sprites);
    if (titleCard.fade.bldY) darken(titleCard.fade.bldY);
    if (semi) drawCard(titleCard.sprites);
  };
}
