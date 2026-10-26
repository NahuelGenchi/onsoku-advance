// The original camera: a target derived from Sonic's position, approached with dead zones and speed caps,
// a look up / look down pan, a short freeze after a spin dash release, and a still target once Sonic dies. It never shows past its
// bounds: the act's edges, or the arena a boss sets (bosses.js). `minX` and `minY` are the least its top left corner may be, `maxX`
// and `maxY` the most (the original's maxX - 240 and maxY - 160). A screen shake (screenshake.js) moves it by shakeX and shakeY
// after it is kept inside them, as UpdateCamera does. A boss can also move its target sideways by shiftX.
// Past the act's goal it rises and, once the results have counted up, stops (stage_goal.c, stage_results.c).
// While the optional Sonic Rush boost runs, it leads him the way Rush's camera does, and as the optional Boost
// Mode starts its sideways speed limit drops, then recovers, as Sonic Advance 2's does.

import { SCREEN_W, SCREEN_H, CAMERA as C, RUSH_BOOST as R, BOOST_MODE as B } from './constants.js';

const centreY = p => Math.floor(p.y);
// how far the widescreen view slides in a frame into a boss's arena and out of it (viewOf)
const ARENA_SLIDE = 4;

// starts with Sonic centred horizontally and his body 84px from the top, not yet kept inside the act
// (InitCamera); its task's first frame only sets it going (Task_CallUpdateCamera), so it moves from the second
export function createCamera(p, terrain) {
  const cam = {
    x: Math.floor(p.x) - SCREEN_W / 2, y: centreY(p) - (SCREEN_H / 2 + 4),
    targetX: 0, targetY: 0, freeze: 0, locked: false, deadY: 0, look: 0, lookDelay: C.lookDelay, offsetY: p.offsetY - 4,
    minX: 0, minY: 0, maxX: terrain.width - SCREEN_W, maxY: terrain.height - SCREEN_H, started: false, shakeX: 0, shakeY: 0,
    // the speed caps (unk8 and unkC, which the results set to 0), the target's shift up or down (shiftY, which
    // the goal takes to -56) and how far the act's end has moved the camera back (unk20, which the background
    // scrolls without)
    speedX: C.maxSpeedX, speedY: C.maxSpeedY, shiftX: 0, shiftY: 0, wrapped: 0,
    // the Rush boost's lead: Sonic shown this far off the target's centre (8.8 px), what it eases toward, the
    // frames left of the delay after a boost starts, and where Sonic was at the last update
    leadX: 0, leadY: 0, leadTargetX: 0, leadTargetY: 0, scroll: 0, prevX: p.x, prevY: p.y,
    // the sideways speed limit in 1/256 px that Boost Mode's start lowers (Sonic Advance 2's unk8)
    boostSpeedX: C.maxSpeedX << 8,
    // the act's animated tiles, which the camera's map layer counts (animDelayCounter and animFrameCounter), and
    // the step the screen shows (stage.js animateStageTiles)
    tiles: { delay: 0, frame: 0, shown: 0 },
    // a boss's arena, { minX, maxX, minY, maxY }, its walls in the act, from when a boss starts closing the bounds
    // in on it (bosses.js, or the boss's own code) until they open again (null); only the widescreen view reads it
    arena: null,
  };
  cam.targetX = cam.x; cam.targetY = cam.y;
  return cam;
}

// CLAMP: below the least it is the least, even when that is more than the most
const within = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function clamp(cam) {
  cam.x = within(cam.x, cam.minX, cam.maxX);
  cam.y = within(cam.y, cam.minY, cam.maxY);
}

// hold up or down while standing still for 120 frames, then pan 2px per frame; ease back otherwise
function updateLook(cam, p) {
  const easeBack = () => { cam.look -= Math.sign(cam.look) * Math.min(Math.abs(cam.look), C.lookStep); };
  const looking = p.state === 'lookUp' ? -C.lookUp : p.state === 'crouch' && p.gsp === 0 ? C.lookDown : 0;
  if (!looking) { cam.lookDelay = C.lookDelay; easeBack(); return; }
  if (cam.lookDelay === 0 || --cam.lookDelay === 0) {
    if (looking < 0 && cam.look + cam.shiftY > looking) cam.look -= C.lookStep;
    if (looking > 0 && cam.look + cam.shiftY < looking) cam.look += C.lookStep;
  } else easeBack();
}

const q8 = v => Math.round(v * 256);
const clampTo = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Rush's camera lead, while boosting: for the delay after the start the target grows with each frame's
// movement, so the view falls behind him, eased by 1/4; then it is 16 times his last frame's movement ahead
// (8 times vertically, each ignored while small), eased by 1/16. Once the boost is over it eases back to 0.
function updateLead(cam, p) {
  const mx = q8(p.x - cam.prevX), my = q8(p.y - cam.prevY);
  cam.prevX = p.x; cam.prevY = p.y;
  if (!p.boost && !cam.scroll && !cam.leadX && !cam.leadY) return;
  let tx = 0, ty = 0, shift = 4;
  if (cam.scroll > 0) {
    cam.scroll--;
    tx = cam.leadTargetX + 16 * mx; ty = cam.leadTargetY + 16 * my; shift = 2;
  } else if (p.boost) {
    tx = -16 * mx; ty = -8 * my;
    if (Math.abs(tx) < R.leadMinX) tx = 0;
    if (Math.abs(ty) < R.leadMinY) ty = 0;
  }
  cam.leadTargetX = clampTo(tx, -R.leadX, R.leadX);
  cam.leadTargetY = clampTo(ty, R.leadUp, R.leadDown);
  // easing back to 0, the last fraction of a step goes too, so it doesn't stay a pixel off
  const ease = (lead, target) => {
    const d = (target - lead) >> shift;
    return d === 0 && target === 0 ? 0 : lead + d;
  };
  cam.leadX = ease(cam.leadX, cam.leadTargetX);
  cam.leadY = ease(cam.leadY, cam.leadTargetY);
}

export function updateCamera(cam, p) {
  if (!cam.started) { cam.started = true; return; }
  // it moves from where it was, kept a pixel further in from the far edges than it may end up: at the
  // bottom of the act, a dead zone can leave it a pixel up
  cam.x = within(cam.x, cam.minX, cam.maxX - 1);
  cam.y = within(cam.y, cam.minY, cam.maxY - 1);
  updateLook(cam, p);
  updateLead(cam, p);
  // a dead Sonic leaves the target where it was (unk50 bits 0–1); the view still eases onto it
  if (cam.freeze > 0) cam.freeze--;
  else if (!cam.locked) {
    cam.targetX = Math.floor(p.x) + cam.shiftX - SCREEN_W / 2 - (cam.leadX >> 8);
    // eases toward spriteOffsetY - 4 so curling up (offset 14 -> 9) doesn't jolt the view
    const want = p.offsetY - 4;
    if (cam.offsetY < want) cam.offsetY = Math.min(want, cam.offsetY + 5);
    else if (cam.offsetY > want) cam.offsetY = Math.max(want, cam.offsetY - 5);
    cam.targetY = centreY(p) + cam.shiftY - SCREEN_H / 2 + cam.look + cam.offsetY - (cam.leadY >> 8);
  }
  const dx = cam.targetX - cam.x;
  // with a lead, it keeps to the target sideways as Rush's does, without a dead zone or a speed limit
  const maxX = Math.min(cam.speedX, cam.boostSpeedX >> 8);
  if (p.boost || cam.leadX || cam.scroll) cam.x = cam.targetX;
  else if (dx > C.deadZoneX) cam.x += Math.min(maxX, dx - C.deadZoneX);
  else if (dx < -C.deadZoneX) cam.x += Math.max(-maxX, dx + C.deadZoneX);
  if (cam.boostSpeedX < C.maxSpeedX << 8) cam.boostSpeedX += B.cameraStep;

  cam.deadY = p.air ? Math.min(C.airDeadZoneY, cam.deadY + 4) : Math.max(0, cam.deadY - 4);
  const dy = cam.targetY - cam.y;
  if (dy > cam.deadY) cam.y += Math.min(cam.speedY, dy - cam.deadY);
  else if (dy < -cam.deadY) cam.y += Math.max(-cam.speedY, dy + cam.deadY);
  clamp(cam);
  cam.x += cam.shakeX; cam.y += cam.shakeY;
}

/**
 * What a view of w × h px shows around the camera (the widescreen view; 240 × 160 is the original screen): the
 * original screen's area kept inside the act, as the renderer draws it, with as much around it as fits inside
 * the act too, then moved by a screen shake. `x` and `y` are its top left corner in the act, and `wrapped` how
 * far the camera has looped back by then, which the background scrolls on from (`bx` and `by`
 * are x and y before the shake, `cx` and `cy` the original screen's), and `sx` and `sy` where the original screen is in it: in its middle, or nearer an
 * edge of the view where the view stops at an edge of the act or in a boss's arena.
 * In a boss's arena it shows nothing past the arena's walls, except where the original screen itself is:
 * `clip` is then [left, top, right, bottom], what of the view the act shows, with black around it (null for
 * all of it), and `edges` the same in the act. An arena narrower or shorter than the view sits in its middle.
 * From `prev`, the view the frame before, the view and the black's edges keep up with where they are going as
 * far as the camera moved, and close the rest at most ARENA_SLIDE px a frame, into an arena, as its walls move
 * and out of it again once they are gone (`tx`, `ty` and `targets`, where they were going).
 */
export function viewOf(cam, w = SCREEN_W, h = SCREEN_H, prev = null) {
  const cx = Math.min(Math.max(Math.floor(cam.x) - cam.shakeX, 0), cam.maxX), cy = Math.min(Math.max(Math.floor(cam.y) - cam.shakeY, 0), cam.maxY);
  let x = Math.max(0, Math.min(cx - ((w - SCREEN_W) >> 1), cam.maxX + SCREEN_W - w));
  let y = Math.max(0, Math.min(cy - ((h - SCREEN_H) >> 1), cam.maxY + SCREEN_H - h));
  const { arena: a } = cam, was = prev && prev.w === w && prev.h === h ? prev : null;
  if (!a && !was?.edges) return { x: x + cam.shakeX, y: y + cam.shakeY, w, h, wrapped: cam.wrapped, clip: null, edges: null, bx: x, by: y, cx, cy, sx: cx - x, sy: cy - y };
  // the walls, moved out to the original screen's edges where it is past them; out of an arena, none
  let walls = [-Infinity, -Infinity, Infinity, Infinity];
  if (a) {
    walls = [Math.min(a.minX, cx), Math.min(a.minY, cy), Math.max(a.maxX, cx + SCREEN_W), Math.max(a.maxY, cy + SCREEN_H)];
    const place = (v, lo, hi, size) => (hi - lo < size ? lo - ((size - (hi - lo)) >> 1) : Math.max(lo, Math.min(v, hi - size)));
    x = place(x, walls[0], walls[2], w); y = place(y, walls[1], walls[3], h);
  }
  const tx = x, ty = y;
  const slide = (from, to) => from + Math.max(-ARENA_SLIDE, Math.min(to - from, ARENA_SLIDE));
  // how far toward where it is going now from where it was going: no more than the camera moved
  const keep = (to, before, moved) => (before === undefined ? 0 : Math.max(-Math.abs(moved), Math.min(to - before, Math.abs(moved))));
  if (was) { x = slide(was.bx + keep(tx, was.tx, cx - was.cx), tx); y = slide(was.by + keep(ty, was.ty, cy - was.cy), ty); }
  // the original screen is always in the view, and never black
  x = Math.max(cx + SCREEN_W - w, Math.min(x, cx)); y = Math.max(cy + SCREEN_H - h, Math.min(y, cy));
  // the black's edges go to the walls, or to the view's own past them
  const targets = [Math.max(walls[0], x), Math.max(walls[1], y), Math.min(walls[2], x + w), Math.min(walls[3], y + h)];
  let edges = targets;
  if (was) {
    const from = was.edges ?? [was.bx, was.by, was.bx + w, was.by + h];
    edges = targets.map((e, i) => slide(from[i] + keep(e, was.targets?.[i], i & 1 ? cy - was.cy : cx - was.cx), e));
  }
  edges = [Math.min(edges[0], cx), Math.min(edges[1], cy), Math.max(edges[2], cx + SCREEN_W), Math.max(edges[3], cy + SCREEN_H)];
  const clip = [Math.max(edges[0] - x, 0), Math.max(edges[1] - y, 0), Math.min(edges[2] - x, w), Math.min(edges[3] - y, h)];
  const view = { x: x + cam.shakeX, y: y + cam.shakeY, w, h, wrapped: cam.wrapped, clip, edges, bx: x, by: y, cx, cy, sx: cx - x, sy: cy - y, tx, ty, targets };
  // out of an arena, the black is gone once it has slid off the view's sides, and the view is where it goes
  if (!a && clip[0] === 0 && clip[1] === 0 && clip[2] === w && clip[3] === h && x === tx && y === ty) Object.assign(view, { clip: null, edges: null });
  return view;
}
