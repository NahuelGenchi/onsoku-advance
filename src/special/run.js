// The special stages between two runs of an act, as Sonic Advance has them, run on the GBA engine (gba/engine.js)
// like the game's start (front/front.js): the fall into the stage when Sonic leaves the act on a special spring,
// the stage with its title card and rings counter, the Chaos Emerald's scene when it is won, the results, and
// then the act again from the spring.
//
// The screens hand over to each other through `ctx`, as the original's create functions call each other:
//   ctx.stage()          CreateSpecialStage (stage.js), after the fall (intro.js)
//   ctx.titleCard(arg)   sub_805C448, the stage's title card and its rings target (card.js)
//   ctx.hud()            CreateSpecialStageUI, the rings counter (hud.js)
//   ctx.emeralds()       sub_8068D0C, the Chaos Emerald's scene (intro.js)
//   ctx.results(arg)     sub_805D048, the results (results.js)
//   ctx.back()           the act again (CreateGameStage at the spring)
// `ctx.game` is what the act hands over and gets back: { level, character, score, lives, courseTime, emeralds (the
// save's record of the Chaos Emeralds, a bit per stage), seed (gPseudoRandom), and what the act needs to come back
// to the spring }. `ctx.special` holds the special stage's own globals once CreateSpecialStage has set them
// (stage.js), `ctx.tables` the tables all the stages share (stages.js).

import { createVideo, SCREEN_W, SCREEN_H } from '../gba/video.js';
import { createEngine } from '../gba/engine.js';
import { spriteTables } from '../rom/sprites.js';
import { GBA_FRAME_MS, keysOf } from '../front/front.js';
import { createSpecialStageIntro, createEmeraldScene } from './intro.js';
import { createSpecialStage } from './stage.js';
import { createTitleCard } from './card.js';
import { createSpecialStageUi } from './hud.js';
import { createResults } from './results.js';
import { stageOfLevel } from './stages.js';

/**
 * Starts the special stage of `game.level` on `canvas`, from the fall into it. `rom` is the ROM (rom.js),
 * `offsets` where its tables are (locate.js), `input` the player's buttons and `sound` the sound engine
 * (audio.js). `done(game)` is called with `game` updated once the act is to start again.
 * Returns { stop, step, draw, setView, engine }, as createFrontEnd does.
 */
export function createSpecialStageRun(canvas, rom, offsets, input, sound, game, done) {
  const video = createVideo();
  const engine = createEngine(video, rom, {
    play: song => sound.play(song), stop: song => sound.stop(song),
  });
  // every screen of the special stage is made for the original screen alone: the widescreen view is black around it
  engine.wideBars = true;
  let finished = false;
  const ctx = {
    engine, rom, sound, game, special: null,
    stageIndex: stageOfLevel(rom, offsets, game.level),
    tilemaps: offsets.tilemaps, sprites: spriteTables(rom, offsets.spriteTables), offsets,
    stage: () => createSpecialStage(ctx),
    titleCard: arg => createTitleCard(ctx, arg),
    hud: () => createSpecialStageUi(ctx),
    emeralds: () => createEmeraldScene(ctx),
    results: arg => createResults(ctx, arg),
    back: () => { finished = true; },
  };
  createSpecialStageIntro(ctx);

  const out = canvas.getContext('2d', { alpha: false });
  let image, pixels, view = null, drawn = false;
  function setView(w = SCREEN_W, h = SCREEN_H) {
    if (image && w === image.width && h === image.height) return;
    canvas.width = w; canvas.height = h;
    image = out.createImageData(w, h);
    pixels = new Uint32Array(image.data.buffer);
    view = w === SCREEN_W && h === SCREEN_H ? null : { w, h };
    if (drawn) draw();
  }
  setView();

  function step() {
    input.poll?.();
    engine.keys = keysOf(input);
    engine.run();
  }
  function draw() {
    engine.draw(pixels, null, view);
    out.putImageData(image, 0, 0);
    drawn = true;
  }

  let frame = 0, last = performance.now(), pending = 0;
  function loop(now) {
    pending += Math.min(100, now - last);
    last = now;
    let ran = false;
    while (pending >= GBA_FRAME_MS && !finished) { step(); ran = true; pending -= GBA_FRAME_MS; }
    if (ran) draw();
    if (finished) { stop(); done(game); return; }
    frame = requestAnimationFrame(loop);
  }
  function stop() { cancelAnimationFrame(frame); input.release(); sound.stopAll(); }

  input.enabled = true;
  frame = requestAnimationFrame(loop);
  return { stop, step, draw, setView, engine };
}
