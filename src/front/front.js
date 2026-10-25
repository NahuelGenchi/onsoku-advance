// The game's start before the act, as Sonic Advance has it: the SEGA and Sonic Team logos, then the intro, run
// on the GBA engine (gba/engine.js) at the GBA's own frame rate and drawn into the game's canvas. The title
// screen and the menus aren't built yet, so the act starts where the title screen would: when the intro ends,
// or when it or the logos' fade are skipped.
//
// The original starts the logos only with a saved game; a new one starts with the language screen first,
// which isn't built either, so this always starts as with a save.

import { createVideo, SCREEN_W, SCREEN_H } from '../gba/video.js';
import { createEngine, KEY } from '../gba/engine.js';
import { spriteTables } from '../rom/sprites.js';
import { createSegaLogo } from './logos.js';
import { createIntro } from './intro.js';

// a GBA frame: 280896 cycles of its 16.78 MHz clock, the rate the music plays at
export const GBA_FRAME_MS = 280896 / 16777216 * 1000;

// what the player holds (engine/input.js), as the GBA's buttons
function keysOf(input) {
  return (input.jump ? KEY.A : 0) | (input.attack ? KEY.B : 0) | (input.start ? KEY.START : 0) | (input.select ? KEY.SELECT : 0)
    | (input.right ? KEY.RIGHT : 0) | (input.left ? KEY.LEFT : 0) | (input.up ? KEY.UP : 0) | (input.down ? KEY.DOWN : 0);
}

/**
 * Starts the logos on `canvas`. `rom` is the ROM (rom.js), `offsets` where its tables are (locate.js), `input`
 * the player's buttons and `sound` the sound engine (audio.js). `play()` is called once the act is to start.
 * Returns { stop, step, draw }; step() and draw() are for checking, a frame at a time.
 */
export function createFrontEnd(canvas, rom, offsets, input, sound, play) {
  const video = createVideo();
  const engine = createEngine(video, rom, { play: song => sound.play(song), stop: song => sound.stop(song) });
  let done = false;
  const ctx = {
    engine, tilemaps: offsets.tilemaps, sprites: spriteTables(rom, offsets.spriteTables),
    introGraphics: offsets.introGraphics, introTables: offsets.introTables,
    intro: () => createIntro(ctx),
    title: () => { done = true; },
  };
  createSegaLogo(ctx);

  canvas.width = SCREEN_W; canvas.height = SCREEN_H;
  const out = canvas.getContext('2d', { alpha: false });
  const image = out.createImageData(SCREEN_W, SCREEN_H);
  const pixels = new Uint32Array(image.data.buffer);

  function step() {
    input.poll?.();
    engine.keys = keysOf(input);
    engine.run();
  }
  function draw() {
    engine.draw(pixels);
    out.putImageData(image, 0, 0);
  }

  let frame = 0, last = performance.now(), pending = 0;
  function loop(now) {
    pending += Math.min(100, now - last);   // after a stall, catch up at most 100 ms instead of fast-forwarding
    last = now;
    let ran = false;
    while (pending >= GBA_FRAME_MS && !done) { step(); ran = true; pending -= GBA_FRAME_MS; }
    if (ran) draw();   // a frame is drawn once, from the H-blank effects its V-blank set up
    if (done) { stop(); play(); return; }
    frame = requestAnimationFrame(loop);
  }
  function stop() { cancelAnimationFrame(frame); input.release(); sound.stopAll(); }

  input.enabled = true;
  frame = requestAnimationFrame(loop);
  return { stop, step, draw, engine };
}
