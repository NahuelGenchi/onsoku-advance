// The multiplayer stages' mystery item boxes (SAT-R decompilation, src/game/sa1/stage/mystery_itembox.c), kind
// 115, as Chao Hunt uses them. All of a stage's boxes share one turn: the box whose d0 is the low three bits of
// the shared item turn (gRandomItemBox, which the stage changes every 512 frames from the players' shared
// random numbers, chaohunt.js) shows, the others wait unseen. Its d1 counts the boxes broken there: a box shows
// only while its count is at most the turn's generation (gRandomItemBox's high bits, one more every 4096
// frames), which a box catches up on as it shows. A box grows into view, its height through the rotation
// hardware, and shrinks out when the turn moves on. Like an item box it is solid, or broken by Sonic's attack
// box; broken, it tells the other players' boxes (room event 5), and its icon rises for 60 frames and then
// gives its item: confusion or darkness to the others (room event 6) or invisibility to the breaker. A box
// broken by another player shows the same dust cloud and rising icon without giving anything. Its item is
// picked from the shared random numbers each time it appears.

import { makeSprite, animate } from './objects.js';
import { platform, itemBox as boxTest, FROM_BELOW, LANDED, PUSHING } from './collide.js';
import { tileFloor } from './terrain.js';
import { dustCloud } from './defeat.js';
import { SONG } from '../sound/songs.js';

export const MYSTERY_ITEM_BOX = 115;
// each item's icon (gUnknown_080BB4D0): confusion, darkness, invisibility and confusion again
const ICONS = ['icon13', 'icon16', 'icon14', 'icon13'];
export const CONFUSION = 0, DARKNESS = 1, INVISIBLE_TIME = 600;
const RISE = 60, HOLD = 30, GROW = 8;
const HOP_SPEED = -256, HOP_GRAVITY = 40;   // in 1/256 px
const I = v => v >> 8;

/**
 * The task for a mystery item box, or null when `e` is not one. `ctx.mp` is the mode's shared state:
 * itemTurn (gRandomItemBox), random (gMultiplayerPseudoRandom), sendEvent(event) and the player's
 * itemEffect bits and invisibility timer.
 */
export function createMysteryBox(e, slot, anims, ctx) {
  if (e.kind !== MYSTERY_ITEM_BOX || !ctx.mp) return null;
  const mp = ctx.mp, d = e.d;
  const turn = () => mp.itemTurn & 7, gen = () => mp.itemTurn >> 4;
  const box = { ...makeSprite('mysteryBox', { order: 18 }), x: e.x, y: e.y };
  const icon = makeSprite('icon13', { order: 19 });
  let phase = turn() === d[0] && d[1] <= gen() ? 'shown' : 'waiting';
  if (d[1] <= gen()) d[1] = gen();
  let item = mp.random % 4, dy = 0, vy = 0, n = 0, falling = false, lastHit = 0, scaleY = 0;
  const setIcon = name => { Object.assign(icon, makeSprite(name, { order: 19 })); animate(icon, anims); };
  animate(box, anims); setIcon(ICONS[item]);

  // he stops standing on it, and stops pushing it if its last collision had him push
  const letGo = p => {
    if (p.onObject === box) { p.onObject = null; p.air = true; }
    if (lastHit & PUSHING) { p.pushing = false; lastHit = 0; }
  };
  const affine = () => ({ rotation: 0, scaleX: 256, scaleY, double: false });

  const phases = {
    // Task_801C420: a new item from the shared random numbers, and the box starts to grow
    appear(ctx) {
      item = mp.random % 4; dy = 0; vy = 0; n = 0; falling = false;
      setIcon(ICONS[item]);
      scaleY = 0; phase = 'appearing';
      return phases.appearing(ctx);
    },
    // Task_MysteryItemBox_Main1: unseen until its turn comes and its count catches up
    waiting(ctx) {
      if (d[0] === turn() && d[1] <= gen()) { d[1] = gen(); phase = 'appear'; return true; }
      const sx = e.x - ctx.cam.x, sy = e.y - ctx.cam.y;
      if ((sx + 128) >>> 0 > 496 || sy + 128 < 0 || sy > 368) return leave();
      return true;
    },
    // Task_801C4EC: it grows from nothing to its full height, 8/256 of it a frame
    appearing(ctx) {
      scaleY += GROW;
      if (scaleY >= 256) { scaleY = 256; phase = 'shown'; return phases.shown(ctx); }
      ctx.draw(box, e.x, e.y, affine());
      ctx.draw(icon, e.x, e.y, affine());
      return true;
    },
    // sub_801C5C4: it shrinks away, then waits unseen
    vanishing(ctx) {
      scaleY -= GROW;
      if (scaleY <= 0) { scaleY = 256; phase = 'waiting'; return phases.waiting(ctx); }
      ctx.draw(box, e.x, e.y, affine());
      ctx.draw(icon, e.x, e.y, affine());
      return true;
    },
    // Task_MysteryItemBox_Main0
    shown(ctx) {
      const p = ctx.player;
      if (d[0] !== turn()) {
        letGo(p);
        scaleY = 256; phase = 'vanishing';
        return phases.vanishing(ctx);
      }
      if (d[1] > gen()) {
        // another player broke it
        ctx.world.playSound(SONG.ITEM_BOX_BREAK);
        ctx.add(dustCloud(e.x, e.y + dy));
        phase = 'rising'; n = 0;
        letGo(p);
        return true;
      }
      if (falling) {
        dy += I(vy); vy += HOP_GRAVITY;
        const f = tileFloor(ctx.world.terrain, e.x, e.y + dy, 1);
        if (f < 0) { dy += f; falling = false; }
      }
      box.y = e.y + dy;
      if (!p.carried) {
        let res;
        if (p.onObject === box || !p.boxes[1]) {
          res = platform(box, box.boxes[0], p, ctx.world.terrain);
          if (res & FROM_BELOW) { vy = HOP_SPEED; falling = true; }
        } else {
          res = boxTest(box, box.boxes[0], p);
          if (res & FROM_BELOW) { vy = HOP_SPEED; falling = true; }
          else if (res & (LANDED | PUSHING)) {
            if (p.onObject === box) { p.onObject = null; p.pushing = false; p.air = true; }
            ctx.world.playSound(SONG.ITEM_BOX_BREAK);
            ctx.add(dustCloud(e.x, e.y + dy));
            phase = 'opening'; n = 0;
            d[1] = (d[1] + 1) & 0xFF;
            mp.sendEvent({ type: 5, x: e.rx, y: e.ry, id: e.id, count: d[1] });
            return true;
          }
        }
        lastHit = res;
      }
      // the offset counts twice, as on the item boxes
      const sx = e.x - ctx.cam.x, sy = e.y - ctx.cam.y + dy;
      if (((sx + 128) & 0xFFFF) > 496 || sy + 128 + dy < 0 || sy + dy > 288) return leave();
      ctx.draw(box, e.x, e.y + dy);
      ctx.draw(icon, e.x, e.y + dy);
      return true;
    },
    // sub_801C130: broken by this player, the icon rises and then gives its item
    opening(ctx) {
      dy--;
      if (++n > RISE - 1) {
        if (item === DARKNESS) mp.sendEvent({ type: 6, effect: DARKNESS });
        else if (item === 2) { ctx.player.itemEffect |= 0x20; mp.invisibleTimer = INVISIBLE_TIME; }
        else mp.sendEvent({ type: 6, effect: CONFUSION });
        phase = 'held'; n = 0;
      }
      ctx.draw(icon, e.x, e.y + dy);
      return true;
    },
    // Task_801C2FC: broken by another player, the icon rises and gives nothing
    rising(ctx) {
      dy--;
      if (++n >= RISE) { phase = 'held'; n = 0; }
      ctx.draw(icon, e.x, e.y + dy);
      return true;
    },
    // Task_801C3A0
    held(ctx) {
      if (++n > HOLD) { phase = 'waiting'; return true; }
      ctx.draw(icon, e.x, e.y + dy);
      return true;
    },
  };
  function leave() { slot.live = null; return false; }

  return { run: ctx => phases[phase](ctx) };
}
