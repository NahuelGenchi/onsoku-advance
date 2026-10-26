// Neo Green Hill's platforms (SAT-R decompilation, src/game/sa1/stage/interactables/platform_thin.c,
// platform_crumbling.c, trampoline.c and bounce_block.c). Sonic lands on the thin, falling and crumbling
// platforms from above and passes through them from below. A thin platform swings to and fro with the stage
// clock and carries him; a falling one drops half a second after he lands on it; a crumbling one falls apart
// tile by tile. The thin and falling ones sag under him by up to 4 px. The trampoline and the bounce block
// are solid and throw him up when he lands on them.

import { makeSprite, startAnim, animate, offCam, offDisplay } from './objects.js';
import { platform, platformTop, LANDED } from './collide.js';
import { endAttack, standUp } from './player.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';

export const THIN = 21, FALLING = 22, TRAMPOLINE = 23, CRUMBLING = 24, BOUNCE_BLOCK = 25, FALLING_BRICK = 104;

const s8 = v => (v << 24) >> 24, s16 = v => (v << 16) >> 16;
const LEFT = 1, RIGHT = 2;   // Sonic's held d-pad bits (player.js)

// in a multiplayer game a falling or crumbling platform giving way under this GBA's player tells the others
// (a room event, chaohunt.js), whose own copy of it, if it is out, gives way at once (`e.changed`)
const giveWay = (ctx, e) => ctx.mp?.sendEvent({ type: 1, x: e.rx, y: e.ry, id: e.id, action: 1 });

// how far a thin or falling platform sags under Sonic: it eases down by 1/64 of a half turn a frame while he
// stands on it, and back up when he is off it
function sagging(o, p) {
  o.sag = p.onObject === o ? Math.min(o.sag + 0x10, 0x100) : Math.max(o.sag - 0x10, 0);
  return SINE[o.sag] >> 12;
}

/**
 * A thin platform (Task_PlatformThin, at priority 0x2010): it swings across when d2 is above d3 and up and
 * down otherwise, by d2 (d3) × 8 px either side, once every 256 frames of the stage clock; a negative d0 (d1)
 * starts it half a swing on. It carries Sonic by what it moved this frame, plus 1 px down, which its top then
 * puts him back from (under flipped gravity 2 px up, and it sags up).
 */
function thin(e, slot, anims) {
  const o = { ...makeSprite('thinPlatform'), sag: 0 };
  animate(o, anims);
  const across = e.d[2] > e.d[3];
  const phase = s8(across ? e.d[0] : e.d[1]) < 0 ? 0x80 : 0, reach = (across ? e.d[2] : e.d[3]) << 11;
  let q = 0;   // the offset, in 1/256 px
  return {
    priority: 0x2010,
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      const next = Math.imul(reach, SINE[(4 * ((ctx.world.tick + phase) & 0xFF)) & 0x3FF]) >> 14, moved = next - q;
      q = next;
      const x = e.x + (across ? q >> 8 : 0), y = e.y + (across ? 0 : q >> 8);
      o.x = x;   // where Sonic balances at its edges
      if (p.onObject === o) {
        if (across) p.x += moved / 256;
        p.y += (p.inverted ? -2 : 1) + (across ? 0 : moved / 256);
      }
      platformTop(o, x, y, o.boxes[0], p);
      if (offDisplay(e.x, e.y, cam) && offCam(x, y, cam)) { slot.live = null; return false; }
      ctx.draw(o, x, y + (p.inverted ? -1 : 1) * sagging(o, p));
      return true;
    },
  };
}

/**
 * A falling platform (Task_PlatformThin_Falling): 30 frames after Sonic lands on it, it falls, 42/256 px a
 * frame faster every frame, and takes him down with it for 32 frames; then it drops him, falling as fast as
 * it does, and falls through him. It comes back when its spawn point is uncovered again.
 */
function falling(e, slot, anims, art = 'thinPlatform') {
  const o = { ...makeSprite(art), sag: 0, x: e.x };
  animate(o, anims);
  let phase = 'still', n = 0, vy = 0, q = 0;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (phase !== 'falling') {
        const hit = platformTop(o, e.x, e.y, o.boxes[0], p);
        if (phase === 'still' && hit & LANDED) { phase = 'waiting'; n = 30; }
        else if (phase === 'waiting' && !e.changed && --n === 0) { phase = 'falling'; giveWay(ctx, e); }
        if (e.changed) { phase = 'falling'; n = 0; }
        if (offDisplay(e.x, e.y, cam) && offCam(e.x, e.y, cam)) { slot.live = null; return false; }
        ctx.draw(o, e.x, e.y + sagging(o, p));
        return true;
      }
      vy += 42; q += vy; n++;
      const y = e.y + (q >> 8);
      if (p.onObject === o) {
        if (n > 32) { p.air = true; p.onObject = null; p.ysp = s16(vy) / 256; }
        else p.y += (vy + 256) / 256;
      }
      if (n < 32) platformTop(o, e.x, y, o.boxes[0], p);
      if (offCam(e.x, y, cam)) { slot.live = null; return false; }
      ctx.draw(o, e.x, y + sagging(o, p));
      return true;
    },
  };
}

// how far a crumbling platform's tile has fallen `t` frames after it let go
const drop = t => s16(((t * 42 * t) << 8) >> 16);

/**
 * A crumbling platform (Task_PlatformCrumbling): 32 frames after Sonic lands on it, it plays the crumbling
 * sound and its 32 tiles fall, one a frame from the bottom right (bottom left when d0 flips it) to the top
 * left, each 42/256 px a frame faster every frame. Sonic stands on it until the last tile goes. The tiles
 * stop being drawn, in order, at the first one past the bottom of the screen, and the platform goes when
 * that is the first tile; it comes back when its spawn point is uncovered again.
 */
function crumbling(e, slot, anims) {
  const flipX = e.d[0] !== 0;
  const o = { ...makeSprite('crumblingPlatform', { flipX }), x: e.x };
  animate(o, anims);
  let phase = 'whole', n = 0;
  // the range it leaves by: 128 px around the screen, and once crumbling only across
  const outX = cam => e.x > cam.x + 368 || e.x < cam.x - 128;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam;
      if (phase === 'whole' || phase === 'waiting') {
        const hit = platformTop(o, e.x, e.y, o.boxes[0], p);
        if (phase === 'whole' && hit & LANDED) { phase = 'waiting'; n = 0; }
        else if (phase === 'waiting' && !e.changed && n++ > 30) {
          phase = 'crumbling'; n = 0; ctx.world.playSound(SONG.CRUMBLING_PLATFORM);
          giveWay(ctx, e);
        }
        if (e.changed) { phase = 'crumbling'; n = 0; ctx.world.playSound(SONG.CRUMBLING_PLATFORM); }
        if ((outX(cam) || e.y > cam.y + 288 || e.y < cam.y - 128) && offCam(e.x, e.y, cam)) { slot.live = null; return false; }
        ctx.draw(o, e.x, e.y);
        return true;
      }
      n++;
      if (phase === 'crumbling') platformTop(o, e.x, e.y, o.boxes[0], p);
      if (outX(cam) && offCam(e.x, e.y, cam)) { slot.live = null; return false; }
      const bottom = cam.y - e.y + 160, whole = phase === 'crumbling';
      for (let i = 0; i < 32; i++) {
        const t = i - 31 + n;
        let dy = 0;
        if (t > 0) {
          if (i === 0 && t === 1 && phase === 'crumbling') {
            if (p.onObject === o) { p.onObject = null; p.air = true; }
            phase = 'fallen';
          }
          dy = drop(t);
          if (dy > bottom) {
            // gone before it has quite fallen apart, it never comes back
            if (i === 0) { if (whole) slot.gone = true; else slot.live = null; return false; }
            return true;
          }
        }
        const tx = (i & 7) * 8, ty = (i >> 3) * 8;
        ctx.draw({ frame: ctx.tiles.crumblingPlatform[i], flipX, flipY: false, order: o.order, prio: o.prio }, flipX ? e.x - tx : e.x + tx, e.y + ty + dy);
      }
      return true;
    },
  };
}

/**
 * The trampoline (Task_Trampoline): landing on it throws Sonic up 1.22 times as fast as he came down, between
 * 3.75 and 10.99 px a frame, rising as off a spring (character state 21), and it bounces. Walking onto it
 * from the side lifts him 8 px first.
 */
function trampoline(e, slot, anims) {
  const o = { ...makeSprite('trampoline'), x: e.x, y: e.y };
  animate(o, anims);
  let bouncing = false;
  function bounce(p, terrain) {
    const v = Math.round(p.ysp * 256);
    if (!(platform(o, o.boxes[0], p, terrain) & LANDED)) return false;
    endAttack(p);
    p.onObject = null; p.air = true; p.curled = false;
    p.offsetY = 14;
    if (v === 0) p.y -= 8;
    p.ysp = Math.min(Math.max((v >> 5) - (v + (v >> 2)), -2814), -960) / 256;
    p.state = 'springRise';
    return true;
  }
  return {
    run(ctx) {
      const hit = bounce(ctx.player, ctx.world.terrain);
      if (hit) ctx.world.playSound(SONG.TRAMPOLINE);
      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      if (bouncing) {
        if (hit) startAnim(o, 'trampolineBounce', true);
        if (animate(o, anims)) { bouncing = false; startAnim(o, 'trampoline'); animate(o, anims); }
      } else if (hit) {
        bouncing = true;
        startAnim(o, 'trampolineBounce');   // its first frame shows on the next one
      }
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}

/**
 * A bounce block (Task_BounceBlock): landing on it throws Sonic up at 5 px a frame, facing the way he holds,
 * in the walk animation (character state 23), which keeps him facing that way in the air and tumbles him
 * forward 4/256 of a turn a frame; it plays the spring's sound and wobbles for 30 frames, up to 16 px up and
 * down.
 */
function bounceBlock(e, slot, anims) {
  const o = { ...makeSprite('bounceBlock'), x: e.x, y: e.y };
  animate(o, anims);
  let wobbling = false, wobble = 0, n = 0;
  function bounce(p, terrain) {
    if (p.dead || !(platform(o, o.boxes[0], p, terrain) & LANDED)) return false;
    endAttack(p);
    p.onObject = null; p.air = true; p.curled = false;
    if (p.held[0] & LEFT) p.facing = -1;
    else if (p.held[0] & RIGHT) p.facing = 1;
    p.ysp = -5;
    p.state = 'bounce'; p.rotation = 0;
    standUp(p);
    return true;
  }
  return {
    run(ctx) {
      const dy = wobbling ? Math.trunc(SINE[wobble & 0x3FF] / 1024) : 0;
      const hit = bounce(ctx.player, ctx.world.terrain);
      if (hit) { n = 30; wobble = 0; ctx.world.playSound(SONG.SPRING); }
      if (offCam(e.x, e.y + dy, ctx.cam)) { slot.live = null; return false; }
      if (wobbling) {
        wobble += 90;
        if (--n === 0) wobbling = false;
        animate(o, anims);
      } else if (hit) wobbling = true;
      ctx.draw(o, e.x, e.y + dy);
      return true;
    },
  };
}

const KINDS = {
  [THIN]: thin, [FALLING]: falling, [TRAMPOLINE]: trampoline, [CRUMBLING]: crumbling, [BOUNCE_BLOCK]: bounceBlock,
  // X Zone's falling bricks (Task_SmallFallBlockMain) do what a falling platform does, with their own sprite
  [FALLING_BRICK]: (e, slot, anims) => falling(e, slot, anims, 'fallingBrick'),
};

/** The task for a platform entity, or null when `e` is not one. */
export function createPlatform(e, slot, anims) {
  return KINDS[e.kind]?.(e, slot, anims) ?? null;
}
