// The game after the last stage, with the same interface as createGame (game.js): after X Zone's results the
// congratulations (congratulations.js), or after the true ending only what comes next, then the staff credits
// and, without all seven Chaos Emeralds, the message (credits.js). Its end is where the SEGA logo comes up.

import { TICK_MS } from './constants.js';
import { createClock } from './clock.js';
import { createRenderer } from './renderer.js';
import { createEndingRenderer } from './endingrender.js';
import { createCongratulations } from './congratulations.js';
import { createStaffCredits } from './credits.js';
import { openSave, WRITE_FRAMES } from './save.js';

// CreateCongratulationsAnimation writes the save game with interrupts off before its first frame, and the
// screen goes on showing the last frame meanwhile. The frames this takes are the Moon Zone's (extra.js), the
// write's (WRITE_FRAMES) only when the save has changed since it was last written.
const SAVE_FRAMES = 16;

const SILENT = { play() {}, stopAll() {} };

/**
 * `from`: 'congratulations' after X Zone's results, or 'credits' (the true ending's onCredits). `emeralds`:
 * all seven collected, so the credits go straight on to the end. `onEnd()` is called on the frame the SEGA
 * logo would come up. `state.seed` is the game's random numbers (gPseudoRandom), which the congratulations'
 * streaks use. `save` is the save (save.js), which the congratulations write.
 */
export function createNormalEnding(canvas, assets, input, sound = SILENT, { from = 'congratulations', emeralds = false, seed = 0, save = openSave(null), onEnd = () => {} } = {}) {
  const { anims } = assets.sprites, art = assets.stage.normalEnding;
  // what the screen showed, held while the save is written
  const held = document.createElement('canvas');
  held.width = canvas.width; held.height = canvas.height;
  held.getContext('2d').drawImage(canvas, 0, 0);
  const render = createRenderer(canvas, assets);
  const renderEnding = createEndingRenderer(render.parts, art);
  const state = { seed, saving: 0, scene: null, ended: false };
  const random = () => (state.seed = (Math.imul(state.seed, 0x196225) + 0x3C6EF35F) >>> 0);

  const credits = () => {
    state.scene = createStaffCredits(anims, sound, art, {
      emeralds, language: save.uiLanguage,
      onEnd() { state.ended = true; onEnd(); },
    });
  };
  // the staff credits' tasks first run on the frame after the congratulations' main task makes them
  const congratulations = () => {
    state.scene = createCongratulations(anims, sound, { random, onCredits: credits });
  };
  if (from === 'congratulations') {
    sound.stopAll();
    state.saving = save.write() ? SAVE_FRAMES : SAVE_FRAMES - WRITE_FRAMES;
  } else credits();

  function step() {
    input.poll?.();
    if (state.ended) return;
    if (state.saving > 0) {
      if (--state.saving === 0) congratulations();
      return;
    }
    state.scene.step();
  }
  function draw() {
    const ctx = render.parts.ctx;
    if (state.saving > 0) { ctx.drawImage(held, 0, 0); return; }
    if (!state.ended) renderEnding(state.scene.state);
  }

  // a frame is drawn once, after its step (clock.js)
  let frame = 0;
  const clock = createClock(TICK_MS, { snap: true });
  function loop(now) {
    const n = clock.steps(now);
    for (let i = 0; i < n; i++) step();
    if (n) draw();
    frame = requestAnimationFrame(loop);
  }

  return {
    state, step, draw,
    setView(w, h) { render.resize(w, h); },
    setRushBoost() {},
    start() { input.enabled = true; clock.reset(); frame = requestAnimationFrame(loop); },
    stop() { input.enabled = false; input.release(); cancelAnimationFrame(frame); sound.stopAll(); },
  };
}
