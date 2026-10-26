// Secret Base act 1's spotlights (SAT-R decompilation, src/game/shared/stage/spot_lights_manager.c and
// spot_light_beam_task.c; Task_SpotlightBeam ported from its SA1 asm, sa1_Task_SpotlightBeam.inc, and the
// triangles it draws from src/bg_triangles.c). The act starts dark, with two beams of light sweeping across
// the screen: windows 0 and 1, whose left and right edges the beams set line by line, keep out the brightness
// decrease that darkens everything else but the backdrop. The darkness eases from 16 sixteenths to 8, a
// quarter a frame. Once Sonic is past x 1368 it eases off to nothing; past x 1488, or when he dies, the
// spotlights go at once. They are made only while his checkpoint is at or before x 1368.
//
// The game keeps the edges in a table with an entry of 4 bytes for each screen line, WIN0H's then WIN1H's,
// each its right edge then its left, which the HBlank DMA copies into the two registers. A frame writes one of
// two such tables (gBgOffsetsBuffer) while the other is shown. A beam leaves its half of the lines and WIN0V or
// WIN1V as they were on the frames it doesn't draw, and lines past the 160th run into the other table, or,
// past the second, into the sprite palette that follows it in memory: the right beam's 160th line of the
// second table ends up in Sonic's colour 1, his outline, on the frames the screen gets the sprite palette
// (an original-game bug).

import { SINE } from './trig.js';

export const SPOTLIGHTS_FADE_X = 1368, SPOTLIGHTS_GONE_X = 1488;
const MIN_BLEND = 8 * 256;   // Q_MIN_BLEND, 8.8
const TABLE = 160 * 4;

const s16 = v => (v << 16) >> 16;
// the BIOS's Div, as mGBA's BIOS emulation answers a division by zero
const div = (a, b) => (b === 0 ? (a < 0 ? -1 : 1) : Math.trunc(a / b));
// the tangent of an angle (0–1023 per turn), 8.8, from the sine table's 8.8 values
const tan = a => div((SINE[a] >> 6) << 8, SINE[a + 256] >> 6);
const mul8 = (a, b) => Math.imul(s16(a), b) >> 8;

// a writer of window `half`'s edges into the table at `base`: put(line, 0, v) its right edge, put(line, 1, v)
// its left; past both tables it writes over Sonic's colours (game.js, spriteRow)
function writer(buf, base, half, row) {
  return (line, k, v) => {
    const at = base + line * 4 + half * 2 + k;
    if (at >= 0 && at < buf.length) buf[at] = v & 0xFF;
    else if (at >= buf.length && at < buf.length + 32) {
      row.bytes[at - buf.length] = v & 0xFF;
      row.written |= 1 << ((at - buf.length) >> 1);
    }
  };
}

// One edge of window `half` along the line from (x0, y0) down to (x1, y1), the other edge `other` (sub_8006228,
// with the line as the right edge, and sub_80064A8, as the left), from line y0 on.
function edge(put, x0, y0, x1, y1, other, right) {
  const dx = s16(x1 - x0), dy = s16(y1 - y0);
  const ex = s16(Math.abs(dx) * 2), ey = s16(Math.abs(dy) * 2);
  let line = y0, x = x0;
  // what goes in each byte: the line's x in one, the other edge in the other
  const v0 = () => (right ? x : other), v1 = () => (right ? other : x);
  if (Math.abs(dx) > Math.abs(dy)) {
    let e = s16(-dx);
    const [first, last] = dx > 0 ? [1, 0] : [0, 1];
    const v = k => (k === 0 ? v0() : v1());
    put(line, first, v(first));
    for (let i = 0; i < Math.abs(dx); i++) {
      x = (x + (dx > 0 ? 1 : -1)) & 0xFF;
      e = s16(e + ey);
      if (e >= 0) { e = s16(e - ex); put(line, last, v(last)); line++; put(line, first, v(first)); }
    }
    put(line, last, v(last));
  } else {
    let e = s16(-dy);
    for (let i = 0; i < Math.abs(dy); i++) {
      put(line, 0, right ? x + 1 : other); put(line, 1, v1());
      line++;
      e = s16(e + ex);
      if (e >= 0) { x = (x + (dx > 0 ? 1 : -1)) & 0xFF; e = s16(e - ey); }
    }
  }
}

// The beam as a triangle (sub_800724C): its two sides start at (p[0], p[1]) and (p[4], p[5]), where they
// leave the screen at its top or its left or right edge, and run down to (p[2], p[3]) and (p[6], p[7]). From
// the higher start to the lower, the window runs from one side to the screen's edge, then between the sides.
function triangle(put, p) {
  let line = Math.min(p[1], p[5]), end = Math.max(p[1], p[5]);
  const d0 = s16(p[2] - p[0]), d1 = s16(p[6] - p[4]);
  const e0x = s16(Math.abs(d0) * 2), e0y = s16(Math.abs(s16(p[3] - p[1])) * 2);
  const e1x = s16(Math.abs(d1) * 2), e1y = s16(Math.abs(s16(p[7] - p[5])) * 2);
  let x0 = p[0], x1 = p[4];
  let a = s16(-s16(p[3] - p[1])), b = s16(-s16(p[7] - p[5]));
  // a side that doesn't go down would never end its line on the GBA, which hangs; here it just stops
  const side0 = () => {
    while (a >= 0 && e0y) {
      x0 = (x0 + (d0 > 0 ? 1 : -1)) & 0xFF;
      a = s16(a - e0y);
      if (d0 <= 0 && a >= 0) put(line, 1, x0);
    }
  };
  const side1 = () => {
    while (b >= 0 && e1y) {
      x1 = (x1 + (d1 > 0 ? 1 : -1)) & 0xFF;
      b = s16(b - e1y);
      if (d1 > 0 && b >= 0) put(line, 0, x1 + 1);
    }
  };
  if (line !== end && p[1] < p[5]) {
    for (; line < end; line++) {
      put(line, 0, 240); put(line, 1, x0);
      a = s16(a + e0x);
      side0();
    }
  } else {
    for (; line < end; line++) {
      put(line, 0, x1); put(line, 1, 0);
      b = s16(b + e1x);
      side1();
    }
  }
  end = Math.min(p[3], p[7]);
  for (; line < end; line++) {
    put(line, 0, x1); put(line, 1, x0);
    a = s16(a + e0x); b = s16(b + e1x);
    side0();
    side1();
  }
}

// One beam's frame (Task_SpotlightBeam). `b` is { swing (unk0), accel (unk2), speed (unk4), x (unk6),
// y (unk8), half (bg & 1), spread (unkB) }, the point (x, y) below the screen it shines from and the angle it
// swings to; it writes its half of the table and its WIN0V or WIN1V into `blend`, and what runs past the
// tables into Sonic's palette row `row`.
function beamStep(b, blend, row) {
  b.speed = s16(b.swing <= 0x1FF ? b.speed - b.accel : b.accel + b.speed);
  b.swing = ((b.speed >> 8) + b.swing) & 0x3FF;
  const a = (b.swing + b.spread) & 0x3FF;
  if (SINE[a + 256] === 0) return;
  // where each side meets the top of the screen: [x, 0], or, past the left or the right edge, that edge's x
  // and the y where it crosses it
  const side = (x, angle) => {
    if (x > 0 && x <= 239) return [x, 0];
    const t = (angle > 0xFF ? angle - 0x300 : 0x100 - angle) & 0x3FF;
    return [x <= 0 ? 0 : 240, s16(b.y - mul8(tan(t), x <= 0 ? b.x : 240 - b.x))];
  };
  const p = new Uint8Array(8);
  const s10 = side(s16(b.x - mul8(tan(a), b.y)), a);
  p[0] = s10[0]; p[1] = s10[1];
  p[2] = (b.x & 0xFF) - mul8(tan(a), b.y - 160);
  p[3] = 160;
  const c = (0x400 - (b.swing - b.spread)) & 0x3FF;
  const s14 = side(s16(mul8(tan(c), b.y) + b.x), c);
  p[4] = s14[0]; p[5] = s14[1];
  p[6] = mul8(tan(c), b.y - 160) + (b.x & 0xFF);
  p[7] = 160;
  const put = writer(blend.buf, blend.base, b.half, row);
  // the whole wedge, for the widescreen view, kept with the table it is drawn into
  const shape = { x: b.x, y: b.y, a, c };
  if (b.swing <= 0x1FF) {
    if (s14[1] > 159) return;
    blend.v[b.half] = (p[5] << 8) | 160;
    blend.drawn = true;
    blend.shapes[blend.base ? 1 : 0][b.half] = shape;
    if (s10[1] > 159) edge(put, p[4], p[5], p[6], p[7], 0, true);
    else triangle(put, p);
  } else {
    if (s10[1] > 159) return;
    blend.v[b.half] = (p[1] << 8) | 160;
    blend.drawn = true;
    blend.shapes[blend.base ? 1 : 0][b.half] = shape;
    if (s14[1] > 159) edge(put, p[0], p[1], p[2], p[3], 0, false);
    else triangle(put, p);
  }
}

/**
 * Where a beam's wedge `shape` ({ x, y, a, c }: the point it shines from and its sides' angles) is lit on screen
 * line `line`, which may be above or below the screen, as [from, to) in the screen's columns, which may be past
 * its edges: the same sides the beam draws its table from, carried on past the screen.
 */
export function beamSpan({ x, y, a, c }, line) {
  if (line >= y) return [0, 0];
  return [x - mul8(tan(a), y - line), mul8(tan(c), y - line) + x];
}

/**
 * The spotlights' manager and its two beams: `tasks`, to run at the objects' priority in that order, and
 * `blend`, what the renderer reads of them while they last (null once they're gone): { bldY, windows,
 * v: [WIN0V, WIN1V], h: [WIN0H, WIN1H], buf, base, drawn, shapes }. `buf` holds both tables and `base` is where
 * the one shown starts, used when a beam drew this frame (`drawn`); `h` is what the windows show otherwise.
 * `shapes` holds, for each table and window, the wedge of the beam that last drew there (beamSpan), or null.
 * `spriteRow` is Sonic's row of the sprite palette (game.js).
 */
export function createSpotlights(spriteRow) {
  const out = {
    // the window registers as the title card's fade leaves them when it is made (as mGBA shows them)
    blend: { bldY: 16, windows: false, v: [0x00A0, 0x00A0], h: [0x00F0, 0x00F0], buf: new Uint8Array(2 * TABLE), base: 0, drawn: false,
      shapes: [[null, null], [null, null]] },
    tasks: [],
  };
  const { blend } = out;
  let qBlend = 2 * MIN_BLEND, fading = false;
  const beams = [
    { swing: 0, accel: 0x40, speed: 0x800, x: 60, y: 200, half: 0, spread: 0x20 },
    { swing: 0, accel: 8, speed: 0x400, x: 200, y: 240, half: 1, spread: 0x10 },
  ];
  // TaskDestructor_SpotlightsManager clears the windows and the blend
  const gone = () => { out.blend = null; return false; };
  const manager = {
    run(ctx) {
      blend.base = blend.base ? 0 : TABLE; blend.drawn = false;
      const x = Math.floor(ctx.player.x);
      if (fading) {
        // Task_801796C
        qBlend = s16(qBlend - 64);
        if (qBlend < 0 || x > SPOTLIGHTS_GONE_X || ctx.player.dead) return gone();
        blend.bldY = qBlend >> 8;
        return true;
      }
      blend.windows = true;
      qBlend = Math.max(s16(qBlend - 64), MIN_BLEND);
      blend.bldY = qBlend >> 8;
      if (x > SPOTLIGHTS_FADE_X) fading = true;
      else if (ctx.player.dead) return gone();
      return true;
    },
  };
  out.tasks.push(manager, ...beams.map(b => ({
    run() {
      if (!out.blend) return false;
      beamStep(b, blend, spriteRow);
      return true;
    },
  })));
  return out;
}
