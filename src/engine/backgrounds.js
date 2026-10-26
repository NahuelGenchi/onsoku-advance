// How each zone's background scrolls (SAT-R decompilation, src/game/sa1/stage/backgrounds/), for the levels
// whose row in levels.js names a `backgroundScroll`: for each line of the original 240 × 160 screen, where in
// the background map its first pixel comes from, as [x, y], the map row shown being y + the line. Each act's
// StageBgUpdate sets BG3's scroll from the camera once a frame, or fills a table that the HBlank interrupt
// copies into it line by line. Neo Green Hill's own scrolling is in renderer.js. Some zones' background updates
// also make tasks of their own (BACKGROUND_UPDATE), run by the camera's task right after it moves, as
// UpdateCamera calls the update.

import { drawEggRocketBackground } from './eggrocket.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';

const mod = (a, n) => ((a % n) + n) % n;

// Inside Secret Base (StageBgUpdate_Zone2_Interior): the wall, rows 0–63 of the map, scrolls a quarter of the
// camera's way and repeats every 64 lines. Three bars of 16 lines, rows 64–79, scroll half its way, and a
// bigger one of 24 lines, rows 80–103, two thirds, each 256 lines from the next of its kind; the later ones
// cover the earlier ones.
function secretBaseInside(line, cx, cy) {
  let x = (cx >> 2) & 0xFF, row = (line + ((cy >> 2) & 63)) & 63;
  for (let i = 0; i < 3; i++) {
    const k = mod(line + ((cy >> 1) + (i << 6)) + 16, 256);
    if (k < 16) { x = ((cx >> 1) + (i << 5)) & 0xFF; row = 64 + k; }
  }
  const k = mod(line + Math.trunc((cy << 1) / 3) + 288 + 24, 256);
  if (k < 24) { x = (Math.trunc((cx << 1) / 3) + 96) & 0xFF; row = 80 + k; }
  return [x, row - line];
}

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
  // StageBgUpdate_Zone2Act1: outside, before x 1488, all of it scrolls a 78th of the camera's way across and
  // shows the map's bottom 160 rows; the map repeats every 512 rows. From x 1488 on, the inside's.
  secretBase1(line, tick, cx, cy) {
    return cx < 1488 ? [Math.trunc((cx * 16) / (78 * 16)), 512 - 160] : secretBaseInside(line, cx, cy);
  },
  // StageBgUpdate_Zone2Act2: the inside's all the way
  secretBase2: (line, tick, cx, cy) => secretBaseInside(line, cx, cy),
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

export const BACKGROUND_UPDATE = {
  // The fireworks in Casino Paradise's sky: on every 4th frame of the stage clock, one draw of the game's random
  // numbers with bits 8–10 clear sets one off, at x −8 … 247 and y −32 … 95 in the map, big or small, each from
  // a draw of its own (x, y, then the size).
  casinoParadise(ctx, cam) {
    const [bgX, bgY] = zone3(Math.floor(cam.x), Math.floor(cam.y), ctx.world.terrain);
    cam.bgX = bgX; cam.bgY = bgY;
    if ((ctx.world.tick & 3) !== 0 || (ctx.world.random() & 0x700) !== 0) return;
    const x = ((ctx.world.random() & 0xFF00) >> 8) - 8;
    const y = ((ctx.world.random() & 0x7F00) >> 8) - 32;
    const name = ctx.world.random() & 0x100 ? 'fireworkSmall' : 'firework';
    ctx.add(firework(x, y, name, cam), FIREWORK_PRIORITY);
  },
};

// A firework's task (Task_UpdateFireworkAnimation, made by CreateMultiplayerSpriteTask) runs after the music
// manager, on the frame it is made too. It moves with the background, behind the stage's layers (background
// priority 3) and last in OAM order (31), and shows its animation once, drawn four times: as it is, then
// flipped across, down, and both, which makes the whole burst out of a quarter. It goes on the frame after
// the animation ends.
const FIREWORK_PRIORITY = 0x4001;
function firework(x, y, name, cam) {
  const s = { anim: makeAnimator(), frame: -1, flipX: false, flipY: false, order: 31, prio: 3 };
  setAnim(s.anim, name);
  return {
    run(ctx) {
      if (s.anim.done) return false;
      tickAnim(s.anim, ctx.anims);
      s.frame = frameOf(s.anim, ctx.anims);
      // where the background lines up with the original screen, in the middle of a wider view
      const { view } = ctx, sx = view.x + ((view.w - SCREEN_W) >> 1) + x - cam.bgX, sy = view.y + ((view.h - SCREEN_H) >> 1) + y - cam.bgY;
      for (const [flipX, flipY] of [[false, false], [true, false], [false, true], [true, true]]) ctx.draw({ ...s, flipX, flipY }, sx, sy);
      return true;
    },
  };
}
// The zones whose background is more than one map scrolled per line (two backgrounds, sizes that change,
// blending): each draws all of it into the frame, from the act's state.bg
export const BACKGROUND_DRAW = {
  eggRocket: drawEggRocketBackground,
};
