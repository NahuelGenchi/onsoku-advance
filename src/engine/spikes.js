// The spikes in Neo Green Hill, following SA1's spike code (SAT-R decompilation,
// src/game/sa1/stage/interactables/spikes.c). They are solid like any platform and hurt only from the side
// they point to: the up spikes when Sonic lands on top, the sideways ones through the face they point to.
// The hiding spikes come up and go down again by the stage clock.

import { platform, overlap, LANDED, FROM_BELOW, LEFT_FACE, RIGHT_FACE, PUSHING } from './collide.js';
import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { SONG } from '../sound/songs.js';

// interactable kinds
export const SPIKES_UP = 1, SPIKES_LEFT = 3, SPIKES_RIGHT = 4, SPIKES_HIDING = 5;

const SOX = 6;   // Sonic's spriteOffsetX

// Coll_DamagePlayer, with the spikes' sound when it hurts
function hurt(world) {
  if (world.damage()) world.playSound(SONG.SPIKES);
}

// up (sub_8020D44): landing on them hurts
function up(o, p, world) {
  if (platform(o, o.boxes[0], p, world.terrain) & LANDED) hurt(world);
  return false;
}

// sideways (Task_Spikes_Horizontal): the top and bottom are only solid and the face they point to hurts;
// touching the back face puts Sonic out beyond the other one, as the code reads (in act 1 their backs are
// against walls)
function side(o, p, world) {
  const hb = o.boxes[0], r = platform(o, hb, p, world.terrain);
  if (r & (LANDED | FROM_BELOW)) return false;
  if (r & LEFT_FACE) {
    if (o.kind === SPIKES_LEFT) hurt(world);
    else p.x = o.x + hb[2] + (SOX + 5) + 1;
  } else if (r & RIGHT_FACE) {
    if (o.kind === SPIKES_RIGHT) hurt(world);
    else p.x = o.x + hb[0] - (SOX + 5) - 1;
  }
  return false;
}

/** The object for a spike entity, or null when `kind` is not one of the up or sideways spikes. */
export function createSpikes(e) {
  if (e.kind === SPIKES_UP) return { kind: e.kind, x: e.x, y: e.y, d: e.d, flipX: false, flipY: false, order: 17, idle: 'spikesUp', collide: up };
  if (e.kind === SPIKES_LEFT || e.kind === SPIKES_RIGHT) {
    return { kind: e.kind, x: e.x, y: e.y, d: e.d, flipX: e.kind === SPIKES_LEFT, flipY: false, order: 17, idle: 'spikesSide', collide: side };
  }
  return null;
}

// the hiding spikes' variants: low and half up as they come and go, and up
const HIDING = ['spikesLow', 'spikesMid', 'spikesUp'];

/**
 * Hiding spikes pointing up (Task_Spikes_HidingUp and sub_8020F2C), or null for another kind. They go by the
 * stage clock: hidden for the first 60 frames of every 128, coming up through two frames each of their low and
 * half-up variants, up for 60 frames, and going down the same way. While they're up they are solid and hurt
 * Sonic landing on top; the frame they come up, they lift him onto their top and hurt him if his body is in
 * them. Whenever they aren't up, Sonic standing on them falls, and stops pushing against them.
 */
export function createHidingSpikes(e, slot, anims) {
  if (e.kind !== SPIKES_HIDING) return null;
  const o = { kind: e.kind, x: e.x, y: e.y, ...makeSprite(HIDING[0], { order: 17 }) };
  let variant = -1;   // none shown yet
  let found = 0;      // what the last platform test found (movestateBuffer)
  const show = v => { variant = v; startAnim(o, HIDING[v]); animate(o, anims); };
  return {
    run(ctx) {
      const p = ctx.player, world = ctx.world;
      if (offCam(o.x, o.y, ctx.cam)) { slot.live = null; return false; }
      const t = world.tick % 128;
      if (t < 64 || t >= 124) {
        if (p.onObject === o) { p.onObject = null; p.air = true; }
        if (found & PUSHING) { p.pushing = false; found = 0; }
        if (t < 60) return true;   // hidden, and not drawn
        show(t < 62 || t >= 126 ? 0 : 1);
      } else if (variant !== 2) {
        show(2);
        const hb = o.boxes[0];
        if (!p.dead && overlap(o.x, o.y, hb, Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) {
          p.y = o.y + hb[1] - (p.offsetY - 1);
          hurt(world);
        } else if (platform(o, hb, p, world.terrain) & LANDED) hurt(world);
      } else {
        found = platform(o, o.boxes[0], p, world.terrain);
        if (found & LANDED) hurt(world);
      }
      ctx.draw(o, o.x, o.y);
      return true;
    },
  };
}
