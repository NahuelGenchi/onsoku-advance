// Egg Rocket's spiked barrels (SAT-R decompilation, src/game/sa1/stage/interactables/spiked_barrel.c), kind 93:
// platforms that swing as the thin ones do (across when d2 is above d3, by d2 × 8 px either side, otherwise up
// and down by d3 × 8, once every 256 frames of the stage clock, a negative d0 or d1 half a swing on) and turn
// their spikes round: out on top for 16 frames, turning for 48, out underneath for 16, turning back for 48.
// Sonic stands on top; while either set is out (variants 0 and 2) touching its box hurts him.

import { makeSprite, startAnim, animate, offCam, offDisplay } from './objects.js';
import { platformTop, overlap } from './collide.js';
import { SINE } from './trig.js';
import { SONG } from '../sound/songs.js';

export const SPIKED_BARREL = 93;
const s8 = v => (v << 24) >> 24;
const LOOKS = ['spikedBarrel', 'spikedBarrel1', 'spikedBarrel2', 'spikedBarrel3'];
const SHORT = 0x10, LONG = 0x30;
const div256 = v => Math.trunc(v / 256);   // Div(v, 0x100): towards 0, where its box uses v >> 8

/** The task for a spiked barrel entity, or null when `e` is not one. */
export function createSpikedBarrel(e, slot, anims) {
  if (e.kind !== SPIKED_BARREL) return null;
  const o = { ...makeSprite(LOOKS[0]) };
  animate(o, anims);
  const across = e.d[2] > e.d[3];
  const phase = s8(across ? e.d[0] : e.d[1]) < 0 ? 0x80 : 0, reach = (across ? e.d[2] : e.d[3]) << 11;
  let q = 0, sag = 0, variant = 0, wait = SHORT;
  return {
    run(ctx) {
      const p = ctx.player, cam = ctx.cam, world = ctx.world;
      const next = Math.imul(reach, SINE[(4 * ((world.tick + phase) & 0xFF)) & 0x3FF]) >> 14, moved = next - q;
      q = next;
      // the sprite is drawn Div(q, 256) off its point; its top is q >> 8 off
      const dx = across ? div256(q) : 0, dy = across ? 0 : div256(q);
      const x = e.x + (across ? q >> 8 : 0), y = e.y + (across ? 0 : q >> 8);
      o.x = x;
      if (p.onObject === o) {
        if (across) p.x += moved / 256;
        p.y += 1 + (across ? 0 : moved / 256);
      }
      platformTop(o, x, y, o.boxes[0], p);
      if ((variant === 0 || variant === 2) && o.boxes[1] && p.boxes[0]
        && overlap(e.x + dx, e.y + dy, o.boxes[1], Math.floor(p.x), Math.floor(p.y), p.boxes[0])) {
        if (!p.dead && world.damage()) world.playSound(SONG.SPIKES);
      }
      if (offDisplay(e.x, e.y, cam) && offCam(e.x + dx, e.y + dy, cam)) { slot.live = null; return false; }
      sag = p.onObject === o ? Math.min(sag + 0x10, 0x100) : Math.max(sag - 0x10, 0);
      if (--wait === 0) {
        wait = variant === 0 || variant === 2 ? LONG : SHORT;
        variant = (variant + 1) % 4;
        startAnim(o, LOOKS[variant], true);
      }
      animate(o, anims);
      ctx.draw(o, e.x + dx, e.y + dy + (SINE[sag] >> 12));
      return true;
    },
  };
}
