// The Sonic Rush boost's effects, run and placed the way Sonic Rush (Nintendo DS) runs and places them, from
// the art in the player's own Sonic Rush ROM (src/rom/rush.js):
// - the burst (animation 5 of act/ac_eff_boost.bac) where Sonic was when the boost started, turned to his
//   angle and drawn twice, the second time upside down, until its animation ends;
// - the aura (animation 4) on Sonic while he boosts, turned the way he moves;
// - the trail, a ribbon of ten translucent polygons through where he was over the last frames, 24 px tall,
//   fading toward its end, which shrinks away once the boost ends.
// Positions are Rush's: 24.8 fixed point (1/256 px). Angles are 256 steps per turn, as Sonic Advance's are. The
// renderer draws the OAM entries and the polygons these give the DS's way.

const TRAIL_NODES = 11, TRAIL_LENGTH = 10;
const TRAIL_HALF = (24 << 8) >> 1;                     // half the ribbon's height, 12 px
const TRAIL_ALPHA = { head: 6, peak: 18, end: 1 };     // its alphas (of 31) at its start, a third along and at its end
const TRAIL_PEAK = { num: 3, den: 10 };
export const TRAIL_COLOR = 0x7CA5;                    // its colour, 15-bit BGR (40, 40, 248)
const OBJ_INV = 3898;                                  // FX_Inv(0x10D0): the sprites are drawn 1/0x10D0 bigger

// FX_SinCosTable_ (4096 steps per turn, 4.12) and the arctangent table FX_Atan2Idx reads (128 steps of 1/128)
const SIN = Int16Array.from({ length: 4096 }, (_, i) => Math.round(Math.sin((2 * Math.PI * i) / 4096) * 4096));
const sin = i => SIN[i & 4095], cos = i => SIN[(i + 1024) & 4095];
const ATAN = Int16Array.from({ length: 128 }, (_, i) => Math.round((Math.atan(i / 128) * 32768) / Math.PI));

// FX_Div of two positive values below 2^20: a / b in 4.12, rounded to nearest
const fxDiv = (a, b) => Math.floor((Math.floor((a * 2 ** 32) / b) + 0x80000) / 2 ** 20);

/** FX_Atan2Idx(y, x): the angle of (x, y), 65536 steps per turn, from the octant and the table. */
export function atan2Idx(y, x) {
  let small, big, base, add;
  if (y > 0) {
    if (x > 0) {
      if (x > y) [small, big, base, add] = [y, x, 0, true];
      else if (x < y) [small, big, base, add] = [x, y, 0x4000, false];
      else return 0x2000;
    } else if (x < 0) {
      x = -x;
      if (x < y) [small, big, base, add] = [x, y, 0x4000, true];
      else if (x > y) [small, big, base, add] = [y, x, 0x8000, false];
      else return 0x6000;
    } else return 0x4000;
  } else if (y < 0) {
    const ny = -y;
    if (x < 0) {
      x = -x;
      if (x > ny) [small, big, base, add] = [ny, x, -0x8000, true];
      else if (x < ny) [small, big, base, add] = [x, ny, -0x4000, false];
      else return 0xA000;
    } else if (x > 0) {
      if (x < ny) [small, big, base, add] = [x, ny, -0x4000, true];
      else if (x > ny) [small, big, base, add] = [ny, x, 0, false];
      else return 0xE000;
    } else return 0xC000;
  } else return x >= 0 ? 0 : 0x8000;
  if (big === 0) return 0;
  const t = ATAN[fxDiv(small, big) >> 5];
  return (add ? base + t : base - t) & 0xFFFF;
}

// the ARM's division routine as Rush calls it: truncated, and a division by 0 gives the dividend back
const div = (a, b) => (b === 0 ? a : Math.trunc(a / b));
const floorShift = (v, n) => Math.floor(v / 2 ** n);

// Sprite__Animate stepping one frame: a frame shows for its length, then the next; past the last one an
// animation with its loop flag goes back to its loop frame and one without stops there
function advance(a, anim, loops) {
  if (a.frozen) return;
  if (a.remain > 0) {
    if (--a.remain > 0) return;
    if (a.i === anim.frames.length - 1) {
      if (!loops) { a.frozen = true; return; }
      a.i = anim.loop;
    } else a.i++;
  }
  a.remain = anim.frames[a.i].duration;
}

/** The effects' state for an act: everything below keeps to it. */
export function createRushFx() {
  return { list: [], prevX: null, prevY: null };
}

const q = v => Math.round(v * 256);

// Sonic's angle as the effects read it (Rush's player angle byte): the one his sprite is turned by
function angleOf(p) {
  return p.state === 'walk' || p.state === 'bounce' ? p.rotation & 0xFF : 0;
}

// RecordPlayerTrailBuffer: the node's two ends, half the ribbon's height either side of him across the way he
// goes (MTX_RotZ33 and MTX_MultVec33 on (0, ±half, 0)); in the air the way he moved turns it further
function record(node, x, y, prevX, prevY, p) {
  const turn = p.air ? atan2Idx(floorShift(y - prevY, 8), floorShift(x - prevX, 8)) : 0;
  const idx = (((angleOf(p) << 8) + turn) & 0xFFFF) >> 4;
  const s = sin(idx), c = cos(idx);
  node.startX = x + floorShift(TRAIL_HALF * s, 12); node.startY = y + floorShift(-TRAIL_HALF * c, 12);
  node.endX = x + floorShift(-TRAIL_HALF * s, 12); node.endY = y + floorShift(TRAIL_HALF * c, 12);
}

/**
 * The boost's start (Rush's FUN_02346B10, after the player's state has turned him): a new trail, the burst
 * where he is and the aura on him, in that order, each after whatever is still running.
 */
export function startRushFx(fx, p) {
  const x = q(p.x), y = q(p.y);
  const nodes = Array.from({ length: TRAIL_NODES }, () => ({ startX: x, startY: y, endX: x, endY: y }));
  record(nodes[0], x, y, fx.prevX ?? x, fx.prevY ?? y, p);
  fx.list.push({ kind: 'trail', nodes, head: 0, count: 0, state: 'init' });
  fx.list.push({ kind: 'burst', x, y, angle: angleOf(p), flipX: p.facing > 0, anim: { i: 0, remain: 0, frozen: false } });
  fx.list.push({ kind: 'aura', x, y, angle: angleOf(p), anim: { i: 0, remain: 0, frozen: false } });
}

/**
 * One frame of the effects, after Sonic's: each runs its state in the order it started, and the sprites step
 * their animations as Rush's draw does. `boosting` is Rush's boost flag.
 */
export function stepRushFx(fx, p, art, boosting) {
  const x = q(p.x), y = q(p.y), prevX = fx.prevX ?? x, prevY = fx.prevY ?? y;
  fx.list = fx.list.filter(e => {
    if (e.kind === 'trail') {
      const push = () => {
        e.head = (e.head + 1) % TRAIL_NODES;
        record(e.nodes[e.head], x, y, prevX, prevY, p);
      };
      if (e.state === 'init') {
        if (!boosting) e.state = 'finish';
        else {
          push();
          if (++e.count >= TRAIL_LENGTH) e.state = 'active';
        }
        return true;
      }
      if (e.state === 'active') {
        push();
        if (!boosting) e.state = 'finish';
        return true;
      }
      if (boosting) return false;   // a new boost's trail takes over
      push();
      return --e.count > 0;
    }
    if (e.kind === 'burst') {
      if (e.done) return false;      // its animation ended last frame
      advance(e.anim, art.burst, false);
      e.done = e.anim.frozen;
      return true;
    }
    // the aura follows him and turns the way he moved this frame; it goes when the boost does
    if (!boosting) return false;
    e.x = x; e.y = y;
    const mx = x - prevX, my = y - prevY;
    e.angle = mx === 0 && my === 0 ? angleOf(p) : atan2Idx(my, mx) >> 8;
    if (e.angle === 0 && angleOf(p) === 0 && p.facing < 0) e.angle = 0x80;
    advance(e.anim, art.aura, true);
    return true;
  });
  fx.prevX = x; fx.prevY = y;
}

// FUN_02032480's matrices for one flip: its rotation scaled by ±k (x then y), MTX_ScaleApply22
function scaled(angle, sx, sy) {
  const i = angle << 4, c = cos(i), s = sin(i);
  return [floorShift(c * sx, 12), floorShift(s * sx, 12), floorShift(-s * sy, 12), floorShift(c * sy, 12)];
}

/**
 * The OAM entries one draw of a sprite effect writes (FUN_0206b768): with an angle, through the rotation
 * hardware in a double-size box (FUN_02032480), turned around the effect's position; without one, placed
 * as they are (FUN_02032d2c), flipped around it. Each entry: screen box (x, y, boxW, boxH), size (w, h), its
 * pixels and colours, and for a turned one the 8.8 matrix [pa, pb, pc, pd]. `cx`, `cy` is the camera.
 */
function entries(frame, ex, ey, angle, flipX, flipY, cx, cy, out) {
  const px = floorShift(ex, 8) - cx, py = floorShift(ey, 8) - cy;
  const [fcx, fcy] = frame.center, flip = (flipX ? 0x1000 : 0) | (flipY ? 0x2000 : 0);
  for (const o of frame.oam) {
    const { a0, a1, w, h } = o, f = (flip ^ a1) & 0x3000;
    const fx = !!(f & 0x1000), fy = !!(f & 0x2000);
    const lx = a1 & 0x1FF, ly = a0 & 0xFF;
    if (angle === 0) {
      out.push({ x: fx ? px + fcx - lx - w : lx + px - fcx, y: fy ? py + fcy - ly - h : ly + py - fcy,
        boxW: w, boxH: h, w, h, flipX: fx, flipY: fy, pixels: o.pixels, colors: frame.colors, matrix: null });
      continue;
    }
    const sx = fx ? -1 : 1, sy = fy ? -1 : 1;
    const [m0, m1, m2, m3] = scaled(angle, sx * 0x1000, sy * 0x1000);
    const X = (lx - fcx + (w >> 1)) * 4096, Y = (ly - fcy + (h >> 1)) * 4096;
    const sxp = px * 4096 - w * 0x800 + floorShift(m0 * X + 0x800, 12) + floorShift(m2 * Y + 0x800, 12) - w * 0x800;
    const syp = py * 4096 - h * 0x800 + floorShift(m1 * X + 0x800, 12) + floorShift(m3 * Y + 0x800, 12) - h * 0x800;
    const m = scaled(angle, sx * OBJ_INV, sy * OBJ_INV).map(v => v >> 4);
    out.push({ x: floorShift(sxp, 12), y: floorShift(syp, 12), boxW: w * 2, boxH: h * 2, w, h,
      pixels: o.pixels, colors: frame.colors, matrix: m });
  }
}

/** The OAM entries the sprite effects show this frame, front (the lowest OAM index) first. */
export function rushObjEntries(fx, art, cx, cy) {
  const out = [];
  for (const e of fx.list) {
    if (e.kind === 'burst') {
      const frame = art.burst.frames[e.anim.i];
      entries(frame, e.x, e.y, e.angle, e.flipX, false, cx, cy, out);
      entries(frame, e.x, e.y, e.angle, e.flipX, true, cx, cy, out);
    } else if (e.kind === 'aura') entries(art.aura.frames[e.anim.i], e.x, e.y, e.angle, true, false, cx, cy, out);
  }
  return out;
}

/**
 * The trail's polygons this frame (FUN_02326744), in the order it sends them: for each segment from the
 * newest node back, a triangle strip of its two nodes' ends in screen pixels, and its alpha (of 31).
 */
export function rushTrailStrips(fx, cx, cy) {
  const out = [];
  for (const e of fx.list) {
    if (e.kind !== 'trail') continue;
    const n = e.count, peak = div(n * TRAIL_PEAK.num, TRAIL_PEAK.den);
    const at = (k, end) => {
      const node = e.nodes[((k % TRAIL_NODES) + TRAIL_NODES) % TRAIL_NODES];
      return end ? [floorShift(node.endX, 8) - cx, floorShift(node.endY, 8) - cy] : [floorShift(node.startX, 8) - cx, floorShift(node.startY, 8) - cy];
    };
    for (let s = 0; s < n; s++) {
      const alpha = s > peak
        ? TRAIL_ALPHA.peak - div((TRAIL_ALPHA.peak - TRAIL_ALPHA.end) * (s - peak), n - peak)
        : TRAIL_ALPHA.head - div(s * (TRAIL_ALPHA.head - TRAIL_ALPHA.peak), peak);
      const cur = e.head - s, next = cur - 1;
      out.push({ alpha: alpha & 0x1F, vertices: [at(cur, false), at(cur, true), at(next, false), at(next, true)] });
    }
  }
  return out;
}
