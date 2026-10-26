// Angel Island's and Ice Mountain's skating stones (SAT-R decompilation,
// src/game/sa1/stage/interactables/skating_stone.c; in the USA ROM the entity is made at 0x0808C4BD, it waits in
// the task at 0x0808C629, slides in the one at 0x0808C971, and its pieces fly in 0x0808D8A5). A stone waits at
// its spawn point until Sonic lands on it, then slides off with him standing on it, gathering speed downhill:
// to the left when d1 is set, to the right otherwise. Where the ground drops away it leaps (Ice Mountain's
// drops) and falls; it lands d0 times and goes on, and breaks on the landing after that, or when it runs into
// a wall ahead of it on its right, throwing Sonic up.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { skatingStone, platformTop, overlap, LANDED } from './collide.js';
import { scan, probeTile, PROBE_FLOOR, PROBE_WALL } from './terrain.js';
import { endAttack } from './player.js';
import { setOffsetY } from './sensors.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';

export const SKATING_STONE = 84;
const ICE_MOUNTAIN = 3;   // LEVEL_TO_ZONE's ZONE_4: Ice Mountain has its own look, and its stones drop
const SOX = 6;            // Sonic's spriteOffsetX

const s16 = v => (v << 16) >> 16;
const Div = (a, b) => Math.trunc(a / b);
const COS = a => SINE[(a & 1023) + 256];
const q8 = v => Math.round(v * 256);

// Player_TransitionCancelFlyingAndBoost
function cancel(p) { endAttack(p); p.pushing = false; }

// thrown up and off the stone at its speed, in the spin animation but not curled up
function throwOff(p, vx) {
  p.ysp = -3; p.xsp = vx / 256; p.gsp = vx / 256;
  cancel(p);
  p.onObject = null; p.air = true;
  p.state = 'spin';
}

/** The task for a skating stone entity, or null when `e` is not one. */
export function createSkatingStone(e, slot, anims, ctx) {
  if (e.kind !== SKATING_STONE) return null;
  const ice = ctx.world.zone === ICE_MOUNTAIN;
  const o = { ...makeSprite(ice ? 'iceStone' : 'skatingStone'), x: e.x, y: e.y };
  animate(o, anims);
  const left = e.d[1] !== 0;
  let hops = e.d[0], sliding = false, riding = false, falling = false;
  let vx = 0, vy = 0, ox = 0, oy = 0;   // its speed and its offset from the spawn point, in 1/256 px (qUnkA0 … qUnkAC)
  let sx = 0, sy = 0;                   // its sprite's screen position, as the original keeps it

  // the stone breaks: Sonic goes up in the air, it plays SE_BOSS_HIT and its pieces fly
  function breakUp(ctx, p) {
    if (riding && !p.dead) { throwOff(p, vx); riding = false; }
    ctx.world.stopSound(SONG.SKATING_STONE);
    ctx.add(debris(sx, sy, e.x + (ox >> 8) - sx, e.y + (oy >> 8) - 20 - sy, ice, anims));
    ctx.world.playSound(SONG.BOSS_HIT);
    slot.live = null;
    return false;
  }

  function wait(ctx) {
    const p = ctx.player, cam = ctx.cam;
    sx = s16(e.x - cam.x); sy = s16(e.y - cam.y);
    if (!p.dead && (skatingStone(o, o.boxes[0], p) & LANDED)) {
      // he is put in the air 44 px above its spawn point, standing; he lands on it as it slides
      p.onObject = null; p.air = true; p.jumped = false; p.curled = false; p.airLock = false;
      setOffsetY(p, 14);
      p.y = e.y - 44;
      riding = true;
      vx = 0; vy = 0; ox = 0; oy = 0;
      sliding = true;
    }
    if (offCam(sx + cam.x, sy + cam.y, cam)) { ctx.world.stopSound(SONG.SKATING_STONE); slot.live = null; return false; }
    ctx.draw(o, sx + cam.x, sy + cam.y);
    return true;
  }

  function slide(ctx) {
    const p = ctx.player, cam = ctx.cam, t = ctx.world.terrain;
    oy += vy;
    sy = s16((oy >> 8) + e.y - cam.y);
    if (offDisplay(e.x, e.y, cam) && offCam(sx + cam.x, sy + cam.y, cam)) {
      ctx.world.stopSound(SONG.SKATING_STONE);
      slot.live = null;
      return false;
    }
    let layer = 0;
    if (!p.dead) {
      layer = p.layer;
      if (riding) p.y = (e.y * 256 + oy - (p.spinDashing || p.curled ? 42 : 46) * 256) / 256;
    }
    const x = e.x + (ox >> 8), y = e.y + (oy >> 8);
    if (falling) {
      if (probeTile(t, y, x, layer, 8, PROBE_FLOOR).d >= 0) vy += 32;
      else {
        vy = 0; falling = false;
        if (hops === 0) return breakUp(ctx, p);
        ctx.world.playSound(SONG.SKATING_STONE);
        hops--;
      }
    } else {
      const { d, rot } = scan(t, y, x, layer, 8, PROBE_FLOOR);
      if (d > 5) {
        ctx.world.stopSound(SONG.SKATING_STONE);
        vy += ice ? Math.abs(Div(vx * 2, 5)) : -Math.abs(Div(vx * 3, 5));
        falling = true;
      } else {
        const c = COS(rot * 4);
        if (riding && !p.dead) p.x += (left ? Div(c, 6070) : -Div(c, 6070)) / 256;
        vx += left ? -Div(c, 1440) : Div(c, 1440);
        oy += (d + 3) * 256;
      }
    }
    // a wall 18 px to its right, 30 px up, breaks it, whichever way it slides
    if (probeTile(t, e.x + (ox >> 8) + 18, e.y + (oy >> 8) - 30, layer, 8, PROBE_WALL).d < 0) return breakUp(ctx, p);
    if (!p.dead) {
      if (riding) {
        if (p.air) riding = false;
        else ride(p, cam, t);
      } else if (platformTop(o, e.x + (ox >> 8), e.y + (oy >> 8), o.boxes[0], p) & LANDED) {
        p.y += 1;
        riding = true;
        cancel(p);
        p.air = false; p.jumped = false; p.airLock = false; p.curled = false;
        p.state = 'walk';
        setOffsetY(p, 14);
      }
    }
    ox += vx * 2;
    sx = s16(e.x + (ox >> 8) - cam.x);
    o.x = sx + cam.x;   // where Sonic balances at its edges
    animate(o, ctx.anims);
    ctx.draw(o, sx + cam.x, sy + cam.y);
    return true;
  }

  // Sonic standing on it: walls to either side of his centre push him off it; while his body touches its box
  // 12 px up it carries him, and drops him where that would take him into a wall; it is drawn under his feet
  function ride(p, cam, t) {
    p.air = false; p.jumped = false; p.airLock = false;
    let r = probeTile(t, Math.floor(p.x), Math.floor(p.y), p.layer, 8, PROBE_WALL).d;
    if (r < 0) { p.onObject = null; p.air = true; riding = false; p.x += r; }
    r = probeTile(t, Math.floor(p.x), Math.floor(p.y), p.layer, -8, PROBE_WALL).d;
    if (r < 0) { p.onObject = null; p.air = true; riding = false; p.x -= r; }
    if (!overlap(e.x + (ox >> 8), e.y + (oy >> 8) - 12, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) {
      cancel(p); p.onObject = null; p.air = true; riding = false;
      return;
    }
    p.x += vx * 2 / 256;
    const ahead = (q8(p.x) + vx * 2) >> 8, py = Math.floor(p.y);
    const knock = r => { cancel(p); p.onObject = null; p.air = true; p.state = 'spin'; riding = false; p.x += r; p.xsp = 0; };
    r = scan(t, ahead, py, p.layer, 8, PROBE_WALL).d;
    if (r < 0) knock(r);
    else {
      r = scan(t, ahead, py, p.layer, -8, PROBE_WALL).d;
      if (r < 0) knock(-r);
    }
    sy = s16(Math.floor(p.y) - cam.y + (p.spinDashing || p.curled ? 42 : 46));
  }

  return { run: ctx => (sliding ? slide(ctx) : wait(ctx)) };
}

// the pieces, as the boulder's (boulders.js): their sprite and its size, how far across they go each frame, how
// far above the stone they start and how far they turn each frame; the large piece's frame isn't centred on its
// anchor, so it has no size
const PIECES = [['Small', 8, -2, 0, -42], ['Small', 8, 1, -16, 42], ['Large', 0, 2, 0, 14], ['Large', 0, -1, -16, -14]];

/**
 * A broken stone's pieces (Task_SkatingStoneDebris), for 61 frames: the boulder's, from three quarters of
 * their size. (sx, sy) is the stone's screen position when it broke and (vx, vy) its offset there from the
 * point it breaks at, 20 px above its foot.
 */
function debris(sx, sy, vx, vy, ice, anims) {
  const pieces = PIECES.map(([size, half, across, y, turn]) => {
    const s = makeSprite(`${ice ? 'iceStone' : 'stone'}Debris${size}`, { order: 8, prio: 0 });
    animate(s, anims);
    return { s, half, across, y: vy + y, turn, angle: 0 };
  });
  let n = 0, fall = -512, scale = 192;
  return {
    run(ctx) {
      if (n++ > 60) return false;
      fall += 40;
      scale = Math.min(scale + 8, 512);
      const cam = ctx.cam;
      for (const q of pieces) {
        q.y += fall >> 8;
        q.angle = (q.angle + q.turn) & 0x3FF;
        const dx = vx - cam.x + q.across * n, dy = q.y - cam.y;
        const x = sx + ((dx * scale * 128) >> 16), y = sy + ((dy * scale * 128) >> 16);
        const v = ctx.view, l = v.x - cam.x, top = v.y - cam.y;
        if (q.half && (x + q.half < l || x - q.half > l + v.w || y + q.half < top || y - q.half > top + v.h)) continue;
        ctx.draw(q.s, cam.x + x, cam.y + y, { rotation: q.angle, scaleX: scale, scaleY: scale, double: true });
      }
      return true;
    },
  };
}
