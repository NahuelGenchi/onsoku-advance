// The GBA's video hardware as the front end drives it: VRAM, palette RAM, OAM and the display registers, and a
// renderer that draws a frame from them one line at a time. It composes the layers, the windows and the colour
// effects the way mGBA's software renderer does (mGBA 0.10, src/gba/renderers/), the emulator every recording
// this project checks against comes from, so a frame matches its pixels exactly: the same 8-bit colours, the same
// blending arithmetic, the same order of sprites and layers, and the same quirks where it departs from the plain
// rules (how a rotated sprite's line starts and stops, which pixels a semi-transparent sprite brightens or darkens).
// Mosaic and the OBJ window aren't drawn yet; nothing that uses them is.
//
// The widescreen view draws a wider frame with the original screen in its middle, drawn exactly as above. Around
// it, each scene goes on as it really is: each layer as the scene says it carries on past the screen's edges
// (wrapping where the scene relies on it, otherwise its picture once, with its edge carried on or nothing past
// it), the sprites where they really are rather than where OAM wraps them, a window across the screen's edge on
// past it (or the shape the scene gives it), and the lines above and below with the registers of the screen's
// first and last line, their scroll carried on as it changes from line to line.

export const SCREEN_W = 240, SCREEN_H = 160;
const MAX_W = 512;   // the widest view

// the display registers, as byte offsets from 0x04000000
export const REG = {
  DISPCNT: 0x00, BG0CNT: 0x08, BG1CNT: 0x0A, BG2CNT: 0x0C, BG3CNT: 0x0E, BG0HOFS: 0x10,
  BG2PA: 0x20, BG2X: 0x28, BG2Y: 0x2C, BG3PA: 0x30, BG3X: 0x38, BG3Y: 0x3C,
  WIN0H: 0x40, WIN1H: 0x42, WIN0V: 0x44, WIN1V: 0x46, WININ: 0x48, WINOUT: 0x4A, MOSAIC: 0x4C,
  BLDCNT: 0x50, BLDALPHA: 0x52, BLDY: 0x54,
};
// what each register keeps of a write
const MASK = { 0x00: 0xFFF7, 0x08: 0xDFFF, 0x0A: 0xDFFF, 0x50: 0x3FFF, 0x52: 0x1F1F, 0x54: 0x1F, 0x48: 0x3F3F, 0x4A: 0x3F3F };
for (let r = 0x10; r < 0x20; r += 2) MASK[r] = 0x1FF;

// a pixel on its way through a line: its colour in the low 24 bits (red in the lowest byte), and above it, in an
// order that makes the front-most of two pixels the smaller number, its priority, which background it comes
// from, whether it is a background, and its part in the colour effects
const PRIORITY_SHIFT = 30, INDEX_SHIFT = 28;
const IS_BACKGROUND = 0x08000000, UNWRITTEN = 0xFC000000, REBLEND = 0x04000000;
const TARGET_1 = 0x02000000, TARGET_2 = 0x01000000, ORDER = 0xF8000000;
const KEEP = 0x00FFFFFF | REBLEND | TARGET_2;   // what a pixel keeps once another has been put behind it
const WRITABLE = 0xFE000000;
const NONE = 0, ALPHA = 1, BRIGHTEN = 2, DARKEN = 3;
// a sprite's draw time in cycles per line, out of 1210 (954 with H-blank free for OAM)
const OBJ_CYCLES = 1210, OBJ_CYCLES_HBLANK_FREE = 954;

// GBA object sizes by shape * 4 + size
const OBJ_SIZES = [[8, 8], [16, 16], [32, 32], [64, 64], [16, 8], [32, 8], [32, 16], [64, 32], [8, 16], [8, 32], [16, 32], [32, 64], [8, 8], [8, 8], [8, 8], [8, 8]];

/** A BGR555 colour as 8 bits a channel, each channel's top bits repeated below it. */
export function color555(c) {
  const v = ((c & 0x1F) << 3) | (((c >> 5) & 0x1F) << 11) | (((c >> 10) & 0x1F) << 19);
  return v | ((v >> 5) & 0x070707);
}

function brighten(c, y) {
  let a = c & 0xFF, out = (a + (((0xFF - a) * y) >> 4)) & 0xFF;
  a = c & 0xFF00; out |= (a + Math.trunc(((0xFF00 - a) * y) / 16)) & 0xFF00;
  a = c & 0xFF0000; out |= (a + Math.trunc(((0xFF0000 - a) * y) / 16)) & 0xFF0000;
  return out;
}

function darken(c, y) {
  let a = c & 0xFF, out = (a - ((a * y) >> 4)) & 0xFF;
  a = c & 0xFF00; out |= (a - Math.trunc((a * y) / 16)) & 0xFF00;
  a = c & 0xFF0000; out |= (a - Math.trunc((a * y) / 16)) & 0xFF0000;
  return out;
}

// alpha blending: each channel weighted by its sixteenths and capped at full
function mix(wa, a, wb, b) {
  let r = ((a & 0xFF) * wa + (b & 0xFF) * wb) >> 4;
  if (r > 0xFF) r = 0xFF;
  let g = (((a >> 8) & 0xFF) * wa + ((b >> 8) & 0xFF) * wb) >> 4;
  if (g > 0xFF) g = 0xFF;
  let bl = (((a >> 16) & 0xFF) * wa + ((b >> 16) & 0xFF) * wb) >> 4;
  if (bl > 0xFF) bl = 0xFF;
  return r | (g << 8) | (bl << 16);
}

export function createVideo() {
  const vram = new Uint8Array(0x18000);
  const pal = new Uint16Array(512);   // the backgrounds' 256 colours, then the sprites'
  const oam = new Uint16Array(512);
  const io = new Uint16Array(0x58 >> 1);
  const vram16 = new Uint16Array(vram.buffer);

  // what the renderer keeps besides the registers: the rotating layers' reference points, which advance down the
  // frame, and the colours as it draws them
  const ref = [[0, 0], [0, 0]], cur = [[0, 0], [0, 0]];
  const normal = new Uint32Array(512), variant = new Uint32Array(512);
  let variantFor = -1;   // the effect and level the variant colours were made for

  const row = new Uint32Array(MAX_W), spriteLayer = new Uint32Array(MAX_W);
  const windows = Array.from({ length: 64 }, () => ({ endX: 0, ctl: 0 }));
  let nWindows = 1;

  // the widescreen view while a frame is drawn (null for the original screen): `ox` the columns left of the
  // original screen, so a line's pixel x is at row[x + ox]; on a line above or below it, the whole line is margin
  let view = null, ox = 0, lineW = SCREEN_W, marginLine = false;
  // a scroll's true value where the scene knows it (an effect that shifts lines either way), else NaN
  const ioTrue = new Float64Array(io.length).fill(NaN);
  const lineIo = Array.from({ length: SCREEN_H }, () => new Uint16Array(io.length));
  const lineTrue = Array.from({ length: SCREEN_H }, () => new Float64Array(io.length));
  // where the rotating layers' lines started on the screen's first and last lines
  const edgeCur = [0, 1].map(() => [[0, 0], [0, 0]]);

  /** Writes a 16-bit display register, as the CPU or a DMA does; `trueValue` is a scroll's value before it is
   *  cut to the register's 9 bits, for the widescreen view. */
  function write(reg, value, trueValue = NaN) {
    value &= MASK[reg] ?? 0xFFFF;
    io[reg >> 1] = value;
    ioTrue[reg >> 1] = trueValue;
    if (reg >= 0x28 && reg < 0x40 && (reg & 0xF) >= 8) {
      // BGxX and BGxY: a write sets the reference point and restarts it from there
      const bg = reg >= 0x38 ? 1 : 0, axis = (reg & 4) >> 2, hi = reg & 2;
      let v = ref[bg][axis];
      v = hi ? ((v & 0xFFFF) | (value << 16)) : ((v & ~0xFFFF) | value);
      v = (v << 4) >> 4;
      ref[bg][axis] = cur[bg][axis] = v;
    }
  }

  function updateColors() {
    for (let i = 0; i < 512; i++) normal[i] = color555(pal[i]);
    variantFor = -1;
  }

  function updateVariant(effect, y) {
    const key = effect * 32 + y;
    if (key === variantFor) return;
    variantFor = key;
    if (effect === BRIGHTEN) for (let i = 0; i < 512; i++) variant[i] = brighten(normal[i], y);
    else if (effect === DARKEN) for (let i = 0; i < 512; i++) variant[i] = darken(normal[i], y);
    else variant.set(normal);
  }

  // the windows across line y: runs of pixels, each ending at endX, with the control bits of the window that
  // covers them (bits 0-3 the backgrounds, 4 the sprites, 5 the colour effects)
  function windowSpan(regH) {
    const v = io[regH >> 1];
    let end = v & 0xFF, start = v >> 8;
    if (start > SCREEN_W && start > end) start = 0;
    if (end > SCREEN_W) { end = SCREEN_W; if (start > SCREEN_W) start = SCREEN_W; }
    return [start, end];
  }
  function windowRows(regV) {
    const v = io[regV >> 1];
    let end = v & 0xFF, start = v >> 8;
    if (start > SCREEN_H && start > end) start = 0;
    if (end > SCREEN_H) { end = SCREEN_H; if (start > SCREEN_H) start = SCREEN_H; }
    return [start, end];
  }
  function breakWindowInner(start, end, ctl) {
    let startX = 0;
    if (end <= 0) return;
    for (let i = 0; i < nWindows; i++) {
      if (start < windows[i].endX) {
        const old = { ...windows[i] };
        if (start > startX) {
          for (let n = nWindows++; n > i; n--) Object.assign(windows[n], windows[n - 1]);
          windows[i].endX = start;
          i++;
        }
        windows[i].ctl = ctl;
        windows[i].endX = end;
        if (end >= old.endX) {
          for (i++; nWindows > i + 1 && end >= windows[i].endX; i++) {
            Object.assign(windows[i], windows[i + 1]);
            nWindows--;
          }
        } else {
          i++;
          for (let n = nWindows++; n > i; n--) Object.assign(windows[n], windows[n - 1]);
          Object.assign(windows[i], old);
        }
        return;
      }
      startX = windows[i].endX;
    }
  }
  function breakWindow(n, y) {
    const [vs, ve] = windowRows(REG.WIN0V + n * 2);
    if (ve >= vs) { if (y >= ve || y < vs) return; }
    else if (y >= ve && y < vs) return;
    const [hs, he] = windowSpan(REG.WIN0H + n * 2), ctl = (io[REG.WININ >> 1] >> (n * 8)) & 0x3F;
    if (he < hs) { breakWindowInner(0, he, ctl); breakWindowInner(hs, SCREEN_W, ctl); }
    else breakWindowInner(hs, he, ctl);
  }

  // the widescreen view's margins: whether window n covers (x, y) there. With a shape from the scene, that shape,
  // which goes on past where the window's rows stop it on the screen (a beam goes on up past where it leaves the
  // screen's side); otherwise as the window covers the screen's nearest pixel, so a window across the screen's
  // edge goes on past it.
  function inWindow(n, x, y) {
    const shape = view.windows?.[n];
    if (shape) return x >= shape.left(y) && x < shape.right(y);
    const cy = y < 0 ? 0 : y >= SCREEN_H ? SCREEN_H - 1 : y;
    const [vs, ve] = windowRows(REG.WIN0V + n * 2);
    if (ve >= vs) { if (cy >= ve || cy < vs) return false; }
    else if (cy >= ve && cy < vs) return false;
    const cx = x < 0 ? 0 : x >= SCREEN_W ? SCREEN_W - 1 : x;
    const [hs, he] = windowSpan(REG.WIN0H + n * 2);
    return he < hs ? cx < he || cx >= hs : cx >= hs && cx < he;
  }
  function marginCtl(x, y) {
    if (!(dispcnt & 0xE000)) return 0xFF;
    for (let n = 0; n < 2; n++) if ((dispcnt & (0x2000 << n)) && inWindow(n, x, y)) return (io[REG.WININ >> 1] >> (n * 8)) & 0x3F;
    return io[REG.WINOUT >> 1] & 0x3F;
  }
  // the runs across a line of the widescreen view, as row indices: the screen's own (already in `windows`) moved
  // over by `ox`, and the margins' worked out a pixel at a time
  function wideWindows(y) {
    const centre = marginLine ? [] : windows.slice(0, nWindows).map(w => ({ endX: w.endX + ox, ctl: w.ctl }));
    const runs = [];
    // a run never crosses the screen's edges, so each is the screen's or a margin's
    const margin = (from, to) => {
      let ctl = -1;
      for (let x = from; x < to; x++) {
        const c = marginCtl(x, y);
        if (c === ctl) runs[runs.length - 1].endX = x + ox + 1;
        else { runs.push({ endX: x + ox + 1, ctl: c }); ctl = c; }
      }
    };
    if (marginLine) margin(-ox, SCREEN_W + ox);
    else {
      margin(-ox, 0);
      for (const w of centre) runs.push(w);
      margin(SCREEN_W, SCREEN_W + ox);
    }
    nWindows = runs.length;
    runs.forEach((r, i) => { windows[i].endX = r.endX; windows[i].ctl = r.ctl; });
  }
  const inScreen = (start, end) => !marginLine && start >= ox && end <= ox + SCREEN_W;

  // the sprites that can show this frame, in OAM order: each one's attributes, top line, bottom line and draw time
  let sprites = [];
  function cleanOam() {
    sprites = [];
    for (let i = 0; i < 128; i++) {
      const a = oam[i * 4], b = oam[i * 4 + 1], c = oam[i * 4 + 2];
      const affine = a & 0x100;
      if (!affine && (a & 0x200)) continue;
      let [w, h] = OBJ_SIZES[((a >> 14) * 4) + (b >> 14)], cycles = w;
      if (affine) { const d = (a >> 9) & 1; w <<= d; h <<= d; cycles = 10 + w * 2; }
      const y = a & 0xFF, x = b & 0x1FF;
      if (y >= SCREEN_H && y + h < 228) continue;
      if (x >= SCREEN_W && x + w < 512) continue;
      sprites.push({ a, b, c, y, endY: y + h, cycles });
    }
  }

  // state for one line, set as it is drawn
  let dispcnt, mode, effect, blda, bldb, bldy, target1Obj, target2Obj, target1Bd, target2Bd, forceTarget1;
  const bgs = [0, 1, 2, 3].map(index => ({ index, cnt: 0, priority: 0, target1: false, target2: false, enabled: false }));

  // one sprite across the run [start, end) of line y, into the sprite layer; returns whether it drew there. A
  // sprite of the widescreen view's margins has its true position, trueX and trueY, instead of OAM's.
  function drawSprite(s, y, start, end, ctl) {
    const { a, b, c } = s;
    const [width, height] = OBJ_SIZES[((a >> 14) * 4) + (b >> 14)];
    const objMode = (a >> 10) & 3, blendOn = (ctl & 0x20) !== 0;
    let flags = ((c >> 10) & 3) << PRIORITY_SHIFT;
    if ((blendOn && target1Obj && effect === ALPHA) || objMode === 1) flags |= TARGET_1;
    if (objMode === 2) return 0;   // the OBJ window: not drawn yet
    const real = s.trueX !== undefined;
    let x = real ? s.trueX : (b << 23) >> 23;
    const map1d = (dispcnt & 0x40) !== 0, is256 = (a & 0x2000) !== 0;
    const charBase = ((c & 0x3FF) & ~(is256 && !map1d ? 1 : 0)) * 0x20;
    const maskLo = map1d ? 0x7FFE : 0x3FE, maskHi = map1d ? 0 : charBase & 0x7C00;
    if (mode >= 3 && (c & 0x3FF) < 512) return 0;
    let useVariant = target1Obj && blendOn && (effect === BRIGHTEN || effect === DARKEN);
    if (objMode === 1 || (target1Obj && effect === ALPHA)) {
      const target2 = target2Bd || bgs.some(bg => bg.target2 && bg.enabled);
      if (target2) { forceTarget1 = true; flags |= REBLEND; useVariant = false; }
      else flags &= ~TARGET_1;
    }
    flags >>>= 0;
    const colors = useVariant ? variant : normal;
    const palBase = 256 + (is256 ? 0 : (c >> 12) << 4);
    let inY = y - (real ? s.trueY : a & 0xFF);
    const stride = map1d ? (width >> (is256 ? 0 : 1)) : 0x80;
    const OBJ = 0x10000;

    const put = (outX, pixel) => {
      const at = outX + ox, current = spriteLayer[at];
      if (((current & ORDER) >>> 0) <= flags) return;
      if (pixel) spriteLayer[at] = (colors[palBase + pixel] | flags) >>> 0;
      else if (current !== UNWRITTEN) spriteLayer[at] = ((current & ~(ORDER | REBLEND | TARGET_1)) | (flags & (ORDER | REBLEND | TARGET_1))) >>> 0;
    };
    const fetch = (localX, localY) => {
      if (is256) {
        const xBase = (localX & ~7) * 8 + (localX & 6), yBase = (localY & ~7) * stride + (localY & 7) * 8 + maskHi;
        const t = vram16[(OBJ + ((yBase + ((xBase + charBase) & maskLo)) & 0x7FFE)) >> 1];
        return (t >> ((localX & 1) << 3)) & 0xFF;
      }
      const xBase = (localX & ~7) * 4 + ((localX >> 1) & 2), yBase = (localY & ~7) * stride + (localY & 7) * 4 + maskHi;
      const t = vram16[(OBJ + ((yBase + ((xBase + charBase) & maskLo)) & 0x7FFE)) >> 1];
      return (t >> ((localX & 3) << 2)) & 0xF;
    };

    if (a & 0x100) {
      const dbl = (a >> 9) & 1, totalWidth = width << dbl, totalHeight = height << dbl;
      const m = ((b >> 9) & 0x1F) * 16;
      const pa = (oam[m + 3] << 16) >> 16, pb = (oam[m + 7] << 16) >> 16, pc = (oam[m + 11] << 16) >> 16, pd = (oam[m + 15] << 16) >> 16;
      if (inY < 0 && !real) inY += 256;
      let outX = x >= start ? x : start, condition = x + totalWidth, inX = outX - x;
      if (end < condition) condition = end;
      let xAccum = pa * (inX - 1 - (totalWidth >> 1)) + pb * (inY - (totalHeight >> 1)) + (width << 7);
      let yAccum = pc * (inX - 1 - (totalWidth >> 1)) + pd * (inY - (totalHeight >> 1)) + (height << 7);
      // skips ahead to the first texel inside the sprite; its end isn't worked out, the run stops there
      const skip = n => { xAccum += pa * n; yAccum += pc * n; outX += n; inX += n; };
      if (pa) {
        if ((xAccum >> 8) < 0) skip(Math.trunc((-xAccum - 1) / pa));
        else if ((xAccum >> 8) >= width) skip(Math.trunc(((width << 8) - xAccum) / pa));
      }
      if (pc) {
        if ((yAccum >> 8) < 0) skip(Math.trunc((-yAccum - 1) / pc));
        else if ((yAccum >> 8) >= height) skip(Math.trunc(((height << 8) - yAccum) / pc));
      }
      if (outX < start || outX >= condition) return 0;
      for (; outX < condition; outX++, inX++) {
        xAccum += pa; yAccum += pc;
        const localX = xAccum >> 8, localY = yAccum >> 8;
        if ((localX & ~(width - 1)) || (localY & ~(height - 1))) break;
        put(outX, fetch(localX, localY));
      }
      return 1;
    }

    let outX = x >= start ? x : start, condition = x + width;
    if (!real && (a & 0xFF) + height - 256 >= 0) inY += 256;
    if (b & 0x2000) inY = height - inY - 1;
    if (end < condition) condition = end;
    let inX = outX - x, step = 1;
    if (b & 0x1000) { inX = width - inX - 1; step = -1; }
    for (; outX < condition; outX++, inX += step) put(outX, fetch(inX, inY));
    return 1;
  }

  // the sprites of priority `priority` over the run [start, end)
  function compositeSprites(priority, start, end, ctl) {
    if (!(ctl & 0x10)) return;
    const flags = target2Obj ? TARGET_2 : 0;
    for (let x = start; x < end; x++) {
      const color = spriteLayer[x];
      if (((color & UNWRITTEN) >>> 0) === (UNWRITTEN >>> 0) || (color >>> PRIORITY_SHIFT) !== priority) continue;
      blendInto(x, (color | flags) >>> 0);
    }
  }

  // puts `color` behind or in front of what is already at x, blending it in as the second target if the pixel
  // in front is a first target
  function blendInto(x, color) {
    const current = row[x];
    if (color >= current) {
      row[x] = (current & TARGET_1) && (color & TARGET_2) ? mix(blda, current, bldb, color) : (current & KEEP) >>> 0;
    } else row[x] = (color & ~TARGET_2) >>> 0;
  }
  function layInto(x, color) {
    const current = row[x];
    row[x] = color >= current ? (current & KEEP) >>> 0 : color;
  }

  function bgFlags(bg, ctl) {
    let flags = (bg.priority << PRIORITY_SHIFT) | (bg.index << INDEX_SHIFT) | IS_BACKGROUND;
    if (bg.target2) flags |= TARGET_2;
    if (effect === ALPHA) {
      if (blda === 0x10 && bldb === 0) flags &= ~TARGET_2;
      else if (bg.target1 && (ctl & 0x20)) flags |= TARGET_1;
    }
    const useVariant = bg.target1 && (ctl & 0x20) && (effect === BRIGHTEN || effect === DARKEN);
    return [flags >>> 0, useVariant ? variant : normal];
  }

  // a text background over [start, end) of line y
  function drawText(bg, y, start, end, ctl) {
    if (!(ctl & (1 << bg.index))) return;
    const [flags, colors] = bgFlags(bg, ctl), blend = (flags & TARGET_2) !== 0;
    const cnt = bg.cnt, size = cnt >> 14, is256 = (cnt & 0x80) !== 0;
    const charBase = ((cnt >> 2) & 3) << 14, screenBase = ((cnt >> 8) & 0x1F) << 11;
    const hofs = io[(REG.BG0HOFS >> 1) + bg.index * 2], vofs = io[(REG.BG0HOFS >> 1) + bg.index * 2 + 1];
    const inY = y + vofs;
    let yBase = inY & 0xF8;
    if (size === 2) yBase += inY & 0x100;
    else if (size === 3) yBase += (inY & 0x100) << 1;
    yBase = (screenBase >> 1) + (yBase << 2);
    for (let x = start; x < end; x++) {
      const localX = (x + hofs) & 0x1FF;
      let xBase = localX & 0xF8;
      if (size & 1) xBase += (localX & 0x100) << 5;
      const map = vram16[(yBase + (xBase >> 3)) & 0xFFFF];
      let ty = inY & 7, tx = localX & 7;
      if (map & 0x800) ty = 7 - ty;
      if (map & 0x400) tx = 7 - tx;
      let pixel, color;
      if (is256) {
        pixel = vram[(charBase + ((map & 0x3FF) << 6) + (ty << 3) + tx) % 0x18000];
        if (!pixel) continue;
        color = colors[pixel];
      } else {
        const byte = vram[(charBase + ((map & 0x3FF) << 5) + (ty << 2) + (tx >> 1)) % 0x18000];
        pixel = tx & 1 ? byte >> 4 : byte & 0xF;
        if (!pixel) continue;
        color = colors[((map >> 12) << 4) | pixel];
      }
      const at = x + ox;
      if (!(row[at] & WRITABLE)) continue;
      if (blend) blendInto(at, (color | flags) >>> 0);
      else layInto(at, (color | flags) >>> 0);
    }
  }

  // a text background over the row indices [start, end) of line y in the widescreen view's margins, as the
  // scene says the layer carries on (view.layers[index], by default wrapping both ways as the hardware does): per
  // axis, { once, box: [from, to), edge, mirror }. A layer shown once has its picture at its true scroll, the
  // register's value nearest 0 unless the scene gave it, between `box`'s columns or rows of its map (all of it by
  // default), and past them its edge if `edge`, else nothing; with `mirror`, past their end the picture goes on
  // mirrored instead.
  function drawTextWide(bg, y, start, end, ctl) {
    if (!(ctl & (1 << bg.index))) return;
    const [flags, colors] = bgFlags(bg, ctl), blend = (flags & TARGET_2) !== 0;
    const cnt = bg.cnt, size = cnt >> 14, is256 = (cnt & 0x80) !== 0;
    const charBase = ((cnt >> 2) & 3) << 14, screenBase = ((cnt >> 8) & 0x1F) << 11;
    const mapW = size & 1 ? 512 : 256, mapH = size & 2 ? 512 : 256;
    const way = view.layers?.[bg.index], wx = way?.x, wy = way?.y;
    const r = (REG.BG0HOFS >> 1) + bg.index * 2;
    const scroll = (k, n, once) => {
      if (!once) return io[k];
      if (!Number.isNaN(ioTrue[k])) return ioTrue[k];
      const v = io[k] & (n - 1);
      return v >= n >> 1 ? v - n : v;
    };
    // where along an axis the map is read, or -1 for nothing
    const along = (p, n, w) => {
      if (!w?.once) return ((p % n) + n) % n;
      const [from, to] = w.box ?? [0, n];
      if (p >= from && p < to) return p;
      if (w.mirror && p >= to) {
        const twice = 2 * (to - from), q = (p - from) % twice;
        return from + (q < to - from ? q : twice - 1 - q);
      }
      if (!w.edge) return -1;
      return p < from ? from : to - 1;
    };
    const inY = along(y + scroll(r + 1, mapH, wy?.once), mapH, wy);
    if (inY < 0) return;
    const hofs = scroll(r, mapW, wx?.once);
    const rowBase = (screenBase >> 1) + (inY >= 256 ? (size === 3 ? 2048 : 1024) : 0) + ((inY & 0xF8) << 2);
    for (let at = start; at < end; at++) {
      const inX = along(at - ox + hofs, mapW, wx);
      if (inX < 0) continue;
      const map = vram16[(rowBase + (inX >= 256 ? 1024 : 0) + ((inX & 0xF8) >> 3)) & 0xFFFF];
      let ty = inY & 7, tx = inX & 7;
      if (map & 0x800) ty = 7 - ty;
      if (map & 0x400) tx = 7 - tx;
      let pixel, color;
      if (is256) {
        pixel = vram[(charBase + ((map & 0x3FF) << 6) + (ty << 3) + tx) % 0x18000];
        if (!pixel) continue;
        color = colors[pixel];
      } else {
        const byte = vram[(charBase + ((map & 0x3FF) << 5) + (ty << 2) + (tx >> 1)) % 0x18000];
        pixel = tx & 1 ? byte >> 4 : byte & 0xF;
        if (!pixel) continue;
        color = colors[((map >> 12) << 4) | pixel];
      }
      if (!(row[at] & WRITABLE)) continue;
      if (blend) blendInto(at, (color | flags) >>> 0);
      else layInto(at, (color | flags) >>> 0);
    }
  }

  // a rotating background over [start, end) of line y
  function drawAffine(bg, start, end, ctl) {
    if (!(ctl & (1 << bg.index))) return;
    const [flags, colors] = bgFlags(bg, ctl), blend = (flags & TARGET_2) !== 0;
    const cnt = bg.cnt, size = cnt >> 14, wrap = (cnt & 0x2000) !== 0, span = 0x8000 << size;
    const charBase = ((cnt >> 2) & 3) << 14, screenBase = ((cnt >> 8) & 0x1F) << 11;
    const r = (REG.BG2PA >> 1) + (bg.index - 2) * 8, pa = (io[r] << 16) >> 16, pc = (io[r + 2] << 16) >> 16;
    let x = cur[bg.index - 2][0] + (start - 1) * pa, y = cur[bg.index - 2][1] + (start - 1) * pc;
    for (let outX = start; outX < end; outX++) {
      x += pa; y += pc;
      let lx = x, ly = y;
      if (wrap) { lx &= span - 1; ly &= span - 1; }
      else if ((x | y) & ~(span - 1)) continue;
      const map = vram[screenBase + (lx >> 11) + (((ly >> 7) & 0x7F0) << size)];
      const pixel = vram[charBase + (map << 6) + ((ly & 0x700) >> 5) + ((lx & 0x700) >> 8)];
      const at = outX + ox;
      if (!pixel || !(row[at] & WRITABLE)) continue;
      if (blend) blendInto(at, (colors[pixel] | flags) >>> 0);
      else layInto(at, (colors[pixel] | flags) >>> 0);
    }
  }

  function drawLine(y, out, outAt) {
    dispcnt = io[0];
    if (dispcnt & 0x80) { out.fill(0xFFFFFFFF, outAt, outAt + lineW); return; }
    mode = dispcnt & 7;
    const bldcnt = io[REG.BLDCNT >> 1], alpha = io[REG.BLDALPHA >> 1];
    effect = (bldcnt >> 6) & 3;
    blda = Math.min(alpha & 0x1F, 16); bldb = Math.min((alpha >> 8) & 0x1F, 16);
    bldy = Math.min(io[REG.BLDY >> 1] & 0x1F, 16);
    target1Obj = (bldcnt & 0x10) !== 0; target1Bd = (bldcnt & 0x20) !== 0;
    target2Obj = (bldcnt & 0x1000) !== 0; target2Bd = (bldcnt & 0x2000) !== 0;
    for (const bg of bgs) {
      bg.cnt = io[(REG.BG0CNT >> 1) + bg.index];
      bg.priority = bg.cnt & 3;
      bg.target1 = (bldcnt & (1 << bg.index)) !== 0;
      bg.target2 = (bldcnt & (0x100 << bg.index)) !== 0;
      bg.enabled = (dispcnt & (0x100 << bg.index)) !== 0;
    }
    updateVariant(effect, bldy);

    spriteLayer.fill(UNWRITTEN);
    windows[0].endX = SCREEN_W;
    nWindows = 1;
    if (dispcnt & 0xE000) {
      windows[0].ctl = io[REG.WINOUT >> 1] & 0x3F;
      if (dispcnt & 0x4000) breakWindow(1, y);
      if (dispcnt & 0x2000) breakWindow(0, y);
    } else windows[0].ctl = 0xFF;
    if (ox || marginLine) wideWindows(y);
    forceTarget1 = false;

    // the backdrop
    let x = 0;
    for (let w = 0; w < nWindows; w++) {
      const lit = target1Bd && (effect === BRIGHTEN || effect === DARKEN) && (windows[w].ctl & 0x20);
      const backdrop = ((lit ? variant[0] : normal[0]) | UNWRITTEN | (3 << PRIORITY_SHIFT) | IS_BACKGROUND) >>> 0;
      for (; x < windows[w].endX; x++) row[x] = backdrop;
    }

    // the sprites into their own layer, each drawing for as long as the line's time lasts; in the widescreen
    // view's margins, the scene's sprites where they really are, all of them
    let spriteLayers = 0;
    if (dispcnt & 0x1000) {
      let cycles = dispcnt & 0x20 ? OBJ_CYCLES_HBLANK_FREE : OBJ_CYCLES;
      for (const s of marginLine ? [] : sprites) {
        if ((y < s.y && (s.endY - 256 < 0 || y >= s.endY - 256)) || y >= s.endY) continue;
        let end = 0;
        for (let w = 0; w < nWindows; w++) {
          const start = end;
          end = windows[w].endX;
          if (!(windows[w].ctl & 0x10) || (ox && !inScreen(start, end))) continue;
          spriteLayers |= drawSprite(s, y, start - ox, end - ox, windows[w].ctl) << ((s.c >> 10) & 3);
        }
        cycles -= s.cycles;
        if (cycles <= 0) break;
      }
      for (const s of view && (ox || marginLine) ? view.sprites ?? [] : []) {
        const affine = s.a & 0x100;
        if (!affine && (s.a & 0x200)) continue;
        const height = OBJ_SIZES[((s.a >> 14) * 4) + (s.b >> 14)][1] << (affine ? (s.a >> 9) & 1 : 0);
        if (y < s.trueY || y >= s.trueY + height) continue;
        let end = 0;
        for (let w = 0; w < nWindows; w++) {
          const start = end;
          end = windows[w].endX;
          if (!(windows[w].ctl & 0x10) || inScreen(start, end)) continue;
          spriteLayers |= drawSprite(s, y, start - ox, end - ox, windows[w].ctl) << ((s.c >> 10) & 3);
        }
      }
    }

    let end = 0;
    for (let w = 0; w < nWindows; w++) {
      const start = end, ctl = windows[w].ctl;
      end = windows[w].endX;
      const margin = (ox || marginLine) && !inScreen(start, end);
      for (let p = 0; p < 4; p++) {
        if (spriteLayers & (1 << p)) compositeSprites(p, start, end, ctl);
        for (const bg of bgs) {
          if (!bg.enabled || bg.priority !== p) continue;
          const text = bg.index < 2 ? mode < 2 : bg.index === 2 ? mode === 0 : mode === 0;
          const affine = bg.index === 2 ? mode === 1 || mode === 2 : bg.index === 3 && mode === 2;
          if (text) {
            if (margin) drawTextWide(bg, y, start, end, ctl);
            else drawText(bg, y, start - ox, end - ox, ctl);
          } else if (affine) drawAffine(bg, start - ox, end - ox, ctl);
        }
      }
    }

    // a first target with nothing behind it but the backdrop, as the second target
    if ((forceTarget1 || bgs.some(bg => bg.target1)) && target2Bd) {
      x = 0;
      for (let w = 0; w < nWindows; w++) {
        const lit = target1Bd && (effect === BRIGHTEN || effect === DARKEN) && (windows[w].ctl & 0x20);
        const backdrop = lit ? variant[0] : normal[0];
        for (; x < windows[w].endX; x++) if (row[x] & TARGET_1) row[x] = mix(bldb, backdrop, blda, row[x]);
      }
    }
    // semi-transparent sprites with nothing to blend with take the brightness effect
    if (forceTarget1 && (effect === DARKEN || effect === BRIGHTEN)) {
      x = 0;
      for (let w = 0; w < nWindows; w++) {
        const endX = windows[w].endX;
        if (!(windows[w].ctl & 0x20)) { x = endX; continue; }
        for (; x < endX; x++) {
          if ((row[x] & (REBLEND | IS_BACKGROUND)) === REBLEND) row[x] = effect === DARKEN ? darken(row[x], bldy) : brighten(row[x], bldy);
        }
      }
    }

    if (mode !== 0 && !marginLine) {
      for (let k = 0; k < 2; k++) {
        if (!bgs[k + 2].enabled) continue;
        const r = (REG.BG2PA >> 1) + k * 8;
        cur[k][0] += (io[r + 1] << 16) >> 16;
        cur[k][1] += (io[r + 3] << 16) >> 16;
      }
    }
    for (let i = 0; i < lineW; i++) out[outAt + i] = (row[i] & 0xFFFFFF) | 0xFF000000;
  }

  // the registers of a line above or below the screen: those of its first or last line, with each layer's scroll
  // carried on by as much as it changes between that line and the next one in, and the rotating layers' lines
  // starting on from that line's as they would further down the screen
  const s9 = v => (v << 23) >> 23;
  function marginRegs(y) {
    const [edge, next, by] = y < 0 ? [0, 1, -y] : [SCREEN_H - 1, SCREEN_H - 2, y - SCREEN_H + 1];
    io.set(lineIo[edge]); ioTrue.set(lineTrue[edge]);
    for (let k = 0; k < 2; k++) {
      const r = (REG.BG2PA >> 1) + k * 8, from = edgeCur[edge ? 1 : 0][k], lines = y - edge;
      cur[k][0] = from[0] + ((io[r + 1] << 16) >> 16) * lines;
      cur[k][1] = from[1] + ((io[r + 3] << 16) >> 16) * lines;
    }
    for (let k = REG.BG0HOFS >> 1; k < (REG.BG0HOFS >> 1) + 8; k++) {
      const a = lineTrue[edge][k], b = lineTrue[next][k];
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        ioTrue[k] = a + (a - b) * by;
        io[k] = ioTrue[k] & 0x1FF;
      } else {
        io[k] = (io[k] + s9(lineIo[edge][k] - lineIo[next][k]) * by) & 0x1FF;
        ioTrue[k] = NaN;
      }
    }
  }

  /**
   * Draws a frame into `out` (240 × 160 RGBA words, as an ImageData's buffer holds them). `hblank(y)` runs
   * after line y is drawn, as the H-blank does, and may write registers for the next line. With `wide`, a
   * widescreen view of { w, h } (even numbers no smaller than the screen) instead, w × h words, with the scene's
   * `layers`, `sprites` and `windows` past the screen's edges (see drawTextWide, drawSprite and inWindow).
   * The registers are as they were before it afterwards, so a frame can be drawn again; the V-blank sets every
   * one the H-blank changes before the next.
   */
  function drawFrame(out, hblank, wide) {
    const before = io.slice(), beforeTrue = ioTrue.slice(), beforeRef = ref.map(r => r.slice());
    updateColors();
    cleanOam();
    if (!wide || (wide.w === SCREEN_W && wide.h === SCREEN_H)) {
      for (let y = 0; y < SCREEN_H; y++) {
        drawLine(y, out, y * SCREEN_W);
        hblank?.(y);
      }
    } else {
      view = wide; lineW = Math.min(wide.w, MAX_W); ox = (lineW - SCREEN_W) >> 1;
      const oy = (wide.h - SCREEN_H) >> 1;
      for (let y = 0; y < SCREEN_H; y++) {
        lineIo[y].set(io); lineTrue[y].set(ioTrue);
        if (y === 0 || y === SCREEN_H - 1) for (let k = 0; k < 2; k++) edgeCur[y ? 1 : 0][k] = cur[k].slice();
        drawLine(y, out, (y + oy) * lineW);
        hblank?.(y);
      }
      // then the lines above and below
      marginLine = true;
      for (let y = -oy; y < wide.h - oy; y++) {
        if (y === 0) y = SCREEN_H;
        if (y >= wide.h - oy) break;
        marginRegs(y);
        drawLine(y, out, (y + oy) * lineW);
      }
      marginLine = false;
      view = null; lineW = SCREEN_W; ox = 0;
    }
    io.set(before); ioTrue.set(beforeTrue);
    for (let k = 0; k < 2; k++) [ref[k][0], ref[k][1]] = beforeRef[k];
    // the V-blank starts the rotating layers from their reference points again
    cur[0][0] = ref[0][0]; cur[0][1] = ref[0][1]; cur[1][0] = ref[1][0]; cur[1][1] = ref[1][1];
  }

  return { vram, pal, oam, io, write, drawFrame, drawLine };
}
