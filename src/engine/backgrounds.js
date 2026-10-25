// How each zone's background scrolls (SAT-R decompilation, src/game/sa1/stage/backgrounds/), for the levels
// whose layers the renderer draws through their palette (stage.indexed): for each line of the original
// 240 × 160 screen, where in the background map its first pixel comes from. Neo Green Hill's own scrolling is
// in renderer.js. Some zones' background updates also make tasks of their own (BACKGROUND_UPDATE), run by the
// camera's task right after it moves, as UpdateCamera calls the update.

import { SCREEN_W, SCREEN_H } from './constants.js';
import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';

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
