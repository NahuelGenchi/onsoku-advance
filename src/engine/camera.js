// The original camera: a target derived from Sonic's position, approached with dead zones and speed caps,
// a look up / look down pan, a short freeze after a spin dash release, and a still target once Sonic dies. It never shows past its
// bounds: the act's edges, or the arena a boss sets (bosses.js). `minX` and `minY` are the least its top left corner may be, `maxX`
// and `maxY` the most (the original's maxX - 240 and maxY - 160).
// While the optional Sonic Rush boost runs, it leads him the way Rush's camera does.

import { SCREEN_W, SCREEN_H, CAMERA as C, RUSH_BOOST as R } from './constants.js';

const centreY = p => Math.floor(p.y);

// starts with Sonic centred horizontally and his body 84px from the top, not yet kept inside the act
// (InitCamera); its task's first frame only sets it going (Task_CallUpdateCamera), so it moves from the second
export function createCamera(p, terrain) {
  const cam = {
    x: Math.floor(p.x) - SCREEN_W / 2, y: centreY(p) - (SCREEN_H / 2 + 4),
    targetX: 0, targetY: 0, freeze: 0, locked: false, deadY: 0, look: 0, lookDelay: C.lookDelay, offsetY: p.offsetY - 4,
    minX: 0, minY: 0, maxX: terrain.width - SCREEN_W, maxY: terrain.height - SCREEN_H, started: false,
    // the Rush boost's lead: Sonic shown this far off the target's centre (8.8 px), what it eases toward, the
    // frames left of the delay after a boost starts, and where Sonic was at the last update
    leadX: 0, leadY: 0, leadTargetX: 0, leadTargetY: 0, scroll: 0, prevX: p.x, prevY: p.y,
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
    if (looking < 0 && cam.look > looking) cam.look -= C.lookStep;
    if (looking > 0 && cam.look < looking) cam.look += C.lookStep;
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
    cam.targetX = Math.floor(p.x) - SCREEN_W / 2 - (cam.leadX >> 8);
    // eases toward spriteOffsetY - 4 so curling up (offset 14 -> 9) doesn't jolt the view
    const want = p.offsetY - 4;
    if (cam.offsetY < want) cam.offsetY = Math.min(want, cam.offsetY + 5);
    else if (cam.offsetY > want) cam.offsetY = Math.max(want, cam.offsetY - 5);
    cam.targetY = centreY(p) - SCREEN_H / 2 + cam.look + cam.offsetY - (cam.leadY >> 8);
  }
  const dx = cam.targetX - cam.x;
  // with a lead, it keeps to the target sideways as Rush's does, without a dead zone or a speed limit
  if (p.boost || cam.leadX || cam.scroll) cam.x = cam.targetX;
  else if (dx > C.deadZoneX) cam.x += Math.min(C.maxSpeedX, dx - C.deadZoneX);
  else if (dx < -C.deadZoneX) cam.x += Math.max(-C.maxSpeedX, dx + C.deadZoneX);

  cam.deadY = p.air ? Math.min(C.airDeadZoneY, cam.deadY + 4) : Math.max(0, cam.deadY - 4);
  const dy = cam.targetY - cam.y;
  if (dy > cam.deadY) cam.y += Math.min(C.maxSpeedY, dy - cam.deadY);
  else if (dy < -cam.deadY) cam.y += Math.max(-C.maxSpeedY, dy + cam.deadY);
  clamp(cam);
}

/**
 * What a view of w × h px shows around the camera (the widescreen view; 240 × 160 is the original screen): the
 * original screen's area kept inside the act, as the renderer draws it, with as much around it as fits inside
 * the act too. `x` and `y` are its top left corner in the act.
 */
export function viewOf(cam, w = SCREEN_W, h = SCREEN_H) {
  const cx = Math.min(Math.max(Math.floor(cam.x), 0), cam.maxX), cy = Math.min(Math.max(Math.floor(cam.y), 0), cam.maxY);
  const x = Math.max(0, Math.min(cx - ((w - SCREEN_W) >> 1), cam.maxX + SCREEN_W - w));
  const y = Math.max(0, Math.min(cy - ((h - SCREEN_H) >> 1), cam.maxY + SCREEN_H - h));
  return { x, y, w, h };
}
