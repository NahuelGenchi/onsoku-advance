// How each zone's background scrolls (SAT-R decompilation, src/game/sa1/stage/backgrounds/), for the levels
// whose layers the renderer draws through their palette (stage.indexed): for each line of the original
// 240 × 160 screen, where in the background map its first pixel comes from. Neo Green Hill's own scrolling is
// in renderer.js.

const BELT_A = [120, 136], BELT_B = [176, 192];   // the conveyor belts' lines in Cosmic Angel's map

export const BACKGROUND_SCROLL = {
  // StageBgUpdate_Zone6Act2: the 512 × 256 map moves across 272 px over the act's width and 72 px down over
  // its height (Div, rounding toward 0), and through HBlank its two belts slide by half the stage clock, the
  // upper one left and the lower one right. `line` is the original screen's line, `cx`, `cy` its camera.
  cosmicAngel(line, tick, cx, cy, terrain) {
    const x = Math.trunc(((cx << 8) + (cx << 4)) / (terrain.width - 240));
    const y = Math.trunc(((cy << 6) + (cy << 3)) / (terrain.height - 160));
    const row = y + line;
    if (row >= BELT_A[0] && row < BELT_A[1]) return [(x - (tick >> 1)) & 0x1FF, y];
    if (row >= BELT_B[0] && row < BELT_B[1]) return [((tick >> 1) + x) & 0x1FF, y];
    return [x, y];
  },
};
