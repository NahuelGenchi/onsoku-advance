// Neo Green Hill's half-pipe (SAT-R decompilation, src/game/sa1/stage/interactables/half_pipe.c), a dip in
// the art with no floor under it. Its start (kind 28) on the left and its end (kind 29), 672 px past the
// start's box, are boxes on flat ground, d0 and d1 tiles from the entity, d2 by d3 tiles big. Running into
// the start to the right faster than 2.25 px a frame, or into the end to the left, without a B move, marks
// Sonic as on the half-pipe; past the box, the half-pipe then lifts him off the ground each frame, by at most
// 6 px, to a height on a curve that rises from 0 to the middle and back, at most 96 px up, lower the slower
// he goes. His walk becomes one of three half-pipe states by the height. He lets go when he slows below
// 2.25 px a frame, jumps, or lands. The start looks 800 px back and the end 800 px ahead before they leave.

import { SINE } from './trig.js';

export const HALF_PIPE_START = 28, HALF_PIPE_END = 29;
const WIDTH = 0x2A0;     // 672 px from the start's box to the end's
const MIN_SPEED = 0x240; // 2.25 px a frame
const STEP = 0x600;      // at most 6 px a frame up or down
const WALKS = new Set(['walk', 'halfPipeLow', 'halfPipeMid', 'halfPipeHigh']);

const s8 = v => (v << 24) >> 24, s16 = v => (v << 16) >> 16;
const q8 = v => Math.round(v * 256);

// how high the half-pipe holds him, in 1/256 px, at `along` px across it: higher the faster he goes, up to
// 2.25 px a frame over the slowest, on a curve of the cosine (0 at either side, 96 px in the middle)
function height(p, along) {
  if (along >>> 0 > WIDTH - 1) return 0;
  const v = Math.min(Math.max(((Math.abs(s16(q8(p.xsp))) - MIN_SPEED) << 14) >> 16, 0), 256);
  const fast = Math.min(SINE[v] >> 6, 256);
  const turn = ((Math.trunc((along < WIDTH / 2 ? along : along - WIDTH) * 32768 / 0x150) << 16) >>> 22) + 256;
  return (((-SINE[turn] * 3) >> 2) + 0x3000) * fast >> 8;
}

// sub_804D4A0: from the feet he had when he ran in, up to the height, and on the ground
function lift(p, along, feet) {
  const h = height(p, along);
  if (!p.curled && p.attack === 0 && WALKS.has(p.state)) {
    p.state = h < 0x800 ? 'walk' : h < 0x1800 ? 'halfPipeLow' : h < 0x3000 ? 'halfPipeMid' : 'halfPipeHigh';
  }
  p.air = false; p.ysp = 0;
  const y = q8(p.y), d = Math.min(Math.max(feet - h - (s8(p.offsetY) << 8) - y, -STEP), STEP);
  p.y = (y + d) / 256;
}

/** The task for a half-pipe entity, or null when `e` is not one. */
export function createHalfPipe(e, slot) {
  if (e.kind !== HALF_PIPE_START && e.kind !== HALF_PIPE_END) return null;
  const start = e.kind === HALF_PIPE_START, dir = start ? 1 : -1;
  const left = e.x + s8(e.d[0]) * 8, top = e.y + s8(e.d[1]) * 8, right = left + e.d[2] * 8, bottom = top + e.d[3] * 8;
  // Task_HalfPipeStart sees further back and Task_HalfPipeEnd further ahead
  const out = cam => e.x > cam.x + (start ? 368 : 1040) || e.x < cam.x - (start ? 800 : 128) || e.y > cam.y + 288 || e.y < cam.y - 128;
  let feet = 0;   // qOffsetY: where his feet were when he ran in
  return {
    run(ctx) {
      const p = ctx.player;
      if (out(ctx.cam)) { p.halfPipe = false; slot.live = null; return false; }
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (x >= left && x < right && y >= top && y < bottom) {
        p.halfPipe = q8(p.xsp) * dir > MIN_SPEED && !p.air && p.attack === 0;
        if (p.halfPipe) feet = q8(p.y) + (s8(p.offsetY) << 8);
      } else if (p.halfPipe && (start ? x >= right : x < left)) {
        if (p.dead) return true;
        const v = s16(q8(p.xsp) + MIN_SPEED - 1);
        if ((v >= 0 && v < 2 * MIN_SPEED - 1) || p.jumpPressed) {
          p.halfPipe = false;
          if (p.state.startsWith('halfPipe')) p.state = 'walk';
        } else if (q8(p.xsp) * dir >= MIN_SPEED) lift(p, start ? x - right : x - left + WIDTH, feet);
      }
      return true;
    },
  };
}
