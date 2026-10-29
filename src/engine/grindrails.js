// Neo Green Hill's grind rails (SAT-R decompilation, src/game/sa1/stage/interactables/grind_rail.c and
// src/game/shared/stage/grind_effect_1.c). The rails are drawn into the act and their collision is on the other
// layer from the ground around them. Kind 19, at a rail's top end, puts Sonic on that layer when his centre
// is in its box while he moves right and isn't rising; he then grinds down it (player.js). Kind 20, at its
// bottom end, throws him off: up as high as a jump from its right half, or higher, at 7 px a frame, from its
// left half while jump is held. Neither checks its box's d0 and d1. They are Sonic's: with another character
// their tasks do nothing, and stay.

import { makeSprite, animate, offCam } from './objects.js';
import { endAttack, SONIC } from './player.js';
import { PHYSICS as K } from './constants.js';
import { SONG } from '../sound/songs.js';

export const GRIND_RAIL_START = 19, GRIND_RAIL_END = 20;
const END = 0x900;           // the end's priority: before the camera, so it sees the last frame's
const SPARKS = 0x2001;       // the sparks' priority
const MIN_SPEED = 0.5;       // the X speed the start gives him at least
const EXTRA_JUMP = 7;        // PLAYER_RAIL_EXTRA_JUMP_HEIGHT

/** The task for a grind rail entity, or null when `e` is not one. */
export function createGrindRail(e, slot) {
  if (e.kind !== GRIND_RAIL_START && e.kind !== GRIND_RAIL_END) return null;
  const w = e.d[2] * 8, h = e.d[3] * 8;
  const inside = p => {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    return x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h;
  };
  // they only test Sonic and leave while he is alive
  const leaves = ctx => {
    if (!offCam(e.x, e.y, ctx.cam)) return false;
    slot.live = null;
    return true;
  };

  // Task_GrindRailStart
  if (e.kind === GRIND_RAIL_START) return {
    run(ctx) {
      const p = ctx.player;
      if (p.character !== SONIC || p.dead) return true;
      if (inside(p) && !p.grinding && p.ysp >= 0 && p.xsp > 0) {
        p.xsp = Math.max(MIN_SPEED, p.xsp);
        p.grinding = true;
        p.layer ^= 1;
        p.front = true;
        ctx.world.playSound(SONG.GRINDING);
        ctx.add(sparks(), SPARKS);
      }
      return !leaves(ctx);
    },
  };

  // Task_GrindRailEnd: the jump button as it is held now, whatever Sonic's own input reads
  return {
    priority: END,
    run(ctx) {
      const p = ctx.player;
      if (p.character !== SONIC || p.dead) return true;
      if (inside(p) && p.grinding) {
        const far = Math.floor(p.x) > e.x + (w >> 1);
        if (far || ctx.input.jump) {
          p.ysp = far ? -K.jumpSpeed : -EXTRA_JUMP;
          ctx.world.stopSound(SONG.GRINDING);
          ctx.world.playSound(SONG.JUMP);
          endAttack(p);
          // the somersault (charState 17) or the jump off the rail (20); he stays uncurled
          p.state = far ? 'spring' : 'railJump';
          p.air = true;
          p.grinding = false;
          p.layer ^= 1;
          p.front = false;
        }
      }
      return !leaves(ctx);
    },
  };
}

// the sparks at Sonic's feet (Task_GrindEffect): shown, and animated, only on the frames his last animation
// was the steep grind, and gone once he stops grinding
function sparks() {
  const s = makeSprite('grindSparks', { order: 8 });
  return {
    run(ctx) {
      const p = ctx.player;
      if (!p.grinding) return false;
      if (p.anim.name === 'grindSteep') {
        s.flipX = p.facing > 0;
        animate(s, ctx.anims);
        ctx.draw(s, Math.floor(p.x), Math.floor(p.y) + p.offsetY);
      }
      return true;
    },
  };
}
