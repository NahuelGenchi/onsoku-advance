// The act's results (SAT-R decompilation, src/game/sa1/ui/stage_results.c: CreateStageResults, Task_8057888
// and the four tasks it runs), as they come after the goal in single player. They play the act-clear jingle,
// switch the music manager off, and put up a white band with "SONIC GOT THROUGH ACT 1" scrolling along it, then
// the time bonus and the ring bonus, each label's letters and figures growing in one by one. From the 182nd
// frame both bonuses count down 100 a frame into the score, with a tick every fourth frame of the stage clock and
// a chime at the end, when the camera stops and Sonic, off the right of the screen, is stopped too. A while
// later the texts slide away and the screen fades to black, all but the band, and 45 frames into the fade the
// next act starts.

import { SONG } from '../sound/songs.js';

const div = (a, b) => Math.trunc(a / b);   // the BIOS's Div rounds toward zero
const s16 = v => (v << 16) >> 16;

const TIME = (m, s) => (m * 60 + s) * 60;
// the time bonus by the course time (CreateStageResults)
const TIME_BONUS = [[TIME(6, 0), 0], [TIME(5, 0), 500], [TIME(4, 0), 1000], [TIME(3, 0), 2000], [TIME(2, 0), 3000],
  [TIME(1, 30), 4000], [TIME(1, 0), 5000], [TIME(0, 50), 10000], [TIME(0, 30), 50000]];
const TOP_TIME_BONUS = 80000;
const MATRICES_UNTIL = 135, TALLY_FROM = 181, FADE_AFTER = 240, SLIDE_AFTER = 230, NEXT_ACT_AFTER = 45;
const STEP = 100;
const LABEL = 11, BLANK = 0x2B - 32;   // a label's glyphs, then five places for the figure, leading zeros blank
const FADE_FULL = 0x2000;

// a text task's piece (StrcStgResults_34): `x`, `y` and `count` are qUnkA, unkC and unkE, `shift` unk1E,
// `order` its OAM order
const piece = (x, y, count, order, extra = {}) => ({ x, y, count, order, shift: 0, ...extra });

// the bonus's figure under its label, as its task rewrites it: sixteen places, the label over the first eleven,
// and the figure's leading zeros (but the last place) blank
function figure(label, value) {
  const text = [];
  for (let i = 15; i >= 0; i--) { text[i] = value % 10; value = div(value, 10); }
  for (let i = LABEL; i < 15 && text[i] === 0; i++) text[i] = BLANK;
  for (let i = 0; i < LABEL; i++) text[i] = label[i];
  return text;
}

/**
 * The results for an act finished with `rings` rings at course time `courseTime`, on `level` (0 is Neo Green
 * Hill act 1). `gfx` is the extractor's results: each slot's sprite size, and the texts.
 */
export function createResults(gfx, { rings, courseTime, level }) {
  const ringBonus = STEP * rings, timeBonus = TIME_BONUS.find(([t]) => courseTime >= t)?.[1] ?? TOP_TIME_BONUS;
  const wait = div(Math.max(ringBonus, timeBonus), STEP) + 75;   // sp10
  return {
    level, gfx, wait,
    frame: 0,                // unk24
    ring: ringBonus,         // unk2C
    time: timeBonus,         // unk30
    countdown: NEXT_ACT_AFTER,   // unk34
    fade: { level: 0, speed: 0x100, bldY: 0 },
    pieces: {
      band: piece(240, 126, 8, 1),
      line: piece(256, 128, 9, 0),
      ring: piece(256, 102, 16, 0, { value: ringBonus, label: gfx.text.ring, text: figure(gfx.text.ring, ringBonus), after: 90 }),
      time: piece(256, 80, 16, 0, { value: timeBonus, label: gfx.text.time, text: figure(gfx.text.time, timeBonus), after: 60 }),
    },
    sprites: [],   // this frame's OAM entries: { slot, glyph, a0, a1, x, y, order, matrix }
  };
}

// sub_8052F78 (semi-transparent) and sub_80530CC: `count` sprites of `slot` showing `text` from its `from`th
// glyph, in a row from (x, y). Like the title card's, each keeps where it is before OAM wraps it.
function put(r, slot, text, from, x, y, count, order, semi = false) {
  const { shape, size, w } = r.gfx.slots[slot];
  const a0 = ((shape << 14) + (y & 0xFF) + (semi ? 0x400 : 0)) & 0xFFFF;
  let a1 = (size << 14) + (x & 0x1FF);
  for (let i = 0; i < count; i++, a1 += w) {
    r.sprites.push({ slot, glyph: text[from + i], a0, a1: a1 & 0xFFFF, x: s16(x) + w * i, y: (y << 23) >> 23, order });
  }
}

// sub_8052E40: one glyph through the rotation hardware, double size, with matrix `matrix` (20 to 31, which
// Task_8057888 squashes to 1/12 to 11/12 of the glyph's height); its box is twice the glyph's size
function putAffine(r, slot, glyph, x, y, matrix, order) {
  const { shape, size } = r.gfx.slots[slot];
  const a0 = ((shape << 14) + (3 << 8) + (y & 0x1FF)) & 0xFFFF, a1 = ((size << 14) + (matrix << 9) + x) & 0xFFFF;
  r.sprites.push({ slot, glyph, a0, a1, x, y, order, matrix });
}

// Task_8057B74: the band slides in from the right along the bottom 26 px a frame, rises 6 px a frame to y 42,
// and (on a zone's second act) slides out to the left; semi-transparent once the fade starts
function band(r, p, k) {
  if (k > r.wait + SLIDE_AFTER) {
    if (r.level & 1 || r.level > 11) {
      if (p.x < -32) { p.x = s16(p.x + 32); if (p.count !== 0) p.count = s16(p.count - 1); }
      p.x = s16(p.x - 26);
    }
  } else if (k >= 50) { p.count = 9; p.y = 42; }
  else if (k >= 36) p.y = s16(p.y - 6);
  else if (k >= 26) p.x = -16;
  else if (k >= 16) { p.x = s16(p.x - 26); if (p.x < -16) p.x = -16; }
  put(r, 'band', r.gfx.text.band, 0, p.x, p.y, p.count, p.order, k > r.wait + FADE_AFTER);
}

// Task_8057C3C: the line comes in from the right 28 px a frame on top of the band, rises with it and scrolls
// left 2 px a frame, a glyph on every 32 px; it leaves to the left 28 px a frame, a sprite fewer every 32 px
function line(r, p, k) {
  const draw = () => put(r, 'line', r.gfx.text.line, p.shift, p.x, p.y, p.count, p.order);
  const wrap = () => { p.x = s16(p.x + 32); p.shift = (p.shift + 1) % 8; };
  if (k > r.wait + SLIDE_AFTER) {
    p.x = s16(p.x - 28);
    if (p.x < -31) { if (p.count !== 0) p.count = s16(p.count - 1); wrap(); }
    draw();
  } else if (k >= 50) {
    p.y = 44; p.x = s16(p.x - 2);
    if (p.x < -31) wrap();
    draw();
  } else if (k >= 36) {
    p.y = s16(p.y - 6); p.x = s16(p.x - 2);
    if (p.x < -31) wrap();
    draw();
  } else if (k >= 26) {
    p.x = s16(p.x - 2); p.count = 9;
    if (p.x < -31) wrap();
    draw();
  } else if (k >= 16) {
    p.x = s16(p.x - 28);
    if (p.x < 240) {
      p.count = 9 - (p.x >> 5);
      if (p.x < -31) wrap();
      draw();
    }
  }
}

// Task_8057D30 (the ring bonus, `y` 102, from frame 90) and Task_805803C (the time bonus, `y` 80, from frame
// 60): two frames apart, each of the label's letters and then the figure's digits grows in through the
// rotation hardware over 12 frames (11 for the time bonus) and stays; the figure follows the count from frame
// 134; once the band is up they leave to the left 28 px a frame
function bonus(r, p, k, ring) {
  const y = p.y, step = k > p.after ? k - p.after : 0, last = ring ? 12 : 11;
  if (k > 133) p.text = figure(p.label, p.value);
  const out = k > r.wait + SLIDE_AFTER ? s16((k - SLIDE_AFTER - r.wait) * 28) : 0;
  const t = p.text;
  if (step > (ring ? 150 : 180)) {
    const x = s16(50 - out);
    if (x >= -80) put(r, 'letters', t, 0, x, y, 10, p.order);
    for (let i = LABEL; i < 16; i++) {
      const dx = s16(i * 8 - (out - 50));
      if (t[i] !== BLANK && dx >= -8) put(r, 'digits', t, i, dx, y, 1, p.order);
    }
  } else if (step > 44) {
    put(r, 'letters', t, 0, 50, y, 10, p.order);
    let i = LABEL;
    while (i < 15 && t[i] === BLANK) i++;
    put(r, 'digits', t, i, s16(i * 8 + 50), y, 16 - i, p.order);
  } else {
    const shown = Math.min(16, div(step, 2) & 0xFF);
    if (shown === 0) return;
    let done = 0;
    for (let i = 0; i < shown; i++) {
      const age = step - i * 2;
      if (age > last) { done++; continue; }
      if (i >= LABEL && t[i] === BLANK) continue;
      const gy = div(0x100 - age * 21, 35) + y - 8;
      const matrix = ring && age === 12 ? 31 : age + 20;
      putAffine(r, i < LABEL ? 'letters' : 'digits', t[i], i * 8 + 46, gy, matrix, p.order);
    }
    if (done > LABEL) {
      let i = LABEL;
      while (i < 15 && t[i] === BLANK) i++;
      put(r, 'digits', t, i, i * 8 + 50, y, done - i, p.order);
      done = LABEL;
    }
    put(r, 'letters', t, 0, 50, y, done, p.order);
  }
}

// sub_805423C as the results set it up: window 0 over the whole screen and the brightness decrease on every
// layer, by level / 256 / 2 sixteenths, then the level rises by `speed`
function fadeOut(fade) {
  fade.bldY = Math.min(32, fade.level >> 8) >> 1;
  fade.level = Math.min(FADE_FULL, fade.level + fade.speed);
}

/**
 * Runs the results' main task (Task_8057888) and then its four pieces' for one frame. `world` gives the
 * stage: { player, camera, stageTime, addScore(n), playSound(song) }. Returns false on the frame the next act
 * starts, with the last frame's sprites left as they were.
 */
export function runResults(r, world) {
  const k = r.frame;   // what the pieces see this frame (unk1C)
  let next = false;
  if (k >= TALLY_FROM) {
    if (r.ring !== 0 || r.time !== 0) {
      if (r.ring !== 0) { r.ring -= STEP; world.addScore(STEP); r.pieces.ring.value = r.ring; }
      if (r.time !== 0) { r.time -= STEP; world.addScore(STEP); r.pieces.time.value = r.time; }
      if (r.ring === 0 && r.time === 0) {
        if (!(r.level & 1)) world.player.actClear = false;
        world.camera.speedX = 0; world.camera.speedY = 0;
        r.countdown = NEXT_ACT_AFTER;
        world.playSound(SONG.RESULTS_DONE);
      } else if (world.stageTime % 4 === 0) world.playSound(SONG.RESULTS_COUNT);
    } else {
      // the bonuses counted: the camera stays, and Sonic stops once he is off the right of the screen
      const p = world.player, cam = world.camera;
      cam.speedX = 0; cam.speedY = 0;
      if (((Math.floor(p.x) - Math.floor(cam.x) + 64) >>> 0) > 368) { p.xsp = 0; p.gsp = 0; }
      if (k > r.wait + FADE_AFTER) {
        fadeOut(r.fade);
        if (r.countdown === 0 || --r.countdown === 0) { r.countdown = 0; next = true; }
      }
    }
  }
  if (next) return false;   // the screen keeps the last frame's
  r.sprites = [];
  r.frame++;
  const { band: b, line: l, ring, time } = r.pieces;
  band(r, b, k); line(r, l, k); bonus(r, ring, k, true); bonus(r, time, k, false);
  return true;
}
