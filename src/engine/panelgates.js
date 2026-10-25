// Casino Paradise's panel gates (SAT-R decompilation, src/game/sa1/stage/interactables/panel_gate.c): panels that
// spin open for Sonic going through them one way and are solid the other way, until they shut 125 frames
// later. Kind 63 stands upright and opens to him running right (left when d0 is set, mirrored) within 32 px
// before it; kind 64 lies flat and opens to him falling (rising when d0 is set, upside down) within 28 px of it.
// While one spins, only the side he would come back through is solid.

import { makeSprite, startAnim, animate, offCam } from './objects.js';
import { overlap, platform, gate } from './collide.js';
import { setOffsetY } from './sensors.js';
import { SPRITE_OFFSET_Y } from './constants.js';
import { SONG } from '../sound/songs.js';

export const PANEL_GATE = 63, PANEL_GATE_FLOOR = 64;
const SOX = 6;      // Sonic's spriteOffsetX
const OPEN = 0x7D;  // how long it spins, in frames

/** The task for a panel gate entity, or null when `e` is not one. */
export function createPanelGate(e, slot, anims) {
  if (e.kind !== PANEL_GATE && e.kind !== PANEL_GATE_FLOOR) return null;
  const flat = e.kind === PANEL_GATE_FLOOR, flip = e.d[0] !== 0;
  const shut = flat ? 'panelGateFloor' : 'panelGate', spin = flat ? 'panelGateFloorOpen' : 'panelGateOpen';
  const o = makeSprite(shut, { flipX: !flat && flip, flipY: flat && flip });
  animate(o, anims);   // shut; it is only stepped while open
  o.x = e.x; o.y = e.y;
  let open = 0;        // unk3C

  // Coll_Player_Entity_Intersection with its box moved
  const touches = (p, x, y) => overlap(x, y, o.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY]);

  function opens(ctx) {
    open = OPEN;
    startAnim(o, spin);
    setOffsetY(ctx.player, SPRITE_OFFSET_Y);   // PLAYERFN_CHANGE_SHIFT_OFFSETS(6, 14)
    ctx.world.playSound(SONG.PANEL_GATE);
  }

  // sub_8081C04: run through from the open side, or pushed out of it
  function upright(ctx) {
    const p = ctx.player, t = ctx.world.terrain, px = Math.floor(p.x), py = Math.floor(p.y), y = p.y;
    if (py >= e.y - 40 && py <= e.y + 40) {
      const [from, to] = flip ? [e.x, e.x + 32] : [e.x - 32, e.x + 16];
      if (px >= from && px <= to) {
        if (flip || px <= e.x) {
          if (flip ? p.xsp < 0 : p.xsp > 0) opens(ctx);
          else gate(o, o.boxes[0], p, t);
        } else if (p.xsp < 0) {
          gate(o, o.boxes[0], p, t);
          p.gsp = 0; p.xsp = 0;
        }
      }
    }
    p.y = y;   // where he was, even after the offset change
  }

  // sub_8081F50: fallen through from the open side, or solid
  function lying(ctx) {
    const p = ctx.player, t = ctx.world.terrain, px = Math.floor(p.x), py = Math.floor(p.y);
    const [from, to] = flip ? [e.y, e.y + 28] : [e.y - 28, e.y];
    if (px >= e.x && px <= e.x + 32 && py >= from && py <= to && (flip ? p.ysp < 0 : p.ysp > 0)) opens(ctx);
    else platform(o, o.boxes[0], p, t);
  }

  return {
    run(ctx) {
      const p = ctx.player, t = ctx.world.terrain;
      if (!open) {
        // opening it switches to Task_PanelGate_*2 from the next frame
        if (!p.dead) flat ? lying(ctx) : upright(ctx);
        if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
        ctx.draw(o, e.x, e.y);
        return true;
      }

      if (offCam(e.x, e.y, ctx.cam)) { slot.live = null; return false; }
      if (!p.dead) {
        // only coming back is stopped
        if (flat) {
          if (touches(p, e.x, flip ? e.y + 5 : e.y - 5) && (flip ? p.ysp > 0 : p.ysp < 0)) platform(o, o.boxes[0], p, t);
        } else if (touches(p, flip ? e.x - 6 : e.x + 6, e.y) && (flip ? p.xsp > 0 : p.xsp < 0)) gate(o, o.boxes[0], p, t);
      }
      if (--open === 0) startAnim(o, shut);
      animate(o, anims);
      ctx.draw(o, e.x, e.y);
      return true;
    },
  };
}
