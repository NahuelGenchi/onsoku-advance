// Draws one 240 × 160 frame (or a wider and taller one, in the widescreen view): the zone background with its per-line scrolling, the act's back layer, the
// sprites behind the front layer, the front layer, the sprites in front of it, and the HUD or the title card on
// top, the background and the layers in the colours the act's palette animations have loaded. The
// sprites are the act's rings and the step's list, stacked as the GBA stacks OAM entries: a lower OAM order
// in front, and within an order the one put in first. While the title card fades the screen in, everything but
// its semi-transparent sprites is darkened, and so is the game over's screen behind its words and countdown.
// The widescreen view shows more of the act around the original screen, which sits in its middle unless an edge
// of the act is near; the HUD keeps to the view's corners and the title card and the game over to its middle. The optional Sonic Rush boost adds its screen shake and its effects around
// Sonic, drawn as the Nintendo DS draws them.

import { SCREEN_W, SCREEN_H, RUSH_BOOST } from './constants.js';
import { drawLayer, stageAnimFrame, paletteVariant, collisionImage } from './stage.js';
import { SINE } from './trig.js';
import { rushObjEntries, rushTrailStrips, TRAIL_COLOR } from './rushfx.js';
import { rasterizeStrips, objLayer as dsObjLayer, to6, out8 } from './dsdraw.js';

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
// The frame before the game over hands over, its last task stops the copy that scrolls each line while the frame
// is being drawn, about this far down (in the recordings, where little else runs then): the lines below keep the
// scroll of the line above.
const SCROLL_STOPS_AT = 24;

export function createRenderer(canvas, assets) {
  let W = SCREEN_W, H = SCREEN_H;
  canvas.width = W; canvas.height = H;
  let ctx = canvas.getContext('2d', { alpha: false });   // the Rush boost borrows it for a moment (drawRushObjs)
  const { atlas, frames, anims } = assets.sprites, hud = assets.hud, card = assets.titleCard, over = assets.gameOver;
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
  const atlasPixels = { data: atlas.getContext('2d').getImageData(0, 0, atlas.width, atlas.height).data, width: atlas.width };
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
    flushObj(box);
  }
  // draws what the pieces put together in `box` over the frame, and clears it
  function flushObj(box) {
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
  // widescreen view reaches past x 256 and draws each piece where it is. The piece's pixels are at (tx, ty) in
  // `src`, the atlas unless another sheet's pixels are given.
  function drawPiece(ox, oy, pw, ph, tx, ty, [pa, pb, pc, pd], double, box, wrap, src = atlasPixels) {
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
        const k = ((ty + ly) * src.width + tx + lx) * 4, o = (line * W + outX) * 4, d = src.data;
        if (!d[k + 3] || px[o + 3]) continue;
        px[o] = d[k]; px[o + 1] = d[k + 1]; px[o + 2] = d[k + 2]; px[o + 3] = 255;
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
  // bottom of a taller view. `sheet` is the HUD's in other colours.
  function drawHud(sprites, sheet = hud.sheet) {
    for (const [what, x, y] of sprites) {
      const [sx, sy, w, h] = typeof what === 'string' ? hud[what] : hud.glyphs[what];
      ctx.drawImage(sheet, sx, sy, w, h, x, y < SCREEN_H / 2 ? y : y + H - SCREEN_H, w, h);
    }
  }

  // The game over's screen (gameover.js). Its sprites come first in OAM, in front of the HUD: the words, the
  // countdown's glyph, then the band. The fade darkens everything but the words and the glyph, which are
  // semi-transparent and blended at full weight over what is behind them. The widescreen view keeps them to its
  // middle, stretches their ways in and out to its edges, and the band runs across all of it.
  const overPixels = { data: over.sheet.getContext('2d').getImageData(0, 0, over.sheet.width, over.sheet.height).data, width: over.sheet.width };
  const WORDS = ['gameOverLeft', 'gameOverRight', 'continueLeft', 'continueRight'];
  function drawGameOver(go) {
    const ox = (W - SCREEN_W) >> 1, oy = (H - SCREEN_H) >> 1, wide = ox > 0 || oy > 0;
    const s9 = x => (x << 23) >> 23;
    if (go.bandX !== null) {
      const [bx, by] = over.box, left = s9(go.bandX);
      const put = x => ctx.drawImage(over.sheet, bx, by, 32, 32, x, 90 + oy, 32, 32);
      if (!wide) for (let i = 0; i < 8; i++) put(s9((go.bandX + 32 * i) & 0x1FF));
      else for (let x = Math.round((left + 256) * W / 256) - 32; x > -32; x -= 32) put(x);
    }
    if (go.bldY) darken(go.bldY);
    if (go.glyph) {
      const g = go.glyph, size = g.what === 'ok' ? 32 : 16, [sx, sy] = g.what === 'ok' ? over.ok : over.digits[g.what];
      if (g.scale === null) {
        // in from the left edge to x 116, out past the right one
        const x = g.x <= 116 ? 116 - Math.round((116 - g.x) * (116 + ox) / 116) : 116 + Math.round((g.x - 116) * (W - ox - 116) / 124);
        ctx.drawImage(over.sheet, sx, sy, size, size, ox + x, g.y + oy, size, size);
      } else {
        // zoomed (sub_80047A0 without a turn), in a box twice its size
        const k = s16(Math.trunc(0x10000 / g.scale)), box = [W, H, -1, -1];
        drawPiece(g.x + ox, g.y + oy, size, size, sx, sy, [k, 0, 0, k], true, box, !wide, overPixels);
        flushObj(box);
      }
    }
    // the right half first, as the left one is in front of it
    for (const w of [...go.words].reverse()) {
      const index = anims[WORDS[w.half]].frames[0][0];
      if (w.affine) drawAffine(index, w.affine.x + ox, w.affine.y + oy, { rotation: 0, scaleX: w.affine.scaleX, scaleY: 256, double: false });
      else drawSprite(index, ox + 128 + Math.round((w.x - 128) * (W - ox - 64) / 176), w.y + oy, false);
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

  // back to front: higher orders first, and the later entries of an order before the earlier ones
  function stack(list) {
    return list.map((s, i) => [s, i]).sort((a, b) => b[0].order - a[0].order || b[1] - a[1]).map(([s]) => s);
  }

  function render({ tick, rings, sprites, terrain, palettes, view, hud: hudState, card: titleCard, gameOver, showCollision, rushFx, rushArt, shake }) {
    const stops = gameOver?.endsNext ? SCROLL_STOPS_AT : Infinity;
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
    for (let line = 0; line < H; line++) {
      const bgLine = Math.min(Math.max(line - oy, 0), background.height - 1);
      const scroll = Math.min(bgLine, stops - 1);
      if (STILL(scroll)) { drawStill(background, bgLine, line, ox); continue; }
      let off = mod(backgroundOffset(scroll, tick - 1, cx) - ox, bgW);
      for (let x = 0; x < W; off = 0) {
        const n = Math.min(bgW - off, W - x);
        ctx.drawImage(background, off, bgLine, n, 1, x, line, n, 1);
        x += n;
      }
    }
    const frame = stageAnimFrame(stage, tick);
    drawLayer(ctx, stage, 'back', vx, vy, W, H, frame, palettes);
    // the rings manager runs first among the tasks that draw, so its rings (OAM order 20) come first
    const shown = rings.visible(view);
    const list = stack([...shown.list.map(r => ({ frame: shown.frame, x: r.x, y: r.y, order: 20, prio: 2 })), ...sprites]);
    const drawAll = behind => {
      for (const s of list) {
        if ((s.prio >= 2) !== behind) continue;
        if (s.rush === 'trail') drawRushTrail(rushFx, vx, vy);
        else if (s.rush === 'obj') drawRushObjs(rushFx, rushArt, vx, vy, s.sonic);
        else if (s.affine) drawAffine(s.frame, s.x - vx, s.y - vy, s.affine);
        else drawSprite(s.frame, s.x - vx, s.y - vy, s.flipX, s.flipY);
      }
    };
    drawAll(true);
    drawLayer(ctx, stage, 'front', vx, vy, W, H, frame, palettes);
    drawAll(false);
    if (showCollision) drawCollision(terrain, vx, vy);
    drawHud(hudState.sprites, gameOver?.hudPalette ? over.hudSheet : hud.sheet);
    if (gameOver) drawGameOver(gameOver);
    if (!titleCard) return;
    // the card's sprites are semi-transparent all together, and blending them at full weight over what's
    // behind keeps them out of the fade
    const semi = titleCard.sprites.length > 0 && (titleCard.sprites[0].a0 & 0xC00) === 0x400;
    if (!semi) drawCard(titleCard.sprites);
    if (titleCard.fade.bldY) darken(titleCard.fade.bldY);
    if (semi) drawCard(titleCard.sprites);
  }

  // what another stage's renderer (extrarender.js) draws with: `use(c)` sends the drawing to canvas context c
  // and gives back the one it replaced
  render.parts = {
    drawSprite, drawAffine, drawHud, drawCard, darken, stack,
    get ctx() { return ctx; }, get w() { return W; }, get h() { return H; },
    use(c) { const old = ctx; ctx = c; return old; },
  };

  /** Draws w × h frames from now on: 240 × 160, the original screen, or the widescreen view's size. */
  render.resize = (w, h) => {
    W = w; H = h;
    canvas.width = objCanvas.width = overlay.width = maskCanvas.width = w;
    canvas.height = objCanvas.height = overlay.height = maskCanvas.height = h;
    objLayer = new ImageData(w, h);
    trailBuf = new Uint8Array(w * h);
  };
  return render;
}
