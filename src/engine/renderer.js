// Draws one 240 × 160 frame (or a wider and taller one, in the widescreen view): the zone background with its per-line scrolling, the sprites behind every
// layer (Casino Paradise's fireworks), the act's back layer, the
// sprites behind the front layer, the front layer, the sprites in front of it, and the HUD, the title card or
// the act's results on top, the background and the layers in the colours the act's palette animations have
// loaded. The sprites are the act's rings and the step's list, stacked as the GBA stacks OAM entries: a lower
// OAM order in front, and within an order the one put in first. While the title card fades the screen in, or
// the results fade it out, everything but their semi-transparent sprites is darkened, and so is the game over's
// screen behind its words and countdown. The widescreen view shows more of the act around the original screen,
// which sits in its middle unless an edge of the act is near, and is black past a boss arena's walls; the HUD
// keeps to the corners of what it shows, and the title card, the results and the game over to its middle and
// along its width. The
// optional Sonic Rush boost adds its screen shake and its effects around Sonic, drawn as the Nintendo DS draws
// them. The optional Boost Mode's afterimages and particles are sprites like the others, drawn from a second
// atlas: Sonic in Sonic Advance 2's boost palette, and its particles. In an act with water the screen below its
// line is drawn again in the water's colours (water.js): the background wavers there and the snow is gone.

import { SCREEN_W, SCREEN_H, RUSH_BOOST } from './constants.js';
import { drawLayer, paletteVariant, collisionImage } from './stage.js';
import { SINE } from './trig.js';
import { rushObjEntries, rushTrailStrips, TRAIL_COLOR } from './rushfx.js';
import { rasterizeStrips, objLayer as dsObjLayer, to6, out8 } from './dsdraw.js';
import { boostAtlas } from './boostmode.js';
import { BACKGROUND_SCROLL, BACKGROUND_DRAW } from './backgrounds.js';
import { beamSpan } from './spotlights.js';
import { bgr555ToRgb, tintRgb, waterTint } from '../rom/colors.js';
import { ICE_MOUNTAIN, iceMountainScroll } from './icemountain.js';
import { underColors, waveOffsets } from './water.js';

const mod = (a, n) => ((a % n) + n) % n;
const HUD_ORDER = 3;   // the HUD's OAM order (Task_StageUIMain: 24 >> 3)
const s16 = v => (v << 16) >> 16;
const div = (a, b) => Math.trunc(a / b);

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
// scroll of the line above. While the save is written after it, every line keeps that scroll.
const SCROLL_STOPS_AT = 24;
// Angel Island's background (StageBgUpdate_Zone5Acts12) stands still, and Egg Rocket's clouds (BG0, in front of
// it at the same priority) scroll left a pixel every 4 frames of the stage clock. They are blended over what is
// behind them (BLDCNT 0x3F41, BLDALPHA 0x100C: 12/16 of the cloud and 16/16 of the background, each channel at
// most 255, as mGBA mixes its 8-bit colours), except while the title card's fade sets the brightness decrease
// in its place and on the frame the card ends, which switches the blending off.
const cloudScroll = tick => (0x100 - (tick >>> 2)) & 0xFF;

// what the renderers work out from the art once, kept for the next act's: each atlas's pixels, each sheet's copy
// in the colours under water (by its pixels, the water's blend and the colours it swaps) and Boost Mode's sheet
const pixelsOfAtlas = new WeakMap(), underSheets = new WeakMap(), boostSheets = new WeakMap();

export function createRenderer(canvas, assets) {
  let W = SCREEN_W, H = SCREEN_H;
  canvas.width = W; canvas.height = H;
  let ctx = canvas.getContext('2d', { alpha: false });   // the Rush boost borrows it for a moment (drawRushObjs)
  const { atlas, frames, anims } = assets.sprites, hud = assets.hud, card = assets.titleCard, results = assets.results, over = assets.gameOver;
  const stage = assets.stage, { backgrounds, snow } = stage;
  const bgW = stage.background?.width, bgH = stage.background?.height, scroll = BACKGROUND_SCROLL[stage.backgroundScroll];
  // the background's pixels that show the backdrop, by map row, and what each screen line showed of the map
  const holes = new Map();
  for (const [x, y] of stage.backgroundHoles ?? []) holes.set(y, [...(holes.get(y) ?? []), x]);
  let bgRows = new Int16Array(H), bgOffsets = new Int16Array(H);

  // an atlas with its frames' rects and its pixels, which the rotation hardware's sprites are sampled from
  const sheetOf = ({ atlas, frames, pixels }) => {
    if (!pixels && !pixelsOfAtlas.has(atlas)) pixelsOfAtlas.set(atlas, atlas.getContext('2d').getImageData(0, 0, atlas.width, atlas.height).data);
    return { atlas, frames, pixels: pixels ?? pixelsOfAtlas.get(atlas) };
  };
  // the sprites' sheet, or the one in the colours under water while the screen below the water line is drawn:
  // palette 423's, or once a boss's task copies the sprite palette every frame (InitWaterPalettes, `ownColours`)
  // each sprite's own
  // (the extractor keeps the atlases' top rows as pixels: those of the rotated pieces and Sonic's frames)
  const { pixels: atlasPx, underPixels, underOwnPixels } = assets.sprites;
  const aboveSheet = sheetOf({ atlas, frames, pixels: atlasPx });
  const underSheet = assets.sprites.under ? sheetOf({ atlas: assets.sprites.under, frames, pixels: underPixels }) : null;
  const ownSheet = assets.sprites.underOwn ? sheetOf({ atlas: assets.sprites.underOwn, frames, pixels: underOwnPixels }) : underSheet;
  let base = aboveSheet, ownColours = false;
  // Another game's sheet in the colours under water: the colours in `swap` (by 'r,g,b') take the one it gives,
  // and every other colour is mixed with the water's, as the HUD's are
  const blend = stage.water?.blend;
  function underOf(sheet, swap = new Map()) {
    const key = `${blend} ${[...swap].join(' ')}`;
    if (!underSheets.has(sheet.pixels)) underSheets.set(sheet.pixels, new Map());
    const made = underSheets.get(sheet.pixels);
    if (!made.has(key)) {
      // each pixel as one little-endian word, its colour 0xBBGGRR under the alpha
      const px = sheet.pixels.slice(), words = new Uint32Array(px.buffer), to = new Map();
      for (const [from, rgb] of swap) { const [r, g, b] = from.split(',').map(Number); to.set(r | (g << 8) | (b << 16), rgb); }
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (!(w >>> 24)) continue;
        const c = w & 0xFFFFFF;
        let rgb = to.get(c);
        if (!rgb) to.set(c, rgb = tintRgb([c & 0xFF, (c >> 8) & 0xFF, c >> 16], blend));
        words[i] = (w & 0xFF000000) | rgb[0] | (rgb[1] << 8) | (rgb[2] << 16);
      }
      // as many rows as the sheet keeps as pixels
      const canvas = document.createElement('canvas');
      canvas.width = sheet.atlas.width; canvas.height = px.length / 4 / canvas.width;
      canvas.getContext('2d').putImageData(new ImageData(px, canvas.width, canvas.height), 0, 0);
      made.set(key, { atlas: canvas, pixels: px });
    }
    return { ...made.get(key), frames: sheet.frames };
  }
  // Boost Mode's atlas, made once its art is read from the ROM, and in an act with water its colours under water
  let boost = null, boostUnder = null, boostArt = null;
  // another game's sprites ({ atlas, frames }), as Sonic Advance 2's tricks have, made into a sheet once, and in
  // an act with water into one in the colours under water: Sonic's row of colours there (`palette`, which has
  // Sonic Advance's layout) takes his colours under water at the same index, as the sprite palette does
  const sheets = new WeakMap();
  const sheetFor = other => {
    if (!other) return base;
    if (!sheets.has(other)) {
      const sheet = sheetOf(other), under = assets.sprites.sonic.under;
      const swap = new Map(under && other.palette ? other.palette.map((c, i) => [c.join(), under[i]]).slice(1) : []);
      sheets.set(other, { above: sheet, under: underSheet && underOf(sheet, swap) });
    }
    const made = sheets.get(other);
    if (base === aboveSheet) return made.above;
    if (!ownColours) return made.under;
    // in its own colours, Sonic's row with the rest
    return (made.own ??= underOf(made.above));
  };

  // sprites face left in the ROM; a flip mirrors them around their anchor like the GBA does
  function drawSprite(index, x, y, flipX, flipY = false, sheet = base) {
    if (index < 0) return;
    const [sx, sy, w, h, ax, ay] = sheet.frames[index];
    const px = Math.floor(x), py = Math.floor(y);   // the integer part, like the original's I(qWorldX)
    if (!flipX && !flipY) { ctx.drawImage(sheet.atlas, sx, sy, w, h, px - ax, py - ay, w, h); return; }
    ctx.save(); ctx.translate(px, py);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(sheet.atlas, sx, sy, w, h, -ax, -ay, w, h);
    ctx.restore();
  }

  // the rotation hardware's sprites are put together here pixel by pixel, then drawn over the frame
  const resultsSheet = results && sheetOf({ atlas: results.sheet });
  // for Sonic, the atlas with his colours as the sprite palette shows them when something wrote over them
  // (game.js, spriteRow): its top rows, where his frames are, kept for the last few colourings shown, as a
  // flash goes back and forth between two or three. Secret Base's spotlights write new colours over his on many
  // frames, so a colouring starts blank and each frame is put in it the first time it is drawn (`index`).
  const atlasPixels = base.pixels, tintedSheets = new Map(), MAX_TINTED = 4;
  // how many times his colours are swapped in each rect of the sheet ('x,y'): once for each of his frames and
  // their pieces there
  const sonicRects = new Map();
  for (const i of assets.sprites.sonic.frames) {
    const [sx, sy, , , , , pieces] = frames[i];
    for (const at of [`${sx},${sy}`, ...(pieces ?? []).map(([, , , , ax, ay]) => `${ax},${ay}`)]) sonicRects.set(at, (sonicRects.get(at) ?? 0) + 1);
  }
  function tint(shown, index) {
    const key = shown.join();
    let tinted = tintedSheets.get(key);
    if (tinted) { tintedSheets.delete(key); tintedSheets.set(key, tinted); }
    else {
      // each colour as 0xBBGGRR
      const { colors } = assets.sprites.sonic, from = new Map(), rows = atlasPixels.length / 4 / atlas.width;
      shown.forEach((v, c) => { if (v !== null) from.set(colors[c][0] | (colors[c][1] << 8) | (colors[c][2] << 16), bgr555ToRgb(v)); });
      const canvas = document.createElement('canvas');
      canvas.width = atlas.width; canvas.height = rows;
      const px = new Uint8ClampedArray(atlasPixels.length);
      tinted = { ...sheetOf({ atlas: canvas, frames, pixels: px }), from, image: new ImageData(px, atlas.width, rows), put: new Set(), done: new Set() };
      tintedSheets.set(key, tinted);
      if (tintedSheets.size > MAX_TINTED) tintedSheets.delete(tintedSheets.keys().next().value);
    }
    if (index >= 0 && !tinted.done.has(index)) {
      tinted.done.add(index);
      const [sx, sy, w, h, , , pieces] = frames[index];
      for (const [x, y, rw, rh] of [[sx, sy, w, h], ...(pieces ?? []).map(([, , pw, ph, ax, ay]) => [ax, ay, pw, ph])]) putTinted(tinted, x, y, rw, rh);
    }
    return tinted;
  }
  // the rect at (x0, y0) of a colouring, copied from the sheet with his colours swapped, once
  function putTinted({ atlas: canvas, pixels: px, image, from, put }, x0, y0, w, h) {
    const at = `${x0},${y0}`;
    if (put.has(at)) return;
    put.add(at);
    const width = canvas.width;
    for (let y = y0; y < y0 + h; y++) px.set(atlasPixels.subarray((y * width + x0) * 4, (y * width + x0 + w) * 4), (y * width + x0) * 4);
    for (let n = sonicRects.get(at) ?? 0; n > 0; n--) {
      for (let y = y0; y < y0 + h; y++) {
        for (let k = (y * width + x0) * 4, end = k + w * 4; k < end; k += 4) {
          const to = px[k + 3] && from.get(px[k] | (px[k + 1] << 8) | (px[k + 2] << 16));
          if (to) { px[k] = to[0]; px[k + 1] = to[1]; px[k + 2] = to[2]; }
        }
      }
    }
    canvas.getContext('2d').putImageData(image, 0, 0, x0, y0, w, h);
  }
  let objLayer = new ImageData(W, H);
  const objCanvas = document.createElement('canvas');
  objCanvas.width = W; objCanvas.height = H;
  const objCtx = objCanvas.getContext('2d');
  // draws what the rotated pieces put in `box` over the frame, and clears it
  function flushObj(box) {
    if (box[2] < 0) return;
    const [x0, y0] = box, bw = box[2] - x0 + 1, bh = box[3] - y0 + 1;
    objCtx.putImageData(objLayer, 0, 0, x0, y0, bw, bh);
    ctx.drawImage(objCanvas, x0, y0, bw, bh, x0, y0, bw, bh);
    for (let row = y0; row <= box[3]; row++) objLayer.data.fill(0, (row * W + x0) * 4, (row * W + box[2] + 1) * 4);
  }

  // a sprite through the rotation hardware (`affine`: rotation 0–1023 per turn, 8.8 scales, double size).
  // TransformSprite builds the matrix and moves the sprite so its anchor stays at (x, y) once turned, by the
  // size of frame `dims` (the one before, where a task transforms before it animates);
  // DisplaySprite puts each OAM piece where the frame has it, in a box twice its size with the double-size
  // flag, and every piece turns around its own centre
  // `matrix` is the transform of the rotation matrix it is drawn through when that isn't its own: sprites that
  // share one OAM matrix all show the last one written to it in the frame, each where its own put it
  function drawAffine(index, x, y, { rotation, scaleX, scaleY, double, dims = index }, sheet = base, matrix = null) {
    if (index < 0) return;
    const [, , w, h, , , pieces] = sheet.frames[index];
    const [, , tw, th, ax, ay] = sheet.frames[dims < 0 ? index : dims];
    if (!pieces) { drawSprite(index, x, y, scaleX < 0, scaleY < 0, sheet); return; }   // a frame the extractor kept no pieces for
    const cos = SINE[(rotation & 1023) + 256] >> 6, sin = SINE[rotation & 1023] >> 6;
    const m = matrix ?? { rotation, scaleX, scaleY };
    const mc = SINE[(m.rotation & 1023) + 256] >> 6, ms = SINE[m.rotation & 1023] >> 6;
    const rx = s16(Math.trunc(0x10000 / m.scaleX)), ry = s16(Math.trunc(0x10000 / m.scaleY));
    const mat = [s16((mc * rx) >> 8), s16((ms * rx) >> 8), s16((-ms * ry) >> 8), s16((mc * ry) >> 8)];
    const kx = Math.abs(scaleX), ky = Math.abs(scaleY);
    const u0 = s16((cos * kx) >> 8), u1 = s16((-sin * kx) >> 8), u2 = s16((sin * ky) >> 8), u3 = s16((cos * ky) >> 8);
    const thw = tw >> 1, thh = th >> 1, ox = (scaleX > 0 ? ax : tw - ax) - thw, oy = (scaleY > 0 ? ay : th - ay) - thh;
    let sx = s16(Math.floor(x) - ((u0 * ox + u1 * oy + (thw << 8)) >> 8));
    let sy = s16(Math.floor(y) - ((u2 * ox + u3 * oy + (thh << 8)) >> 8));
    let sw = w, sh = h;
    if (double) { sx -= w >> 1; sy -= h >> 1; sw *= 2; sh *= 2; }
    if (sx + sw < 0 || sx > W || sy + sh < 0 || sy > H) return;
    const box = [W, H, -1, -1], wrap = W === SCREEN_W && H === SCREEN_H;
    for (const [px, py, pw, ph, tx, ty] of pieces) {
      drawPiece(wrap ? (sx + px) & 0x1FF : sx + px, wrap ? (sy + py) & 0xFF : sy + py, pw, ph, tx, ty, mat, double, box, wrap, sheet);
    }
    flushObj(box);
  }

  // one rotated OAM entry at (ox, oy), sampled line by line the way mGBA 0.10.5's software renderer does
  // (src/gba/renderers/software-obj.c): 8.8 steps from the box's centre, the nearest texel, and the line's
  // run stopping at the first one outside the piece once its start is skipped ahead. A piece earlier in the
  // frame has the lower OAM index and stays in front of a later one. With `wrap`, (ox, oy) are OAM's 9-bit x and
  // 8-bit y, and a piece past the right or the bottom edge comes round on the left or the top, as on the GBA. The
  // widescreen view reaches past x 256 and draws each piece where it is. Its pixels are at (tx, ty) in `sheet`,
  // the sprites' atlas unless another is given.
  function drawPiece(ox, oy, pw, ph, tx, ty, [pa, pb, pc, pd], double, box, wrap, { atlas: src, pixels: srcPx } = base) {
    const srcW = src.width;
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
        const k = ((ty + ly) * srcW + tx + lx) * 4, o = (line * W + outX) * 4;
        if (!srcPx[k + 3] || px[o + 3]) continue;
        px[o] = srcPx[k]; px[o + 1] = srcPx[k + 1]; px[o + 2] = srcPx[k + 2]; px[o + 3] = 255;
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
  // Sonic stands between the two, as his sprite does between them in Rush. Below the water line their colours
  // are mixed with the water's, as everything else there is.
  let trailBuf = new Uint8Array(W * H), trailBox = null;
  const dsRgb = color => [color & 31, (color >> 5) & 31, (color >> 10) & 31].map(c => (c ? (c << 1) + 1 : 0));
  const trailDry = dsRgb(TRAIL_COLOR), trailWet = blend === undefined ? null : dsRgb(waterTint(TRAIL_COLOR, blend));
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W; maskCanvas.height = H;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = W; flashCanvas.height = H;
  const flashCtx = flashCanvas.getContext('2d');
  // `rows` are the screen's lines they go on, [first, end), under water with `wet`
  function drawRushTrail(fx, vx, vy, rows, wet) {
    trailBox = null;
    const strips = rushTrailStrips(fx, vx, vy);
    if (strips.length === 0) return;
    trailBuf.fill(0);
    trailBox = rasterizeStrips(strips, W, H, trailBuf);
    if (!trailBox) return;
    const [x0, , x1] = trailBox, y0 = Math.max(trailBox[1], rows[0]), y1 = Math.min(trailBox[3], rows[1] - 1);
    if (y1 < y0) return;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, trailRgb = wet ? trailWet : trailDry;
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
  function drawRushObjs(fx, art, vx, vy, sonic, rows, wet) {
    const layer = dsObjLayer(rushObjEntries(fx, art, vx, vy), W, H);
    if (!layer) return;
    const { x0, y0, w, colors } = layer, h = Math.min(layer.h, rows[1] - y0);
    if (h <= 0) return;
    let mask = null;
    if (trailBox && sonic) {
      // where Sonic covers the trail, his sprite is what is below
      const main = ctx;
      ctx = maskCtx;
      maskCtx.imageSmoothingEnabled = false;
      maskCtx.clearRect(0, 0, W, H);
      if (sonic.affine) drawAffine(sonic.frame, sonic.x - vx, sonic.y - vy, sonic.affine, sheetFor(sonic.sheet));
      else drawSprite(sonic.frame, sonic.x - vx, sonic.y - vy, sonic.flipX, sonic.flipY, sheetFor(sonic.sheet));
      ctx = main;
      mask = maskCtx.getImageData(x0, y0, w, h).data;
    }
    const img = ctx.getImageData(x0, y0, w, h), d = img.data, trailRgb = wet ? trailWet : trailDry;
    for (let y = Math.max(0, rows[0] - y0); y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x, color = colors[o] < 0 || !wet ? colors[o] : waterTint(colors[o], blend);
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

  // Sprites in OBJ window mode with every layer brightened to full inside the window (a boss's hit flash): the
  // sprites themselves aren't drawn, and the layers in their shape turn white. mGBA 0.10.5 leaves every other
  // sprite as it is there, Sonic and the HUD included. Returns the window's shape in white, or null.
  function whiteWindow(whites, vx, vy) {
    if (!whites.length) return null;
    const main = ctx;
    ctx = maskCtx;
    maskCtx.imageSmoothingEnabled = false;
    maskCtx.clearRect(0, 0, W, H);
    for (const s of whites) {
      if (s.affine) drawAffine(s.frame, s.x - vx, s.y - vy, s.affine);
      else drawSprite(s.frame, s.x - vx, s.y - vy, s.flipX, s.flipY);
    }
    ctx = main;
    maskCtx.globalCompositeOperation = 'source-in';
    maskCtx.fillStyle = '#fff';
    maskCtx.fillRect(0, 0, W, H);
    maskCtx.globalCompositeOperation = 'source-over';
    return maskCanvas;
  }
  // a layer drawn over what is there, white inside the window where it has pixels
  function drawFlashedLayer(flash, draw) {
    if (!flash) { draw(ctx); return; }
    flashCtx.imageSmoothingEnabled = false;
    flashCtx.globalCompositeOperation = 'source-over';
    flashCtx.clearRect(0, 0, W, H);
    draw(flashCtx);
    ctx.drawImage(flashCanvas, 0, 0);
    flashCtx.globalCompositeOperation = 'source-in';
    flashCtx.drawImage(flash, 0, 0);
    flashCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(flashCanvas, 0, 0);
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
  function drawHud(sprites, sheet, [left, top, , bottom] = [0, 0, W, H]) {
    for (const [what, x, y] of sprites) {
      const [sx, sy, w, h] = typeof what === 'string' ? hud[what] : hud.glyphs[what];
      ctx.drawImage(sheet, sx, sy, w, h, left + x, y < SCREEN_H / 2 ? top + y : y + bottom - SCREEN_H, w, h);
    }
  }

  // black around [left, top, right, bottom] of the view
  function blackOutside([left, top, right, bottom]) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, top);
    ctx.fillRect(0, bottom, W, H - bottom);
    ctx.fillRect(0, top, left, bottom - top);
    ctx.fillRect(right, top, W - right, bottom - top);
  }

  // The game over's screen (gameover.js). Its sprites come first in OAM, in front of the HUD: the words, the
  // countdown's glyph, then the band. The fade darkens everything but the words and the glyph, which are
  // semi-transparent and blended at full weight over what is behind them. The widescreen view keeps them to its
  // middle, stretches their ways in and out to its edges, and the band runs across all of it.
  const overSheet = over && sheetOf({ atlas: over.sheet });
  const WORDS = ['gameOverLeft', 'gameOverRight', 'continueLeft', 'continueRight'];
  // `dark`: the brightness decrease is still what BLDCNT holds (on the Moon the robot can clear it)
  function drawGameOver(go, dark = true) {
    const ox = (W - SCREEN_W) >> 1, oy = (H - SCREEN_H) >> 1, wide = ox > 0 || oy > 0;
    const s9 = x => (x << 23) >> 23;
    if (go.bandX !== null) {
      const [bx, by] = over.box, left = s9(go.bandX);
      const put = x => ctx.drawImage(over.sheet, bx, by, 32, 32, x, 90 + oy, 32, 32);
      if (!wide) for (let i = 0; i < 8; i++) put(s9((go.bandX + 32 * i) & 0x1FF));
      else for (let x = Math.round((left + 256) * W / 256) - 32; x > -32; x -= 32) put(x);
    }
    if (go.bldY && dark) darken(go.bldY);
    if (go.glyph) {
      const g = go.glyph, size = g.what === 'ok' ? 32 : 16, [sx, sy] = g.what === 'ok' ? over.ok : over.digits[g.what];
      if (g.scale === null) {
        // in from the left edge to x 116, out past the right one
        const x = g.x <= 116 ? 116 - Math.round((116 - g.x) * (116 + ox) / 116) : 116 + Math.round((g.x - 116) * (W - ox - 116) / 124);
        ctx.drawImage(over.sheet, sx, sy, size, size, ox + x, g.y + oy, size, size);
      } else {
        // zoomed (sub_80047A0 without a turn), in a box twice its size
        const k = s16(Math.trunc(0x10000 / g.scale)), box = [W, H, -1, -1];
        drawPiece(g.x + ox, g.y + oy, size, size, sx, sy, [k, 0, 0, k], true, box, !wide, overSheet);
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

  // The time over's TIME and OVER (timeover.js), in front of the act at priority 0, TIME in front of OVER, in the
  // colours under water below the water line, and its fade on the whole screen, them and the HUD too. The
  // widescreen view keeps them to its middle and stretches their way in from its right edge.
  function drawTimeOver(to) {
    const ox = (W - SCREEN_W) >> 1, oy = (H - SCREEN_H) >> 1;
    const x = ox + 120 + Math.round((to.x - 120) * (W - ox - 60) / 180);
    byPart(() => { for (const name of ['gameOverRight', 'timeOverLeft']) drawSprite(anims[name].frames[0][0], x, 60 + oy, false); });
    if (to.bldY) darken(to.bldY);
  }

  // the title card's sprites from their OAM attributes; they have priority 0 and the lowest OAM orders, so
  // they are in front of everything. A sprite off the right or the bottom edge wraps round to the left or the top.
  // The widescreen view is wider and taller than that wrap allows for, so it places each sprite where its piece
  // put it, without wrapping. The zigzag band keeps to the left edge and runs down to the bottom, the pieces
  // along the bottom keep to it, the act number and the Japanese name to the right, and the white bar and the
  // zone's name go on to the right edge: the bar with more of itself, the name with its next letters. Those two
  // slide in from the original screen's right edge, so their way in is stretched to start from the view's.
  function drawCard(sprites, sheet) {
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
      if (wide) ctx.drawImage(sheet, sx, sy, w, h, x, y, w, h);
      else for (const dx of [x, x - 512]) for (const dy of [y, y - 256]) ctx.drawImage(sheet, sx, sy, w, h, dx, dy, w, h);
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

  // The results' sprites from their OAM attributes, like the title card's (results.js); they have priority 0 and
  // OAM orders 0 and 1, in front of everything. A glyph growing in goes through the rotation hardware, double
  // size, squashed by its matrix: matrix 20 + i (Task_8057888) scales the height by Div(i << 8, 12) / 256, which
  // the hardware gets as its inverse, 1 for i = 0. The widescreen view puts the original screen's figures in its
  // middle; the band and the line along it start from its left edge as they do from the screen's, slide in from
  // its right edge, and go on to it: the band with more of itself, the line with its next letters.
  const matrixPd = m => s16(div(0x10000, m === 20 ? 1 : div((m - 20) << 8, 12)));
  function drawResults(sprites) {
    const wider = W - SCREEN_W, taller = H - SCREEN_H, wide = wider > 0 || taller > 0;
    const ox = wider >> 1, oy = taller >> 1, more = Math.ceil(wider / 32);
    const last = {}, shift = {};
    sprites.forEach((s, i) => { last[s.slot] = i; });
    for (const [slot, stop] of [['band', -16], ['line', 0]]) {
      const first = sprites.find(s => s.slot === slot);
      shift[slot] = first && first.x > stop ? Math.round((first.x - stop) * wider / (SCREEN_W - stop)) : 0;
    }
    const index = new Map(sprites.map((s, i) => [s, i]));
    const put = (s, glyph, x, y) => {
      const { w, h, glyphs } = results.slots[s.slot], [sx, sy] = glyphs[glyph];
      if (wide) ctx.drawImage(results.sheet, sx, sy, w, h, x, y, w, h);
      else for (const dx of [x, x - 512]) for (const dy of [y, y - 256]) ctx.drawImage(results.sheet, sx, sy, w, h, dx, dy, w, h);
    };
    for (const s of stack(sprites)) {
      if (s.matrix !== undefined) {
        const { w, h, glyphs } = results.slots[s.slot], [tx, ty] = glyphs[s.glyph], box = [W, H, -1, -1];
        const x = wide ? s.x + ox : s.a1 & 0x1FF, y = wide ? s.y + oy : s.a0 & 0xFF;
        drawPiece(x, y, w, h, tx, ty, [256, 0, 0, matrixPd(s.matrix)], true, box, !wide, resultsSheet);
        flushObj(box);
        continue;
      }
      const x = wide ? s.x : s.a1 & 0x1FF, y = wide ? s.y + oy : s.a0 & 0xFF;
      if (s.slot === 'band' || s.slot === 'line') {
        put(s, s.glyph, x + shift[s.slot], y);
        if (!wide || index.get(s) !== last[s.slot]) continue;
        for (let i = 1; i <= more; i++) put(s, s.slot === 'line' ? (s.glyph + i) % 8 : s.glyph, x + shift[s.slot] + 32 * i, y);
      } else put(s, s.glyph, wide ? x + ox : x, y);
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
  // as 0, and a window whose end comes before its start wraps round the screen. Past the original screen, the
  // widescreen view shows each beam's whole wedge, its sides carried on along their own lines (beamSpan); a
  // window no beam drew carries an edge at the original screen's left or right edge on to its own, and keeps the
  // lines above and below the original screen's to its first and last line's windows.
  function windowRange(value, max) {
    let start = value >> 8, end = value & 0xFF;
    if (start > max && start > end) start = 0;
    if (end > max) { end = max; if (start > max) start = max; }
    return [start, end];
  }
  const NO_SHAPES = [null, null];
  function lit(blend, line, inside, ox) {
    inside.fill(0);
    if (!blend.windows) return;
    const margin = line < 0 || line >= SCREEN_H, l = Math.min(Math.max(line, 0), SCREEN_H - 1);
    const shapes = blend.drawn ? blend.shapes[blend.base ? 1 : 0] : NO_SHAPES;
    // columns [a, b) of the screen, kept to the view
    const span = (a, b) => { if (b > a) inside.fill(1, Math.max(a + ox, 0), Math.max(Math.min(b + ox, W), 0)); };
    for (let n = 0; n < 2; n++) {
      const shape = shapes[n];
      if (shape) {
        const [from, to] = beamSpan(shape, line);
        if (margin) { span(from, to); continue; }
        span(from, Math.min(to, 0)); span(Math.max(from, SCREEN_W), to);
      }
      const [top, bottom] = windowRange(blend.v[n], SCREEN_H);
      if (bottom >= top ? l < top || l >= bottom : l >= bottom && l < top) continue;
      const at = blend.base + l * 4 + n * 2;
      const [left, right] = windowRange(blend.drawn ? blend.buf[at] | (blend.buf[at + 1] << 8) : blend.h[n], SCREEN_W);
      const fill = (a, b) => inside.fill(1, a === 0 && !shape ? 0 : a + ox, b === SCREEN_W && !shape ? W : b + ox);
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
  // `rows` lines of it from `line` down (map rows `bgLine` on)
  const mirrored = new WeakMap();
  function drawStill(background, bgLine, line, ox, rows = 1) {
    let flip = mirrored.get(background);
    if (!flip) {
      flip = document.createElement('canvas');
      flip.width = bgW; flip.height = background.height;
      const f = flip.getContext('2d');
      f.scale(-1, 1); f.drawImage(background, -bgW, 0);
      mirrored.set(background, flip);
    }
    const n = Math.min(bgW, W - ox), right = W - ox - n;
    if (ox > 0) ctx.drawImage(flip, bgW - ox, bgLine, ox, rows, 0, line, ox, rows);
    ctx.drawImage(background, 0, bgLine, n, rows, ox, line, n, rows);
    if (right > 0) ctx.drawImage(flip, 0, bgLine, right, rows, ox + n, line, right, rows);
  }

  // `rows` lines of the background from screen line `line` down, from map row `row` on and map column `off` at
  // the left edge, repeating across. Lines that scroll alike and show the map's rows in order are drawn in one
  // go, which puts the same pixels on the screen as a line at a time with far fewer calls.
  function drawRows(background, off, row, rows, line) {
    for (let dx = 0; dx < W; off = 0) {
      const n = Math.min(bgW - off, W - dx);
      ctx.drawImage(background, off, row, n, rows, dx, line, n, rows);
      dx += n;
    }
  }

  // The background of a level whose scroll backgrounds.js gives, line by line from the map row and column it
  // starts at; the map repeats both ways.
  function drawScrolled(background, tick, ox, oy, cx, cy, terrain) {
    let start = 0;
    for (let line = 0; line < H; line++) {
      const [x, y] = scroll(line - oy, tick, cx, cy, terrain), row = mod(y + line - oy, background.height);
      bgRows[line] = row; bgOffsets[line] = mod(x - ox, bgW);
      if (bgOffsets[line] === bgOffsets[start] && row === bgRows[start] + line - start) continue;
      drawRows(background, bgOffsets[start], bgRows[start], line - start, start);
      start = line;
    }
    drawRows(background, bgOffsets[start], bgRows[start], H - start, start);
  }

  // The layers and the background of an act with many palette animations (stage.indexed) are colour indices,
  // drawn through the colours the animations have loaded on this frame: the background and the back layer
  // straight into the frame, the front layer over the sprites behind it.
  const ix = stage.indexed, pal32 = new Uint32Array(256);
  let ixBack = ix && new ImageData(W, H), ixFront = ix && new ImageData(W, H);
  const ixCanvas = document.createElement('canvas');
  ixCanvas.width = W; ixCanvas.height = H;
  function loadPalette(shown) {
    const p = ix.palette.slice();
    ix.loads.forEach((frames, k) => { for (let f = 0; f <= shown[k]; f++) for (const l of frames[f]) l.colors.forEach((c, i) => { p[l.insert + i] = c; }); });
    p.forEach(([r, g, b], i) => { pal32[i] = 0xFF000000 | (b << 16) | (g << 8) | r; });
  }
  // a layer's pixels under the view into `out`, where they aren't transparent; `split` (an Egg Rocket stage
  // separation's, on the back layer) leaves its rows from split.y a gap for split.shift rows, then shows the
  // rows above moved down by that much
  function indexLayer(out, layer, vx, vy, frame, split = null) {
    const { size, pixels, slots } = ix.metatiles, slot = slots[frame], map = stage.layers[layer];
    for (let y = 0; y < H; y++) {
      let wy = vy + y;
      if (split && wy >= split.y) { if (wy < split.y + split.shift) continue; wy -= split.shift; }
      const my = Math.floor(wy / size), row = (wy - my * size) * size;
      if (wy < 0 || my >= stage.levelY) continue;
      for (let x = 0; x < W;) {
        const wx = vx + x, mx = Math.floor(wx / size), col = wx - mx * size, n = Math.min(size - col, W - x);
        if (wx >= 0 && mx < stage.levelX) {
          const block = slot[map[my * stage.levelX + mx]] * size * size + row + col;
          for (let i = 0; i < n; i++) {
            const c = pixels[block + i];
            if (c) out[y * W + x + i] = pal32[c];
          }
        }
        x += n;
      }
    }
  }
  // a layer drawn over what `c` has so far
  function indexOver(c, layer, vx, vy, frame, split = null) {
    const out = new Uint32Array(ixFront.data.buffer);
    out.fill(0);
    indexLayer(out, layer, vx, vy, frame, split);
    ixCanvas.getContext('2d').putImageData(ixFront, 0, 0);
    c.drawImage(ixCanvas, 0, 0);
  }
  // Neo Green Hill's own scroll (backgroundOffset, the still band mirrored past the screen's sides), as the
  // atlas path draws it, for act 2, whose palette animations keep it as colour indices
  function neoGreenHillIndexed(out, bg, tick, ox, oy, cx) {
    const w = bg.width;
    for (let y = 0; y < H; y++) {
      const bgLine = Math.min(Math.max(y - oy, 0), bg.height - 1), row = bgLine * w, at = y * W;
      if (STILL(bgLine)) {
        for (let x = 0; x < W; x++) {
          const k = x - ox, col = k < 0 ? -1 - k : k < w ? k : w - 1 - (k - w);
          out[at + x] = pal32[bg.pixels[row + mod(col, w)]];
        }
        continue;
      }
      const off = backgroundOffset(bgLine, tick, cx) - ox;
      for (let x = 0; x < W; x++) out[at + x] = pal32[bg.pixels[row + mod(off + x, w)]];
    }
  }

  // the background through its scroll function, lined up with the original screen in the view's middle; the
  // map wraps both ways and colour 0 is the backdrop. A zone that draws its own (BACKGROUND_DRAW) does so from
  // the act's state.bg
  function indexBackground(out, tick, ox, oy, cx, cy, terrain, bgState) {
    const bg = ix.background;
    if (BACKGROUND_DRAW[stage.backgroundScroll]) { BACKGROUND_DRAW[stage.backgroundScroll](out, pal32, bg, bgState, W, H, ox, oy); return; }
    if (!scroll) { neoGreenHillIndexed(out, bg, tick, ox, oy, cx); return; }
    for (let y = 0; y < H; y++) {
      const [bx, by] = scroll(y - oy, tick, cx, cy, terrain), row = (by + y - oy) & 0xFF;
      for (let x = 0; x < W; x++) {
        const c = row < bg.height ? bg.pixels[row * bg.width + mod(bx + x - ox, bg.width)] : 0;
        out[y * W + x] = pal32[c];
      }
    }
  }

  // The screen's lines above `end` of a background that wraps around its map both ways, the original screen's
  // left edge at map column x and its first line at map row bgLine
  function drawWrapped(background, x, bgLine, end, ox) {
    const off = mod(x - ox, bgW);
    for (let line = 0; line < end;) {
      const row = mod(bgLine + line, bgH), rows = Math.min(end - line, bgH - row);
      drawRows(background, off, row, rows, line);
      line += rows;
    }
  }

  // The snow (Ice Mountain) from map pixel (sx, sy) at the original screen's top left, in palette `colors`,
  // added to what is under it or, with `opaque`, drawn over it, on the screen's lines above `end`; white in a
  // hit flash's window with `flash` (whiteWindow). It is put together on a layer of its own and added onto the
  // screen ('lighter' adds each channel and stops at 255, as the blend does), so the screen is never read back.
  const snowCanvas = document.createElement('canvas');
  let snowImg = null;
  function drawSnow(frame, sx, sy, colors, opaque, ox, oy, end, flash) {
    if (end <= 0) return;
    if (snowImg?.width !== W || snowImg?.height !== H) { snowImg = new ImageData(W, H); snowCanvas.width = W; snowCanvas.height = H; }
    const d = snowImg.data, sw = snow.width, sh = snow.height;
    const win = flash && maskCtx.getImageData(0, 0, W, end).data;
    d.fill(0, 0, W * end * 4);
    for (let y = 0; y < end; y++) {
      const row = mod(sy + y - oy, sh) * sw;
      for (let x = 0; x < W; x++) {
        const c = frame[row + mod(sx + x - ox, sw)];
        if (!c) continue;
        const k = (y * W + x) * 4, rgb = win && win[k + 3] ? [255, 255, 255] : colors[c];
        d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255;
      }
    }
    snowCanvas.getContext('2d').putImageData(snowImg, 0, 0, 0, 0, W, end);
    ctx.globalCompositeOperation = opaque ? 'source-over' : 'lighter';
    ctx.drawImage(snowCanvas, 0, 0, W, end, 0, 0, W, end);
    ctx.globalCompositeOperation = 'source-over';
  }

  // A still background with the clouds over it, put together pixel by pixel. The widescreen view shows the
  // background mirrored past its edges and its top and bottom lines repeated, and the clouds' 256 columns
  // repeated across, on the original screen's lines only.
  const pixelsOf = new WeakMap();
  const pixels = canvas => {
    if (!pixelsOf.has(canvas)) pixelsOf.set(canvas, canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    return pixelsOf.get(canvas);
  };
  let backgroundImage = null;
  function drawCloudBackground(tick, palettes, ox, oy, blend) {
    const sky = backgrounds.canvases[paletteVariant(stage, backgrounds.follows, palettes)];
    const clouds = stage.clouds.canvases[paletteVariant(stage, stage.clouds.follows, palettes)];
    const sp = pixels(sky), cp = pixels(clouds), sw = sky.width, sh = sky.height, cw = clouds.width, ch = clouds.height;
    if (backgroundImage?.width !== W || backgroundImage?.height !== H) backgroundImage = new ImageData(W, H);
    const d = backgroundImage.data, scroll = cloudScroll(tick - 1);
    for (let line = 0; line < H; line++) {
      const y = line - oy, sy = Math.min(Math.max(y, 0), sh - 1);
      for (let x = 0; x < W; x++) {
        const k = (line * W + x) * 4, rx = x - ox;
        const sx = rx < 0 ? Math.min(-1 - rx, sw - 1) : rx >= sw ? Math.max(2 * sw - 1 - rx, 0) : rx;
        const s = (sy * sw + sx) * 4;
        d[k] = sp[s]; d[k + 1] = sp[s + 1]; d[k + 2] = sp[s + 2]; d[k + 3] = 255;
        if (y < 0 || y >= ch) continue;
        const c = (y * cw + mod(rx + scroll, cw)) * 4;
        if (!cp[c + 3]) continue;
        for (let i = 0; i < 3; i++) d[k + i] = blend ? Math.min(255, (cp[c + i] * 12 + d[k + i] * 16) >> 4) : cp[c + i];
      }
    }
    ctx.putImageData(backgroundImage, 0, 0);
  }

  // back to front: higher orders first, and the later entries of an order before the earlier ones
  function stack(list) {
    return list.map((s, i) => [s, i]).sort((a, b) => b[0].order - a[0].order || b[1] - a[1]).map(([s]) => s);
  }

  // The background below the water line, from screen line `first` down: its colour indices in `colors`, each
  // line from `waves` on moved by the waves (waveOffsets) from the background's scroll (bgX, bgY)
  let waterImg = null;
  function drawUnderBackground(bgX, bgY, colors, tick, first, waves, ox, oy) {
    const { width: bw, height: bh, indices } = stage.water.background;
    if (!waterImg || waterImg.width !== W || waterImg.height !== H) waterImg = new ImageData(W, H);
    const out = new Uint32Array(waterImg.data.buffer);
    for (let line = first; line < H; line++) {
      const [hofs, vofs] = line < waves ? [bgX, bgY] : waveOffsets(bgX, bgY, line - oy, tick);
      const row = mod(vofs + line - oy, bh) * bw, o = line * W;
      for (let x = 0; x < W; x++) out[o + x] = colors[indices[row + mod(hofs + x - ox, bw)]];
    }
    ctx.putImageData(waterImg, 0, 0, 0, first, W, H - first);
  }

  // `draw(below, first, end)` once for each part of the screen, the lines [first, end): above the water line
  // and below it, where the sprites, the HUD and the title card take their colours under water
  let parts = [[0, SCREEN_H, false]];
  function byPart(draw) {
    if (parts.length === 1 && !parts[0][2]) { draw(false, 0, H); return; }
    for (const [first, end, below] of parts) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, first, W, end - first); ctx.clip();
      base = below ? (ownColours ? ownSheet : underSheet) : aboveSheet;
      draw(below, first, end);
      ctx.restore();
    }
    base = aboveSheet;
  }

  // a sprite drawn in an all-white palette (Egg X's hit flash fills OBJ palette 12 with white)
  const whiteCanvas = document.createElement('canvas');
  whiteCanvas.width = W; whiteCanvas.height = H;
  function drawAllWhite(s, vx, vy, sheet) {
    const main = ctx;
    ctx = whiteCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    drawSprite(s.frame, s.x - vx, s.y - vy, s.flipX, s.flipY, sheet);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx = main;
    ctx.drawImage(whiteCanvas, 0, 0);
  }

  // The brightness increase a boss sets up (Egg X's laser, and the fade to white after it): with the first
  // window on and BLDCNT's brighten mode, every pixel inside the window (with WININ's effects bit) or outside
  // it (with WINOUT's) is brightened by bldY sixteenths, as mGBA (the reference) brightens its 8-bit colours:
  // c + (255 - c) × bldY / 16, rounded down. The window's edges are WIN0H and WIN0V's, kept to the screen as
  // mGBA keeps them, and one that wraps covers both ends. In the widescreen view the original screen sits in
  // the middle, and a window that reaches its edge goes on to the view's.
  function brightenRange(reg, size, extra) {
    let start = reg >> 8, end = reg & 0xFF;
    if (start > size && start > end) start = 0;
    if (end > size) { end = size; if (start > size) start = size; }
    const at = v => (v === 0 ? 0 : v === size ? size + 2 * extra : v + extra);
    return [at(start), at(end)];
  }
  const inRange = (v, [start, end]) => (start <= end ? v >= start && v < end : v >= start || v < end);
  function brighten({ win0, win0h, win0v, winIn, winOut, bldCnt, bldY }) {
    // the sprites are brightened with the layers even when they aren't a target (bldCnt bit 4 clear): the one
    // place that clears it, X Zone's fade to its results, has no sprites left on the screen by then
    if (!win0 || (bldCnt & 0xC0) !== 0x80 || !(bldCnt & 0x3F) || bldY === 0) return;
    const inside = (winIn & 0x20) !== 0, outside = (winOut & 0x20) !== 0;
    if (!inside && !outside) return;
    const y16 = Math.min(bldY, 16), h = brightenRange(win0h, SCREEN_W, (W - SCREEN_W) >> 1), v = brightenRange(win0v, SCREEN_H, (H - SCREEN_H) >> 1);
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      const rowIn = inRange(y, v);
      for (let x = 0; x < W; x++) {
        if ((rowIn && inRange(x, h) ? inside : outside) === false) continue;
        const k = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) d[k + c] += ((255 - d[k + c]) * y16) >> 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // the multiplayer modes' screen effects. Darkness darkens everything but the lit span of each line (the
  // window WIN0, its lines from H-blank DMA); the screen fades to white by brightening all of it; an
  // invisible player's sprite is a window (the OBJ window) that shows only the background, or only the
  // backdrop, through everything drawn in front of it.
  function darkenSpans(bldY, spans, ox, oy) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let line = 0; line < H; line++) {
      const span = spans[line - oy];
      for (let x = 0; x < W; x++) {
        if (span && x - ox >= span[0] && x - ox < span[1]) continue;
        const i = (line * W + x) * 4;
        d[i] -= (d[i] * bldY) >> 4;
        d[i + 1] = (d[i + 1] * (16 - bldY)) >> 4;
        d[i + 2] = (d[i + 2] * (16 - bldY)) >> 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function brightenAll(bldY) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] += ((255 - d[i + c]) * bldY) >> 4;
    ctx.putImageData(img, 0, 0);
  }
  function objWindow(list, vx, vy, behind, layers) {
    const main = ctx;
    ctx = maskCtx;
    maskCtx.imageSmoothingEnabled = false;
    maskCtx.clearRect(0, 0, W, H);
    for (const s of list) {
      if (s.affine) drawAffine(s.frame, s.x - vx, s.y - vy, s.affine);
      else drawSprite(s.frame, s.x - vx, s.y - vy, s.flipX, s.flipY);
    }
    ctx = main;
    const mask = maskCtx.getImageData(0, 0, W, H).data, img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!mask[i + 3]) continue;
      if (layers & 0x08) { d[i] = behind[i]; d[i + 1] = behind[i + 1]; d[i + 2] = behind[i + 2]; }
      else { d[i] = backdrop[0]; d[i + 1] = backdrop[1]; d[i + 2] = backdrop[2]; }
    }
    ctx.putImageData(img, 0, 0);
  }
  const backdrop = stage.backdrop ?? [0, 0, 0];


  function render({ tick, rings, ringsStopped, sprites, terrain, palettes, objPalette, view, cam, hud: hudState, card: titleCard, results: actResults, gameOver, timeOver, bg, backLines, showCollision, rushFx, rushArt, shake, boostArt: art, spotlights, spriteRow, cardOver, water, display, effects2d, blendOff, pauseSign }) {
    const stops = gameOver?.endsNext || gameOver?.saving ? SCROLL_STOPS_AT : Infinity;
    ctx.imageSmoothingEnabled = false;
    if (art && art !== boostArt) {
      if (!boostSheets.has(art)) boostSheets.set(art, new WeakMap());
      const made = boostSheets.get(art);
      if (!made.has(assets.sprites)) made.set(assets.sprites, sheetOf(boostAtlas(assets.sprites, art)));
      boostArt = art; boost = made.get(assets.sprites);
      boostUnder = underSheet && underOf(boost);
    }
    // on the act's first frame the camera isn't kept inside the act yet; the title card's fade has the
    // screen black then, and the view is kept inside. The boost's shake moves it, still inside the act.
    let { x: vx, y: vy } = view;
    if (shake >= 0) {
      const [dx, dy] = RUSH_BOOST.shake[shake];
      vx = Math.max(0, Math.min(vx + dx, terrain.width - W));
      vy = Math.max(0, Math.min(vy + dy, terrain.height - H));
    }
    // the view's lines from `line` down are under water. The VCount interrupt on the line before it loads the
    // colours under water and turns the snow off in time for that line too (`split`), and starts the waves from
    // the line itself; with the line at the top the VBlank does both for the whole screen (water.js).
    const line = water ? Math.max(0, Math.min(H, water.level - vy)) : H;
    const split = line > 0 && line < H ? line - 1 : line;
    parts = [[0, split, false], [split, H, true]].filter(([first, end]) => end > first);
    ownColours = !!water?.ownColours;
    // the background is fixed to the view, as the original's is to its screen: it lines up with a 240 × 160
    // screen in the view's middle, and the sea scrolls with where that screen would be. Near the act's edges
    // the view stops before the camera does, and so does the background. A taller view shows the map's lines
    // below it and repeats its top line above it. Where the act has looped back, it scrolls on from where it was:
    // on the frame it loops back, with the camera where it was before.
    const ox = (W - SCREEN_W) >> 1, oy = (H - SCREEN_H) >> 1, cx = vx + ox - view.wrapped;
    const ice = stage.zone === ICE_MOUNTAIN ? iceMountainScroll(stage, cx, vy + oy, tick - 1, cam.bgUpdates) : null;
    const under = split < H ? { line: split, colors: underColors(stage, water, palettes) } : null;
    if (ix) {
      loadPalette(palettes);
      indexBackground(new Uint32Array(ixBack.data.buffer), tick - 1, ox, oy, cx, vy + oy, terrain, bg);
      ctx.putImageData(ixBack, 0, 0);
    } else {
      const background = backgrounds.canvases[paletteVariant(stage, backgrounds.follows, palettes)];
      if (scroll) drawScrolled(background, tick - 1, ox, oy, cx, vy + oy, terrain);
      else if (stage.clouds) drawCloudBackground(tick, palettes, ox, oy, !(titleCard?.fading || cardOver));
      else if (ice) drawWrapped(background, ice.bgX, ice.bgY - oy, split, ox);
      else {
        // runs of lines that scroll alike over consecutive map rows go together (drawRows)
        let start = 0, still = false, off = 0, first = 0;
        const flush = end => {
          if (end <= start) return;
          if (still) drawStill(background, first, start, ox, end - start);
          else drawRows(background, off, first, end - start, start);
        };
        for (let line = 0; line < H; line++) {
          const bgLine = Math.min(Math.max(line - oy, 0), background.height - 1);
          const scrollLine = gameOver?.saving ? stops - 1 : Math.min(bgLine, stops - 1), isStill = STILL(scrollLine);
          const o = isStill ? 0 : mod(backgroundOffset(scrollLine, tick - 1, cx) - ox, bgW);
          if (line > start && isStill === still && o === off && bgLine === first + line - start) continue;
          flush(line);
          start = line; still = isStill; off = o; first = bgLine;
        }
        flush(H);
      }
    }
    if (ice && under) drawUnderBackground(ice.bgX, ice.bgY, under.colors, tick, split, line, ox, oy);
    // what an invisible multiplayer player's OBJ window shows through: the background alone
    const windows = sprites.filter(s => s.window);
    const behind = windows.length && effects2d?.objWindow ? ctx.getImageData(0, 0, W, H).data : null;
    const frame = cam.tiles.shown;
    // the rings manager runs first among the tasks that draw, so its rings (OAM order 20) come first; past the
    // goal it draws none
    const shown = ringsStopped ? { list: [] } : rings.visible(view);
    // each in the colours its row of the sprite palette has as the frame ends (extract.js's alts)
    const recolour = s => {
      const alt = !s.sheet && !s.boost && assets.sprites.alts?.[s.frame]?.find(([row, key]) => objPalette?.[row] === key);
      return alt ? { ...s, frame: alt[2] } : s;
    };
    const list = stack([...shown.list.map(r => ({ frame: shown.frame, x: r.x, y: r.y, order: 20, prio: 2 })), ...sprites].map(recolour));
    // the last transform written to each shared OAM matrix (an affine's `matrix`) this frame
    const matrices = {};
    for (const s of sprites) if (s.affine?.matrix !== undefined) matrices[s.affine.matrix] = s.affine;
    // the layers' priorities are 1 (front), 2 (back) and 3 (background), and a sprite goes in front of those
    // whose priority is the same as its own or lower; `shows` picks some of them
    const drawAll = (level, shows = () => true) => byPart((below, first, end) => {
      for (const s of list) {
        if (Math.min(Math.max(s.prio ?? 0, 1), 3) !== level || s.white || s.window || !shows(s)) continue;
        // the HUD's and the multiplayer modes' screen sprites are placed on the original screen
        const dx = s.screen ? -ox : vx, dy = s.screen ? -oy : vy;
        const sheet = s.boost ? (below ? boostUnder : boost) : sheetFor(s.sheet);
        if (s.rush === 'trail') drawRushTrail(rushFx, vx, vy, [first, end], below);
        else if (s.rush === 'obj') drawRushObjs(rushFx, rushArt, vx, vy, s.sonic, [first, end], below);
        else if (!sheet) continue;
        else {
          const own = !s.sheet && s.sonicRow && spriteRow?.shown ? tint(spriteRow.shown, s.frame) : sheet;
          if (s.affine) drawAffine(s.frame, s.x - dx, s.y - dy, s.affine, own, matrices[s.affine.matrix]);
          else if (s.allWhite) drawAllWhite(s, dx, dy, own);
          else drawSprite(s.frame, s.x - dx, s.y - dy, s.flipX, s.flipY, own);
        }
      }
    });
    drawAll(3);
    if (ix) indexOver(ctx, 'back', vx, vy, frame, backLines);
    else drawLayer(ctx, stage, 'back', vx, vy, W, H, frame, palettes, under);
    // the background and the back layer fill the screen, so the window turns everything drawn so far white
    const flash = whiteWindow(sprites.filter(s => s.white), vx, vy);
    if (flash) ctx.drawImage(flash, 0, 0);
    drawAll(2);
    drawFlashedLayer(flash, c => (ix ? indexOver(c, 'front', vx, vy, frame) : drawLayer(c, stage, 'front', vx, vy, W, H, frame, palettes, under)));
    drawAll(1, s => (s.prio ?? 0) >= 1);
    // the snow lies over everything but the sprites of priority 0; the title card's fade and its last frame show
    // it as it is, as do the frames a boss has turned the blending off on (`blendOff`) or flashes on. Above the
    // water it is off while the water line was at the screen's top the frame before.
    const fading = titleCard ? titleCard.sprites.length > 0 && (titleCard.sprites[0].a0 & 0xC00) === 0x400 : cardOver;
    if (ice && tick > 1 && (!water || water.snow)) drawSnow(snow.frames[ice.snowFrame], ice.snowX, ice.snowY, snow.palettes[paletteVariant(stage, snow.follows, palettes)], fading || blendOff || !!flash, ox, oy, split, flash);
    if (behind) objWindow(windows, vx, vy, behind, effects2d.objWindowLayers);
    // the HUD's sprites are at priority 0 and OAM order 3, so the few of priority 0 with a lower order are in
    // front of them
    drawAll(1, s => (s.prio ?? 0) < 1 && s.order >= HUD_ORDER);
    if (showCollision) drawCollision(terrain, vx, vy);
    // in a boss's arena, nothing past its walls; the HUD keeps to the corners of what is shown
    if (view.clip) blackOutside(view.clip);
    byPart(below => drawHud(hudState.sprites, gameOver?.hudPalette ? over.hudSheet : below ? hud.under : hud.sheet, view.clip ?? undefined));
    drawAll(1, s => (s.prio ?? 0) < 1 && s.order < HUD_ORDER);
    if (gameOver) drawGameOver(gameOver);
    if (timeOver) drawTimeOver(timeOver);
    if (effects2d?.darkness) darkenSpans(effects2d.darkness.y, effects2d.darkness.spans, ox, oy);
    if (effects2d?.fade) brightenAll(effects2d.fade);
    if (display) brighten(display);
    if (actResults) {
      // the band is semi-transparent from when the fade starts, and blending it at full weight over what's
      // behind keeps it out of the fade
      const semi = s => (s.a0 & 0xC00) === 0x400;
      drawResults(actResults.sprites.filter(s => !semi(s)));
      if (actResults.fade.bldY) darken(actResults.fade.bldY);
      drawResults(actResults.sprites.filter(semi));
    }
    // the spotlights' blend takes the place of the title card's fade. Its windows are on the original screen,
    // wherever that is in the view.
    const blend = spotlights?.blend;
    if (blend) darkenOutside(blend, view.sx, view.sy);
    // the pause menu's sign, in front of everything and out of any fade (pause.js), in the middle of the
    // original screen
    if (pauseSign) byPart(() => { for (const s of stack(pauseSign.map(recolour))) drawSprite(s.frame, s.x + ox, s.y + oy, s.flipX, s.flipY); });
    if (!titleCard) return;
    // the card's sprites are semi-transparent all together, and blending them at full weight over what's
    // behind keeps them out of the fade
    const semi = titleCard.sprites.length > 0 && (titleCard.sprites[0].a0 & 0xC00) === 0x400;
    const cardSprites = () => byPart(below => drawCard(titleCard.sprites, below ? card.under : card.sheet));
    if (!semi) cardSprites();
    if (!blend && titleCard.fade.bldY) darken(titleCard.fade.bldY);
    if (semi) cardSprites();
  }

  /** Draws w × h frames from now on: 240 × 160, the original screen, or the widescreen view's size. */
  // what another stage's renderer (extrarender.js) draws with: `use(c)` sends the drawing to canvas context c
  // and gives back the one it replaced
  render.parts = {
    drawSprite, drawAffine, drawHud: (sprites, sheet = hud.sheet) => drawHud(sprites, sheet), drawCard: sprites => drawCard(sprites, card.sheet), darken, stack, atlas, frames,
    drawGameOver, gameOverHud: over?.hudSheet,
    get ctx() { return ctx; }, get w() { return W; }, get h() { return H; },
    use(c) { const old = ctx; ctx = c; return old; },
  };

  render.resize = (w, h) => {
    W = w; H = h;
    whiteCanvas.width = w; whiteCanvas.height = h;
    canvas.width = objCanvas.width = overlay.width = maskCanvas.width = flashCanvas.width = ixCanvas.width = w;
    canvas.height = objCanvas.height = overlay.height = maskCanvas.height = flashCanvas.height = ixCanvas.height = h;
    objLayer = new ImageData(w, h);
    if (ix) { ixBack = new ImageData(w, h); ixFront = new ImageData(w, h); }
    trailBuf = new Uint8Array(w * h);
    bgRows = new Int16Array(h); bgOffsets = new Int16Array(h); inside = new Uint8Array(w);
  };
  return render;
}
