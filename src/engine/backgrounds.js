// How each zone's background scrolls (SAT-R decompilation, src/game/sa1/stage/backgrounds/), for the levels
// whose layers the renderer draws through their palette (stage.indexed): for each line of the original
// 240 × 160 screen, where in the background map its first pixel comes from. Neo Green Hill's own scrolling is
// in renderer.js.

import { SCREEN_W, SCREEN_H } from './constants.js';

// StageBgUpdate_Zone3Acts12: where the 256 × 256 map's top left is, for the camera at (cx, cy). It moves 16 px
// across over the act's width and 96 px down over its height (Div, rounding toward 0).
const zone3 = (cx, cy, terrain) => [
  Math.trunc((cx << 4) / (terrain.width - SCREEN_W)),
  Math.trunc(((cy << 6) + (cy << 5)) / (terrain.height - SCREEN_H)),
];
// Casino Paradise's map lines from which the hedges' bands and the railing scroll faster through HBlank, and by
// how much of the camera's x: the update first sets the lines from 134 to x / 64 and then writes x / 32 over them
const ZONE3_BANDS = [[134, 5], [140, 4], [152, 3], [168, 2], [192, 1], [256, null]];

export const BACKGROUND_SCROLL = {
  // `line` is the original screen's line, `cx`, `cy` its camera. Below the sky and the water, each band of the
  // hedges and the railing moves on by a further share of the camera's x, wrapping round the map's 256 px.
  casinoParadise(line, tick, cx, cy, terrain) {
    const [x, y] = zone3(cx, cy, terrain), row = y + line;
    for (let b = ZONE3_BANDS.length - 2; b >= 0; b--) {
      if (row >= ZONE3_BANDS[b][0] && row < ZONE3_BANDS[b + 1][0]) return [(x + (cx >> ZONE3_BANDS[b][1])) & 0xFF, y];
    }
    return [x, y];
  },
};
