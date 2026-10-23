// The original camera: a target derived from Sonic's position, approached with dead zones and speed caps,
// a look up / look down pan, and a short freeze after a spin dash release.

import { SCREEN_W, SCREEN_H, CAMERA as C, FEET, BALL_FEET, SPRITE_OFFSET_Y, BALL_SPRITE_OFFSET_Y } from './constants.js';
import { isCurled } from './player.js';

export function createCamera(p) {
  // starts with Sonic centred horizontally and his body 84px from the top
  const cam = {
    x: Math.floor(p.x) - SCREEN_W / 2, y: p.groundY - FEET - (SCREEN_H / 2 + 4),
    targetX: 0, targetY: 0, freeze: 0, deadY: 0, look: 0, lookDelay: C.lookDelay, offsetY: SPRITE_OFFSET_Y - 4,
  };
  cam.targetX = cam.x; cam.targetY = cam.y;
  return cam;
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
  updateLook(cam, p);
  const curled = isCurled(p);
  if (cam.freeze > 0) cam.freeze--;
  else {
    cam.targetX = Math.floor(p.x) - SCREEN_W / 2;
    // eases toward spriteOffsetY - 4 so curling up (offset 14 -> 9) doesn't jolt the view
    const want = (curled ? BALL_SPRITE_OFFSET_Y : SPRITE_OFFSET_Y) - 4;
    if (cam.offsetY < want) cam.offsetY = Math.min(want, cam.offsetY + 5);
    else if (cam.offsetY > want) cam.offsetY = Math.max(want, cam.offsetY - 5);
    const centreY = Math.floor(p.y) - (curled ? BALL_FEET : FEET);
    cam.targetY = centreY - SCREEN_H / 2 + cam.look + cam.offsetY;
  }
  const dx = cam.targetX - cam.x;
  if (dx > C.deadZoneX) cam.x += Math.min(C.maxSpeedX, dx - C.deadZoneX);
  else if (dx < -C.deadZoneX) cam.x += Math.max(-C.maxSpeedX, dx + C.deadZoneX);

  cam.deadY = p.ground ? Math.max(0, cam.deadY - 4) : Math.min(C.airDeadZoneY, cam.deadY + 4);
  const dy = cam.targetY - cam.y;
  if (dy > cam.deadY) cam.y += Math.min(C.maxSpeedY, dy - cam.deadY);
  else if (dy < -cam.deadY) cam.y += Math.max(-C.maxSpeedY, dy + cam.deadY);
}
