// The UI's screen fade (SAT-R decompilation, src/game/sa1/stage/stage_ui.c: sub_80543A4 and sub_805423C, a
// StrcUi_805423C), on display registers the ending's renderer reads: `win0` and `win1` (the windows' lines,
// [top, bottom), or null when off), `winIn` and `winOut` (WININ and WINOUT), `bldCnt` and `bldY`.
//   - `mode` (unk4): 1 goes out to black, 2 comes in from black, 4 goes out to white, 8 comes in from white;
//   - `speed` (unk8) is added to the level (unk6, 0 to 0x2000) each frame, after `delay` (unk0) has run out;
//   - `targets` (unkA): 1 every layer and the backdrop, 0 the backgrounds only, and in sub_805423C 0x10 every
//     layer over the backdrop and 8 every layer and the backdrop without touching the alpha;
//   - `win1` (unk2) puts it in window 1 instead of window 0, over the whole screen.

export const TO_BLACK = 1, FROM_BLACK = 2, TO_WHITE = 4, FROM_WHITE = 8;
const FULL = 0x2000;

export function createFade({ delay = 0, win1 = false, mode, speed, targets }) {
  return { delay, win1, mode, level: 0, speed, targets };
}

// what both functions set: the window, the blend's targets and its brightness from the level
function registers(f, d, running) {
  if (f.targets & 1) d.bldCnt = 0x3F3F;
  else if (running && f.targets & 0x10) d.bldCnt = 0x203F;
  else if ((f.targets & 0xFF) === 0) d.bldCnt = 0x000F;
  else if (running && f.targets & 8) d.bldCnt = 0x3F3F;
  if (f.win1) { d.win1 = [0, 160]; d.winIn |= 0x3F00; } else { d.win0 = [0, 160]; d.winIn |= 0x3F; }
  d.winOut |= 0x1F;
  d.bldCnt |= f.mode & 0xC ? 0x80 : 0xC0;
  d.bldY = Math.min(f.mode & 5 ? f.level >> 8 : 32 - (f.level >> 8), 32) >> 1;
}

/** sub_80543A4: the registers for the fade's level, without moving it on. */
export function applyFade(f, d) { registers(f, d, false); }

/** sub_805423C: the registers, then the level moved on; true on the frame it reaches the end. */
export function runFade(f, d) {
  registers(f, d, true);
  if (f.delay) { f.delay = f.delay >= f.speed ? f.delay - f.speed : 0; return false; }
  f.level = Math.min(f.level + f.speed, FULL);
  return f.level === FULL;
}

/** Display registers with no window and no blend. */
export const plainDisplay = () => ({ win0: null, win1: null, winIn: 0, winOut: 0, bldCnt: 0, bldY: 0 });
