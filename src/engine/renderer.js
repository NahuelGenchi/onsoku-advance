// Draws one 240 × 160 frame (or a wider and taller one, in the widescreen view): the zone background with its per-line scrolling, the act's back layer, the
// sprites behind the front layer, the front layer, the sprites in front of it, and the HUD or the title card on
// top, the background and the layers in the colours the act's palette animations have loaded. The
// sprites are the act's rings and the step's list, stacked as the GBA stacks OAM entries: a lower OAM order
// in front, and within an order the one put in first. While the title card fades the screen in, everything but
// its semi-transparent sprites is darkened. The widescreen view shows more of the act around the original
// screen, which sits in its middle unless an edge of the act is near; the HUD keeps to the view's corners and
// the title card to its middle. The optional Sonic Rush boost adds its screen shake and its effects around
// Sonic, drawn as the Nintendo DS draws them.

import { SCREEN_W, SCREEN_H, RUSH_BOOST } from './constants.js';
import { drawLayer, stageAnimFrame, paletteVariant, collisionImage } from './stage.js';
import { SINE } from './trig.js';
import { rushObjEntries, rushTrailStrips, TRAIL_COLOR } from './rushfx.js';
import { rasterizeStrips, objLayer as dsObjLayer, to6, out8 } from './dsdraw.js';
import { BACKGROUND_SCROLL } from './backgrounds.js';
import { bgr555ToRgb } from '../rom/colors.js';

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
// The lines that never scroll. The original screen only ever shows their first 240 columns, and they don't
// repeat cleanly past their 256th: a big cloud is cut there.
const STILL = line => line >= 40 && line < 88;

export function createRenderer(canvas, assets) {
  let W = SCREEN_W, H = SCREEN_H;
  canvas.width = W; canvas.height = H;
  let ctx = canvas.getContext('2d', { alpha: false });   // the Rush boost borrows it for a moment (drawRushObjs)
  const { atlas, frames } = assets.sprites, hud = assets.hud, card = assets.titleCard;
  const stage = assets.stage, { backgrounds } = stage;
  const bgW = stage.background.width, scroll = BACKGROUND_SCROLL[stage.backgroundScroll];
  // the background's pixels that show the backdrop, by map row, and what each screen line showed of the map
  const holes = new Map();
  for (const [x, y] of stage.backgroundHoles ?? []) holes.set(y, [...(holes.get(y) ?? []), x]);
  let bgRows = new Int16Array(H), bgOffsets = new Int16Array(H);

  // sprites face left in the ROM; a flip mirrors them around their anchor like the GBA does
  function drawSprite(index, x, y, flipX, flipY = false) {
    if (index < 0) return;
    const [sx, sy, w, h, ax, ay] = frames[index];
    const px = Math.floor(x), py = Math.floor(y);   // the integer part, like the original's I(qWorldX)
    if (!flipX && !flipY) { ctx.drawImage(sheet, sx, sy, w, h, px - ax, py - ay, w, h); return; }
    ctx.save(); ctx.translate(px, py);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(sheet, sx, sy, w, h, -ax, -ay, w, h);
    ctx.restore();
  }

  // the rotation hardware's sprites are put together here pixel by pixel, then drawn over the frame
  const atlasPixels = atlas.getContext('2d').getImageData(0, 0, atlas.width, atlas.height).data;
  // what the sprites are drawn from: the atlas, or for Sonic, the atlas with his colours as the sprite palette
  // shows them when something wrote over them (game.js, spriteRow)
  let sheet = atlas, sheetPixels = atlasPixels, tinted = null, tintedKey = null;
  function tint(shown) {
    const key = shown.join();
    if (key === tintedKey) return tinted;
    const { frames: sonicFrames, colors } = assets.sprites.sonic;
    const px = atlasPixels.slice(), from = new Map();
    shown.forEach((v, c) => { if (v !== null) from.set(colors[c].join(), bgr555ToRgb(v)); });
    const recolor = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y++) {
        for (let k = (y * atlas.width + x0) * 4, end = k + w * 4; k < end; k += 4) {
          const to = px[k + 3] && from.get(`${px[k]},${px[k + 1]},${px[k + 2]}`);
          if (to) { px[k] = to[0]; px[k + 1] = to[1]; px[k + 2] = to[2]; }
        }
      }
    };
    for (const i of sonicFrames) {
      const [sx, sy, w, h, , , pieces] = frames[i];
      recolor(sx, sy, w, h);
      for (const [, , pw, ph, ax, ay] of pieces ?? []) recolor(ax, ay, pw, ph);
    }
    tinted ??= { canvas: document.createElement('canvas') };
    tinted.canvas.width = atlas.width; tinted.canvas.height = atlas.height;
    tinted.canvas.getContext('2d').putImageData(new ImageData(px, atlas.width, atlas.height), 0, 0);
    tinted.pixels = px; tintedKey = key;
    return tinted;
  }
  let objLayer = new ImageData(W, H);
  const objCanvas = document.createElement('canvas');
  objCanvas.width = W; objCanvas.height = H;
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
    if (sx + sw < 0 || sx > W || sy + sh < 0 || sy > H) return;
    const box = [W, H, -1, -1], wrap = W === SCREEN_W && H === SCREEN_H;
    for (const [px, py, pw, ph, tx, ty] of pieces) {
      drawPiece(wrap ? (sx + px) & 0x1FF : sx + px, wrap ? (sy + py) & 0xFF : sy + py, pw, ph, tx, ty, mat, double, box, wrap);
    }
    if (box[2] < 0) return;
    const [x0, y0] = box, bw = box[2] - x0 + 1, bh = box[3] - y0 + 1;
    objCtx.putImageData(objLayer, 0, 0, x0, y0, bw, bh);
    ctx.drawImage(objCanvas, x0, y0, bw, bh, x0, y0, bw, bh);
    for (let row = y0; row <= box[3]; row++) objLayer.data.fill(0, (row * W + x0) * 4, (row * W + box[2] + 1) * 4);
  }

  // one rotated OAM entry at (ox, oy), sampled line by line the way mGBA 0.10.5's software renderer does
  // (src/gba/renderers/software-obj.c): 8.8 steps from the box's centre, the nearest texel, and the line's
  // run stopping at the first one outside the piece once its start is skipped ahead. A piece earlier in the
  // frame has the lower OAM index and stays in front of a later one. With `wrap`, (ox, oy) are OAM's 9-bit x and
  // 8-bit y, and a piece past the right or the bottom edge comes round on the left or the top, as on the GBA. The
  // widescreen view reaches past x 256 and draws each piece where it is.
  function drawPiece(ox, oy, pw, ph, tx, ty, [pa, pb, pc, pd], double, box, wrap) {
    const tw = double ? pw * 2 : pw, th = double ? ph * 2 : ph;
    if (wrap ? (oy >= H && oy + th < 228) || (ox >= W && ox + tw < 512) : oy >= H || ox >= W) return;
    const x = wrap ? (ox << 23) >> 23 : ox, endY = oy + th, px = objLayer.data;
    for (let line = 0; line < H; line++) {
      if ((line < oy && (!wrap || endY - 256 < 0 || line >= endY - 256)) || line >= endY) continue;
      const inY = line < oy ? line - oy + 256 : line - oy;
      let outX = Math.max(x, 0), inX = outX - x;
      const end = Math.min(x + tw, W);
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
        const k = ((ty + ly) * atlas.width + tx + lx) * 4, o = (line * W + outX) * 4;
        if (!sheetPixels[k + 3] || px[o + 3]) continue;
        px[o] = sheetPixels[k]; px[o + 1] = sheetPixels[k + 1]; px[o + 2] = sheetPixels[k + 2]; px[o + 3] = 255;
        if (outX < box[0]) box[0] = outX;
        if (line < box[1]) box[1] = line;
        if (outX > box[2]) box[2] = outX;
        if (line > box[3]) box[3] = line;
      }
    }
  }

  // The Rush boost's effects, drawn the DS's way (dsdraw.js) over what is already in the frame. The trail is a
  // translucent polygon of the DS's 3D layer, blended with what is below it by its alpha. The burst and the
  // aura are semi-transparent sprites in front of it, blended at 12/16 over 14/16 of what is below them: the
  // trail's own colour where it shows, as the 3D layer is what is under them there, otherwise the frame.
  // Sonic stands between the two, as his sprite does between them in Rush.
  let trailBuf = new Uint8Array(W * H), trailBox = null;
  const trailRgb = [TRAIL_COLOR & 31, (TRAIL_COLOR >> 5) & 31, (TRAIL_COLOR >> 10) & 31].map(c => (c ? (c << 1) + 1 : 0));
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W; maskCanvas.height = H;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  function drawRushTrail(fx, vx, vy) {
    trailBox = null;
    const strips = rushTrailStrips(fx, vx, vy);
    if (strips.length === 0) return;
    trailBuf.fill(0);
    trailBox = rasterizeStrips(strips, W, H, trailBuf);
    if (!trailBox) return;
    const [x0, y0, x1, y1] = trailBox, w = x1 - x0 + 1, h = y1 - y0 + 1;
    const img = ctx.getImageData(x0, y0, w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const eva = trailBuf[(y + y0) * W + x + x0];   // the alpha + 1
        if (!eva) continue;
        const k = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) d[k + c] = out8((trailRgb[c] * eva + to6(d[k + c]) * (32 - eva) + 16) >> 5);
      }
    }
    ctx.putImageData(img, x0, y0);
  }
  function drawRushObjs(fx, art, vx, vy, sonic) {
    const layer = dsObjLayer(rushObjEntries(fx, art, vx, vy), W, H);
    if (!layer) return;
    const { x0, y0, w, h, colors } = layer;
    let mask = null;
    if (trailBox && sonic) {
      // where Sonic covers the trail, his sprite is what is below
      const main = ctx;
      ctx = maskCtx;
      maskCtx.imageSmoothingEnabled = false;
      maskCtx.clearRect(0, 0, W, H);
      if (sonic.affine) drawAffine(sonic.frame, sonic.x - vx, sonic.y - vy, sonic.affine);
      else drawSprite(sonic.frame, sonic.x - vx, sonic.y - vy, sonic.flipX, sonic.flipY);
      ctx = main;
      mask = maskCtx.getImageData(x0, y0, w, h).data;
    }
    const img = ctx.getImageData(x0, y0, w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x, color = colors[o];
        if (color < 0) continue;
        const k = o * 4, trail = trailBox && trailBuf[(y + y0) * W + x + x0] && !(mask && mask[k + 3]);
        for (let c = 0; c < 3; c++) {
          const below = trail ? trailRgb[c] : to6(d[k + c]);
          d[k + c] = out8(Math.min(63, (((color >> (5 * c)) & 31) * 2 * 12 + below * 14 + 8) >> 4));
        }
      }
    }
    ctx.putImageData(img, x0, y0);
  }

  // debug overlay: the collision under the view, drawn through a scratch canvas so it blends
  const overlay = document.createElement('canvas');
  overlay.width = W; overlay.height = H;
  function drawCollision(terrain, cx, cy) {
    overlay.getContext('2d').putImageData(collisionImage(terrain, cx, cy, W, H), 0, 0);
    ctx.drawImage(overlay, 0, 0);
  }

  // the HUD's sprites have priority 0: in front of the layers and every other sprite. The lives keep to the
  // bottom of a taller view.
  function drawHud(sprites) {
    for (const [what, x, y] of sprites) {
      const [sx, sy, w, h] = what === 'ring' ? hud.ring : what === 'face' ? hud.face : hud.glyphs[what];
      ctx.drawImage(hud.sheet, sx, sy, w, h, x, y < SCREEN_H / 2 ? y : y + H - SCREEN_H, w, h);
    }
  }

  // the title card's sprites from their OAM attributes; they have priority 0 and the lowest OAM orders, so
  // they are in front of everything. A sprite off the right or the bottom edge wraps round to the left or the top.
  // The widescreen view is wider and taller than that wrap allows for, so it places each sprite where its piece
  // put it, without wrapping. The zigzag band keeps to the left edge and runs down to the bottom, the pieces
  // along the bottom keep to it, the act number and the Japanese name to the right, and the white bar and the
  // zone's name go on to the right edge: the bar with more of itself, the name with its next letters. Those two
  // slide in from the original screen's right edge, so their way in is stretched to start from the view's.
  function drawCard(sprites) {
    const wider = W - SCREEN_W, taller = H - SCREEN_H, wide = wider > 0 || taller > 0, more = Math.ceil(wider / 32);
    const last = {}, shift = {};
    sprites.forEach((s, i) => { last[s.slot] = i; });
    // each one's x where its way in ends
    for (const [slot, stop] of [['bar', -16], ['zone', 0]]) {
      const first = sprites.find(s => s.slot === slot);
      shift[slot] = first && first.x > stop ? Math.round((first.x - stop) * wider / (SCREEN_W - stop)) : 0;
    }
    const index = new Map(sprites.map((s, i) => [s, i]));
    const put = (s, glyph, x, y) => {
      const { w, h, glyphs } = card.slots[s.slot], [sx, sy] = glyphs[glyph];
      if (wide) ctx.drawImage(card.sheet, sx, sy, w, h, x, y, w, h);
      else for (const dx of [x, x - 512]) for (const dy of [y, y - 256]) ctx.drawImage(card.sheet, sx, sy, w, h, dx, dy, w, h);
    };
    for (const s of stack(sprites)) {
      if ((s.a0 & 0x300) === 0x200) continue;   // hidden
      const x = wide ? s.x : s.a1 & 0x1FF, y = wide ? s.y : s.a0 & 0xFF;
      if (s.slot === 'zigzag') {
        for (let dy = 0; dy === 0 || (y === 128 && y + dy < H); dy += 32) put(s, s.glyph, x, y + dy);
      } else if (s.slot === 'act' || s.slot === 'zoneJp') put(s, s.glyph, x + wider, y + taller);
      else if (s.slot === 'bar' || s.slot === 'zone') {
        put(s, s.glyph, x + shift[s.slot], y + taller);
        if (index.get(s) !== last[s.slot]) continue;
        // a bar sprite or the zone's next letter (its seven letters repeat), each 32 px further right
        for (let i = 1; i <= more; i++) put(s, s.slot === 'zone' ? (s.glyph + i) % 7 : s.glyph, x + shift[s.slot] + 32 * i, y + taller);
      } else put(s, s.glyph, x, y);
    }
  }

  // the brightness decrease by bldY sixteenths, as mGBA (the reference) applies it to its 8-bit colours: the
  // red channel keeps what a sixteenth-rounded-down decrease leaves, green and blue round down after it
  function darken(bldY) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] -= (d[i] * bldY) >> 4;
      d[i + 1] = (d[i + 1] * (16 - bldY)) >> 4;
      d[i + 2] = (d[i + 2] * (16 - bldY)) >> 4;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Secret Base act 1's spotlights (spotlights.js): the brightness decrease by bldY sixteenths on every pixel
  // outside windows 0 and 1 but the backdrop's. Each window's lines and edges as mGBA 0.10.5 reads its
  // registers (src/gba/renderers/video-software.c): a start past the screen's end and past its own end counts
  // as 0, and a window whose end comes before its start wraps round the screen. The widescreen view carries an
  // edge at the original screen's left or right edge on to its own, and keeps the lines above and below the
  // original screen's to its first and last line's windows.
  function windowRange(value, max) {
    let start = value >> 8, end = value & 0xFF;
    if (start > max && start > end) start = 0;
    if (end > max) { end = max; if (start > max) start = max; }
    return [start, end];
  }
  function lit(blend, line, inside, ox) {
    inside.fill(0);
    if (!blend.windows) return;
    const l = Math.min(Math.max(line, 0), SCREEN_H - 1);
    for (let n = 0; n < 2; n++) {
      const [top, bottom] = windowRange(blend.v[n], SCREEN_H);
      if (bottom >= top ? l < top || l >= bottom : l >= bottom && l < top) continue;
      const at = blend.base + l * 4 + n * 2;
      const [left, right] = windowRange(blend.drawn ? blend.buf[at] | (blend.buf[at + 1] << 8) : blend.h[n], SCREEN_W);
      const fill = (a, b) => inside.fill(1, a === 0 ? 0 : a + ox, b === SCREEN_W ? W : b + ox);
      if (right < left) { fill(0, right); fill(left, SCREEN_W); } else fill(left, right);
    }
  }
  let inside = new Uint8Array(W);
  function darkenOutside(blend, ox, oy) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data, y = blend.bldY, [br, bg, bb] = stage.backdrop;
    for (let line = 0; line < H; line++) {
      lit(blend, line - oy, inside, ox);
      for (const x of holes.get(bgRows[line]) ?? []) {
        for (let k = mod(x - bgOffsets[line], bgW); k < W; k += bgW) {
          const i = (line * W + k) * 4;
          if (d[i] === br && d[i + 1] === bg && d[i + 2] === bb) inside[k] = 1;
        }
      }
      for (let x = 0, i = line * W * 4; x < W; x++, i += 4) {
        if (inside[x]) continue;
        d[i] -= (d[i] * y) >> 4;
        d[i + 1] = (d[i + 1] * (16 - y)) >> 4;
        d[i + 2] = (d[i + 2] * (16 - y)) >> 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // A still line of the background, its column 0 at the original screen's left edge `ox`. The widescreen view
  // shows it mirrored past its own edges, which carries its clouds and islands on without a seam.
  const mirrored = new WeakMap();
  function drawStill(background, bgLine, line, ox) {
    let flip = mirrored.get(background);
    if (!flip) {
      flip = document.createElement('canvas');
      flip.width = bgW; flip.height = background.height;
      const f = flip.getContext('2d');
      f.scale(-1, 1); f.drawImage(background, -bgW, 0);
      mirrored.set(background, flip);
    }
    const n = Math.min(bgW, W - ox), right = W - ox - n;
    if (ox > 0) ctx.drawImage(flip, bgW - ox, bgLine, ox, 1, 0, line, ox, 1);
    ctx.drawImage(background, 0, bgLine, n, 1, ox, line, n, 1);
    if (right > 0) ctx.drawImage(flip, 0, bgLine, right, 1, ox + n, line, right, 1);
  }

  // The background of a level whose scroll backgrounds.js gives, line by line from the map row and column it
  // starts at; the map repeats both ways.
  function drawScrolled(background, tick, ox, oy, cx, cy, terrain) {
    for (let line = 0; line < H; line++) {
      const [x, y] = scroll(line - oy, tick, cx, cy, terrain), row = mod(y + line - oy, background.height);
      let off = mod(x - ox, bgW);
      bgRows[line] = row; bgOffsets[line] = off;
      for (let dx = 0; dx < W; off = 0) {
        const n = Math.min(bgW - off, W - dx);
        ctx.drawImage(background, off, row, n, 1, dx, line, n, 1);
        dx += n;
      }
    }
  }

  // back to front: higher orders first, and the later entries of an order before the earlier ones
  function stack(list) {
    return list.map((s, i) => [s, i]).sort((a, b) => b[0].order - a[0].order || b[1] - a[1]).map(([s]) => s);
  }

  function render({ tick, rings, sprites, terrain, palettes, view, hud: hudState, card: titleCard, showCollision, rushFx, rushArt, shake, spotlights, spriteRow, bgAnim }) {
    ctx.imageSmoothingEnabled = false;
    // on the act's first frame the camera isn't kept inside the act yet; the title card's fade has the
    // screen black then, and the view is kept inside. The boost's shake moves it, still inside the act.
    let { x: vx, y: vy } = view;
    if (shake >= 0) {
      const [dx, dy] = RUSH_BOOST.shake[shake];
      vx = Math.max(0, Math.min(vx + dx, terrain.width - W));
      vy = Math.max(0, Math.min(vy + dy, terrain.height - H));
    }
    // the background is fixed to the view, as the original's is to its screen: it lines up with a 240 × 160
    // screen in the view's middle, and the sea scrolls with where that screen would be. Near the act's edges
    // the view stops before the camera does, and so does the background. A taller view shows the map's lines
    // below it and repeats its top line above it.
    const ox = (W - SCREEN_W) >> 1, oy = (H - SCREEN_H) >> 1, cx = vx + ox;
    const background = backgrounds.canvases[paletteVariant(stage, backgrounds.follows, palettes)];
    if (scroll) drawScrolled(background, tick - 1, ox, oy, cx, vy + oy, terrain);
    else for (let line = 0; line < H; line++) {
      const bgLine = Math.min(Math.max(line - oy, 0), background.height - 1);
      if (STILL(bgLine)) { drawStill(background, bgLine, line, ox); continue; }
      let off = mod(backgroundOffset(bgLine, tick - 1, cx) - ox, bgW);
      for (let x = 0; x < W; off = 0) {
        const n = Math.min(bgW - off, W - x);
        ctx.drawImage(background, off, bgLine, n, 1, x, line, n, 1);
        x += n;
      }
    }
    // the ROM's counter (gStageBackgroundsRam.unk40, 0x0300593B in the USA ROM) is one behind the camera's runs
    const frame = stageAnimFrame(stage, bgAnim - 1);
    drawLayer(ctx, stage, 'back', vx, vy, W, H, frame, palettes);
    // the rings manager runs first among the tasks that draw, so its rings (OAM order 20) come first
    const shown = rings.visible(view);
    const list = stack([...shown.list.map(r => ({ frame: shown.frame, x: r.x, y: r.y, order: 20, prio: 2 })), ...sprites]);
    const drawAll = behind => {
      for (const s of list) {
        if ((s.prio >= 2) !== behind) continue;
        if (s.rush === 'trail') drawRushTrail(rushFx, vx, vy);
        else if (s.rush === 'obj') drawRushObjs(rushFx, rushArt, vx, vy, s.sonic);
        else {
          const own = s.sonicRow && spriteRow?.shown ? tint(spriteRow.shown) : null;
          if (own) { sheet = own.canvas; sheetPixels = own.pixels; }
          if (s.affine) drawAffine(s.frame, s.x - vx, s.y - vy, s.affine);
          else drawSprite(s.frame, s.x - vx, s.y - vy, s.flipX, s.flipY);
          sheet = atlas; sheetPixels = atlasPixels;
        }
      }
    };
    drawAll(true);
    drawLayer(ctx, stage, 'front', vx, vy, W, H, frame, palettes);
    drawAll(false);
    if (showCollision) drawCollision(terrain, vx, vy);
    drawHud(hudState.sprites);
    // the spotlights' blend takes the place of the title card's fade
    const blend = spotlights?.blend;
    if (blend) darkenOutside(blend, ox, oy);
    if (!titleCard) return;
    // the card's sprites are semi-transparent all together, and blending them at full weight over what's
    // behind keeps them out of the fade
    const semi = titleCard.sprites.length > 0 && (titleCard.sprites[0].a0 & 0xC00) === 0x400;
    if (!semi) drawCard(titleCard.sprites);
    if (!blend && titleCard.fade.bldY) darken(titleCard.fade.bldY);
    if (semi) drawCard(titleCard.sprites);
  }

  /** Draws w × h frames from now on: 240 × 160, the original screen, or the widescreen view's size. */
  render.resize = (w, h) => {
    W = w; H = h;
    canvas.width = objCanvas.width = overlay.width = maskCanvas.width = w;
    canvas.height = objCanvas.height = overlay.height = maskCanvas.height = h;
    objLayer = new ImageData(w, h);
    trailBuf = new Uint8Array(w * h);
    bgRows = new Int16Array(h); bgOffsets = new Int16Array(h); inside = new Uint8Array(w);
  };
  return render;
}
