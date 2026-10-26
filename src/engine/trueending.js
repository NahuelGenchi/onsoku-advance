// The true ending (SAT-R decompilation, src/game/sa1/ui/extra_stage_results.c: CreateExtraStageResults and the
// tasks it starts, checked in the USA ROM), from the Super Egg Robo's fade to white to the staff credits. One
// main task counts the frames of each scene and runs the fades; the sprites' tasks after it read its count.
//   - The night scene: the earth seen from the moon, coming in from white, with the results' tally over it (on
//     its 30th frame, CreateStageResults, which says how long the scene lasts) and four twinkles in the sky as
//     the tally ends. A minute on the three layers start to slide down, and the scene fades to black.
//   - "A few days later" on black, for 600 frames.
//   - The Tornado in the sky, Tails at the controls, clouds drifting past and a sparkle crossing the sky; the
//     Tornado turns and flies off into the distance, and the scene fades out.
//   - Four pictures in turn, 400 frames each, fading in from black and out to it; the third's colours turn into
//     the fourth's, and three congratulation lines scroll up over the last one.
// Then the staff credits (`onCredits`).

import { SINE } from './trig.js';
import { makeSprite, startAnim, animate } from './objects.js';
import { EXTRA_SONG } from '../sound/songs.js';

const Q = v => Math.round(v * 256);
const I = v => v >> 8;
const div = (a, b) => Math.trunc(a / b);   // the BIOS's Div rounds toward zero
const SIN = a => SINE[a & 1023];

// StrcUi_805423C's modes: 8 comes in from white, 1 goes out to black, 2 comes in from black
const FROM_WHITE = 8, TO_BLACK = 1, FROM_BLACK = 2;
const FADE_SPEED = 0x80, FADE_FULL = 0x2000;
const FADE_FRAMES = FADE_FULL / FADE_SPEED;   // Div(0x2000, 0x80)

const RESULTS_AT = 30;          // sub_80684F4: CreateStageResults on the 30th frame
const NIGHT_FADE = 0x21C;       // the night scene fades out this long after the tally's end
const SCROLL_AFTER = 60;        // Task_8067F38: the night scene slides down from a second after the tally
const FEW_DAYS = 600, BLACK = FEW_DAYS + FADE_FRAMES;   // sub_8067928
const SKY = 0x336;              // Task_80679E4
const PICTURE = 400;            // Task_8067B14, Task_8067B9C, Task_8067C24 and Task_8067E68
const SKY_SCROLL = 0x128;
// Task_8067C24's colours turn from 0xB3 frames on, a step every 16 frames
const BLEND_FROM = 0xB3, BLEND_FRAMES = 0x80;
// Task_8066D64's lines: when each starts up from y 180 at 3 px a frame (gUnknown_0868B4BE), and the y it stops
// at (gUnknown_0868B4B8); Task_8067E68 counts them on from 0x14B
const LINE_FROM = [330, 480, 484], LINE_TO = [16, 128, 144], LINE_COUNT = 0x14B;
// the clouds (790–793): where each starts, Q 8 and its speed to the right, 8.8 px a frame
const CLOUDS = [['cloudXS', 80, 50, 0x80], ['cloudS', 40, 100, 0x40], ['cloudM', 120, 120, 0x100], ['cloudL', 160, 20, 0xC0]];
const TWINKLES = [[105, 17], [47, 95], [213, 69], [168, 95]];

// CreateStageResults' time bonus by the course time, and the frames its tally lasts: the larger bonus counted
// down 100 a frame, then 75 + 285 more
const TIME = (m, s) => (m * 60 + s) * 60;
const TIME_BONUS = [[TIME(6, 0), 0], [TIME(5, 0), 500], [TIME(4, 0), 1000], [TIME(3, 0), 2000], [TIME(2, 0), 3000],
  [TIME(1, 30), 4000], [TIME(1, 0), 5000], [TIME(0, 50), 10000], [TIME(0, 30), 50000]];
export function tallyLength(rings, courseTime) {
  const ring = 100 * rings, time = TIME_BONUS.find(([t]) => courseTime >= t)?.[1] ?? 80000;
  return div(Math.max(ring, time), 100) + 75 + 285;
}

/**
 * The ending after the Super Egg Robo, for `rings` and `courseTime` as the stage left them. `stageResults(r)`
 * is where the results' tally comes up (#69's, { rings, courseTime, level }); `onCredits()` is called on the
 * frame the staff credits take over. `step()` runs one frame; `state` is what endingrender.js draws.
 */
export function createTrueEnding(anims, sound, { rings = 0, courseTime = 0, stageResults = () => {}, onCredits = () => {} } = {}) {
  const fade = { mode: FROM_WHITE, level: 0 };
  // sub_80543A4 and sub_805423C: the brightness change across the whole screen (window 1), from `level`
  const display = { scene: 'night', brighten: true, bldY: 0, scroll: [0, 0, 0] };
  function applyFade() {
    display.brighten = (fade.mode & 0xC) !== 0;
    display.bldY = Math.min((fade.mode & 5 ? fade.level >> 8 : 32 - (fade.level >> 8)), 32) >> 1;
  }
  function runFade() {
    applyFade();
    fade.level = Math.min(fade.level + FADE_SPEED, FADE_FULL);
  }
  const resetFade = mode => { fade.mode = mode; fade.level = 0; };
  applyFade();
  sound.stopAll();

  const state = { display, sprites: [], phase: 'night', done: false };
  const show = (s, x, y, extra = {}) => {
    if (s.frame >= 0) state.sprites.push({ frame: s.frame, x, y, order: s.order, prio: s.prio, ...extra });
  };
  let count = 0, length = 60;   // unk38, and unk3C: the night scene's tally length, once the tally is up

  // the sprite tasks, in the order CreateExtraStageResults makes them; each has its own count (unk3C) and
  // `run`, which the main task changes from scene to scene (TaskDestroy is run = null)
  const task = (name, order, prio, fields = {}) => ({ s: makeSprite(name, { order, prio }), count: 0, run: null, ...fields });
  const sparkle = task('skySparkle', 3, 1, { qx: Q(160), qy: -Q(32) });
  const face = task('tailsFace', 3, 0, { qx: Q(120), qy: Q(90) });
  const tornado = task('tornadoSide', 6, 1, { qx: Q(120), qy: Q(90), still: false });
  const twinkle = task('twinkle', 15, 2);
  const clouds = CLOUDS.map(([name, x, y, dx]) => task(name, 12, 1, { qx: Q(x), qy: Q(y), dx }));
  const caption = task('fewDaysLater', 0, 0);
  let lines = [];
  const tasks = () => [sparkle, face, tornado, twinkle, ...clouds, caption, ...lines];

  // Task_806806C: the twinkles, one after another 16 frames each from the tally's end, the second at two places
  twinkle.run = t => {
    if (t.count <= length) return;
    const whole = div(t.count - length, 16) & 0xFF, rem = (t.count - length) % 16;
    if (whole > 2) return;
    if (rem === 0) startAnim(t.s, 'twinkle', true);
    animate(t.s, anims);
    if (whole === 1) { show(t.s, ...TWINKLES[1]); show(t.s, ...TWINKLES[2]); } else show(t.s, ...TWINKLES[whole === 2 ? 3 : 0]);
  };
  // Task_8067F38: the night scene's three layers slide down at their own speeds, each to its stop
  const slide = [0, 0, 0];
  caption.run = t => {
    if (t.count < length + SCROLL_AFTER) return;
    [85, 96, 192].forEach((v, i) => { slide[i] += v; display.scroll[i] = Math.min(I(slide[i]), [71, 80, 160][i]); });
  };
  // Task_806853C: "A few days later", a semi-transparent sprite, which the fade to black doesn't darken
  const fewDaysLater = t => {
    if (t.count >= FEW_DAYS) return;
    animate(t.s, anims);
    show(t.s, 120, 80, { semi: true });
  };
  // Task_8068360: a cloud drifting right, round again past the right edge
  const drift = t => {
    t.qx += t.dx;
    if (t.qx > Q(272)) t.qx = -Q(120);
    if (t.qx < -Q(120)) t.qx = Q(272);
    if (t.qy > Q(172)) t.qy = -Q(16);
    if (t.qy < -Q(16)) t.qy = Q(172);
    animate(t.s, anims);
    show(t.s, I(t.qx), I(t.qy));
  };
  // Task_806862C: the sparkle, from three seconds in, down and left to its stop
  const sparkleRun = t => {
    if (t.count <= 180) return;
    t.qx = Math.max(t.qx - 0x60, -Q(64));
    t.qy = Math.min(t.qy + 0x30, Q(32));
    animate(t.s, anims);
    show(t.s, I(t.qx), I(t.qy));
  };
  // the Tornado's bob up and down (Task_8068148 and Task_8068214): a sine wave to frame 600, then a slowing one
  const bob = (t, k) => {
    if (k <= 0x257) t.qy += SIN((k & 0xFF) * 4) >> 9;
    else t.qy += div(SIN((k - 600) * 4), 0x1A);
  };
  // Task_8068148: Tails in the cockpit, turning his head at 2 and at 8 seconds; once the Tornado has turned his
  // face stays where it is, moved to x 140
  const faceRun = t => {
    const k = t.count;
    if (k === 0x78) startAnim(t.s, 'tailsTurn', true);
    else if (k === 0x1E0) startAnim(t.s, 'tailsTurned', true);
    if (k < 663) bob(t, k);
    else t.qx = 0x8C00;
    animate(t.s, anims);
    show(t.s, I(t.qx), I(t.qy));
  };
  // Task_8068214: the Tornado bobs with Tails, is gone for a moment, and then from the front flies off to the
  // upper right, turning and shrinking. Its front view is never animated after its first frame.
  const tornadoRun = t => {
    const k = t.count;
    if (k <= 0x296) {
      bob(t, k);
      animate(t.s, anims);
      show(t.s, I(t.qx), I(t.qy));
    } else if (k <= 0x2BB) {
      t.qx = Q(180); t.qy = Q(180);
      if (k === 0x2BB) { startAnim(t.s, 'tornadoFront', true); animate(t.s, anims); }
    } else {
      const v = (SIN((0x3BB - k) * 4) << 16) >> 16, n = k - 700;
      t.qy += div(v, 36);
      t.qx += div(v, 18);
      const scale = Q(1.5) - n * 3;
      show(t.s, I(t.qx), I(t.qy), { affine: { rotation: 0x3FF & ~(n * 2), scaleX: scale, scaleY: scale, double: true } });
    }
  };
  // Task_8068570, Task_80685C8, Task_8067F9C and Task_8068004: a picture in the middle of the screen, set up on
  // its scene's first frame; the third is drawn in the colours its scene has reached (`blend`)
  const picture = (name, order, prio) => t => {
    if (t.count === 0) { startAnim(t.s, name, true); t.s.order = order; t.s.prio = prio; }
    animate(t.s, anims);
    show(t.s, 120, 80, name === 'artB0' ? { blend: state.blend } : {});
  };
  // Task_8066D64: a congratulation line, scrolling up from the bottom to its place
  const lineRun = t => {
    if (t.count <= LINE_FROM[t.i]) return;
    const y = Math.max(180 - (t.count - LINE_FROM[t.i]) * 3, LINE_TO[t.i]);
    animate(t.s, anims);
    show(t.s, 120, y);
  };

  // the main task's scenes, each a function of the frame it is on (unk38 + 1)
  let scene;
  const scenes = {
    // Task_8067824
    night(n) {
      if (n === RESULTS_AT) {
        length = tallyLength(rings, courseTime);
        sound.play(EXTRA_SONG.EXTRA_CLEAR);
        stageResults({ rings, courseTime, level: 13 });
      }
      if (n === length) sound.play(EXTRA_SONG.A_FEW_DAYS_LATER);
      if (n > FADE_FRAMES + length + NIGHT_FADE) {
        count = 0; caption.count = 0;
        twinkle.run = null;
        caption.run = fewDaysLater;
        state.phase = scene = 'black';
        return;
      }
      if (n === length + NIGHT_FADE) resetFade(TO_BLACK);
      runFade();
      count = n; caption.count = n; twinkle.count = n;
    },
    // sub_8067928: "A few days later", then the sky, its sprites and the fade in from black
    black(n) {
      if (n > BLACK) {
        display.scene = 'sky';
        display.scroll = [0, 0, 0];
        resetFade(FROM_BLACK);
        runFade();
        n = 0;
        for (const c of clouds) c.run = drift;
        sparkle.run = sparkleRun; tornado.run = tornadoRun; face.run = faceRun;
        caption.run = null;
        state.phase = scene = 'sky';
      }
      count = n; caption.count = n;
    },
    // Task_80679E4
    sky(n) {
      display.scroll[0] = SKY_SCROLL;
      if (n > SKY) {
        count = 0; caption.count = 0;
        for (const t of [...clouds, face, sparkle, tornado]) t.run = null;
        caption.run = picture('artA0', 0, 0);
        display.scene = 'pictures';
        display.scroll[0] = 0;
        resetFade(FROM_BLACK);
        state.phase = scene = 'artA0';
        return;
      }
      if (n === SKY - FADE_FRAMES) resetFade(TO_BLACK);
      runFade();
      count = n;
      for (const t of [caption, face, sparkle, tornado]) t.count = n;
    },
    // Task_8067B14 and Task_8067B9C
    artA0(n) { pictureScene(n, 'artA1', picture('artA1', 0, 0)); },
    artA1(n) { pictureScene(n, 'sepia', picture('artB0', 15, 2)); },
    // Task_8067C24: no fade out; the colours turn from Box3's into Box4's, then the last picture and its lines
    sepia(n) {
      const k = count - BLEND_FROM;
      if (k >= 0 && k <= BLEND_FRAMES) state.blend = k >> 4;
      if (n > PICTURE) {
        n = 0;
        lines = [0, 1, 2].map(i => {
          const t = task(`congrats${i}`, 0, 1, { i });
          t.run = lineRun;
          animate(t.s, anims);
          return t;
        });
        caption.run = picture('artB1', 15, 2);
        state.phase = scene = 'last';
      }
      runFade();
      count = n; caption.count = n;
    },
    // Task_8067E68: the lines count on from 0x14B, and after 400 frames the staff credits
    last(n) {
      if (n > PICTURE) {
        state.done = true;
        onCredits();
        return;
      }
      if (n === PICTURE - FADE_FRAMES) resetFade(TO_BLACK);
      runFade();
      for (const t of lines) t.count = count + LINE_COUNT;
      count = n; caption.count = n;
    },
  };
  function pictureScene(n, next, run) {
    if (n > PICTURE) {
      count = 0; caption.count = 0;
      resetFade(FROM_BLACK);
      caption.run = run;
      state.phase = scene = next;
      return;
    }
    if (n === PICTURE - FADE_FRAMES) resetFade(TO_BLACK);
    runFade();
    count = n; caption.count = n;
  }
  scene = 'night';
  state.blend = 0;

  // one frame: the main task (0x2100), then the sprites' (0x2120) in the order they were made
  function step() {
    if (state.done) return;
    state.sprites = [];
    scenes[scene](count + 1);
    if (state.done) return;
    for (const t of tasks()) t.run?.(t);
  }
  return { state, step };
}
