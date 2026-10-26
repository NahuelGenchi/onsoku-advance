// Terrain lookups over an act's collision, as the original does them (SAT-R decompilation,
// src/game/shared/stage/terrain_collision.c).
//
// Every 8 × 8 tile has eight height bytes. The high nibble describes each pixel column and the low nibble
// each pixel row, both signed 4-bit. A positive value v is solid from pixel v % 8 to the bottom (or right)
// edge, so 8 is a full column; a negative value is solid for the first -v pixels from the top (or left);
// 0 is empty, and -8 reads as 8.

export const LAYER_FRONT = 0, LAYER_BACK = 1;
export const IGNORE_PLATFORMS = 0x80;   // jump-through tiles count as empty

const TILE_X_FLIP = 0x400, TILE_Y_FLIP = 0x800;

export function createTerrain(collision) {
  const { metatiles, layers, heights, angles, flags, levelX, width, height } = collision;
  // the original caches the last metatile column and row; a lookup is cheap enough here without it
  function tileAt(px, py, layer) {
    const tx = px >> 3, ty = py >> 3;
    const id = layers[layer & 1][Math.floor(ty / 12) * levelX + Math.floor(tx / 12)];
    return metatiles[id * 144 + (ty % 12) * 12 + (tx % 12)];
  }
  const clampX = x => Math.min(Math.max(x | 0, 0), width - 1);
  const clampY = y => Math.min(Math.max(y | 0, 0), height - 1);
  const signed4 = v => (v & 8 ? v - 16 : v);
  // a flip across the measured axis turns "solid from row v down" into "solid for the first 8 - v rows"
  const flipHeight = v => (v === 0 || v === 8 ? v : v > 0 ? v - 8 : v + 8);
  const platform = tile => (flags[tile >> 3] >> ((tile & 7) * 2)) & 1;

  return {
    width, height, tileAt,
    /** Height value of the pixel column at (px, py), −7 … 8. */
    columnHeight(px, py, layer) {
      px = clampX(px); py = clampY(py);
      const entry = tileAt(px, py, layer), tile = entry & 0x3FF;
      let col = px & 7;
      if (entry & TILE_X_FLIP) col = 7 - col;
      let v = signed4(heights[tile * 8 + col] >> 4);
      if (v === -8) v = 8;
      if ((layer & IGNORE_PLATFORMS) && platform(tile)) v = 0;
      return entry & TILE_Y_FLIP ? flipHeight(v) : v;
    },
    /** Width value of the pixel row at (px, py), −7 … 8. */
    rowWidth(px, py, layer) {
      px = clampX(px); py = clampY(py);
      const entry = tileAt(px, py, layer), tile = entry & 0x3FF;
      let row = py & 7;
      if (entry & TILE_Y_FLIP) row = 7 - row;
      let v = signed4(heights[tile * 8 + row] & 15);
      if (v === -8) v = 8;
      if ((layer & IGNORE_PLATFORMS) && platform(tile)) v = 0;
      return entry & TILE_X_FLIP ? flipHeight(v) : v;
    },
    /** Surface angle of the tile at (px, py), 0–255 for a full turn, mirrored for flipped tiles. */
    angle(px, py, layer) {
      const entry = tileAt(clampX(px), clampY(py), layer);
      let a = angles[entry & 0x3FF];
      if (entry & TILE_X_FLIP) a = -a;
      if (entry & TILE_Y_FLIP) a = 0x80 - a;
      return a & 0xFF;
    },
  };
}

// The probes take the coordinate along the scan axis first, like the original's: a vertical probe reads
// the column of (x, y) as (y, x) and a horizontal one the row as (x, y). Both return the value and angle.
const vertical = (t, y, x, layer) => ({ v: t.columnHeight(x, y, layer), rot: t.angle(x, y, layer) });
const horizontal = (t, x, y, layer) => ({ v: t.rowWidth(x, y, layer), rot: t.angle(x, y, layer) });
export const PROBE_FLOOR = vertical, PROBE_WALL = horizontal;

// distance to the last free pixel before the solid part of a partial tile: right when the solid part faces
// the scan, and kept as the original computes it when it doesn't
const partial = (v, r) => (v > 0 ? v - 1 - r : v + r);

/**
 * The original's terrain scan (sub_801E4E4): looks up to three tiles ahead of p0 along `step` (+8 or -8)
 * when p0 is in an empty tile, and up to two tiles back when it is in a full one. Returns d, the signed
 * distance from p0 to the last free pixel (negative when embedded), and rot, the surface angle, which is
 * undefined when nothing was found and the caller keeps its old one.
 */
export function scan(terrain, p0, p1, layer, step, probe) {
  const fwd = step > 0, r = p0 & 7;
  const at = k => probe(terrain, p0 + k * step, p1, layer);
  const t0 = at(0);
  if (t0.v !== 0 && t0.v !== 8) return { d: partial(t0.v, r), rot: t0.rot };
  if (t0.v === 0) {
    const t1 = at(1);
    if (t1.v === 8) return { d: fwd ? 7 - r : r, rot: t1.rot };
    if (t1.v !== 0) return { d: partial(t1.v, r) + 8, rot: t1.rot };
    const t2 = at(2);
    if (t2.v === 8) return { d: fwd ? 15 - r : r + 8, rot: t2.rot };
    if (t2.v !== 0) return { d: partial(t2.v, r) + 16, rot: t2.rot };
    return { d: fwd ? 24 - r : r + 17, rot: undefined };
  }
  const b1 = at(-1);
  if (b1.v === 0) return { d: fwd ? -1 - r : r - 8, rot: t0.rot };
  if (b1.v !== 8) return { d: partial(b1.v, r) - 8, rot: b1.rot };
  const b2 = at(-2);
  if (b2.v === 0) return { d: fwd ? -9 - r : r - 16, rot: b1.rot };
  if (b2.v !== 8) return { d: partial(b2.v, r) - 16, rot: b2.rot };
  return { d: fwd ? -17 - r : r - 24, rot: b2.rot };
}

/**
 * The one-tile probe along either axis (sub_801F100), with p0 along the probe's axis as scan() takes it: the
 * distance from p0 to the edge of the solid part of its tile, negative when p0 is inside it. An empty tile
 * gives the distance to the next tile along `step` and a full one to the tile before it.
 */
export function tileScan(terrain, p0, p1, layer, step, probe) {
  const v = probe(terrain, p0, p1, layer).v, r = p0 & 7;
  if (v === 0) return step > 0 ? 8 - r : r + 1;
  if (v === 8) return step > 0 ? -1 - r : r - 8;
  return v > 0 ? v - 1 - r : v + r;
}

/**
 * The one-tile floor probe (sub_801F100 and sub_801F07C, scanning down): the distance from (x, y) to the
 * floor within the tile holding y, ≤ 0 at or inside it. An empty tile sends it on to the next tile down and a
 * full one up into the tile above, so whatever uses it moves at most 8 px a frame. With `dir` negative it
 * scans up, as the rings falling up do: only the empty and full tiles answer differently.
 */
export const tileFloor = (terrain, x, y, layer, dir = 8) => tileScan(terrain, y, x, layer, dir, vertical);

/**
 * The one-tile probe along either axis and either way (sub_801F07C): the distance from p0 to the surface within
 * the tile holding p0, negative inside it, with the tile's angle (undefined in an empty tile). Its arguments are
 * scan()'s.
 */
export function probeTile(terrain, p0, p1, layer, step, probe) {
  const { v, rot } = probe(terrain, p0, p1, layer), r = p0 & 7;
  if (v === 0) return { d: step > 0 ? 8 - r : r + 1, rot: undefined };
  if (v === 8) return { d: step > 0 ? -1 - r : r - 8, rot };
  return { d: v > 0 ? v - 1 - r : v + r, rot };
}

/** True when the pixel (px, py) is inside the solid part of its column, by the floor heights. */
export function solidPixel(terrain, px, py, layer) {
  const v = terrain.columnHeight(px, py, layer), row = py & 7;
  if (v === 0) return false;
  return v > 0 ? row >= (v & 7) : row < -v;
}
