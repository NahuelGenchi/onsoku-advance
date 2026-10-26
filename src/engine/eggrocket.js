// Egg Rocket Zone (level 10), what the act adds to the stage (SAT-R decompilation): StageInit_Zone6Act1
// (src/game/shared/stage/stage.c), its invisible checkpoints (src/game/sa1/stage/interactables/checkpoint.c),
// the launch and the two stage separations (src/game/sa1/stage/egg_rocket_transitions.c) and its background
// (StageBgUpdate_Zone6Act1, src/game/sa1/stage/backgrounds/zone_6.inc.c, with HBlankCallback_803FA1C).
//
// The act's three checkpoints have no post: passing the first, by the launch tower, sets the rocket off (the
// screen shakes for a second, then for five more with explosions, while Sonic can't move) and starts a five
// minute countdown; the other two, at the tops of the rocket's lower stages, each drop the stage below away.
// The background follows: the tower at sunset, then the sky scrolling down as the rocket climbs, then space.

import { offCam } from './objects.js';
import { screenShake, SCREEN_SHAKE, SHAKE } from './screenshake.js';
import { throwNutsAndBolts } from './nutsandbolts.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { SONG } from '../sound/songs.js';

export const EGG_ROCKET = 10;
const CHECKPOINT = 7;
const TRANSITIONS = 0x4000;              // the launch's and the separations' task priority
const LAUNCH_MIN_X = 1058;               // EGG_ROCKET_LAUNCH_MIN_X: once the rocket is off, no way back left
const BOOSTER_DEPART_MAX_Y = 5568;       // EGG_ROCKET_BOOSTER_DEPART_MAX_Y: the bottom after the first separation
const MIDDLE_DEPART_MAX_Y = 3264;        // EGG_ROCKET_MIDDLE_DEPART_MAX_Y: and after the second
const SEPARATIONS = { 2: 58 * 96 - 1, 3: 34 * 96 - 1 };   // the world row each separation splits the rocket at
const COUNTDOWN = 5 * 3600;              // TIME(5, 0)
// the camera's unk50 flags the background reads: stopped (the time over's banner sets it, once that is
// built), space next, the sky scrolling
const BG_STOPPED = 0x2000, BG_SPACE = 0x4000, BG_SCROLLING = 0x8000;

// the walls the widescreen view doesn't show past (cam.arena, camera.js viewOf): once the rocket is off, the
// camera's bounds, the left one right of the tower and the bottom one above the stages that fell away
const walls = cam => { cam.arena = { minX: cam.minX, maxX: cam.maxX + SCREEN_W, minY: cam.minY, maxY: cam.maxY + SCREEN_H }; };

/**
 * What the act adds to the stage: init() is StageInit_Zone6Act1's part after its palette animations and song,
 * on each start of the act; background(cam) is StageBgUpdate_Zone6Act1, after each camera update, with the
 * camera's position, shake included. `state.bg` is what it leaves for drawing: BG3's map screen `base`, its
 * size (`tall`: 256 × 512, else 256 × 256) and scroll, and BG0 once it is on; `state.backLines` the back
 * layer's split during a separation.
 */
export function createEggRocket({ state, world }) {
  let bg;
  // the camera's maxY is the top of the screen at its lowest; the original's, its bottom
  const setMaxY = maxY => { state.cam.maxY = maxY - SCREEN_H; };
  return {
    init() {
      const i = state.checkpointIndex, cam = state.cam;
      // BG3 starts 256 × 512 from the background map's first screen (sStageBgDimensions); BG0 is off
      bg = state.bg = { flags: 0, base: 0, tall: true, x: 0, y: 0, bg0: null };
      state.backLines = null;
      if (i > 0) { cam.minX = LAUNCH_MIN_X; bg.flags |= BG_SCROLLING; bg.tall = false; world.countDown(COUNTDOWN); }
      if (i > 1) { setMaxY(BOOSTER_DEPART_MAX_Y); world.countDown(COUNTDOWN); }
      if (i > 2) { bg.flags = (bg.flags | BG_SPACE) & ~BG_SCROLLING; setMaxY(MIDDLE_DEPART_MAX_Y); world.countDown(COUNTDOWN); }
      if (i > 0) walls(cam);
    },
    background(cam) {
      if (bg.flags & BG_STOPPED) return;
      const t = state.tick, i = state.checkpointIndex, down = -(t * 2) & 0x1FF;
      // the HBlank callback runs only on the frames a branch adds it
      if (bg.bg0) bg.bg0.callback = false;
      if (i === 0) {
        // the launch tower at sunset, on the map's fourth screen, scrolled sideways a little with the camera
        Object.assign(bg, { tall: true, base: 2, x: Math.trunc(cam.x * 16 / 816), y: 256 });
      } else if (i < 3) {
        if (!(bg.flags & BG_SCROLLING)) {
          // still on the tower until the climb's scroll comes round to it
          Object.assign(bg, { tall: true, base: 2, x: Math.trunc(cam.x * 16 / 816) });
          if (down === bg.y) bg.flags |= BG_SCROLLING;
        } else {
          // the sky scrolls down 2 px a frame, up the third screen from the tower, which it then loops
          if (down === 0) bg.tall = false;
          Object.assign(bg, { base: 2, x: 0, y: bg.tall ? down : down & 0xFF });
        }
      } else if (bg.base === 2) {
        bg.x = 0; bg.y = -(t * 2) & 0xFF;
        if (down === 256 && bg.flags & BG_SPACE) Object.assign(bg, { y: 256, tall: true, base: 1 });
      } else if (bg.base === 1) {
        // up the second screen to the top of the atmosphere
        bg.x = 0; bg.y = down;
        if (down === 0) Object.assign(bg, { y: -(t * 2 + 256) & 0x1FF, tall: true, base: 0 });
      } else if (bg.tall) {
        // into space, the first screen; BG0 comes on over it with the same screen, lightened on some lines
        bg.x = 0; bg.y = -(t * 2 + 256) & 0x1FF;
        if (bg.y < SCREEN_H) bg.bg0 = { x: 0, y: (t >> 3) & 0xFF, callback: true, table: false };
        if (bg.y === 0) {
          Object.assign(bg, { y: down & 0xFF, tall: false, base: 0 });
          bg.bg0 = { x: 0, y: (t >> 1) & 0xFF, callback: true, table: false };
        }
      } else {
        // space: BG3's stars drift down slowly, BG0's faster; while no separation uses the HBlank offsets, BG0's
        // lines from 100 show other parts of the map (sub_80078D4)
        Object.assign(bg, { tall: false, base: 0, x: 0, y: (t >> 6) & 0xFF });
        bg.bg0 = { x: 0x74, y: (t >> 3) & 0xFF, callback: true, table: !(bg.flags & BG_SCROLLING), k: (t >> 5) & 0x7F };
      }
    },
    // what the separations change: the background's flags, and the back layer's lines (null: as they are)
    flag(set, clear = 0) { bg.flags = (bg.flags | set) & ~clear; },
    split(lines) { state.backLines = lines; },
  };
}

/** The task for an Egg Rocket checkpoint entity, or null when `e` is not one. */
export function createEggRocketCheckpoint(e, slot, ctx) {
  if (e.kind !== CHECKPOINT || ctx.world.level !== EGG_ROCKET) return null;
  const index = (e.d[0] << 24) >> 24;
  let passed = index <= ctx.world.checkpointIndex;
  return {
    run(ctx) {
      const p = ctx.player;
      // the first counts once Sonic's centre is past it; the others once his feet are above its base + 4
      const reached = index === 1 ? Math.floor(p.x) > e.x : Math.floor(p.y) + p.offsetY < e.y + 4;
      if (!passed && reached && !p.carried) {
        ctx.world.passCheckpoint(index, e.x, e.y - p.offsetY);
        passed = true;
        if (offCam(e.x, e.y, ctx.cam)) slot.live = null;   // what its spinning task does first, here at once
        if (index === 1) { p.xsp = 0; p.gsp = 0; ctx.add(launch(ctx), TRANSITIONS); }
        if (SEPARATIONS[index]) { ctx.world.stopClock(); ctx.add(separation(SEPARATIONS[index], ctx), TRANSITIONS); }
        return slot.live !== null;
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

// CreateEggRocketLaunchScreenShakeEffect: a short shake, the camera kept right of the tower, Sonic's input
// ignored; a second later a five-second random shake with an explosion every 16 frames, then the countdown
// starts and Sonic can move again
function launch(ctx) {
  const { world, player } = ctx;
  ctx.add(screenShake(0x800, 8, 16, 10, SHAKE.VERTICAL), SCREEN_SHAKE);
  world.camera.minX = LAUNCH_MIN_X;
  walls(world.camera);
  player.ignoreInput = true;
  let n = 60, rumbling = false;
  return {
    run(ctx) {
      if (!rumbling) {
        if (--n === 0) {
          n = 300; rumbling = true;
          ctx.add(screenShake(0x800, 8, 16, 300, SHAKE.VERTICAL | SHAKE.RANDOM), SCREEN_SHAKE);
        }
        return true;
      }
      if ((n & 0xF) === 0) world.playSound(SONG.EXPLOSION);
      if (--n !== 0) return true;
      world.countDown(COUNTDOWN);
      player.ignoreInput = false;
      return false;
    },
  };
}

// CreateEggRocketStageSeparation(worldY): Sonic held still and the camera's bottom kept at the split while it
// pans down until the split is mid-screen; then the stage below shakes and falls away, scrolled down on the
// back layer below the split, with nuts, bolts and explosions; the camera pans back up until the split is at
// the screen's bottom, the bottom stays there, and the countdown starts again
function separation(worldY, ctx) {
  const { world, player } = ctx;
  const cam = world.camera, act = world.act;
  let q6 = 0, q8 = 0, n = 0, phase = 0;
  player.ignoreInput = true; player.xsp = 0; player.gsp = 0;
  cam.maxY = worldY;   // the original's worldY + DISPLAY_HEIGHT
  walls(cam);
  // the back layer's lines on screen while the stage slips: above the split as they are, then a gap (BG2's
  // offsets point at a buffer row nothing draws) down to the falling stage, its rows moved down by q8; only
  // while q6's line is below the screen's top and the falling stage's top above its bottom
  const slip = () => {
    const top = worldY + (q6 >> 8) - ctx.cam.y, below = worldY + (q8 >> 8) - ctx.cam.y;
    act.split(top > 0 && below < SCREEN_H ? { y: worldY, shift: q8 >> 8 } : null);
  };
  const debris = () => {
    if ((n++ & 0xF) !== 0) return;
    throwNutsAndBolts(ctx);
    world.playSound(SONG.EXPLOSION);
  };
  const steps = [
    // Task_8028CE4: the camera pans down 1 px a frame
    () => {
      if (++cam.shiftY < worldY - ctx.cam.y + SCREEN_H / 2) return;
      throwNutsAndBolts(ctx);
      ctx.add(screenShake(0x800, 8, 0x10, 0xA, SHAKE.VERTICAL), SCREEN_SHAKE);
      world.playSound(SONG.CRUMBLING_PLATFORM);
      phase = 1;
    },
    // Task_8028F20: the stage starts to slip; at the second separation the climb's sky has to come round
    // first, and space is next
    () => {
      q6 += 8; q8 += 16;
      if (q6 >= 0x400 && (world.checkpointIndex === 2 || (-(world.tick * 2) & 0x1FF) === 0x102)) {
        phase = 2; n = 0;
        if (world.checkpointIndex === 3) act.flag(BG_SPACE);
        return steps[2]();
      }
      slip();
    },
    // Task_8029070: 41 more frames of that, then a long shake
    () => {
      q6 += 8; q8 += 16;
      if (n++ > 40) {
        phase = 3; n = 0;
        ctx.add(screenShake(0x800, 8, 0x10, -1, SHAKE.VERTICAL | SHAKE.HORIZONTAL | SHAKE.RANDOM), SCREEN_SHAKE);
        return steps[3]();
      }
      slip();
    },
    // Task_8029194: it falls 2 px a frame, nuts, bolts and an explosion every 16 frames, until off the screen
    () => {
      q8 += 0x200; q6 += 0x100;
      debris();
      if (worldY + (q8 >> 8) - ctx.cam.y > SCREEN_H) { phase = 4; return steps[4](); }
      slip();
    },
    // Task_80294A8: the camera pans back up 1 px a frame, the debris going on, all below the split a gap
    () => {
      cam.shiftY--;
      debris();
      if (ctx.cam.y > worldY - SCREEN_H) { act.split({ y: worldY, shift: Infinity }); return; }
      cam.shiftY = 0;
      const i = world.checkpointIndex;
      if (i > 1) { cam.maxY = BOOSTER_DEPART_MAX_Y - SCREEN_H; world.stopClock(false); world.countDown(COUNTDOWN); }
      if (i > 2) { cam.maxY = MIDDLE_DEPART_MAX_Y - SCREEN_H; world.stopClock(false); world.countDown(COUNTDOWN); }
      walls(cam);
      player.ignoreInput = false;
      act.split(null);
      act.flag(0, BG_SCROLLING);
      return false;
    },
  ];
  return { run: () => steps[phase]() !== false };
}

// mGBA's brightness increase on an 8-bit channel, as the title card's darkening follows its decrease
const brighten = (v, evy) => {
  let o = 0xFF000000;
  for (let s = 0; s < 24; s += 8) {
    const a = (v >>> s) & 0xFF;
    o |= (a + (((255 - a) * evy) >> 4)) << s;
  }
  return o >>> 0;
};
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Draws the act's background into `out` (W × H, colours as pal32 values) from `map`, the 256 × 1024 background
 * map's colour indices, and `bg` (state.bg): BG3 a window of the map from its screen `base`, 256 × 256 or
 * 256 × 512, scrolled and wrapping, colour 0 the backdrop; BG0, once on, the map's first screen over it, colour
 * 0 clear. HBlankCallback_803FA1C makes BG0 256 × 512 at (0, 160) from line 101 and brightens it on lines
 * 103 to 134 (BLDY 16 − ((line − 102) >> 1)); in space its per-line offsets take over from line 100. `ox` and
 * `oy` place the original screen in a wider view.
 */
export function drawEggRocketBackground(out, pal32, map, bg, W, H, ox, oy) {
  const { width, pixels } = map, rows = bg.tall ? 512 : 256;
  for (let y = 0; y < H; y++) {
    const src = (bg.base * 256 + mod(bg.y + y - oy, rows)) * width;
    for (let x = 0; x < W; x++) out[y * W + x] = pal32[pixels[src + ((bg.x + x - ox) & 0xFF)]];
  }
  const b = bg.bg0;
  if (!b) return;
  for (let y = 0; y < H; y++) {
    const line = y - oy;
    let bx = b.x, by = b.y, n = 256;
    if (b.callback && line > 100) { bx = 0; by = SCREEN_H; n = 512; }
    if (b.table && line >= 100) { bx = 0; by = line < 104 ? SCREEN_H : line >= 232 - b.k ? b.k + 32 : b.k + SCREEN_H; }
    const src = mod(by + line, n) * width, evy = b.callback && line >= 103 && line <= 134 ? 16 - ((line - 102) >> 1) : 0;
    for (let x = 0; x < W; x++) {
      const c = pixels[src + ((bx + x - ox) & 0xFF)];
      if (c) out[y * W + x] = evy ? brighten(pal32[c], evy) : pal32[c];
    }
  }
}
