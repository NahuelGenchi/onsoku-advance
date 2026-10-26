// Casino Paradise's party balloons (SAT-R decompilation, src/game/sa1/stage/interactables/party_balloon.c):
// touching one pops it and throws Sonic up at 6 px a frame, rising as off a spring. Its burst shows for 33
// frames; then it goes, to come back when the camera next uncovers its place. d0 picks its colour.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { overlap } from './collide.js';
import { standUp, endAttack } from './player.js';
import { SONG } from '../sound/songs.js';

export const PARTY_BALLOON = 59;
const COLOURS = ['balloonBlue', 'balloonRed', 'balloonYellow'];
const SOX = 6;      // Sonic's spriteOffsetX
const LIFT = 6;     // the speed up it throws him at
const BURST = 33;   // frames from the pop to the balloon going (unk40)

// what the pop does to Sonic; the original restarts the partner's animation where it means his, so his
// carries on if he was already rising
function throwUp(p) {
  endAttack(p); p.pushing = false;   // Player_TransitionCancelFlyingAndBoost
  p.onObject = null; p.air = true; p.curled = false; p.airLock = false;
  standUp(p);
  p.ysp = -LIFT;
  p.state = 'springRise';
}

/** The task for a party balloon entity, or null when `e` is not one. */
export function createPartyBalloon(e, slot, anims) {
  if (e.kind !== PARTY_BALLOON) return null;
  const look = COLOURS[e.d[0]];
  const s = makeSprite(look);
  animate(s, anims);
  let burst = 0;
  return {
    run(ctx) {
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      if (burst) {
        if (--burst === 0) { slot.live = null; return false; }
      } else {
        // Coll_Player_Entity_Intersection: his body's box against the box its last frame set
        const p = ctx.player;
        if (!p.dead && s.boxes[0] && overlap(e.x, e.y, s.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])
          && !p.carried) {
          throwUp(p);
          burst = BURST;
          startAnim(s, look + 'Pop', true);
          ctx.world.playSound(SONG.BALLOON_POP);
        }
      }
      animate(s, anims);
      ctx.draw(s, e.x, e.y);
      return true;
    },
  };
}
