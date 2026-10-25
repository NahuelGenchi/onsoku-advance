// The original's task list and its entities manager (SAT-R decompilation, src/task.c and
// src/game/shared/stage/entities_manager.c), with the objects it spawns: springs, spikes, layer toggles,
// platforms, boulders, waterfalls, boosters, checkpoints, wall poles, grind rails, the incline ramp, the
// half-pipe, the forced slide, item boxes, enemies, and a stand-in for each kind of act 1's that this game
// doesn't build yet, so that every task keeps its place in the list.
//
// A task is { run(ctx) } and returns false from run() when it ends. The list runs once a frame in priority
// order, and the tasks of a priority in the order they were made. The original fetches the next task before
// it runs the current one and puts a new task after the last one of its priority, so a task made by the one
// just before its place in the list (the last of its priority, say) only runs from the next frame.

import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { createSpring } from './springs.js';
import { createSpikes } from './spikes.js';
import { ENEMIES } from './enemies.js';
import { createItemBox } from './itembox.js';
import { createPlatform } from './platforms.js';
import { createBoulder } from './boulders.js';
import { createWaterfall } from './waterfalls.js';
import { createBooster } from './boosters.js';
import { createCheckpoint } from './checkpoints.js';
import { createWallPole } from './wallpoles.js';
import { createGrindRail } from './grindrails.js';
import { createRamp } from './ramps.js';
import { createHalfPipe } from './halfpipes.js';
import { createSlide } from './slides.js';
import { createTorch } from './torches.js';

export const OBJECTS = 0x2000;   // the priority of the entities and of most tasks they make

/**
 * The task list: add(task, priority, permanent), run(ctx), stop(), which ends this frame's run after the
 * task running now, and reset(), which keeps the permanent tasks.
 */
export function createTasks() {
  let list = [], next = null;
  return {
    add(task, priority = OBJECTS, permanent = false) {
      task.priority = priority; task.permanent = permanent;
      const at = list.findIndex(t => t.priority > priority);
      list.splice(at < 0 ? list.length : at, 0, task);
    },
    run(ctx) {
      for (let t = list[0]; t; t = next) {
        next = list[list.indexOf(t) + 1] ?? null;
        if (!t.run(ctx)) list.splice(list.indexOf(t), 1);
      }
    },
    stop() { next = null; },
    reset() { list = list.filter(t => t.permanent); next = null; },
  };
}

/** IS_OUT_OF_CAM_RANGE on the screen position of world point (x, y): out unless x is in -128..368 and y in -128..288. */
export const offCam = (x, y, cam) => ((x - cam.x + 128) & 0xFFFF) > 496 || y - cam.y + 128 < 0 || y - cam.y > 288;
/** IS_OUT_OF_DISPLAY_RANGE on world point (x, y): more than 128 px out from the screen. */
export const offDisplay = (x, y, cam) => x > cam.x + 368 || x < cam.x - 128 || y > cam.y + 288 || y < cam.y - 128;

// a hitbox under the sprite's flips, as the sprite system applies them when the box is set
function flipBox(box, flipX, flipY) {
  if (!box) return null;
  let [l, t, r, b] = box;
  if (flipY) [t, b] = [-b, -t];
  if (flipX) [l, r] = [-r, -l];
  return [l, t, r, b];
}

/** A sprite that keeps the hitboxes its script sets. `order` is its OAM order, `prio` its BG priority. */
export function makeSprite(name, { flipX = false, flipY = false, order = 18, prio = 2 } = {}) {
  const s = { anim: makeAnimator(), shown: -1, frame: -1, boxes: [null, null], flipX, flipY, order, prio };
  setAnim(s.anim, name);
  return s;
}

/** Switches the sprite's animation; the same one carries on unless `restart` (the original's prevVariant = -1). */
export function startAnim(s, name, restart = false) {
  if (s.anim.name === name && !restart) return;
  setAnim(s.anim, name, true); s.shown = -1;
}

/**
 * Steps the sprite's animation (UpdateSpriteAnimation). The hitboxes set before a frame take effect when it
 * appears, and the sprite keeps its last frame until the next animation shows its first. Returns true on
 * the tick a one-shot animation ends.
 */
export function animate(s, anims) {
  const ended = tickAnim(s.anim, anims);
  if (s.anim.i !== s.shown) {
    s.shown = s.anim.i;
    const boxes = anims[s.anim.name].frames[s.anim.i][2];
    if (boxes) for (const [slot, box] of Object.entries(boxes)) if (slot < 2) s.boxes[slot] = flipBox(box, s.flipX, s.flipY);
    s.frame = frameOf(s.anim, anims);
  }
  return ended;
}

// a spring or spike: it runs its collision, plays its animation and goes when its spawn point leaves the
// range around the camera
function objectTask(def, slot, anims) {
  const o = { ...def, ...makeSprite(def.idle, { flipX: def.flipX, flipY: def.flipY, order: def.order ?? 18 }), launching: false };
  animate(o, anims);
  return {
    run(ctx) {
      const hit = o.collide(o, ctx.player, ctx.world);
      if (hit && o.sound) ctx.world.playSound(o.sound);
      if (offCam(o.x, o.y, ctx.cam)) { slot.live = null; return false; }
      if (o.launching) {
        // a hit during the launch restarts it, except on the diagonal springs
        if (hit && o.restarts) startAnim(o, o.launch, true);
        if (animate(o, anims)) { o.launching = false; startAnim(o, o.idle); animate(o, anims); }
      } else if (hit) {
        o.launching = true;
        startAnim(o, o.launch);   // its first frame shows on the next one
      }
      ctx.draw(o, o.x, o.y);
      return true;
    },
  };
}

// layer toggles (toggle_player_layer.c): while Sonic's centre is inside one, the front one puts him on the
// front layer and the back one on the back layer; it sees where he was at the end of the last frame
const TOGGLE_FRONT = 17, TOGGLE_BACK = 18;
function toggle(e, slot) {
  const w = e.d[2] * 8, h = e.d[3] * 8;
  return {
    run(ctx) {
      const p = ctx.player, x = Math.floor(p.x), y = Math.floor(p.y);
      if (x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h) p.layer = e.kind === TOGGLE_FRONT ? 0 : 1;
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

// The act 1 kinds not built yet, as tasks at the objects' priority that do nothing but leave when their
// spawn point does. The stage goal makes no task while its d1 is 0.
const STAGE_GOAL = 0;
function standIn(e, slot, kind = e.kind) {
  if (kind === STAGE_GOAL && e.d[1] === 0) return null;
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

// what an interactable spawns as
function interactable(e, slot, anims, ctx) {
  if (e.kind === TOGGLE_FRONT || e.kind === TOGGLE_BACK) return toggle(e, slot);
  const def = createSpring(e) ?? createSpikes(e);
  return def ? objectTask(def, slot, anims) : createPlatform(e, slot, anims) ?? createBoulder(e, slot, anims) ?? createWaterfall(e, slot, anims)
    ?? createBooster(e, slot, anims) ?? createCheckpoint(e, slot, anims, ctx) ?? createWallPole(e, slot, anims) ?? createGrindRail(e, slot)
    ?? createRamp(e, slot) ?? createHalfPipe(e, slot) ?? createSlide(e, anims) ?? createTorch(e, slot) ?? standIn(e, slot);
}

/**
 * The entities manager (Task_8008DCC): each frame it spawns the entities whose spawn point the camera's
 * move brought into the range of 128 px around the screen, scanning the strip it uncovered sideways, then
 * the one it uncovered up or down, region by region and, in each region, its interactables, then its item
 * boxes, then its enemies. On its first frame, and after a jump of more than 248 px across or 208 down, it
 * spawns everything in range (SpawnMapEntities). A task that leaves sets its slot's `live` back to null, so
 * it can spawn again when its point is uncovered again; a defeated enemy's slot is `gone` until the act
 * starts over.
 *
 * `stage` has interactables, itemBoxes, enemies and entityRegions; `tasks` is the list it adds to.
 */
export function createEntities(stage, anims, tasks) {
  const { x: regionsX, y: regionsY } = stage.entityRegions;
  const regions = Array.from({ length: regionsX * regionsY }, () => []);
  const slot = (e, spawn) => ({ e, live: null, gone: false, spawn });
  for (const [list, spawn] of [
    [stage.interactables, (s, ctx) => interactable(s.e, s, anims, ctx)],
    [stage.itemBoxes, s => createItemBox(s.e, s, anims)],
    [stage.enemies, (s, ctx) => ENEMIES[s.e.kind]?.(s.e, s, anims, ctx) ?? standIn(s.e, s, -1)],
  ]) {
    // each region keeps its interactables, then its item boxes, then its enemies
    for (const e of list) regions[e.rx + e.ry * regionsX].push(slot(e, spawn));
  }
  const width = regionsX * 256, height = regionsY * 256;
  let prev = null;   // the camera the last scan saw; null spawns everything in range

  // CamCoord clamps of the original: below 0 to 0, past the grid to its last pixel
  const clampX = v => Math.min(Math.max(v, 0), width - 1), clampY = v => Math.min(Math.max(v, 0), height - 1);
  // spawns what lies in the range: the regions scanned are those that start below its far edges
  function scan(ctx, x0, x1, y0, y1) {
    for (let ry = y0 >> 8; ry * 256 < y1 && ry < regionsY; ry++) {
      for (let rx = x0 >> 8; rx * 256 < x1 && rx < regionsX; rx++) {
        for (const s of regions[rx + ry * regionsX]) {
          const { x, y } = s.e;
          if (s.live || s.gone || x < x0 || x > x1 || y < y0 || y > y1) continue;
          const task = s.spawn(s, ctx);
          if (!task) continue;
          s.live = task;
          tasks.add(task, task.priority ?? OBJECTS);
        }
      }
    }
  }

  return {
    manager: {
      run(ctx) {
        const cam = ctx.cam;
        if (!prev || Math.abs(cam.x - prev.x) > 248 || Math.abs(cam.y - prev.y) > 208) {
          scan(ctx, clampX(cam.x - 128), clampX(cam.x + 368), clampY(cam.y - 128), clampY(cam.y + 288));
          prev = { ...cam };
          return true;
        }
        // the strip uncovered sideways, the full height of the range, then the one uncovered up or down,
        // its full width
        const [ax0, ax1] = cam.x > prev.x ? [prev.x + 368, cam.x + 368] : [cam.x - 128, prev.x - 128];
        const [by0, by1] = cam.y > prev.y ? [prev.y + 288, cam.y + 288] : [cam.y - 128, prev.y - 128];
        const a = [clampX(ax0), clampX(ax1), clampY(cam.y - 128), clampY(cam.y + 288)];
        const b = [clampX(cam.x - 128), clampX(cam.x + 368), clampY(by0), clampY(by1)];
        if (cam.x !== prev.x && a[0] !== a[1] && a[2] !== a[3]) scan(ctx, ...a);
        if (cam.y !== prev.y && b[2] !== b[3] && b[0] !== b[1]) scan(ctx, ...b);
        prev = { ...cam };
        return true;
      },
    },
    /** Everything leaves and the next scan spawns what is in range, as when the act starts over. */
    reset() {
      prev = null;
      for (const r of regions) for (const s of r) { s.live = null; s.gone = false; }
    },
  };
}
