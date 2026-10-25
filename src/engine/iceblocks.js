// Ice Mountain's blocks of ice (SAT-R decompilation, src/game/sa1/stage/interactables/ice_block.c; the task is
// at 0x080914F9 in the USA ROM). A block is solid like a boulder, and breaks the same ways, and also when
// Sonic's attack box touches it while he is curled up or charging a spin dash, or when he lands on it curled
// up: rolling into one breaks it, and landing on one curled up doesn't bounce him. It leaves a dust cloud and
// four pieces that spin out and fall, and never comes back until the act starts over.

import { makeSprite, animate, offCam } from './objects.js';
import { platform, breaks, overlap, LANDED } from './collide.js';
import { dustCloud } from './defeat.js';
import { debris } from './boulders.js';
import { SONG } from '../sound/songs.js';

export const ICE_BLOCK = 95;

// the character states sub_8091E88 lets Sonic's attack box break it in: curled up (5) and the spin dash (6, 7)
const CURLED_STATES = new Set(['spin', 'spinDash', 'spinDashRev']);

/** The task for an ice block entity, or null when `e` is not one. */
export function createIceBlock(e, slot, anims) {
  if (e.kind !== ICE_BLOCK) return null;
  const o = { ...makeSprite('iceBlock', { order: 8 }), x: e.x, y: e.y };
  animate(o, anims);
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, hb = o.boxes[0];
      if (!p.dead) {
        // landing on it curled up stands him on it first, so the landing doesn't bounce him
        const landed = p.state === 'spin' && (platform(o, hb, p, ctx.world.terrain) & LANDED) !== 0;
        if (breaks(o, hb, p) || (CURLED_STATES.has(p.state) && p.boxes[1] && overlap(e.x, e.y, hb, Math.floor(p.x), Math.floor(p.y), p.boxes[1])) || landed) {
          if (p.onObject === o) { p.onObject = null; p.air = true; }
          ctx.add(dustCloud(e.x, e.y));
          ctx.world.playSound(SONG.ENEMY_DEFEAT);
          ctx.add(debris(e.x - cam.x, e.y - cam.y, cam.x, cam.y, anims, PIECES, { frames: 80, grow: 1 }));
          ctx.world.playSound(SONG.ICE_BLOCK_BREAK);
          slot.gone = true;
          return false;
        }
      }
      platform(o, hb, p, ctx.world.terrain);
      if (offCam(e.x, e.y, cam)) { slot.live = null; return false; }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

// the pieces (CreateIceBlockShards), as the boulder's: their sprite and its size, how far across they go each
// frame, how high above the block they start and how far they turn each frame; the large piece's frame isn't
// centred on its anchor, so it has no size
const PIECES = [
  ['iceShardsSmall', 16, -2, -16, -42], ['iceShardsSmall', 16, 1, -32, 42],
  ['iceShardsLarge', 0, 2, -16, 14], ['iceShardsLarge', 0, -1, -32, -14],
];
