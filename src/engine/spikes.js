// The spikes, following SA1's spike code (SAT-R decompilation, src/game/sa1/stage/interactables/spikes.c).
// They are solid like any platform and hurt only from the side they point to: the up spikes when Sonic lands
// on top, the down spikes when he hits them from below, the sideways ones through the face they point to.
// The hiding spikes are in hidingspikes.js.

import { platform, LANDED, FROM_BELOW, LEFT_FACE, RIGHT_FACE } from './collide.js';
import { SONG } from '../sound/songs.js';

// interactable kinds
export const SPIKES_UP = 1, SPIKES_DOWN = 2, SPIKES_LEFT = 3, SPIKES_RIGHT = 4;

const SOX = 6;   // Sonic's spriteOffsetX

// Coll_DamagePlayer, with the spikes' sound when it hurts
function hurt(world) {
  if (world.damage()) world.playSound(SONG.SPIKES);
}

// sub_8020D44: landing on them hurts
function landing(o, p, world) {
  if (platform(o, o.boxes[0], p, world.terrain) & LANDED) hurt(world);
  return false;
}

// sub_8020E98: hitting them from below hurts; not while an object carries Sonic
function bumping(o, p, world) {
  if (p.carried) return false;
  if (platform(o, o.boxes[0], p, world.terrain) & FROM_BELOW) hurt(world);
  return false;
}

// up (Task_Spikes_Up) and down (Task_Spikes_Down): under flipped gravity they swap tests, so the side they point
// to still hurts
const up = (o, p, world) => (p.inverted ? bumping : landing)(o, p, world);
const down = (o, p, world) => (p.inverted ? landing : bumping)(o, p, world);

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

/** The object for a spike entity, or null when `kind` is not one of the spikes built. */
export function createSpikes(e) {
  if (e.kind === SPIKES_UP) return { kind: e.kind, x: e.x, y: e.y, d: e.d, flipX: false, flipY: false, order: 17, idle: 'spikesUp', collide: up };
  if (e.kind === SPIKES_DOWN) return { kind: e.kind, x: e.x, y: e.y, d: e.d, flipX: false, flipY: true, order: 17, idle: 'spikesUp', collide: down };
  if (e.kind === SPIKES_LEFT || e.kind === SPIKES_RIGHT) {
    return { kind: e.kind, x: e.x, y: e.y, d: e.d, flipX: e.kind === SPIKES_LEFT, flipY: false, order: 17, idle: 'spikesSide', collide: side };
  }
  return null;
}
