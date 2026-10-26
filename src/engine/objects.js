// The original's task list and its entities manager (SAT-R decompilation, src/task.c and
// src/game/shared/stage/entities_manager.c), with the objects it spawns: springs, spikes, layer toggles,
// platforms (thin, falling, sinking, rising and square), boulders, blocks of ice, breakable walls, moving springs, ferris wheels, underwater lava platforms, waterfalls, boosters, checkpoints, wall poles, grind
// rails, the incline ramp, the half-pipe, the forced slide, the mini loops, the water bridge, the shrubbery, the
// goal, the special spring, the hook rails, the deep snow, the air bubbles, the skating stones, the security gates, the conveyor belts, the steam exhausts, the swinging hooks, Angel Island's torches, floats, lifts, bowls, run wheels, updrafts and iron balls, swing
// ropes and crane claws, the visibility toggles, Secret Base's pipe curler, the multiplayer stages' mystery item
// boxes, item boxes, enemies, and a stand-in for each kind that this game doesn't build yet, so that every task
// keeps its place in the list.
//
// A task is { run(ctx) } and returns false from run() when it ends. The list runs once a frame in priority
// order, and the tasks of a priority in the order they were made. The original fetches the next task before
// it runs the current one and puts a new task after the last one of its priority, so a task made by the one
// just before its place in the list (the last of its priority, say) only runs from the next frame.

import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { createSpring, createHidingSpring } from './springs.js';
import { createSpikes } from './spikes.js';
import { ENEMIES } from './enemies.js';
import { createItemBox } from './itembox.js';
import { createPlatform } from './platforms.js';
import { createBoulder } from './boulders.js';
import { createIceBlock } from './iceblocks.js';
import { createBreakableWall } from './breakablewalls.js';
import { createSquarePlatform } from './squareplatforms.js';
import { createFerrisWheel } from './ferriswheels.js';
import { createMovingSpring } from './movingsprings.js';
import { createSlowPlatform } from './slowplatforms.js';
import { createLavaPlatform } from './lavaplatforms.js';
import { createWaterfall } from './waterfalls.js';
import { createBooster } from './boosters.js';
import { createCheckpoint } from './checkpoints.js';
import { createWallPole } from './wallpoles.js';
import { createGrindRail } from './grindrails.js';
import { createRamp } from './ramps.js';
import { createHalfPipe } from './halfpipes.js';
import { createSlide } from './slides.js';
import { createMiniLoop } from './miniloops.js';
import { createWaterBridge, createBridgeSplash } from './waterbridges.js';
import { createShrub } from './shrubs.js';
import { createGoal, STAGE_GOAL } from './goal.js';
import { createSpecialSpring } from './specialspring.js';
import { createHookRail } from './hookrails.js';
import { createSecurityGate } from './securitygates.js';
import { createConveyor } from './conveyors.js';
import { createSwingingHook } from './swinginghooks.js';
import { createSwingRope } from './swingropes.js';
import { createVisibilityToggle } from './visibility.js';
import { createCurler } from './curlers.js';
import { createMarbleTrack } from './marbletrack.js';
import { createCraneClaw } from './craneclaws.js';
import { createLava } from './lava.js';
import { createHidingSpikes } from './hidingspikes.js';
import { createTube } from './pipes.js';
import { createSteamExhaust } from './steamexhausts.js';
import { createPartyBalloon } from './balloons.js';
import { createBumper } from './bumpers.js';
import { createFlipper } from './flippers.js';
import { createSegaSonicLetter } from './segaletters.js';
import { createTeleportOrb } from './teleportorbs.js';
import { createTubeJunction } from './junctions.js';
import { createBarrelOfDoomMini } from './barrels.js';
import { createRedFlag } from './redflags.js';
import { createShipSwing } from './shipswing.js';
import { createSpikedPlatform } from './spikedplatforms.js';
import { createBowl } from './bowls.js';
import { createPanelGate } from './panelgates.js';
import { createCarousel } from './carousel.js';
import { createSnow } from './snow.js';
import { createAirBubbles } from './airbubbles.js';
import { createSkatingStone } from './skatingstones.js';
import { createTorch } from './torches.js';
import { createBoulderSpawner } from './boulderspawners.js';
import { createFloat } from './floats.js';
import { createLift } from './lifts.js';
import { createRunWheel } from './runwheels.js';
import { createUpdraft } from './updrafts.js';
import { createIronBall } from './ironballs.js';
import { createTube as createRollTube } from './tubes.js';
import { createHangBar } from './hangbars.js';
import { createConveyorBeltObject } from './conveyorobject.js';
import { createSpikedBarrel } from './spikedbarrel.js';
import { createPropeller } from './propeller.js';
import { createToggleGravity } from './gravity.js';
import { createMysteryBox } from './mysterybox.js';

export const OBJECTS = 0x2000;   // the priority of the entities and of most tasks they make

/**
 * The task list: add(task, priority, permanent), run(ctx), stop(), which ends this frame's run after the
 * task running now, removeRange(from, to), and reset(), which keeps the permanent tasks.
 */
export function createTasks() {
  let list = [], next = null;
  return {
    add(task, priority = OBJECTS, permanent = false) {
      task.priority = priority; task.permanent = permanent;
      const at = list.findIndex(t => t.priority > priority);
      list.splice(at < 0 ? list.length : at, 0, task);
    },
    // with `after`, only the tasks of a higher priority run, as on the frame a task of that priority makes the act
    run(ctx, after = -1) {
      for (let t = list.find(t => t.priority > after); t; t = next) {
        next = list[list.indexOf(t) + 1] ?? null;
        if (!t.run(ctx) && list.includes(t)) list.splice(list.indexOf(t), 1);
        if (next?.destroyed) next = list.find(u => u.priority > t.priority) ?? null;
      }
    },
    stop() { next = null; },
    /** TasksDestroyInPriorityRange: the tasks from priority `from` up to `to`, not included, go at once. */
    removeRange(from, to) { list = list.filter(t => t.priority < from || t.priority >= to); },
    /** Every task from priority `lo` to `hi`, permanent or not, goes at once, calling a task's destroy() if it has one. */
    destroyRange(lo, hi) {
      for (const t of list) if (t.priority >= lo && t.priority <= hi) { t.destroyed = true; t.destroy?.(); }
      list = list.filter(t => !t.destroyed);
    },
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

// The kinds not built yet, as tasks at the objects' priority that do nothing but leave when their spawn point
// does.
function standIn(e, slot) {
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      return true;
    },
  };
}

// what an interactable spawns as, in act `level` of `zone`
function interactable(e, slot, anims, ctx, level, zone) {
  if (e.kind === TOGGLE_FRONT || e.kind === TOGGLE_BACK) return toggle(e, slot);
  const def = createSpring(e) ?? createSpikes(e);
  return def ? objectTask(def, slot, anims) : createHidingSpikes(e, slot, anims) ?? createPlatform(e, slot, anims) ?? createBoulder(e, slot, anims) ?? createIceBlock(e, slot, anims) ?? createBreakableWall(e, slot, anims) ?? createMovingSpring(e, slot, anims) ?? createSquarePlatform(e, slot, anims) ?? createSlowPlatform(e, slot, anims) ?? createFerrisWheel(e, slot, anims) ?? createLavaPlatform(e, slot, anims) ?? createWaterfall(e, slot, anims, ctx)
    ?? createBooster(e, slot, anims) ?? createCheckpoint(e, slot, anims, ctx) ?? createWallPole(e, slot, anims) ?? createGrindRail(e, slot)
    ?? createRamp(e, slot) ?? createHalfPipe(e, slot) ?? createSlide(e, anims, zone) ?? createMiniLoop(e, slot)
    ?? createWaterBridge(e, slot, anims) ?? createBridgeSplash(e, slot, anims) ?? createShrub(e, slot, anims)
    ?? createSpecialSpring(e, slot, anims) ?? createHookRail(e, slot, anims) ?? createSecurityGate(e, slot, anims)
    ?? createConveyor(e, slot, ctx) ?? createSteamExhaust(e, slot, anims) ?? createSwingingHook(e, slot, anims)
    ?? createSwingRope(e, slot) ?? createCraneClaw(e, slot, anims) ?? createVisibilityToggle(e, slot) ?? createCurler(e, slot)
    ?? createMarbleTrack(e, slot, anims, level) ?? createLava(e, slot) ?? createTube(e, slot, anims, level)
    ?? createPartyBalloon(e, slot, anims) ?? createBumper(e, slot, anims) ?? createFlipper(e, slot, anims)
    ?? createSegaSonicLetter(e, slot, anims) ?? createTeleportOrb(e, slot) ?? createTubeJunction(e, slot)
    ?? createBarrelOfDoomMini(e, slot, anims) ?? createRedFlag(e, slot, anims) ?? createShipSwing(e, slot, anims)
    ?? createSpikedPlatform(e, slot, anims, zone) ?? createBowl(e, slot, anims) ?? createPanelGate(e, slot, anims)
    ?? createCarousel(e, slot, anims) ?? createSnow(e, slot, ctx) ?? createAirBubbles(e, slot, anims) ?? createSkatingStone(e, slot, anims, ctx)
    ?? createTorch(e, slot, ctx.world) ?? createBoulderSpawner(e, slot, anims) ?? createFloat(e, slot) ?? createLift(e, slot, anims)
    ?? createRunWheel(e, slot, anims) ?? createUpdraft(e, slot, anims) ?? createIronBall(e, slot, anims)
    ?? createRollTube(e, slot) ?? createHidingSpring(e, slot, anims) ?? createHangBar(e, slot) ?? createConveyorBeltObject(e, slot, anims) ?? createSpikedBarrel(e, slot, anims) ?? createPropeller(e, slot, anims) ?? createToggleGravity(e, slot, ctx)
    ?? createMysteryBox(e, slot, anims, ctx)
    ?? (e.kind === STAGE_GOAL ? createGoal(e, slot, anims) : standIn(e, slot));
}

/**
 * The entities manager (Task_8008DCC): each frame it spawns the entities whose spawn point the camera's
 * move brought into the range of 128 px around the screen, scanning the strip it uncovered sideways, then
 * the one it uncovered up or down, region by region and, in each region, its interactables, then its item
 * boxes, then its enemies. On its first frame, and after a jump of more than 248 px across or 208 down, it
 * spawns everything in range (SpawnMapEntities). A task that leaves sets its slot's `live` back to null, so
 * it can spawn again when its point is uncovered again; a defeated enemy's slot is `gone` until the act
 * starts over, and a task that changes its entity's data bytes (the act's copy, in the original) keeps them
 * in its slot's `d` until then.
 *
 * `stage` has interactables, itemBoxes, enemies and entityRegions; `tasks` is the list it adds to. Each game
 * keeps its own copy of the entities' data, which some objects change (the mystery item boxes' counts).
 */
export function createEntities(stage, anims, tasks) {
  const { x: regionsX, y: regionsY } = stage.entityRegions;
  const regions = Array.from({ length: regionsX * regionsY }, () => []);
  const slot = (e, spawn) => ({ e: { ...e, d: e.d.slice() }, live: null, gone: false, d: null, spawn });
  const interactables = (s, ctx) => interactable(s.e, s, anims, ctx, stage.level, stage.zone);
  for (const [list, spawn] of [
    [stage.interactables, interactables],
    [stage.itemBoxes, s => createItemBox(s.e, s, anims)],
    [stage.enemies, (s, ctx) => ENEMIES[s.e.kind]?.(s.e, s, anims, ctx) ?? standIn(s.e, s)],
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
          s.e.changed = false;
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
    /** The interactable at place `id` in region (rx, ry)'s list, as the room events name one. */
    interactable(rx, ry, id) { return regions[rx + ry * regionsX]?.find(s => s.spawn === interactables && s.e.id === id)?.e ?? null; },
    /**
     * Another player's change to that interactable (ReceiveRoomEvent_PlatformChange): a live one sees it as
     * `changed` until it leaves (MAP_ENTITY_STATE_MINUS_THREE); with action 0 one that isn't live never
     * spawns again.
     */
    change(rx, ry, id, action) {
      const s = regions[rx + ry * regionsX]?.find(s => s.spawn === interactables && s.e.id === id);
      if (s?.live) s.e.changed = true;
      else if (s && action === 0) s.gone = true;
    },
    /** Everything leaves and the next scan spawns what is in range, as when the act starts over. */
    reset() {
      prev = null;
      for (const r of regions) for (const s of r) { s.live = null; s.gone = false; s.d = null; s.e.changed = false; }
    },
  };
}
