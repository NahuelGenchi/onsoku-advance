// The Chao of Chao Hunt (SAT-R decompilation, src/game/sa1/stage/mp_chao.c). Chao Hunt has one, made at the
// stage's start at one of its stage's eight places (picked by the GBA that leads the link, chaohunt.js), 16 px
// above it. It sits there until a player's body box touches its box; it then hovers by that player's head,
// 20 px behind them and 28 px up, bobbing up and down, moving there at up to 2 px a frame, and turning to face
// the way the player looks when it catches up while they are bored. When another player takes it (a knock,
// mpplayer.js, or the message saying so, chaohunt.js) it jumps off in shock, falls to the ground, lands and goes
// over to its new player. It goes by the multiplayer players' tasks (mpplayer.js), so it sees each player as
// that player's GBA sent them two frames ago.

import { makeSprite, startAnim, animate } from './objects.js';
import { overlap } from './collide.js';
import { SINE, vectorAngle } from './trig.js';
import { tileEdge, PROBE_FLOOR } from './terrain.js';
import { SONG } from '../sound/songs.js';

export const NO_PLAYER = 0xFF;
const ABOVE = 16;                       // it starts this far above its place
const BEHIND = 20, HEAD = 28;           // where it hovers by its player
const MAX_STEP = 512;                   // 2 px a frame, in 1/256 px
const JUMP_X = 384, JUMP_Y = -768, FALL = 0x28;   // its jump off a player it is taken from
const I = q => q >> 8;
const ZERO_BOX = [0, 0, 0, 0];

/**
 * Chao `id` (CreateMultiplayerChao) at `place` of the stage's spawn table. `mp` is the mode's shared state
 * (its players' tasks); the Chao's `playerA` is whom it goes to, and `playerB` whom it is with.
 */
export function createChao(mp, place, id, anims) {
  const s = makeSprite('chaoSitting', { order: 16 - id });
  const c = { id, playerA: NO_PLAYER, playerB: NO_PLAYER, qx: place.x << 8, qy: (place.y - ABOVE) << 8, vx: 0, vy: 0, s };
  let phase = 'free';
  const box = () => s.boxes[0] ?? ZERO_BOX;
  const player = () => mp.players[c.playerA];
  const show = ctx => ctx.draw(s, I(c.qx), I(c.qy));

  // UpdateChaoPosition: toward (x, y) by up to 2 px along the angle the sprite code finds, facing its way;
  // true once it is there
  function moveTo(x, y) {
    const mpp = player();
    const dx = (x - I(c.qx)) << 16 >> 16, dy = (y - I(c.qy)) << 16 >> 16;
    s.flipX = dx > 0 || (dx === 0 && mpp.flipX);
    if (dx === 0 && dy === 0) return true;
    let ux = dx, uy = dy;
    if (dx !== 0 && dy !== 0) {
      while (Math.abs(ux) > 0x7F || Math.abs(uy) > 0x7F) {
        ux = Math.trunc(ux / 2); uy = Math.trunc(uy / 2);
        if (Math.abs(ux) <= 1 || Math.abs(uy) <= 1) break;
      }
    }
    let angle;
    if (Math.abs(ux) <= 1 && Math.abs(uy) > 1) angle = uy > 0 ? 256 : 768;
    else if (Math.abs(uy) <= 1 && Math.abs(ux) > 1) angle = ux > 0 ? 0 : 512;
    else angle = vectorAngle(uy, ux);
    let dist = Math.floor(Math.sqrt(dx * dx + dy * dy)) << 8;
    if (dist > MAX_STEP) dist = MAX_STEP;
    else if (dist === 0) dist = 1;
    c.qx += (dist * SINE[angle + 256]) >> 14;
    c.qy += (dist * SINE[angle]) >> 14;
    return false;
  }

  // the move to the player it is with, or its jump when another took it
  function follow(ctx) {
    if (c.playerA !== c.playerB) { c.playerB = c.playerA; return jumpOff(); }
    const mpp = player(), angle = (ctx.world.tick * 16) >>> 0;
    let y, theta;
    if (mpp.flipY) { s.flipY = true; y = mpp.pos.y + HEAD; theta = (angle + 0x200) & 0x3FF; }
    else { s.flipY = false; y = mpp.pos.y - HEAD; theta = angle & 0x3FF; }
    const x = (mpp.flipX ? mpp.pos.x - BEHIND : mpp.pos.x + BEHIND) << 16 >> 16;
    // caught up with a bored player it turns to the front; otherwise it faces the way it goes
    if (x === I(c.qx)) startAnim(s, mpp.animId === 1 ? 'chaoTurn' : 'chaoDiagonalR');
    else startAnim(s, 'chaoHover');
    moveTo(x, y);
    animate(s, anims);
    ctx.draw(s, I(c.qx), I(c.qy) - (SINE[theta] >> 11));
    return true;
  }

  // sub_802888C: it jumps away from the way it faces, and isn't drawn on this frame
  function jumpOff() {
    c.vx = s.flipX ? -JUMP_X : JUMP_X;
    c.vy = player().flipY ? -JUMP_Y : JUMP_Y;
    startAnim(s, 'chaoShocked');
    phase = 'falling';
    return true;
  }

  const phases = {
    // Task_802816C: sitting, until a player's body box touches it (each player's last box, set or not);
    // its own goes by the box it has whether set or not
    free(ctx) {
      startAnim(s, 'chaoSitting');
      animate(s, anims);
      if (c.playerA !== NO_PLAYER) { c.playerB = c.playerA; phase = 'follow'; }
      else {
        for (let pid = 0; pid < 4 && mp.players[pid]; pid++) {
          const mpp = mp.players[pid];
          if (mpp.flags & 4) continue;   // untouchable
          if (!overlap(I(c.qx), I(c.qy), box(), mpp.pos.x, mpp.pos.y, mpp.boxes[0].b)) continue;
          mpp.state |= 0x10000 << c.id;
          c.playerA = c.playerB = pid;
          phase = 'follow';
          ctx.world.playSound(SONG.CHAO_HUH);
          break;
        }
      }
      show(ctx);
      return true;
    },
    follow,
    // sub_8028910: falling until the floor under its centre stops it
    falling(ctx) {
      const mpp = player(), up = mpp.flipY;
      c.vy += up ? -FALL : FALL;
      c.qx += c.vx; c.qy += c.vy;
      const layer = (mpp.flags >> 7) & 1;
      const res = tileEdge(ctx.world.terrain, I(c.qy), I(c.qx), layer, up ? -8 : 8, PROBE_FLOOR);
      if (res < 0) {
        c.qy += up ? -(res << 8) : res << 8;
        startAnim(s, 'chaoLand');
        phase = 'landing';
      }
      animate(s, anims);
      show(ctx);
      return true;
    },
    // Task_8028A1C: the landing plays out, its animation stepped twice a frame
    landing(ctx) {
      if (animate(s, anims)) phase = c.playerA !== NO_PLAYER ? 'follow' : 'free';
      animate(s, anims);
      show(ctx);
      return true;
    },
  };

  c.task = { run: ctx => phases[phase](ctx) };
  return c;
}
