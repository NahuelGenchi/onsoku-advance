// The normal ending's congratulations (SAT-R decompilation, src/game/sa1/ui/extra_stage_results.c:
// CreateCongratulationsAnimation and the tasks it starts, checked in the USA ROM). Sonic falls through the sky
// after X Zone, the Tornado catches him and pulls him up onto its wing, the Flickies fly past, and he leaps off
// toward the screen as "Congratulations!" comes up over his thumbs-up. One main task counts each scene's
// frames; the sprites' tasks after it read its count, and it changes what each of them runs from scene to scene.
// Then the staff credits (`onCredits`).

import { SINE } from './trig.js';
import { makeSprite, startAnim, animate } from './objects.js';
import { createFade, applyFade, runFade, plainDisplay, FROM_WHITE, TO_BLACK } from './screenfade.js';

export const TORNADO_RESCUE_SONG = 38;   // MUS_CUTSCENE_TORNADO_RESCUE

const Q = v => Math.round(v * 256);
const I = v => v >> 8;
const s16 = v => (v << 16) >> 16;
const SIN = a => SINE[a];                 // SIN(): the table as it is, 2.14 fixed point
const SIN8 = a => SINE[a] >> 6;           // SIN_24_8
const mod = (a, b) => a % b;              // the BIOS's Mod: the sign of the dividend

// Sonic's entries in the per-character tables (gUnknown_0868B488 and gUnknown_0868B498, USA 0x08684384 and
// 0x08684394): how far the leap's turned frame moves on its first two frames, and the Flickies' places
const LEAP_SHIFT = [10, 16];
const FLOCK = [[0, 8], [12, 24], [24, 40], [36, 56], [0, -8], [12, -24], [24, -40], [36, -56]];
// Task_8066D64's congratulation lines: when each starts up from y 180 at 3 px a frame (gUnknown_0868B4BE), and
// the y it stops at (gUnknown_0868B4B8)
const LINE_FROM = [330, 480, 484], LINE_TO = [16, 128, 144];
// the four clouds Task_8065F5C makes on its 180th frame: their animation, OAM order, x, and speeds (8.8)
const CLOUDS = [['cloud0', 19, 0x3C00, 0x80, -0x3C0], ['cloud1', 18, 0, 0x40, -0x400], ['cloud2', 17, 0x7800, 0x100, -0x380], ['cloud3', 16, 0xB400, 0xC0, -0x480]];
// where Task_80661A8 puts them on its 208th frame, and their speed to the right
const CLOUDS_AGAIN = [[-Q(30), -Q(120), 0x80], [-Q(60), -Q(90), 0x140], [-Q(90), -Q(60), 0x100], [-Q(120), -Q(30), 0xC0]];
const STREAKS = 15;

/**
 * The congratulations, with `random()` the game's random numbers (gPseudoRandom, which the wind's streaks
 * draw from). `onCredits()` is called on the frame the staff credits take over. `step()` runs one frame;
 * `state` is what endingrender.js draws: { display, sprites, scroll, done }.
 */
export function createCongratulations(anims, sound, { random, onCredits = () => {} }) {
  const display = { ...plainDisplay(), scene: 'congrats', scroll: [0] };
  const state = { display, sprites: [], done: false };
  // CreateCongratulationsAnimation: from white, over the whole screen in window 1, 0x80 a frame
  let fade = createFade({ win1: true, mode: FROM_WHITE, speed: 0x80, targets: 1 });
  applyFade(fade, display);

  const show = (s, x, y, extra = {}) => {
    if (s.frame >= 0) state.sprites.push({ frame: s.frame, x, y, order: s.order, prio: s.prio, ...extra });
  };
  // each task's sprite, its count (unk3C), its 8.8 fields as the task's memory has them (0x40, 0x44, 0x48,
  // 0x4C), and what it runs (TaskDestroy is run = null); the sprites start at (x, y)
  const task = (name, order, x, y, fields = {}) => {
    const s = makeSprite(name, { order, prio: 1 });
    animate(s, anims);
    return { s, x, y, count: 0, f40: 0, f44: 0, f48: 0, f4C: 0, run: null, ...fields };
  };
  const sonic = task('fallSonic', 6, 120, 80, { f44: 0x780, f40: Q(120), f48: Q(80) });
  const tails = task('pilotTails', 9, 300, 108, { f44: 0x780, f40: Q(300), f48: Q(108), flag: 0 });
  const tornado = task('tornado', 12, 300, 108, { f44: 0x780, f40: Q(300), f48: Q(108) });
  const flickies = task('flicky', 15, 248, 80, { f44: 0x100, f40: Q(248), f48: Q(80), at: 0, wave: new Array(64).fill(0) });
  const closeUp = task('closeUp', 3, 120, 80);
  const streaks = task('streak', 0, 120, 80, { xs: new Array(STREAKS).fill(0), ys: new Array(STREAKS).fill(0) });
  const lines = [0, 1, 2].map(i => ({ ...task(`congrats${i}`, 0, 180, 80), i }));
  let clouds = [];
  const tasks = () => [sonic, tails, tornado, flickies, closeUp, streaks, ...lines, ...clouds];

  // Task_8066DD0: Sonic falling, where he is
  sonic.run = t => { animate(t.s, anims); show(t.s, t.x, t.y); };
  // Task_8066F14: the Tornado's animation runs, off screen
  tornado.run = t => { animate(t.s, anims); };
  // Task_8066A5C: the Flickies' wave moves on, unseen
  const wave = t => {
    if (++t.at > 63) t.at = 0;
    t.wave[t.at] = SIN(mod(t.count, 64) * 8) >> 10;
  };
  flickies.run = wave;
  // Task_8067020: the sky scrolls up a line every other frame
  closeUp.run = t => { if (mod(t.count, 2) === 0) display.scroll[0]++; };
  // Task_8066C78: fifteen streaks rising 16 px a frame, each starting again from a random place every 16
  streaks.run = t => {
    const k = ++t.count;
    startAnim(t.s, 'streak', true);
    animate(t.s, anims);
    for (let i = 0; i < STREAKS; i++) {
      if ((k + i) & 0xF) t.ys[i] = s16(t.ys[i] - 0x10);
      else {
        t.ys[i] = mod(random() | 0, 40) + 0x8C;
        t.xs[i] = mod(random() | 0, 0xDC) + 0x14;
      }
      show(t.s, t.xs[i], t.ys[i]);
    }
  };

  // the clouds: sub_806844C rises them from below, round to the bottom again further right; Task_80684B4 lets
  // them go off the top; sub_80683D8 sends them down and to the right; Task_8068360 drifts them right
  // a cloud in the colours the sprite palette has: its own row (cloud3's), or once the close-up has loaded its
  // 256 colours over every row, the close-up's
  let lateColours = false;
  const cloudShow = c => {
    animate(c.s, anims);
    animate(c.late, anims);
    show(lateColours ? c.late : c.s, I(c.x), I(c.y));
  };
  const cloudRise = c => {
    c.y += c.dy;
    if (c.y < -Q(16)) {
      c.y = Q(172);
      c.x += c.dx * 200;
      if (c.x > Q(272)) c.x -= Q(300);
    }
    cloudShow(c);
  };
  const cloudLeave = c => {
    if (c.y < -Q(16)) return;
    c.y += c.dy;
    cloudShow(c);
  };
  const cloudFall = c => {
    c.x += Q(8); c.y += Q(8);
    c.x += c.dx;
    if (c.x > Q(272)) c.x -= Q(300);
    c.y += c.dy;
    if (c.y > Q(172)) c.y -= Q(300);
    cloudShow(c);
  };
  const cloudDrift = c => {
    c.x += c.dx;
    if (c.x > Q(272)) c.x = -Q(120);
    if (c.x < -Q(120)) c.x = Q(272);
    c.y += c.dy;
    if (c.y > Q(172)) c.y = -Q(16);
    if (c.y < -Q(16)) c.y = Q(172);
    cloudShow(c);
  };

  // Task_8066628: Sonic caught, then pulled up and off to the left
  const caught = t => {
    const k = t.count;
    if (k === 15) startAnim(t.s, 'caughtSonic0', true);
    else if (k === 20) startAnim(t.s, 'caughtSonic1', true);
    else if (k === 30) startAnim(t.s, 'pulledSonic', true);
    if (k > 20) {
      t.f48 = Math.max(t.f48 - Q(8), -Q(64));
      t.y = I(t.f48);
      t.f40 = Math.max(t.f40 - t.f44, 0);
      t.x = I(t.f40);
    }
    animate(t.s, anims);
    show(t.s, t.x, t.y);
  };
  // Task_8066E5C and Task_8066F30: Tails and the Tornado fly in from the right and up after him
  const flyIn = t => {
    t.f40 = Math.max(t.f40 - t.f44, 0);
    t.x = I(t.f40);
    if (t.count > 20) {
      t.f48 = Math.max(t.f48 - Q(8), -Q(30));
      t.y = s16(t.f48 >> 8);
    }
    animate(t.s, anims);
    show(t.s, t.x, t.y);
  };
  // Task_8066DF4: Sonic comes down from the top left, onto the wing
  const landing = t => {
    t.f40 += t.f44;
    t.x = I(t.f40) - 20;
    t.f48 += Q(8);
    t.y = s16(t.f48 >> 8);
    animate(t.s, anims);
    show(t.s, t.x, t.y);
  };
  // Task_8066EBC and Task_8066F90: the Tornado and Tails come down into the middle under him
  const comeDown = t => {
    t.f40 = Math.max(t.f40 + t.f44, 0);
    t.x = I(t.f40);
    t.f48 += Q(8);
    if (t === tails) t.f48 = Math.max(t.f48, -Q(30));
    t.y = t === tails ? s16(t.f48 >> 8) : I(t.f48);
    animate(t.s, anims);
    show(t.s, t.x, t.y);
  };
  // Task_80666E0: Sonic on the wing bobbing with the Tornado, standing up on the 300th frame
  const ride = t => {
    const k = t.count;
    if (k === 0x12C) startAnim(t.s, 'rideSonic', true);
    t.f48 += SIN((k % 256) * 4) >> 8;
    t.y = I(t.f48);
    animate(t.s, anims);
    show(t.s, t.x, t.y);
  };
  // Task_80669A0: Tails in the cockpit, bobbing, looking round on the 300th frame of the scene that sets his flag
  // and back on the first frame of the next
  const pilot = t => {
    const k = t.count;
    if (k === 0x12C && t.flag) { startAnim(t.s, 'pilotTailsLook', true); t.flag = 0; }
    else if (k === 1 && t.flag) { startAnim(t.s, 'pilotTails', true); t.flag = 0; }
    t.f48 += I(SIN((k % 256) * 4));
    t.y = I(t.f48);
    animate(t.s, anims);
    show(t.s, t.x, t.y);
  };
  // Task_8066FDC: the Tornado bobbing
  const bob = t => {
    t.f48 += SIN((t.count & 0xFF) * 4) >> 8;
    t.y = I(t.f48);
    animate(t.s, anims);
    show(t.s, t.x, t.y);
  };
  // Task_8066ACC and Task_8066BA4: the eight Flickies flying in from the right in a wave, then staying
  const flock = fixed => t => {
    wave(t);
    animate(t.s, anims);
    FLOCK.forEach(([dx, dy], i) => {
      const x = fixed ? dx + 0xBC : dx + 0xF8 - t.count;
      show(t.s, x, dy + 80 + t.wave[(t.at + i * 8) & 0x3F]);
    });
  };
  // Task_8067054: the close-up, held on its first frame
  const still = t => { lateColours = true; startAnim(t.s, t.s.anim.name, true); animate(t.s, anims); show(t.s, t.x, t.y); };
  // Task_8067084: the thumbs-up from the 360th frame
  const thumbsUp = t => {
    if (t.count < 360) return;
    if (t.count === 360) startAnim(t.s, 'thumbsUp', true);
    animate(t.s, anims);
    show(t.s, t.x, t.y);
  };
  // Task_8066768: Sonic bobbing, crouching on the 240th frame and leaping on the 300th: up, then down toward the
  // screen through the rotation hardware, growing, until the 360th
  const tf = { x: 0, y: 0, scale: 0 };
  const leap = t => {
    const k = t.count;
    if (k === 1) startAnim(t.s, 'leapSonic0', true);
    else if (k === 0xF0) { startAnim(t.s, 'leapSonic1', true); t.f4C = -0x400; }
    if (k >= 0x12C) {
      if (k === 0x12C) {
        startAnim(t.s, 'leapSonic2', true);
        tf.scale = Math.trunc(Q(7) / 10);
        tf.x = t.x; tf.y = t.y;
      }
      t.f4C += 0x1E;
      t.f48 += t.f4C;
    } else t.f48 += SIN8((k % 256) * 4) >> 2;
    t.y = I(t.f48);
    let affine = null;
    if (k >= 300) {
      // the decompilation's gUnknown_0868B488[n][character][0] for both x and y; the sine's index runs past the
      // table after the 360th frame, where nothing is shown any more
      if (k === 300) { tf.x = s16(tf.x - LEAP_SHIFT[0]); tf.y = t.y - LEAP_SHIFT[0]; }
      else if (k === 301) { tf.x = s16(LEAP_SHIFT[1] + (SIN8(44) >> 6) + tf.x); tf.y = LEAP_SHIFT[1] + t.y; }
      else if (k <= 360) { tf.x = s16((SIN((k - 300) * 12 + 0x20) >> 12) + tf.x); tf.y = t.y; }
      tf.scale = Math.min(tf.scale + 4, Q(1.5));
      affine = { rotation: 0, scaleX: tf.scale, scaleY: tf.scale, double: true };
    }
    // TransformSprite comes before UpdateSpriteAnimation, so it places the sprite by the frame it showed last
    if (affine) affine.dims = t.s.frame;
    animate(t.s, anims);
    if (k <= 360) affine ? show(t.s, tf.x, tf.y, { affine }) : show(t.s, t.x, t.y);
  };
  // Task_8066D64: a congratulation line, scrolling up from the bottom to its place
  const lineUp = t => {
    if (t.count <= LINE_FROM[t.i]) return;
    const y = Math.max(180 - (t.count - LINE_FROM[t.i]) * 3, LINE_TO[t.i]);
    animate(t.s, anims);
    show(t.s, 120, y);
  };

  // the main task's scenes (Task_8065F5C to Task_8066520), each a function of its frame (unk40 + 1)
  let count = 0, scene;
  const setCounts = (n, list) => { for (const t of list) t.count = n; };
  const scenes = {
    // Sonic falls, the clouds come up from below on the 180th frame and go off the top from the 360th
    fall(n) {
      runFade(fade, display);
      if (n === 0xB4) {
        clouds = CLOUDS.map(([name, order, x, dx, dy]) => {
          const c = task(name, order, 180, 80, { x, y: Q(200), dx, dy, late: (l => (animate(l, anims), l))(makeSprite(`${name}Late`, { order, prio: 1 })) });
          c.run = cloudRise;
          return c;
        });
      }
      if (n === 0x168) for (const c of clouds) c.run = cloudLeave;
      if (n > 0x190) {
        n = 0;
        streaks.run = null;
        tails.run = flyIn; tornado.run = flyIn; sonic.run = caught; closeUp.run = null;
        scene = 'catch';
      }
      count = n;
      setCounts(n, [closeUp, sonic, tornado, tails]);
    },
    // the Tornado catches him; the clouds come back on the 208th frame
    catch(n) {
      if (n === 0xD0) {
        clouds.forEach((c, i) => { [c.x, c.y, c.dx] = CLOUDS_AGAIN[i]; c.dy = 0; c.run = cloudFall; });
      }
      if (n > 0x118) {
        n = 0;
        tails.run = comeDown; tornado.run = comeDown; sonic.run = landing;
        scene = 'land';
      }
      count = n;
      setCounts(n, [sonic, tornado, tails]);
    },
    land(n) {
      if (n > 16) {
        n = 0;
        for (const c of clouds) c.run = cloudDrift;
        tails.run = pilot; tornado.run = bob; sonic.run = ride;
        scene = 'ride';
      }
      count = n;
      setCounts(n, [sonic, tornado, tails]);
    },
    ride(n) {
      if (n > 400) {
        n = 0;
        flickies.run = flock(false);
        scene = 'flickies';
      }
      if (n === 0x12C) tails.flag = 1;
      count = n;
      setCounts(n, [sonic, tornado, tails]);
    },
    // the Flickies fly in, and stay from the 60th frame; Sonic's bob counts on from 0x3FF
    flickies(n) {
      if (n === 0x3C) flickies.run = flock(true);
      if (n > 200) {
        n = 0;
        closeUp.run = still;
        scene = 'closeUp';
      }
      count = n;
      sonic.count = (n + 0x3FF) & 0xFFFF;
      setCounts(n, [flickies, tornado, tails]);
    },
    closeUp(n) {
      if (n > 0xF0) {
        n = 0;
        for (const l of lines) l.run = lineUp;
        sonic.run = leap; closeUp.run = thumbsUp;
        scene = 'leap';
      }
      if (n === 1) tails.flag = n;
      count = n;
      setCounts(n, [sonic, flickies, tornado, tails]);
    },
    // the leap and the thumbs-up, the lines, and from the 670th frame the fade to black
    leap(n) {
      if (n > 0x2BC) {
        state.done = true;
        onCredits();
        return;
      }
      if (n >= 0x29E) {
        if (n === 0x29E) fade = createFade({ win1: true, mode: TO_BLACK, speed: 0xC0, targets: 1 });
        runFade(fade, display);
      }
      count = n;
      setCounts(n, [closeUp, ...lines, sonic, flickies, tornado, tails]);
    },
  };
  scene = 'fall';
  sound.stopAll();
  sound.play(TORNADO_RESCUE_SONG);

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
