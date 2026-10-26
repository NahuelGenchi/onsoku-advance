// An act's water (SAT-R decompilation, src/game/shared/stage/water_effects.c and underwater_effects.c): its
// line, the waves along it, the splash where Sonic goes in or out, the drowning countdown's numbers and the
// bubbles he lets out, and how the screen looks below the line. Ice Mountain has it.
//
// The water's task runs after the stage's clocks. It moves the line a pixel toward its target on odd frames,
// and works out where the line is on the screen (`line`): 0 when it is above the screen's top, 255 when it is
// below the bottom. Each frame the screen ends, `seen` takes that value (the VBlank callback sub_8011A4C). Below
// the line the screen is drawn in colours mixed with the water's (waterTint in src/rom/colors.js) and without
// the snow, and the background wavers (renderer.js).

import { makeSprite, animate } from './objects.js';
import { paletteVariant, packPalette } from './stage.js';
import { SINE } from './trig.js';
import { rgbToBgr555, waterTint, bgr555ToRgb } from '../rom/colors.js';

export const WATER_TASK = 0xFFFE;
// the tasks of the splash, the countdown's numbers and the bubbles (CreateMultiplayerSpriteTask)
const EFFECTS = 0x4001;
const SURFACE_PIECES = 17;   // (DISPLAY_WIDTH + 16) / 16, plus one
const MAX_BUBBLES = 11;      // past this many of the small bubbles, no more are made (MAX_SMALL_BUBBLE_COUNT)

const SIN = a => SINE[a & 1023], COS = a => SINE[(a & 1023) + 256];

// the background colours the VCount interrupt loads at the water line (29 rows' worth of bytes); the last
// 24 keep their colours above it
const UNDER_BG_COLORS = 232;

/** The water of an act whose stage has `water` ({ level, blend }), or null for an act without. */
export function createWater(water) {
  if (!water) return null;
  return {
    level: water.level, target: water.level, blend: water.blend & 0xFFFF,
    line: 255, seen: 255,   // gWater.unk2 and unk1
    snow: true,             // whether the snow (BG0) shows above the line: off while `seen` is 0
    bubbles: 0,             // gSmallAirBubbleCount
    shown: null,            // the palette animations' frames the colours under water were taken from
    ownColours: false,      // whether the sprites' colours under water were taken from their own, not palette 423's
    surface: makeSprite('waterSurface', { order: 0, prio: 0 }),
  };
}

// the copies in the water's colours, by the palette variant they were made from
const tinted = new WeakMap();
/**
 * The background's 256 colours below the water line, packed for drawing: the stage's colours as the palette
 * animations' frames `w.shown` had them while the title card showed (InitWaterPalettes copies them in the
 * water's colours on each of its frames), up to the last 24, which keep their colours under the frames
 * `shown` now.
 */
export function underColors(stage, w, shown) {
  const water = stage.water, { palettes, follows } = water;
  let byVariant = tinted.get(water);
  if (!byVariant) tinted.set(water, byVariant = new Map());
  const v = w.shown ? paletteVariant(stage, follows, w.shown) : 0;
  if (!byVariant.has(v)) byVariant.set(v, packPalette(palettes[v].map(c => bgr555ToRgb(waterTint(rgbToBgr555(c), w.blend)))));
  const out = packPalette(palettes[paletteVariant(stage, follows, shown)]).slice();
  out.set(byVariant.get(v).subarray(0, UNDER_BG_COLORS));
  return out;
}

/**
 * The background's scroll (BG3) on screen line `s` below the water line, for its scroll (bgX, bgY) on stage
 * time `t` (the water's task, through sub_8007738): up to 2 px sideways, a wave every 16 lines of the
 * background, and up to 10 px up and down, one every 32.
 */
export function waveOffsets(bgX, bgY, s, t) {
  const k = (((bgY + s) % 32) + 32) % 32;
  return [(((SIN(4 * t + 64 * k) * 2) >> 14) + bgX) & 0x1FF, (((SIN(2 * t + 32 * k + 0x100) * 10) >> 14) + bgY) & 0x1FF];
}

/**
 * The water's task (Task_StageWaterTask). `time` is the stage clock, which has ticked this frame. The surface
 * shows while the line was on the screen at the end of the last frame: one sprite drawn 17 times 16 px apart,
 * on the frames with bit 1 of the clock set, its waves moving left with the camera and a pixel every 4 frames.
 */
export function waterTask(w, time) {
  return {
    run(ctx) {
      // the zone's background update before it turned the snow on or off by the line the last frame had
      w.snow = w.seen !== 0;
      if (time() & 1 && w.level !== w.target) w.level += w.level < w.target ? 1 : -1;
      const camY = ctx.cam.y;
      w.line = w.level <= camY ? 0 : w.level < camY + 160 ? w.level - camY : 255;
      if (w.seen > 0 && w.seen < 160) {
        const y = w.line + 1, x = -((ctx.cam.x + ((time() + 1) >> 2)) & 15);
        animate(w.surface, ctx.anims);
        if (time() & 2 && y > 0 && y < 240) {
          for (let i = 0; i < SURFACE_PIECES; i++) ctx.draw(w.surface, ctx.cam.x + x + i * 16, camY + y);
        }
      }
      return true;
    },
  };
}

/** The end of the frame: the line it was drawn with is the one the next frame's tasks see (sub_8011A4C). */
export function endFrame(w) { w.seen = w.line; }

// a sprite effect's task that ends the frame after its animation does (Task_UpdateMpSpriteTaskSprite)
function oneShot(s, place) {
  let over = false;
  return {
    run(ctx) {
      if (over) return false;
      over = animate(s, ctx.anims);
      const [x, y] = place(ctx);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

/** The splash where Sonic went into the water or out of it (CreateWaterfallSurfaceHitEffect): it stays on the line. */
export function surfaceSplash(w, x) {
  return [oneShot(makeSprite('surfaceHit', { order: 7, prio: 2 }), () => [x, w.level]), EFFECTS];
}

/**
 * A number of the drowning countdown, 5 to 0, over Sonic (SpawnDrowningCountdownNum): it stays where it
 * appeared on the screen, grows to full size over its first 32 frames and rises, slower and slower, over its
 * first 64, and goes after its 129th or when it is off the screen.
 */
export function drownCountdown(p, cam, n) {
  const s = makeSprite(`drownCountdown${n}`, { order: 9, prio: 2 });
  let x = Math.round((p.x - cam.x) * 256), y = Math.round((p.y - cam.y) * 256), t = 0;
  return [{
    run(ctx) {
      const sx = x >> 8, sy = y >> 8, scale = Math.min((t + 1) << 3, 0x100);
      if (sx < -32 || sx > 272 || sy < -32 || sy > 192 || t > 0x80) return false;
      if (t <= 0x40) y += (-(COS(t * 4) >> 6) * 0x120) >> 8;
      t++;
      animate(s, ctx.anims);
      ctx.draw(s, ctx.cam.x + sx, ctx.cam.y + sy, { rotation: 0, scaleX: scale, scaleY: scale, double: false });
      return true;
    },
  }, EFFECTS];
}

/**
 * A bubble rising from (x, y), 8.8 world coordinates (SpawnAirBubbles): a small one, or a group of them
 * turned by the game's random numbers. It sways sideways, rises half a pixel a frame and grows to full size
 * over its first 16 frames; its X speed `dx` falls off by an eighth each frame. It bursts at the water line
 * (3 px below it), after 481 frames or off the screen. While 12 are rising no more are made.
 */
export function bubble(w, world, x, y, dx, group) {
  if (((w.bubbles << 24) >> 24) > MAX_BUBBLES) return null;
  w.bubbles++;
  const s = makeSprite(group ? 'bubblesGroup' : 'bubblesSmall', { order: 9, prio: 2 });
  const flips = group ? (world.random() & 0x30000) >> 16 : 0;
  let t = 0;
  return [{
    run(ctx) {
      const sx = ((x + (SIN((t & 0xFF) * 4) >> 4)) >> 8) - ctx.cam.x, sy = (y >> 8) - ctx.cam.y;
      const scale = Math.min((t + 1) << 4, 0x100);
      if (sx < -32 || sx > 272 || sy < -32 || sy > 192 || w.level < 0 || (y >> 8) - 3 < w.level || t > 0x1E0) {
        w.bubbles--;
        return false;
      }
      x += dx; y -= 0x80;
      dx -= dx >> 3;
      t++;
      animate(s, ctx.anims);
      ctx.draw(s, ctx.cam.x + sx, ctx.cam.y + sy, { rotation: 0, scaleX: flips & 1 ? -scale : scale, scaleY: flips & 2 ? -scale : scale, double: false });
      return true;
    },
  }, EFFECTS];
}

/**
 * The bubbles that keep coming out of Sonic once he has drowned (Task_SpawnBubblesAfterDrowning): on every
 * 4th frame of the clock, one time in four, one or two groups or small ones up to 4 px from his centre, 12 px up.
 */
export function bubblesAfterDrowning(w, world, p, add) {
  return [{
    run() {
      if (!p.dead) return false;
      if ((world.tick & 3) === 0 && (world.random() & 0x300) === 0) {
        let n = (world.random() & 0x100) >> 8;
        do {
          const dx = ((world.random() & 0x7FF00) >> 8) - 0x400, dy = ((world.random() & 0x7FF00) >> 8) - 0x400;
          const group = (world.random() & 0x100) >> 8;
          add(bubble(w, world, Math.round(p.x * 256) + dx, Math.round(p.y * 256) + dy - 0xC00, 0, group));
        } while (n-- !== 0);
      }
      return true;
    },
  }, EFFECTS];
}
