// Item boxes (SAT-R decompilation, src/game/sa1/stage/itembox.c). A box shows its prize's icon through its
// screen. Sonic breaks it with his attack box on it, or by falling onto it while he has one; without it the box
// is solid and he can stand on it. Hit from below, it hops up 1 px a frame, slowing down, until it lands again.
// A broken box leaves a dust cloud, its icon rises 1 px a frame and after 60 frames gives the prize, then stays
// 30 frames more. A broken box never comes back until the act starts over.

import { makeSprite, animate } from './objects.js';
import { platform, itemBox as boxTest, FROM_BELOW, LANDED, PUSHING } from './collide.js';
import { tileFloor } from './terrain.js';
import { dustCloud } from './defeat.js';
import { SONG } from '../sound/songs.js';

export const ONE_UP = 0, SHIELD = 1, MAGNETIC_SHIELD = 2, INVINCIBILITY = 3, SPEED_UP = 4,
  RANDOM_RINGS = 5, RINGS_5 = 6, RINGS_10 = 7;
// each prize's icon (gUnknown_080BB4D8): Sonic's 1-up, then the others in order
const ICON = [0, 4, 5, 6, 7, 8, 9, 10];
const RISE = 60, HOLD = 30;
const HOP_SPEED = -256, HOP_GRAVITY = 40;   // in 1/256 px

const I = v => v >> 8;
// IS_OUT_OF_CAM_RANGE on a screen position, IS_OUT_OF_DISPLAY_RANGE on a world position
const offCam = (sx, sy) => ((sx + 128) & 0xFFFF) > 496 || sy + 128 < 0 || sy > 288;
const offDisplay = (wx, wy, cam) => wx > cam.x + 368 || wx < cam.x - 128 || wy > cam.y + 288 || wy < cam.y - 128;

/**
 * The box at item box record `e` (kind, x, y) for objects.js. It calls ctx.world.prize(kind) when the prize
 * is given.
 */
export function createItemBox(e, slot, anims) {
  // the box is what Sonic stands on, at its spawn point plus the hop's offset
  const box = { ...makeSprite('itemBox', { order: 18 }), x: e.x, y: e.y };
  const icon = makeSprite(`icon${ICON[e.kind]}`, { order: 19 });
  animate(box, anims); animate(icon, anims);
  let dy = 0, vy = 0, hopping = false, phase = 'whole', n = 0;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (phase === 'rising') {
        dy--;
        if (++n >= RISE) { ctx.world.prize(e.kind); phase = 'held'; n = 0; }
        ctx.draw(icon, e.x, e.y + dy);
        return true;
      }
      if (phase === 'held') {
        if (++n > HOLD) { slot.live = null; return false; }
        ctx.draw(icon, e.x, e.y + dy);
        return true;
      }
      if (hopping) {
        dy += I(vy); vy += HOP_GRAVITY;
        const d = tileFloor(ctx.world.terrain, e.x, e.y + dy, 1);
        if (d < 0) { dy += d; hopping = false; }
      }
      box.y = e.y + dy;
      // standing on it, or without his attack box, it is only solid: he can stand on it or bump it from
      // below, but not break it (the original checks slot 1 here, where the decompiled C reads slot 0)
      const solid = p.onObject === box || !p.boxes[1];
      const res = solid ? platform(box, box.boxes[0], p, ctx.world.terrain) : boxTest(box, box.boxes[0], p);
      if (res & FROM_BELOW) { vy = HOP_SPEED; hopping = true; }
      else if (!solid && res & (LANDED | PUSHING)) {
        if (p.onObject === box) { p.onObject = null; p.air = true; }
        ctx.world.playSound(SONG.ITEM_BOX_BREAK);
        ctx.add(dustCloud(e.x, e.y + dy));
        phase = 'rising'; n = 0; slot.gone = true;
        return true;
      }
      // the original adds the offset to the screen position twice here
      if (offDisplay(e.x, e.y, cam) && offCam(e.x - cam.x, e.y - cam.y + 2 * dy)) { slot.live = null; return false; }
      ctx.draw(box, e.x, e.y + dy);
      ctx.draw(icon, e.x, e.y + dy);
      return true;
    },
  };
}
