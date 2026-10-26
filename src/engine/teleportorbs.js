// Casino Paradise's teleport orbs (SAT-R decompilation, src/game/sa1/stage/interactables/teleport_orb.c): an
// orb drawn in the level's tiles that, when Sonic's centre comes within 12 px of it, puts him at (d0 × 256 +
// d2, d1 × 256 + d3), curled up, still and held there, with the spring's sound. It lets him go, in the air and
// still, once the camera has caught up with him: on the first frame it hasn't moved since the last one, with
// him inside the screen. A death meanwhile lets him go too, puts him in the middle of the screen and stops the
// camera.
//
// The orb itself has no task of its own to draw; it goes when its spawn point leaves the camera's range, but
// not while it holds him. The flag it sets on him (PLAYER_ITEM_EFFECT__TELEPORT) is only read in
// multiplayer and isn't kept.

import { offCam } from './objects.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';
import { SPRITE_OFFSET_Y, SCREEN_W, SCREEN_H } from './constants.js';
import { s8 } from './trig.js';
import { SONG } from '../sound/songs.js';

export const TELEPORT_ORB = 72;
const REACH = 12;

// Player_TransitionCancelFlyingAndBoost
function cancel(p) { endAttack(p); p.pushing = false; }
// held: curled up, carried, still, at his standing height
function hold(p) {
  cancel(p);
  p.carried = true;
  p.xsp = 0; p.ysp = 0; p.gsp = 0;
  p.state = 'spin';
  setOffsetY(p, SPRITE_OFFSET_Y);
}

/** The task for a teleport orb, or null when `e` is not one. */
export function createTeleportOrb(e, slot) {
  if (e.kind !== TELEPORT_ORB) return null;
  const toX = s8(e.d[0]) * 256 + e.d[2], toY = s8(e.d[1]) * 256 + e.d[3];
  // whether it holds him, and where the camera was on its last frame
  let held = false, camX = 0, camY = 0;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (held) {
        const px = Math.floor(p.x), py = Math.floor(p.y);
        if (cam.x === camX && cam.y === camY && cam.x <= px && cam.x + SCREEN_W >= px && cam.y <= py && cam.y + SCREEN_H >= py) {
          p.carried = false; p.air = true;
          held = false;
          p.xsp = 0; p.ysp = 0; p.gsp = 0;
        } else hold(p);
        if (p.dead) {
          held = false;
          p.carried = false;
          p.x = cam.x + SCREEN_W / 2; p.y = cam.y + SCREEN_H / 2;
          ctx.world.stopCamera();
        }
        camX = cam.x; camY = cam.y;
      } else if (!p.dead) {
        const px = Math.floor(p.x), py = Math.floor(p.y);
        if (px >= e.x - REACH && px <= e.x + REACH && py >= e.y - REACH && py <= e.y + REACH) {
          cancel(p);
          p.curled = true; p.carried = true;
          p.x = toX; p.y = toY;
          p.xsp = 0; p.ysp = 0; p.gsp = 0;
          p.state = 'spin';
          setOffsetY(p, SPRITE_OFFSET_Y);
          ctx.world.playSound(SONG.SPRING);
          held = true;
          camX = cam.x; camY = cam.y;
        }
      }
      if (!held && offCam(e.x, e.y, cam)) { slot.live = null; return false; }
      return true;
    },
  };
}
