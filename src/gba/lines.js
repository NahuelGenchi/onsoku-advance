// Line-by-line effects (SAT-R decompilation, src/bg_triangles.c): each fills this frame's half of the engine's
// H-blank buffer with a register's value for every line, which the H-blank DMA then copies in as the screen is
// drawn. Some scroll a layer differently on each line; the others draw a window's left and right edges along
// the sides of a shape, a line at a time.

import { REG } from './video.js';

const s8 = v => (v << 24) >> 24, s16 = v => (v << 16) >> 16;

function put16(e, at, v) { e.hblank[at] = v & 0xFF; e.hblank[at + 1] = (v >> 8) & 0xFF; }

/** sub_8007858: layer `bg` scrolled to `h` on lines minY to maxY - 1, and `v` there going one line up each line. */
export function scrollLines(e, bg, minY, maxY, h, v) {
  e.setHBlankCopy(REG.BG0HOFS + bg * 4, 4);
  minY &= 0xFF; maxY &= 0xFF;
  let at = e.primary + minY * 4;
  v = (v - minY) & 0x1FF; h &= 0x1FF;
  for (; minY < maxY; minY++, at += 4) { put16(e, at, h); put16(e, at + 2, v); v = (v - 1) & 0xFFFF; }
}

/** sub_80078D4: layer `bg` scrolled to (h, v) on lines minY to maxY - 1. */
export function fillLines(e, bg, minY, maxY, h, v) {
  e.setHBlankCopy(REG.BG0HOFS + bg * 4, 4);
  minY &= 0xFF; maxY &= 0xFF;
  for (let at = e.primary + minY * 4; minY < maxY; minY++, at += 4) { put16(e, at, h % 512); put16(e, at + 2, v % 512); }
}

/** sub_8007958: layer `bg` shifted by `shift` one way and the next line the other, `step` further each line. */
export function shearLines(e, bg, minY, maxY, shift, step, h, v) {
  e.setHBlankCopy(REG.BG0HOFS + bg * 4, 4);
  minY &= 0xFF; maxY &= 0xFF;
  shift = s16(shift); step = s8(step);
  for (let at = e.primary + minY * 4; minY < maxY; minY++, at += 4) {
    put16(e, at, (shift + h) & 0x1FF); put16(e, at + 2, v);
    shift = s16(-(shift + step)); step = s8(-step);
  }
}

// where a window's edges go: windows 0 and 1 for layers 0 and 1 (2 bytes a line), or both at once, the first for
// layer 2 and the second for layer 3 (4 bytes a line). A line's first byte is its right edge, its second its left.
function windowLines(e, bg) {
  const size = bg >= 2 ? 4 : 2;
  e.setHBlankCopy(bg < 2 && bg & 1 ? REG.WIN1H : REG.WIN0H, size);
  return { size, at: e.primary + (bg >= 2 && bg & 1 ? 2 : 0) };
}

// sub_8006228 (the right edge follows the line) and sub_80064A8 (the left edge does): a line from (x1, y1) to
// (x2, y2) as one edge of the window on each line it crosses, the other edge at `other`
function windowEdge(e, bg, x1, y1, x2, y2, other, right) {
  const { size, at } = windowLines(e, bg), b = e.hblank;
  const right0 = () => (right ? x1 : other), left1 = () => (right ? other : x1);   // a line's two bytes
  const r1 = s16(x2 - x1), r5 = s16(y2 - y1);
  let r4 = r5, r2 = r1;
  const r8 = s16(Math.abs(r2) * 2), r7 = s16(Math.abs(r4) * 2);
  let cur = at + y1 * size;
  if (Math.abs(r2) > Math.abs(r4)) {
    // flatter than 45°: along x, a line down each time the error passes 0
    r4 = s16(-r2);
    if (r2 > 0) {
      b[cur + 1] = left1();
      for (r2 = 0; r2 < Math.abs(r1); r2++) {
        x1 = (x1 + 1) & 0xFF; r4 = s16(r4 + r7);
        if (r4 >= 0) { r4 = s16(r4 - r8); b[cur] = right0(); cur += size; b[cur + 1] = left1(); }
      }
      b[cur] = right0();
    } else {
      b[cur] = right0(); cur++;
      for (r2 = 0; r2 < Math.abs(r1); r2++) {
        x1 = (x1 - 1) & 0xFF; r4 = s16(r4 + r7);
        if (r4 >= 0) { r4 = s16(r4 - r8); b[cur] = left1(); cur += size - 1; b[cur] = right0(); cur++; }
      }
      b[cur] = left1();
    }
  } else {
    // steeper: a line at a time, x a step over each time the error passes 0
    r4 = s16(-r4);
    const dir = r2 > 0 ? 1 : -1;
    for (r2 = 0; r2 < Math.abs(r5); r2++) {
      b[cur] = right ? (x1 + 1) & 0xFF : other; cur++;
      b[cur] = left1(); cur += size - 1;
      r4 = s16(r4 + r8);
      if (r4 >= 0) { x1 = (x1 + dir) & 0xFF; r4 = s16(r4 - r7); }
    }
  }
}
export const windowRight = (e, bg, x1, y1, x2, y2, left) => windowEdge(e, bg, x1 & 0xFF, y1 & 0xFF, x2 & 0xFF, y2 & 0xFF, left & 0xFF, true);
export const windowLeft = (e, bg, x1, y1, x2, y2, right) => windowEdge(e, bg, x1 & 0xFF, y1 & 0xFF, x2 & 0xFF, y2 & 0xFF, right & 0xFF, false);

/**
 * sub_800724C: the window between two lines, p = [x0, y0, x1, y1, x2, y2, x3, y3] (bytes): the left edge along
 * (x0, y0)–(x1, y1), the right edge along (x2, y2)–(x3, y3). Above where both have started, the one that starts
 * higher has the screen's other side for its partner.
 */
export function windowBetween(e, bg, p) {
  const { size, at } = windowLines(e, bg), b = e.hblank;
  let cur = at;
  const u8 = v => v & 0xFF;
  let minVal = Math.min(p[1], p[5]), maxVal = Math.max(p[1], p[5]);
  cur += minVal * size;
  const dx = [s16(p[2] - p[0]), s16(p[6] - p[4])], dy = [s16(p[3] - p[1]), s16(p[7] - p[5])];
  const ax = [s16(Math.abs(dx[0]) * 2), s16(Math.abs(dx[1]) * 2)], ay = [s16(Math.abs(dy[0]) * 2), s16(Math.abs(dy[1]) * 2)];
  const x = [p[0], p[4]], err = [s16(-dy[0]), s16(-dy[1])];
  // steps edge `k` down a line; the left edge (0) takes the last x it reaches going left, the right edge (1) the
  // one past the last it reaches going right
  const step = k => {
    while (err[k] >= 0) {
      if (dx[k] > 0) {
        x[k] = u8(x[k] + 1); err[k] = s16(err[k] - ay[k]);
        if (k === 1 && err[k] >= 0) b[cur] = u8(x[1] + 1);
      } else {
        x[k] = u8(x[k] - 1); err[k] = s16(err[k] - ay[k]);
        if (k === 0 && err[k] >= 0) b[cur + 1] = x[0];
      }
    }
  };
  if (minVal !== maxVal && p[1] < p[5]) {
    for (; minVal < maxVal; minVal++, cur += size) {
      b[cur] = 240; b[cur + 1] = x[0];
      err[0] = s16(err[0] + ax[0]);
      step(0);
    }
  } else {
    for (; minVal < maxVal; minVal++, cur += size) {
      b[cur] = x[1]; b[cur + 1] = 0;
      err[1] = s16(err[1] + ax[1]);
      step(1);
    }
  }
  for (maxVal = Math.min(p[3], p[7]); minVal < maxVal; minVal++, cur += size) {
    b[cur] = x[1]; b[cur + 1] = x[0];
    err[0] = s16(err[0] + ax[0]); err[1] = s16(err[1] + ax[1]);
    step(0); step(1);
  }
}
