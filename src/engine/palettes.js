// The act's palette animations (SAT-R decompilation, src/game/shared/stage/palette_loader.c): stage tasks
// that run an animation whose commands only load colours into the background palette. Neo Green Hill's
// cycle the waterfalls' colours one place every frame and the background's every 16 frames.

/**
 * One palette animation, stepped as UpdateSpriteAnimation_BG steps any animation at speed 0x10: a frame's
 * colours load and it then shows for its delay; one that ends keeps its last colours. `shown` is the frame
 * whose colours are loaded, -1 for the stage's own; the act starting over loads those again and starts the
 * animation over. run() returns true on the frames it loads colours: only then does it write the palette, so
 * where two animations load the same colours the one that stepped last shows.
 */
export function createPaletteAnimation({ delays, loop }) {
  let next = 0, wait = 0;
  const a = {
    shown: -1,
    run() {
      if (wait > 0) { wait -= 256; return false; }
      if (next === null) return false;
      a.shown = next;
      wait += (delays[next] - 1) * 256;
      next = next + 1 < delays.length ? next + 1 : loop;
      return true;
    },
    reset() { next = 0; wait = 0; a.shown = -1; },
  };
  return a;
}
