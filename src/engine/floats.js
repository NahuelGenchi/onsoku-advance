// The player float toggle (SAT-R decompilation, src/game/sa1/stage/interactables/toggle_player_float.c;
// Task_PlayerFloatMain at 0x0808EF90 in the USA ROM): an area with nothing drawn, from its spawn point d2
// tiles across and d3 down, both edges in. On every frame Sonic's centre is in it and he is alive, it lifts
// him: 104/256 px a frame off his Y speed, no faster up than 2.25 px a frame, before his own frame adds
// gravity, so he rises at 2.0859375 px a frame once at full speed. It puts him in the air, cancels what the
// original's Player_TransitionCancelFlyingAndBoost cancels and gives him its character state: with d0 = 0
// the whirlwind's spin (37), any other d0 the spring's somersault (17). More than 4 px above the floor under
// his centre (the one-tile probe) it also uncurls him, leaving his hitbox at the height it has.
//
// A whirlwind plays SE_200 on the frame it first lifts him while he isn't already spinning in one, and fades
// the second sound effect player out on a frame he isn't spinning (landed, say); leaving the camera's range
// while it plays, it stops it. The halving of his falling speed on leaving is behind a flag nothing sets,
// as in the waterfalls.

import { offCam } from './objects.js';
import { endAttack } from './player.js';
import { tileFloor } from './terrain.js';
import { SONG } from '../sound/songs.js';

export const PLAYER_FLOAT = 90;
const UPDRAFT = 104 / 256, MAX_RISE = 2.25;   // PLAYER_FLOATING_UPDRAFT, PLAYER_MAX_FLOATING_SPEED
const SE2 = 2, FADE = 4;                       // m4aMPlayFadeOut(&gMPlayInfo_SE2, 4)

/** The task for a player float toggle entity, or null when `e` is not one. */
export function createFloat(e, slot) {
  if (e.kind !== PLAYER_FLOAT) return null;
  const right = e.x + e.d[2] * 8, bottom = e.y + e.d[3] * 8, whirlwind = e.d[0] === 0;
  let sounding = false;   // unk3D: SE_200 has started
  return {
    run(ctx) {
      const p = ctx.player;
      if (offCam(e.x, e.y, ctx.cam)) {
        if (sounding) ctx.world.stopSound(SONG.WHIRLWIND);
        slot.live = null;
        return false;
      }
      if (p.state !== 'float' && sounding) { ctx.world.fadeOut(SE2, FADE); sounding = false; }
      if (p.dead) return true;
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (x >= e.x && x <= right && y >= e.y && y <= bottom) {
        if (!sounding && p.state !== 'float' && whirlwind) { sounding = true; ctx.world.playSound(SONG.WHIRLWIND); }
        p.ysp -= UPDRAFT;
        if (p.ysp < -MAX_RISE) p.ysp = -MAX_RISE;
        p.air = true;
        // Player_TransitionCancelFlyingAndBoost
        endAttack(p); p.pushing = false; p.airLock = false;
        p.state = whirlwind ? 'float' : 'spring';
        if (tileFloor(ctx.world.terrain, x, y, p.layer) > 4) p.curled = false;
      }
      return true;
    },
  };
}
