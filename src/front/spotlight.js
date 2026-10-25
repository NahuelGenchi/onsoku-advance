// A spotlight's beam (SAT-R decompilation, src/game/shared/stage/spot_light_beam_task.c, CreateSpotlightBeamTask
// and Task_SpotlightBeam; the C there is Sonic Advance 2's, so this follows Sonic Advance's own code,
// asm/non_matching/game/shared/stage/sa1_Task_SpotlightBeam.inc). A beam is a window shaped like a wedge from a
// point below the screen, swinging back and forth: its angle swings one way while it is under half a turn and
// the other way past it, and its two edges are drawn into the window's sides a line at a time.

import { SINE } from '../engine/trig.js';
import { windowRight, windowLeft, windowBetween } from '../gba/lines.js';
import { FLAGS } from '../gba/engine.js';

const BEAM_PRIORITY = 0x2000;
const s16 = v => (v << 16) >> 16;

/** The BIOS's Div: rounded toward 0; a division by 0 gives ±1, as mGBA's BIOS does. */
export const div = (a, b) => (b === 0 ? (a < 0 ? -1 : 1) : Math.trunc(a / b));

// tan of a 1024-step angle in 8.8, from the sine table's 8.8 values
const tan = a => s16(div((SINE[a] >> 6) << 8, SINE[a + 0x100] >> 6));
// the angle an edge that leaves the screen's side is measured at
const sideAngle = a => (a > 0xFF ? a - 0x300 : 0x100 - a) & 0x3FF;

/**
 * CreateSpotlightBeamTask: `unk0` is the beam's angle (1024 a turn), `unk2` how fast its swing changes and
 * `unk4` the swing (8.8), (`unk6`, `unk8`) the point it comes from, `bg` which window it is (as the H-blank
 * effects number them: 2 is window 0's, 3 window 1's) and `unkB` how wide it is.
 */
export function createSpotlightBeam(e) {
  const beam = { e, unk0: 0, unk2: 64, unk4: 0x800, unk6: 120, unk8: 200, bg: 0, unkB: 32 };
  return e.createTask(spotlightBeam, beam, BEAM_PRIORITY, 0, () => { e.flags &= ~FLAGS.HBLANK_COPY; });
}

// where one edge of the beam, at angle `a`, meets the screen: [x, y] on its top or one of its sides
function edgeEnd(b, a, x) {
  if (x <= 0) return [0, s16(b.unk8 - ((b.unk6 * tan(sideAngle(a))) >> 8))];
  if (x > 0xEF) return [0xF0, s16(b.unk8 - (((0xF0 - b.unk6) * tan(sideAngle(a))) >> 8))];
  return [x, 0];
}

// Task_SpotlightBeam
function spotlightBeam(t) {
  const b = t.data, e = b.e;
  b.unk4 = s16((b.unk0 & 0xFFFF) > 0x1FF ? b.unk2 + b.unk4 : b.unk4 - b.unk2);
  b.unk0 = ((b.unk4 >> 8) + (b.unk0 & 0xFFFF)) & 0x3FF;
  const a0 = (b.unk0 + b.unkB) & 0x3FF;
  if (SINE[a0 + 0x100] === 0) return;
  // the edges as [x0, y0, x1, y1] where they meet the screen's top or side, then its bottom, as bytes
  const p = new Uint8Array(8);
  const [x0, y0] = edgeEnd(b, a0, s16(b.unk6 - ((b.unk8 * tan(a0)) >> 8)));
  p[0] = x0; p[1] = y0;
  p[2] = (b.unk6 & 0xFF) - (((b.unk8 - 0xA0) * tan(a0)) >> 8);
  p[3] = 0xA0;
  const a1 = (0x400 - ((b.unk0 & 0xFFFF) - b.unkB)) & 0x3FF;
  const [x1, y1] = edgeEnd(b, a1, s16(((b.unk8 * tan(a1)) >> 8) + (b.unk6 & 0xFFFF)));
  p[4] = x1; p[5] = y1;
  p[6] = (((b.unk8 - 0xA0) * tan(a1)) >> 8) + (b.unk6 & 0xFF);
  p[7] = 0xA0;
  const top = y => { e.winRegs[b.bg & 1 ? 3 : 2] = (y << 8) | 0xA0; };
  if ((b.unk0 & 0xFFFF) <= 0x1FF) {
    if (y1 > 0x9F) return;
    top(p[5]);
    if (y0 > 0x9F) windowRight(e, b.bg, p[4], p[5], p[6], p[7], 0);
    else windowBetween(e, b.bg, p);
  } else {
    if (y0 > 0x9F) return;
    top(p[1]);
    if (y1 > 0x9F) windowLeft(e, b.bg, p[0], p[1], p[2], p[3], 0);
    else windowBetween(e, b.bg, p);
  }
}
