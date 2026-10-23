// The act's objects, spawned and removed around the camera like the original's entities manager (SAT-R
// decompilation, src/game/shared/stage/entities_manager.c). They run before Sonic each frame, so they see
// where he was at the end of the last one.

import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { createSpring } from './springs.js';

// objects live while their origin is within this range of the screen's top-left corner; the original's
// entities manager spawns them in the same window, scanning the strips the camera uncovers
const RANGE = { left: -128, right: 240 + 128, top: -128, bottom: 160 + 128 };
const inRange = (o, cx, cy) => {
  const sx = o.x - cx, sy = o.y - cy;
  return sx >= RANGE.left && sx <= RANGE.right && sy >= RANGE.top && sy <= RANGE.bottom;
};

const FACTORIES = [createSpring];

// a hitbox under the sprite's flips, as the sprite system applies them when the box is set
function flipBox(box, flipX, flipY) {
  if (!box) return null;
  let [l, t, r, b] = box;
  if (flipY) [t, b] = [-b, -t];
  if (flipX) [l, r] = [-r, -l];
  return [l, t, r, b];
}

export function createObjects(entities, anims) {
  // one slot per entity that the engine knows how to run
  const slots = [];
  for (const e of entities) {
    for (const make of FACTORIES) {
      const def = make(e);
      if (def) { slots.push({ def, live: null }); break; }
    }
  }

  // steps the object's animation; the hitboxes set before a frame take effect when it appears, and the
  // sprite keeps its last frame until the next animation shows its first
  function animate(o) {
    const ended = tickAnim(o.anim, anims);
    if (o.anim.i !== o.shown) {
      o.shown = o.anim.i;
      const boxes = anims[o.anim.name].frames[o.anim.i][2];
      if (boxes) for (const [slot, box] of Object.entries(boxes)) o.boxes[slot] = flipBox(box, o.flipX, o.flipY);
      o.frame = frameOf(o.anim, anims);
    }
    return ended;
  }
  function start(o, name, restart = false) { setAnim(o.anim, name, restart); o.shown = -1; }

  function spawn(def) {
    const o = { ...def, anim: makeAnimator(), shown: -1, frame: -1, boxes: [null, null], launching: false };
    start(o, o.idle); animate(o);
    return o;
  }

  return {
    /** Spawns, runs and removes objects for this frame. `world` provides terrain and playSound(song). */
    update(player, cam, world) {
      const cx = Math.floor(cam.x), cy = Math.floor(cam.y);
      for (const s of slots) {
        if (!s.live && inRange(s.def, cx, cy)) s.live = spawn(s.def);
        const o = s.live;
        if (!o) continue;
        const hit = o.collide(o, player, world.terrain);
        if (hit && o.sound) world.playSound(o.sound);
        if (!inRange(o, cx, cy)) { s.live = null; continue; }
        if (o.launching) {
          // a hit during the launch restarts it, except on the diagonal springs
          if (hit && o.restarts) start(o, o.launch, true);
          if (animate(o)) { o.launching = false; start(o, o.idle); animate(o); }
        } else if (hit) {
          o.launching = true;
          start(o, o.launch);   // its first frame shows on the next one
        }
      }
    },
    /** The live objects, in the order they run; each has x, y, frame (an atlas index), flipX and flipY. */
    live() { return slots.filter(s => s.live).map(s => s.live); },
  };
}
