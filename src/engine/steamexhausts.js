// Secret Base act 2's steam exhausts (SAT-R decompilation, src/game/sa1/stage/interactables/steam_exhaust.c): a
// vent in the floor with a lid on it, both solid. Whenever the stage clock is a multiple of 160 it blows the lid
// up at 5 px a frame, 37/256 px a frame slower every frame, and the lid bounces twice when it lands again,
// each time at 2/5 of the speed. The steam scalds Sonic from its 7th frame to its 53rd, a box 26 px tall above
// the vent. On the rising lid he is carried up, and he can ride it for as long as he stays on it.

import { makeSprite, startAnim, animate, offCam, offDisplay } from './objects.js';
import { platform, platformTop, overlap, LANDED } from './collide.js';
import { scan, PROBE_FLOOR } from './terrain.js';
import { SONG } from '../sound/songs.js';

export const STEAM_EXHAUST = 79;

const PERIOD = 160;                  // Mod(gStageTime, 160)
const LAUNCH = -1280, GRAVITY = 37;  // the lid's speed and its fall, in 1/256 px
const BOUNCES = 3;                   // its landings until it rests
const STEAM = 102;                   // the steam's countdown (unk84): it scalds from 95 to 49 and ends at 48
const SOX = 6;                       // Sonic's spriteOffsetX
const Div = (a, b) => Math.trunc(a / b);

// a ceiling over his head pushes him back down out of it (sub_801E4E4 up from 19 px above his centre)
function unstick(p, terrain) {
  const d = scan(terrain, Math.floor(p.y) - 19, Math.floor(p.x), p.layer, -8, PROBE_FLOOR).d;
  if (d < 0) p.y += d;
}

/** The task for a steam exhaust, or null when `e` is not one. */
export function createSteamExhaust(e, slot, anims) {
  if (e.kind !== STEAM_EXHAUST) return null;
  const { x, y } = e;
  // neither sprite has run its script yet, so they are not solid on their first frame
  const vent = { ...makeSprite('steamExhaust'), x, y };
  const lid = { ...makeSprite('steamExhaustLid', { order: 17 }), x, y };
  let blowing = false, riding = false, vel = 0, off = 0, bounces = 0, steam = 0;

  function rest(ctx) {
    const p = ctx.player, terrain = ctx.world.terrain;
    if (platform(lid, lid.boxes[0], p, terrain) & LANDED) p.y += 1;
    // the original checks for the vent twice where it meant the vent or the lid
    else if (p.onObject === vent) {
      if (p.jumpPressed) p.onObject = null;
      unstick(p, terrain);
    } else if (platform(vent, vent.boxes[0], p, terrain)) unstick(p, terrain);
    if (offDisplay(x, y, ctx.cam) && offCam(x, y, ctx.cam)) { slot.live = null; return false; }
    if (ctx.world.tick % PERIOD === 0) {
      steam = STEAM; riding = false; vel = LAUNCH; off = 0; bounces = BOUNCES;
      startAnim(vent, 'steamExhaustBlow', true);
      ctx.world.playSound(SONG.STEAM_EXHAUST);
      blowing = true;
    }
    animate(vent, ctx.anims); ctx.draw(vent, x, y);
    animate(lid, ctx.anims); ctx.draw(lid, x, y);
    return true;
  }

  // while it blows, it stays even off screen
  function blow(ctx) {
    const p = ctx.player, terrain = ctx.world.terrain;
    vel += GRAVITY; off += vel;
    const ly = y + (off >> 8);
    if (riding) {
      p.y += vel / 256;
      if (p.air) riding = false;
      const [px, py] = [Math.floor(p.x), Math.floor(p.y)];
      if (!lid.boxes[0] || p.dead || !overlap(x, ly, lid.boxes[0], px, py, [-SOX, -p.offsetY, SOX, p.offsetY])) riding = false;
    }
    if (platformTop(lid, x, ly, lid.boxes[0], p)) { riding = true; p.y += 1; }
    platform(vent, vent.boxes[0], p, terrain);
    if (off >= 0) {
      if (--bounces !== 0) { vel = -Div(vel * 2, 5); riding = false; off = 0; }
      else { startAnim(vent, 'steamExhaust', true); blowing = false; }
    }
    if (--steam === 48) {
      startAnim(vent, 'steamExhaustBlowEnd', true);
      animate(vent, ctx.anims);
    } else if (steam + 1 >= 50 && steam + 1 < 97) {
      const [px, py] = [Math.floor(p.x), Math.floor(p.y)];
      if (p.boxes[0] && vent.boxes[1] && overlap(x, y, vent.boxes[1], px, py, p.boxes[0]) && !p.dead) ctx.world.damage();
      animate(vent, ctx.anims);
    } else if (steam < 48) {
      // UpdateSpriteAnimation keeps returning ACMD_RESULT__ENDED once the script has ended, and here it runs
      // twice a frame, so the end the second call reaches shows on the next frame's first
      if (animate(vent, ctx.anims) || vent.anim.done) startAnim(vent, 'steamExhaust', true);
      animate(vent, ctx.anims);
    }
    ctx.draw(vent, x, y);
    animate(lid, ctx.anims); ctx.draw(lid, x, ly);
    return true;
  }

  return { run: ctx => (blowing ? blow(ctx) : rest(ctx)) };
}
