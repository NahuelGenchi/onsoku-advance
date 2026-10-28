// The game over (SAT-R decompilation, src/game/sa1/ui/game_over.c): what Sonic Advance shows once Sonic loses his
// last life. The act keeps running behind it, without Sonic. GAME OVER slides in from the right; with a continue
// left, it turns into CONTINUE? as the screen darkens a little, a black band slides in from the left and a
// countdown from 9 runs on it, a digit and its voice every two seconds. A takes the continue: OK, then the act
// starts over with three lives. B skips to the next digit. At the end of the countdown, or with no continue left,
// the words close up, the screen goes black and the game goes back to the SEGA logo.
//
// CreateGameOverScreen makes four tasks at the objects' priority, which run in this order each frame: the screen
// with the words, the band, the fade and the countdown. Without a continue only the screen and a fade to black
// are made. runGameOver runs them in turn and leaves what the frame shows (renderer.js draws it):
// - words: the two halves of GAME OVER or CONTINUE? (sprite animation 715's variants), each at (x, y), or
//   through the rotation hardware at affine.x and affine.y with affine.scaleX
// - bandX: the band's left edge as OAM's 9-bit x, or null
// - glyph: the countdown's digit (0–9) or 'ok' at (x, y), or zooming with its scale (null when shown as it is)
// - bldY: the brightness decrease on everything else (0 when none); black: the screen is all black
// - hudPalette: on the frame the screen is made, the HUD shows the colours its graphics load over the font's
// - endsNext: the game over ends on the next frame
// - saving: it has ended, and the save is being written (WriteSaveGame): the screen keeps the last frame it showed

import { SINE } from './trig.js';

const cos = angle => SINE[angle + 256] >> 6;   // COS_24_8, on 1024 steps a turn
const s16 = v => (v << 16) >> 16, u16 = v => v & 0xFFFF;
const MAX_FADE = 32 * 256;

/** The game over's state, `withContinue` when a continue is left to use; `art` is the assets' gameOver. */
export function createGameOver(art, withContinue) {
  return {
    art, withContinue,
    screen: { frames: 0, main: 'enter', variant: 0, x: 304 },
    band: withContinue ? { unk18: 0, x: -256, main: 'wait' } : null,
    fade: { unk18: 0, level: 0, speed: withContinue ? 64 : 96, main: 'wait', on: false, bldY: 0 },
    count: withContinue ? { unk24: 0, main: 'wait' } : null,
    takeContinue: false,   // the screen's unk80: A was pressed on the countdown
    songAge: 0,            // frames since the game over's song started, with the screen
    stopped: false,        // the music was stopped (m4aMPlayAllStop)
    words: [], bandX: null, glyph: null, bldY: 0, black: false, hudPalette: true,
    endsNext: false,       // it ends on the next frame, whose code starts while this one is drawn (renderer.js)
  };
}

// a word turning (TransformSprite with only a scale): its width in 256ths, never under 10
const turned = (scale, x) => ({ scaleX: Math.max(10, scale), x, y: 60 });
// the words closing up over the 16 frames from `end` - 31: the cosine of an angle from 63/64 of a turn down to 3/4,
// so from nearly 1 to 0
const closing = (frames, end) => cos(s16(32 - u16(frames - end)) * 16);

// Task_GameOverScreenInit and the tasks after it: where the words are, and when the game over ends
function runScreen(go, sound) {
  const s = go.screen, F = s.frames, variant = s.variant;
  let words = null;   // [left, right], each null for (x, y) as it is or the affine place
  switch (s.main) {
    case 'enter':   // just off the right edge for a second
      s.x = 304;
      if (++s.frames >= 60) s.main = 'slide';
      words = [null, null];
      break;
    case 'slide':   // Task_8056100: in to the middle in half a second
      s.x = s16(240 - Math.trunc((184 * (F - 60)) / 30) + 64);
      if (++s.frames >= 90) s.main = 'hold';
      words = [null, null];
      break;
    case 'hold':    // Task_805618C
      s.x = 128;
      if (++s.frames >= 120) s.main = go.withContinue ? 'close' : 'last';
      words = [null, null];
      break;
    case 'close': { // Task_8056348: GAME OVER closes up around x 127, then CONTINUE? takes its place
      const scale = cos(u16(F - 120) << 4);
      if (++s.frames >= 136) { s.variant = 2; s.main = 'open'; }
      words = [turned(scale, 127), turned(scale, 127)];
      break;
    }
    case 'open': {  // Task_805648C, as the ROM's code has it: CONTINUE? opens out from x 127 and 128
      const scale = cos(s16(256 - 16 * u16(F - 136))) + 1;
      if (++s.frames >= 152) s.main = 'wait';
      words = [turned(scale, 127), turned(scale, 128)];
      break;
    }
    case 'wait':    // Task_80565C4: CONTINUE? until frame 1433, then it closes up and the music stops
      s.x = 128;
      if (++s.frames >= 1433) words = [turned(closing(s.frames, 1464), 127), turned(closing(s.frames, 1464), 127)];
      else words = [null, null];
      if (s.frames >= 1449) {
        words = null;
        if (s.frames >= 1464) { sound.stopAll(); go.stopped = true; s.main = 'black'; }
      }
      break;
    case 'last':    // Task_8056218: without a continue GAME OVER stays, and closes up from frame 217
      if (++s.frames >= 217) words = [turned(closing(s.frames, 248), 127), turned(closing(s.frames, 248), 127)];
      else words = [null, null];
      if (s.frames >= 233) {
        words = null;
        if (s.frames >= 248) s.main = 'black';
      }
      break;
    case 'black':   // Task_8056AC8: black until the song has ended or the music was stopped
      go.black = true;
      if (go.stopped || go.songAge >= go.art.songFrames) return go.takeContinue ? 'continue' : 'title';
      break;
  }
  go.words = words ? words.map((affine, i) => ({ half: variant + i, x: s.x, y: 60, affine })) : [];
  return null;
}

// Task_8056F54, Task_8056714 and Task_8056F80: the band waits 162 frames, slides in from the left, 12 px a
// frame, and jumps the last 16
function runBand(go) {
  const b = go.band;
  if (!b) return;
  if (b.main === 'wait') {
    if (++b.unk18 >= 162) b.main = 'slide';
    return;
  }
  if (b.main === 'slide') {
    ++b.unk18;
    b.x = Math.min(0, b.x + 12);
    go.bandX = b.x & 0x1FF;
    if (b.unk18 >= 182) { b.main = 'still'; b.x = 0; b.unk18 = 0; }
    return;
  }
  go.bandX = b.x & 0x1FF;
}

// sub_805423C: the screen's brightness decrease, half the level's whole part, before the level goes up
function fadeStep(f) {
  f.on = true;
  f.bldY = Math.min(32, f.level >> 8) >> 1;
  f.level = Math.min(MAX_FADE, f.level + f.speed);
}

// with a continue (Task_8056CE0 to Task_8056EC4): two seconds, a half-second fade to a quarter dark, held until
// the countdown's end, then darker until the end; without one (Task_8056E24, Task_8056E64), all the way to black
function runFade(go) {
  const f = go.fade;
  switch (f.main) {
    case 'wait':
      if (++f.unk18 >= 120) f.main = 'in';
      break;
    case 'in':
      if (go.withContinue) {
        fadeStep(f);
        if (++f.unk18 >= 152) f.main = 'held';
      } else {
        const done = Math.trunc(u16(f.unk18 - 120) * 32 / 96) >= 96;
        fadeStep(f);
        f.unk18++;
        if (done) f.main = 'gone';
      }
      break;
    case 'held':   // sub_80543A4: the same decrease, the level kept
      f.bldY = Math.min(32, f.level >> 8) >> 1;
      if (++f.unk18 >= 1382) f.main = 'out';
      break;
    case 'out':
      fadeStep(f);
      if (++f.unk18 >= 1464) f.main = 'gone';
      break;
  }
}

// one digit or the OK (sub_8052C84): in from the left edge over 20 frames, zoomed down from about twice its
// size over 60 at (zoomX, zoomY), then out to the right over the last 40
function glyphAt(go, what, t, y, zoomX, zoomY) {
  if (t > 80) go.glyph = { what, x: Math.trunc(((t - 80) * 116) / 18) + 116, y, scale: null };
  else if (t > 20) go.glyph = { what, x: zoomX, y: zoomY, scale: 497 - (t - 20) * 4 };
  else go.glyph = { what, x: Math.trunc((t * 116) / 20), y, scale: null };
}

// Task_8056FA0, Task_805676C and Task_8056970: three seconds, then the countdown. `a` and `b` are this frame's
// presses of A and B.
function runCount(go, sound, a, b) {
  const c = go.count;
  if (!c) return;
  if (c.main === 'wait') {
    if (++c.unk24 >= 182) { c.unk24 = 0; c.main = 'count'; }
    return;
  }
  if (c.main === 'count') {
    let unk24 = c.unk24;
    const digit = 9 - Math.trunc(unk24 / 120), t = unk24 % 120;
    // at 20 seconds the countdown has ended: nothing is left to show
    if (digit >= 0 || (t > 20 && t <= 80)) glyphAt(go, digit, t, 91, 104, 83);
    if (unk24 >= 1200) c.main = 'gone';
    if (b) {
      // the next digit at once, and the band, the fade and the words skip ahead with it
      const next = Math.trunc(unk24 / 120) + 1;
      unk24 = next * 120;
      if (go.band) go.band.unk18 = 1200 - (10 - next) * 120;
      go.fade.unk18 = go.screen.frames = 1382 - (10 - next) * 120;
    }
    if (a) {
      c.main = 'ok'; c.unk24 = 0; go.takeContinue = true;
    } else c.unk24 = s16(unk24 + 1);
    if (c.unk24 % 120 === 60) sound.play(go.art.voices[Math.trunc(c.unk24 / 120)]);
    return;
  }
  if (c.main === 'ok') {
    glyphAt(go, 'ok', c.unk24, 84, 88, 68);
    if (c.unk24 >= 120) {
      // the words close up at once
      c.main = 'gone';
      go.fade.unk18 = 1382;
      go.screen.frames = 1464;
    }
    c.unk24++;
  }
}

/**
 * One frame of the game over, with this frame's presses of A (`a`) and B (`b`). Returns 'continue' when the act
 * starts over with the continue, 'title' when the game goes back to the start, otherwise null.
 */
export function runGameOver(go, sound, a, b) {
  // on the frame it ends, Task_8056AC8 turns the VBlank off to write the save, so nothing this frame sets is shown
  const shown = { words: go.words, bandX: go.bandX, glyph: go.glyph };
  go.hudPalette = false;
  go.songAge++;
  go.words = []; go.bandX = null; go.glyph = null;
  const end = runScreen(go, sound);
  if (end) { Object.assign(go, shown); go.saving = true; return end; }
  runBand(go);
  runFade(go);
  runCount(go, sound, a, b);
  go.bldY = go.black ? 16 : go.fade.on ? go.fade.bldY : 0;
  go.endsNext = go.screen.main === 'black' && (go.stopped || go.songAge + 1 >= go.art.songFrames);
  return null;
}
