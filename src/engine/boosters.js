// Neo Green Hill's speed boosters (SAT-R decompilation, src/game/sa1/stage/interactables/booster.c): the flat
// one (kind 31) and the one on a slight slope up to the right (33). Running or rolling over one on the ground
// sends Sonic its way at 12 px a frame, unless he is already going faster than 9 that way; it points right,
// or left when d1 is set.

import { makeSprite, animate, offCam } from './objects.js';
import { overlap } from './collide.js';
import { endAttack } from './player.js';
import { SONG } from '../sound/songs.js';

export const BOOSTER = 31, BOOSTER_SLIGHT_LEFT = 32, BOOSTER_SLIGHT_RIGHT = 33;
// the animation's variant for each kind
const LOOKS = { [BOOSTER]: 'booster', [BOOSTER_SLIGHT_LEFT]: 'boosterSlightLeft', [BOOSTER_SLIGHT_RIGHT]: 'boosterSlightRight' };
const SOX = 6;   // Sonic's spriteOffsetX
const BOOST = 12, BOOSTED = 9;
// the character states a boost keeps: rolling and the spin dash; anything else becomes the walk
const KEPT = new Set(['spin', 'spinDash', 'spinDashRev']);

/** The task for a booster entity, or null when `e` is not one. */
export function createBooster(e, slot, anims) {
  const look = LOOKS[e.kind];
  if (!look) return null;
  const dir = e.d[1] ? -1 : 1;
  const o = makeSprite(look, { flipX: dir < 0 });
  return {
    run(ctx) {
      const p = ctx.player;
      // it tests the box its last animation frame set, before stepping the animation; none yet on its first frame
      const probe = [-(SOX + 5), 1 - p.offsetY, SOX + 5, p.offsetY - 1];
      if (!p.dead && !p.air && o.boxes[0] && overlap(e.x, e.y, o.boxes[0], Math.floor(p.x), Math.floor(p.y), probe)) {
        // Player_TransitionCancelFlyingAndBoost
        endAttack(p); p.pushing = false;
        ctx.world.playSound(SONG.BOOSTER);
        if (!KEPT.has(p.state)) p.state = 'walk';
        p.facing = dir;
        if (p.gsp * dir < BOOSTED) p.gsp = p.xsp = BOOST * dir;
      }
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
