// Neo Green Hill's boulders (SAT-R decompilation, src/game/sa1/stage/interactables/decoration.c). A boulder is
// solid: Sonic can stand on it and push against it. Falling onto it curled up, or hitting it with an attack,
// breaks it: it leaves a dust cloud and four pieces that spin out and fall, and never comes back until the act
// starts over.

import { makeSprite, animate, offCam } from './objects.js';
import { platform, breaks } from './collide.js';
import { dustCloud } from './defeat.js';
import { SONG } from '../sound/songs.js';

export const DECORATION = 16;

/** The task for a boulder entity, or null when `e` is not one. */
export function createBoulder(e, slot, anims) {
  if (e.kind !== DECORATION) return null;
  const o = { ...makeSprite('rock'), x: e.x, y: e.y };
  animate(o, anims);
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (breaks(o, o.boxes[0], p)) {
        if (p.boostBox) ctx.world.shake();
        ctx.add(dustCloud(e.x, e.y));
        if (p.onObject === o) { p.onObject = null; p.air = true; }
        ctx.world.playSound(SONG.ITEM_BOX_BREAK);
        ctx.add(debris(e.x - cam.x, e.y - cam.y, cam.x, cam.y, anims));
        slot.gone = true;
        return false;
      }
      platform(o, o.boxes[0], p, ctx.world.terrain);
      if (offCam(e.x, e.y, cam)) { slot.live = null; return false; }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

// the pieces: their sprite and its size, how far across they go each frame, how high above the boulder they start and how
// far they turn each frame (in 1/1024 of a turn)
const PIECES = [
  ['rockDebrisSmall', 8, -2, -16, -42], ['rockDebrisSmall', 8, 1, -32, 42],
  ['rockDebrisLarge', 16, 2, -16, 14], ['rockDebrisLarge', 16, -1, -32, -14],
];

/**
 * The pieces of a broken boulder (Task_DecorationDebrisMain), for 61 frames. They rise at 2 px a frame,
 * slowing by 40/256 px a frame per frame, spread sideways and grow to twice their size, 8/256 a frame. The
 * original places them through its sprite transform, around the boulder's screen position on the frame it
 * broke (sx, sy): each piece's offset from there is multiplied by its scale over 512, so it starts at half
 * and the pieces drift out while they grow. (cx, cy) is where the camera was then.
 */
function debris(sx, sy, cx, cy, anims) {
  const pieces = PIECES.map(([name, size, across, y, turn]) => {
    const s = makeSprite(name, { order: 8, prio: 0 });
    animate(s, anims);
    return { s, size, across, y: cy + y, turn, angle: 0 };
  });
  let n = 0, vy = -512, scale = 256;
  return {
    run(ctx) {
      if (n++ > 60) return false;
      vy += 40;
      scale = Math.min(scale + 8, 512);
      const cam = ctx.cam;
      for (const q of pieces) {
        q.y += vy >> 8;
        q.angle = (q.angle + q.turn) & 0x3FF;
        const dx = cx - cam.x + q.across * n, dy = q.y - cam.y;
        const x = sx + ((dx * scale * 128) >> 16), y = sy + ((dy * scale * 128) >> 16);
        // drawn at double size, it is left out once that square is off the screen
        // (the widescreen view draws the ones in its wider area too)
        const v = ctx.view, left = v.x - cam.x, top = v.y - cam.y;
        if (x + q.size < left || x - q.size > left + v.w || y + q.size < top || y - q.size > top + v.h) continue;
        ctx.draw(q.s, cam.x + x, cam.y + y, { rotation: q.angle, scaleX: scale, scaleY: scale, double: true });
      }
      return true;
    },
  };
}
