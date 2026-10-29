// Moving springs (SAT-R decompilation, src/game/sa1/stage/interactables/moving_spring.c; the tasks are at
// 0x0808B131 and 0x0808B2B5 in the USA ROM): a spring on a block that swings back and forth with the stage
// clock, d2 × 8 px either way across when d2 > d3, else d3 × 8 px either way up and down, one swing every 256
// frames, half a swing later when the sign of d0 (across) or d1 (up and down) is set.
//
// Sonic lands on its top like any solid object's; the frame after he lands, the spring throws him up at 7.5 px
// a frame in his spring somersault, and plays its launch animation. Its sides push him out on their own,
// 8 px of slack each way, and set him on the terrain when that puts him in it. Two quirks of the original are
// kept: while he is in the spring somersault (from any spring) its sides don't move him, and whenever he
// pushes against anything but its block, it stops his pushing and sets him walking. Knuckles climbing into
// its block from below or from a side lets go of the wall, curled up in the air.

import { makeSprite, startAnim, animate, offCam, offDisplay } from './objects.js';
import { platform, overlap, PUSHING, FROM_BELOW, LEFT_FACE, RIGHT_FACE } from './collide.js';
import { endAttack, climbing } from './player.js';
import { scan, PROBE_FLOOR } from './terrain.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';

export const MOVING_SPRING = 81;

const s8 = v => (v << 24) >> 24;
const SPEED = 7.5;
const LAUNCH_FRAMES = 12;

/** The task for a moving spring entity, or null when `e` is not one. */
export function createMovingSpring(e, slot, anims) {
  if (e.kind !== MOVING_SPRING) return null;
  const [d0, d1, d2, d3] = e.d;
  // which way it swings, and the phase its sign picks
  const across = d2 > d3, phase = (across ? s8(d0) : s8(d1)) < 0 ? 0x80 : 0;
  const o = { ...makeSprite('movingSpring'), x: e.x, y: e.y };
  animate(o, anims);
  let launching = false, n = 0;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, t = ctx.world.tick;
      const swing = Math.imul((across ? d2 : d3) << 11, SINE[(4 * ((t + phase) & 0xFF)) & 0x3FF]) >> 14 >> 8;
      o.x = across ? e.x + swing : e.x; o.y = across ? e.y : e.y + swing;
      if (!launching) {
        if (collide(ctx, p)) { n = 0; launching = true; startAnim(o, 'movingSpringLaunch', true); }
      } else {
        // a throw while it plays keeps the animation going and counts its 12 frames again
        if (collide(ctx, p)) n = 0;
        if (++n > LAUNCH_FRAMES) { launching = false; startAnim(o, 'movingSpring', true); }
      }
      if (offDisplay(e.x, e.y, cam) && offCam(o.x, o.y, cam)) { slot.live = null; return false; }
      animate(o, anims);
      ctx.draw(o, o.x, o.y);
      return true;
    },
  };

  // sub_808B7A0: true when it throws him
  function collide(ctx, p) {
    if (p.dead) return false;
    let thrown = false;
    if (p.onObject === o) {
      p.air = true; p.pushing = false; endAttack(p);
      p.state = 'spring'; p.animRestart = true;
      p.ysp = -SPEED;
      ctx.world.playSound(SONG.SPRING);
      thrown = true;
    }
    const x = p.x;
    side(p, ctx.world.terrain);
    const r = platform(o, o.boxes[0], p, ctx.world.terrain);
    if (p.state === 'spring') p.x = x;
    // Knuckles climbing into it from below or a side lets go of the wall, curled up in the air
    if (r & (FROM_BELOW | LEFT_FACE | RIGHT_FACE) && climbing(p)) { endAttack(p); p.state = 'spin'; p.curled = true; p.air = true; }
    if (!(r & PUSHING) && p.pushing) { p.pushing = false; endAttack(p); p.state = 'walk'; }
    return thrown;
  }

  // sub_808BB44: out of its sides to a whole pixel, within 8 px of each, then out of the floor below and the
  // ceiling above him (both moving him up)
  function side(p, terrain) {
    const flank = [-11, 1 - p.offsetY, 11, p.offsetY - 1], hb = o.boxes[0];
    if (!hb || !overlap(o.x, o.y, hb, Math.floor(p.x), Math.floor(p.y), flank)) return;
    const left = o.x + hb[0] - flank[2], right = o.x + hb[2] - flank[0];
    if (Math.floor(p.x) <= left + 8) p.x = left;
    else if (Math.floor(p.x) >= right - 8) p.x = right;
    else return;
    let d = scan(terrain, Math.floor(p.y) + 9, p.x, p.layer, 8, PROBE_FLOOR).d;
    if (d < 0) p.y += d;
    d = scan(terrain, Math.floor(p.y), p.x, p.layer, -8, PROBE_FLOOR).d;
    if (d < 0) p.y += d;
    // off whatever he stood on, not only this
    p.pushing = false; p.onObject = null;
  }
}
