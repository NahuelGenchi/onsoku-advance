// Breakable walls (SAT-R decompilation, src/game/sa1/stage/interactables/breakable_wall.c; the tasks are at
// 0x08027A55 and 0x08027D59 in the USA ROM). A wall pushes Sonic out of its sides until he touches it with
// his attack box out (curled up, or attacking): then it breaks with song 173 and its 32 tiles of 8 × 8 fall
// away column by column, the column he came from first, drifting the way he was going at half his speed.
//
// It never stays broken: once the first column's top tile falls past the bottom of the screen (the original
// tests every tile against that one line), or the camera leaves it behind, the task ends and the whole wall
// spawns again when its spawn point comes back into range. d0 non-zero mirrors it.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { gate, LANDED } from './collide.js';
import { SONG } from '../sound/songs.js';

export const BREAKABLE_WALL = 114;

const s16 = v => (v << 16) >> 16;
const ROWS = 8, COLUMNS = 4;

/** The task for a breakable wall entity, or null when `e` is not one. */
export function createBreakableWall(e, slot, anims) {
  if (e.kind !== BREAKABLE_WALL) return null;
  const flipX = e.d[0] !== 0;
  const o = { ...makeSprite('breakableWall', { flipX, order: 15 }), x: e.x, y: e.y };
  animate(o, anims);
  let broken = false, n = 0, v = 0;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (broken) return fall(ctx);
      if (gate(o, o.boxes[0], p, ctx.world.terrain) & LANDED) {
        if (p.boostBox) ctx.world.shake();
        ctx.world.playSound(SONG.CRUMBLING_PLATFORM);
        broken = true;
        // half his speed across, or a pixel a frame away from him when he wasn't moving across
        v = s16(Math.round(p.xsp * 256)) >> 1 || (e.x < Math.floor(p.x) ? -256 : 256);
        if (p.onObject === o) { p.onObject = null; p.air = true; }
      }
      if (offDisplay(e.x, e.y, cam) && offCam(e.x, e.y, cam)) { slot.live = null; return false; }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };

  // Task_BreakableWall2: tile (row, column) starts falling 10 frames after the column before it and 2 frames
  // after the row below it, 42/256 px a frame faster every frame from 2 px a frame up
  function fall(ctx) {
    const cam = ctx.cam, bottom = s16(cam.y - e.y + 160), sx = s16(e.x - cam.x);
    n = s16(n + 1);
    if ((e.x > cam.x + 368 || e.x < cam.x - 128) && ((sx + 128) & 0xFFFF) > 496) { slot.live = null; return false; }
    // the tile whose fall ends it: the top one of the column that falls first
    const last = (v >= 0) !== flipX ? 0 : COLUMNS - 1;
    for (let row = 0; row < ROWS; row++) {
      for (let j = 0; j < COLUMNS; j++) {
        const column = flipX ? COLUMNS - 1 - j : j, delay = v >= 0 ? j : COLUMNS - 1 - j, tile = row * COLUMNS + column;
        const t = s16(n - delay * 10 - (ROWS - 1 - row) * 2);
        let dx = 0, dy = 0;
        if (t > 0) {
          dy = s16((t * (t * 42 - 512)) >> 8);
          dx = s16((t * v) >> 8);
          if (dy > bottom) {
            if (tile === last) { slot.live = null; return false; }
            continue;
          }
        }
        const x = flipX ? e.x - column * 8 + dx : e.x + column * 8 + dx;
        ctx.draw({ frame: ctx.tiles.breakableWall[tile], flipX, flipY: false, order: o.order, prio: o.prio }, x, e.y + row * 8 + dy);
      }
    }
    return true;
  }
}
