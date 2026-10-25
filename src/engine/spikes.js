// The spikes, following SA1's spike code (SAT-R decompilation, src/game/sa1/stage/interactables/spikes.c).
// They are solid like any platform and hurt only from the side they point to: the up spikes when Sonic lands
// on top, the sideways ones through the face they point out of.

import { platform, LANDED, FROM_BELOW, LEFT_FACE, RIGHT_FACE } from './collide.js';
import { SONG } from '../sound/songs.js';

// interactable kinds
export const SPIKES_UP = 1, SPIKES_LEFT = 3, SPIKES_RIGHT = 4;

const SOX = 6;   // Sonic's spriteOffsetX

// up (sub_8020D44): landing on them hurts
function up(o, p, world) {
  if ((platform(o, o.boxes[0], p, world.terrain) & LANDED) && world.damage()) world.playSound(SONG.SPIKES);
  return false;
}

// pointing sideways (Task_Spikes_Horizontal): the top and bottom are only solid and the face they point out
// of hurts; touching the back face puts Sonic out beyond the other one, as the code reads (their backs are
// against walls)
function left(o, p, world) {
  const hb = o.boxes[0], r = platform(o, hb, p, world.terrain);
  if (r & (LANDED | FROM_BELOW)) return false;
  if (r & LEFT_FACE) { if (world.damage()) world.playSound(SONG.SPIKES); }
  else if (r & RIGHT_FACE) p.x = o.x + hb[0] - (SOX + 5) - 1;
  return false;
}
function right(o, p, world) {
  const hb = o.boxes[0], r = platform(o, hb, p, world.terrain);
  if (r & (LANDED | FROM_BELOW)) return false;
  if (r & LEFT_FACE) p.x = o.x + hb[2] + (SOX + 5) + 1;
  else if (r & RIGHT_FACE) { if (world.damage()) world.playSound(SONG.SPIKES); }
  return false;
}

/** The object for a spike entity, or null when `kind` is not one of the spikes built. */
export function createSpikes(e) {
  if (e.kind === SPIKES_UP) return { kind: e.kind, x: e.x, y: e.y, d: e.d, flipX: false, flipY: false, order: 17, idle: 'spikesUp', collide: up };
  if (e.kind === SPIKES_LEFT) return { kind: e.kind, x: e.x, y: e.y, d: e.d, flipX: true, flipY: false, order: 17, idle: 'spikesSide', collide: left };
  if (e.kind === SPIKES_RIGHT) return { kind: e.kind, x: e.x, y: e.y, d: e.d, flipX: false, flipY: false, order: 17, idle: 'spikesSide', collide: right };
  return null;
}
