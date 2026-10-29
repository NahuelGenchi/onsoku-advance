// The game's start before the act, as Sonic Advance has it: the SEGA and Sonic Team logos, the intro, the title
// screen and the main menu, run on the GBA engine (gba/engine.js) at the GBA's own frame rate and drawn into the
// game's canvas. The character select and the screens after it aren't built yet, so the act starts where the
// character select would: after Game Start on the main menu.
//
// A new game, with no save yet, starts with the language screen (language.js), which writes the save; with a save,
// the game starts with the logos. The Options menu (options.js) changes the save and writes it.

import { createVideo, REG, SCREEN_W, SCREEN_H } from '../gba/video.js';
import { createEngine, KEY } from '../gba/engine.js';
import { spriteTables } from '../rom/sprites.js';
import { createSegaLogo } from './logos.js';
import { createLanguageScreen, hasLanguageScreen } from './language.js';
import { createIntro } from './intro.js';
import { createTitleScreen } from './title.js';
import { createClock } from '../engine/clock.js';

// a GBA frame: 280896 cycles of its 16.78 MHz clock, the rate the music plays at
export const GBA_FRAME_MS = 280896 / 16777216 * 1000;
/**
 * The frames after power-on before the game starts: the GBA (mGBA) is still starting up, the screen white (forced
 * blank), and gFrameCount isn't counted yet (VBlankIntr, which counts it, starts with GameInit).
 */
export const STARTUP_FRAMES = 6;

// what the player holds (engine/input.js), as the GBA's buttons
export function keysOf(input) {
  return (input.jump ? KEY.A : 0) | (input.attack ? KEY.B : 0) | (input.start ? KEY.START : 0) | (input.select ? KEY.SELECT : 0)
    | (input.right ? KEY.RIGHT : 0) | (input.left ? KEY.LEFT : 0) | (input.up ? KEY.UP : 0) | (input.down ? KEY.DOWN : 0)
    | (input.r ? KEY.R : 0) | (input.l ? KEY.L : 0);
}

/** GameStart: the language screen when there is no save (a new game), else the logos. */
export function powerOn(ctx) {
  if (ctx.save.exists || !hasLanguageScreen(ctx.offsets)) createSegaLogo(ctx);
  else createLanguageScreen(ctx, true);
}

/**
 * Starts the front end on `canvas`, from power-on. `rom` is the ROM (rom.js), `offsets` where its tables are
 * (locate.js), `input` the player's buttons, `sound` the sound engine (audio.js) and `save` the save
 * (engine/save.js), which the language screen and the Options menu change. `play()` is called once the act is to
 * start.
 * Returns { stop, step, draw, setView }: setView(w, h) draws a widescreen view of w × h from then on (the
 * original 240 × 160 is the default); step() and draw() are for checking, a frame at a time.
 */
export function createFrontEnd(canvas, rom, offsets, input, sound, save, play) {
  const video = createVideo();
  const engine = createEngine(video, rom, sound);
  video.write(REG.DISPCNT, 0x80);   // forced blank, until the game starts
  let done = false, startingUp = STARTUP_FRAMES;
  const ctx = {
    engine, tilemaps: offsets.tilemaps, sprites: spriteTables(rom, offsets.spriteTables), offsets, save,
    introGraphics: offsets.introGraphics, introTables: offsets.introTables,
    intro: () => createIntro(ctx),
    title: playMusic => createTitleScreen(ctx, playMusic),
    play: () => { done = true; },
  };

  const out = canvas.getContext('2d', { alpha: false });
  let image, pixels, view = null, drawn = false;
  // the size the screens are drawn at: the original screen, or a widescreen view around it (video.js)
  function setView(w = SCREEN_W, h = SCREEN_H) {
    if (image && w === image.width && h === image.height) return;
    canvas.width = w; canvas.height = h;
    image = out.createImageData(w, h);
    pixels = new Uint32Array(image.data.buffer);
    view = w === SCREEN_W && h === SCREEN_H ? null : { w, h };
    if (drawn) draw();   // at once, as resizing the canvas clears it
  }
  setView();

  function step() {
    input.poll?.();
    if (startingUp > 0) {
      if (--startingUp === 0) powerOn(ctx);
      return;
    }
    engine.keys = keysOf(input);
    engine.run();
  }
  function draw() {
    engine.draw(pixels, null, view);
    out.putImageData(image, 0, 0);
    drawn = true;
  }

  // on the GBA's own frame rate, which the music keeps to (clock.js)
  let frame = 0;
  const clock = createClock(GBA_FRAME_MS);
  clock.reset();
  function loop(now) {
    let ran = false;
    for (let n = clock.steps(now); n > 0 && !done; n--) { step(); ran = true; }
    if (ran) draw();   // a frame is drawn once, from the H-blank effects its V-blank set up
    if (done) { stop(); play(); return; }
    frame = requestAnimationFrame(loop);
  }
  function stop() { cancelAnimationFrame(frame); input.release(); sound.stopAll(); }

  input.enabled = true;
  frame = requestAnimationFrame(loop);
  return { stop, step, draw, setView, engine };
}
