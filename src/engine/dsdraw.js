// The Nintendo DS's drawing, for what the optional Sonic Rush boost shows (rushfx.js), following melonDS's
// software renderers (GPU3D_Soft.cpp, GPU2D_Soft.cpp):
// - translucent polygons of one colour and polygon ID 0, as the 3D engine rasterizes them with alpha blending
//   on: edges walked from the top vertex with 18-bit fractional slopes, every edge pixel filled, polygons
//   sorted by their bottom then top line, and a pixel taken by the first one only (equal translucent IDs);
// - sprites, normal and through the rotation hardware in a double-size box, the lowest OAM index in front;
// - the blending of each over what is below, in the 6-bit colours the DS mixes in.

// the 3D engine's slope along an edge, for the left (side 0) or right (side 1) one
function slope(x0, x1, y0, y1, y, side) {
  let xmin, xmax, neg = false;
  if (x1 > x0) { xmin = x0; xmax = x1 - 1; }
  else if (x1 < x0) { xmin = x1; xmax = x0 - 1; neg = true; }
  else { xmin = x0; xmax = x0; }
  const xlen = xmax + 1 - xmin, ylen = y1 - y0;
  let inc;
  if (ylen === 0) inc = 0;
  else if (ylen === xlen && xlen !== 1) inc = 0x40000;
  else inc = Math.abs((x1 - x0) * Math.trunc(0x40000 / ylen));
  const xMajor = inc > 0x40000;
  let dx;
  if (side) dx = xMajor ? (neg ? 0x60000 : inc - 0x20000) : inc !== 0 ? (neg ? 0x40000 : 0) : 0;
  else dx = xMajor ? (neg ? inc - 0x20000 + 0x40000 : 0x20000) : inc !== 0 ? (neg ? 0x40000 : 0) : 0;
  dx += (y - y0) * inc;
  return { x0, y0, xmin, xmax, neg, inc, dx };
}
function xAt(s, y) {
  const d = Math.floor((s.dx + (y - (s.y ?? y)) * s.inc) / 0x40000);
  const x = s.neg ? s.x0 - d : s.x0 + d;
  return x < s.xmin ? s.xmin : x > s.xmax ? s.xmax : x;
}

// a triangle's set-up (the bounds, which way it faces, as GPU3D.cpp's SubmitPolygon works them out)
function triangle(v, alpha) {
  let vtop = 0, vbot = 0, ytop = Infinity, ybot = 0, xbot = 0;
  v.forEach(([x, y], i) => {
    if (y < ytop) { ytop = y; vtop = i; }
    if (y > ybot || (y === ybot && x > xbot)) { xbot = x; ybot = y; vbot = i; }
  });
  const [[x0, y0], [x1, y1], [x2, y2]] = v;
  const facing = (x0 - x1) * (y2 - y1) - (y0 - y1) * (x2 - x1) >= 0;
  return { v, alpha, vtop, vbot, ytop, ybot, facing, key: ybot * 1024 + Math.max(ytop, 0) };   // (ybot << 8) | ytop on the DS's 192 lines
}

/**
 * Rasterizes the strips ({alpha, vertices: four [x, y]}, each a triangle strip of two triangles, all one
 * translucent colour) into `buf` (W × H, 0 where none, else the alpha + 1). Returns the box it touched,
 * [x0, y0, x1, y1], or null.
 */
export function rasterizeStrips(strips, W, H, buf) {
  const polys = [];
  for (const { alpha, vertices: [a, b, c, d] } of strips) polys.push(triangle([a, b, c], alpha), triangle([c, b, d], alpha));
  polys.sort((p, q) => p.key - q.key);   // stable, as melonDS's sort is
  const box = [W, H, -1, -1];
  for (const p of polys) {
    if (p.ybot <= 0 && p.ytop !== p.ybot) continue;
    if (p.ytop >= H || p.ybot < 0) continue;
    const n = 3, step = (i, d) => (i + d + n) % n, { v } = p;
    const span = (y, xs, xe) => {
      if (xs > xe) [xs, xe] = [xe, xs];
      xs = Math.max(xs, 0); xe = Math.min(xe, W - 1);
      for (let x = xs; x <= xe; x++) {
        const o = y * W + x;
        if (buf[o]) continue;
        buf[o] = p.alpha + 1;
        if (x < box[0]) box[0] = x;
        if (y < box[1]) box[1] = y;
        if (x > box[2]) box[2] = x;
        if (y > box[3]) box[3] = y;
      }
    };
    if (p.ytop === p.ybot) {
      // a flat one: one line from its leftmost vertex to its rightmost
      let l = 0, r = 0;
      for (const i of [1, n - 1]) {
        if (v[i][0] < v[l][0]) l = i;
        if (v[i][0] > v[r][0]) r = i;
      }
      if (p.ytop >= 0) {
        let xs = v[l][0], xe = v[r][0];
        if (xs !== xe && xe !== 0) xe--;   // a right edge with no slope is pushed a pixel left
        span(p.ytop, xs, xe);
      }
      continue;
    }
    // the left edge goes from the top vertex the way the polygon faces, the right edge the other way
    const dl = p.facing ? 1 : -1;
    let curL = p.vtop, nextL = step(p.vtop, dl), curR = p.vtop, nextR = step(p.vtop, -dl), L = null, R = null;
    const setL = y => {
      while (y >= v[nextL][1] && curL !== p.vbot) { curL = nextL; nextL = step(curL, dl); }
      L = slope(v[curL][0], v[nextL][0], v[curL][1], v[nextL][1], y, 0); L.y = y;
    };
    const setR = y => {
      while (y >= v[nextR][1] && curR !== p.vbot) { curR = nextR; nextR = step(curR, -dl); }
      R = slope(v[curR][0], v[nextR][0], v[curR][1], v[nextR][1], y, 1); R.y = y;
    };
    const first = Math.max(p.ytop, 0);
    setL(first); setR(first);
    for (let y = first; y < p.ybot && y < H; y++) {
      if (y >= v[nextL][1] && curL !== p.vbot) setL(y);
      if (y >= v[nextR][1] && curR !== p.vbot) setR(y);
      const xs = xAt(L, y);
      let xe = xAt(R, y);
      if (R.inc === 0 && (L.inc !== 0 || xs !== xe) && xe !== 0) xe--;
      span(y, xs, xe);
    }
  }
  return box[2] < 0 ? null : box;
}

/**
 * The sprite layer the entries make (rushfx.js rushObjEntries, front first): for each pixel of the box they
 * cover, the 15-bit colour of the frontmost entry's non-transparent texel there, or -1. Returns
 * {x0, y0, w, h, colors} or null.
 */
export function objLayer(entries, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const e of entries) {
    x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y);
    x1 = Math.max(x1, e.x + e.boxW - 1); y1 = Math.max(y1, e.y + e.boxH - 1);
  }
  x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, W - 1); y1 = Math.min(y1, H - 1);
  if (x1 < x0 || y1 < y0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, colors = new Int32Array(w * h).fill(-1);
  for (const e of entries) {
    const ex0 = Math.max(e.x, x0), ex1 = Math.min(e.x + e.boxW - 1, x1);
    const ey0 = Math.max(e.y, y0), ey1 = Math.min(e.y + e.boxH - 1, y1);
    for (let y = ey0; y <= ey1; y++) {
      const yoff = y - e.y;
      for (let x = ex0; x <= ex1; x++) {
        const o = (y - y0) * w + (x - x0);
        if (colors[o] >= 0) continue;
        const xoff = x - e.x;
        let tx, ty;
        if (e.matrix) {
          // DrawSprite_Rotscale: from the box's centre, 8.8 steps, the texel under it
          const [pa, pb, pc, pd] = e.matrix, cx = e.boxW >> 1, cy = e.boxH >> 1;
          const rx = (xoff - cx) * pa + (yoff - cy) * pb + (e.w << 7);
          const ry = (xoff - cx) * pc + (yoff - cy) * pd + (e.h << 7);
          if (rx < 0 || ry < 0 || rx >= e.w << 8 || ry >= e.h << 8) continue;
          tx = rx >> 8; ty = ry >> 8;
        } else {
          tx = e.flipX ? e.w - 1 - xoff : xoff;
          ty = e.flipY ? e.h - 1 - yoff : yoff;
        }
        const index = e.pixels[ty * e.w + tx];
        if (index) colors[o] = e.colors[index] & 0x7FFF;
      }
    }
  }
  return { x0, y0, w, h, colors };
}

// a canvas channel (8 bits, from a 5-bit colour) as the 6 bits the DS mixes in, and the DS's 6 bits back out
export const to6 = v => (v >> 3) << 1;
export const out8 = c => (c << 2) | (c >> 4);
