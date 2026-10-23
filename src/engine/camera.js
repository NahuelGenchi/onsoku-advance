// The original camera: a target derived from Sonic's position, approached with dead zones and speed caps,
// a look up / look down pan, a short freeze after a spin dash release, and a still target once Sonic dies. It never shows past the act's edges.

import { SCREEN_W, SCREEN_H, CAMERA as C } from './constants.js';

const centreY = p => Math.floor(p.y);

// starts with Sonic centred horizontally and his body 84px from the top, not yet kept inside the act
// (InitCamera); its task's first frame only sets it going (Task_CallUpdateCamera), so it moves from the second
export function createCamera(p, terrain) {
  const cam = {
    x: Math.floor(p.x) - SCREEN_W / 2, y: centreY(p) - (SCREEN_H / 2 + 4),
    targetX: 0, targetY: 0, freeze: 0, locked: false, deadY: 0, look: 0, lookDelay: C.lookDelay, offsetY: p.offsetY - 4,
    maxX: terrain.width - SCREEN_W, maxY: terrain.height - SCREEN_H, started: false,
  };
  cam.targetX = cam.x; cam.targetY = cam.y;
  return cam;
}

function clamp(cam) {
  cam.x = Math.min(Math.max(cam.x, 0), cam.maxX);
  cam.y = Math.min(Math.max(cam.y, 0), cam.maxY);
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

export function updateCamera(cam, p) {
  if (!cam.started) { cam.started = true; return; }
  updateLook(cam, p);
  // a dead Sonic leaves the target where it was (unk50 bits 0–1); the view still eases onto it
  if (cam.freeze > 0) cam.freeze--;
  else if (!cam.locked) {
    cam.targetX = Math.floor(p.x) - SCREEN_W / 2;
    // eases toward spriteOffsetY - 4 so curling up (offset 14 -> 9) doesn't jolt the view
    const want = p.offsetY - 4;
    if (cam.offsetY < want) cam.offsetY = Math.min(want, cam.offsetY + 5);
    else if (cam.offsetY > want) cam.offsetY = Math.max(want, cam.offsetY - 5);
    cam.targetY = centreY(p) - SCREEN_H / 2 + cam.look + cam.offsetY;
  }
  const dx = cam.targetX - cam.x;
  if (dx > C.deadZoneX) cam.x += Math.min(C.maxSpeedX, dx - C.deadZoneX);
  else if (dx < -C.deadZoneX) cam.x += Math.max(-C.maxSpeedX, dx + C.deadZoneX);

  cam.deadY = p.air ? Math.min(C.airDeadZoneY, cam.deadY + 4) : Math.max(0, cam.deadY - 4);
  const dy = cam.targetY - cam.y;
  if (dy > cam.deadY) cam.y += Math.min(C.maxSpeedY, dy - cam.deadY);
  else if (dy < -cam.deadY) cam.y += Math.max(-C.maxSpeedY, dy + cam.deadY);
  clamp(cam);
}
