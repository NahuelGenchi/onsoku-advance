// The effects that go with Sonic Advance 2's optional tricks (SAT-R decompilation of Sonic Advance 2:
// src/game/shared/stage/mp_sprite_task.c, Task_SonicBoundMotionFrames in src/game/sa2/stage/player_callbacks.c,
// and boost_effect.c): tasks made as a trick gets going, which run just after Sonic's (priority 0x4001) and
// draw from the tricks' own sprite sheet (sa2tricks.js).

import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';

export const TRICK_FX_PRIORITY = 0x4001;
const HISTORY = 16;
const BOUND_TRAIL_SPEED = 2;   // the afterimages go once the dive is slower than this

/** Where Sonic was at the end of each of his last 16 frames, newest first (BoostEffect_StorePlayerPos). */
export function createTrail() { return []; }
export function recordTrail(trail, p) {
  trail.unshift([Math.floor(p.x), Math.floor(p.y)]);
  if (trail.length > HISTORY) trail.pop();
}

function effect(art, name, order) {
  const s = { anim: makeAnimator(), frame: -1, flipX: false, flipY: false, order, prio: 2, sheet: art };
  setAnim(s.anim, name);
  return s;
}

/**
 * The Humming Top's spin effect (sub_8028640's sprite task): it follows Sonic, mirrored the way he faces, in
 * front of him (OAM order 7), until his animation changes or he dies.
 */
export function spinEffect(art) {
  const s = effect(art, 'trickForwardFx', 7);
  return {
    run(ctx) {
      const p = ctx.player;
      if (p.dead || p.anim.name !== 'trickForwardSpin') return false;
      s.flipX = p.facing > 0;
      tickAnim(s.anim, art.anims);
      s.frame = frameOf(s.anim, art.anims);
      ctx.draw(s, Math.floor(p.x), Math.floor(p.y));
      return true;
    },
  };
}

/**
 * The Bound's afterimages (Task_SonicBoundMotionFrames): one a frame behind Sonic (OAM order 17), where he was
 * 6, 4, 2 and 0 frames before in turn, for as long as he dives at 2 px a frame or faster.
 */
export function boundTrail(art, trail) {
  const s = effect(art, 'boundTrail', 17);
  let back = 0;
  return {
    run(ctx) {
      const p = ctx.player;
      if (p.dead || p.ysp < BOUND_TRAIL_SPEED || p.trick?.phase !== 'dive') return false;
      tickAnim(s.anim, art.anims);
      s.frame = frameOf(s.anim, art.anims);
      back = (back - 1) & 6;
      const [x, y] = trail[Math.min(back, trail.length - 1)];
      ctx.draw(s, x, y);
      return true;
    },
  };
}
