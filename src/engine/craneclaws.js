// Secret Base's crane claws (SAT-R decompilation, src/game/sa1/stage/interactables/crane_claw_and_lift.c), kind
// 80: a claw hanging 48 px down on its cable from a trolley. Sonic's body touching its box catches him: it
// closes, lifts him 48 px over 30 frames, carries him right at 2 px a frame until it has gone more than d2
// tiles, opens to drop him and, 30 frames later, goes back left at the same speed and down again.

import { makeSprite, startAnim, animate, offCam, offDisplay } from './objects.js';
import { overlap } from './collide.js';
import { endAttack } from './player.js';
import { SONG } from '../sound/songs.js';

export const CRANE_CLAW = 80;

const Div = (a, b) => Math.trunc(a / b);
const DROP = 48;   // the claw's way down from the trolley
const LIFT = 30;   // frames it takes to go up or down
const WAIT = 30;   // frames it stays open before it goes back
const SOX = 6;     // Sonic's spriteOffsetX

// Player_TransitionCancelFlyingAndBoost; his speeds and whether he is in the air stay as they were
function cancel(p) { endAttack(p); p.pushing = false; }

// held still, hanging (charState 38)
function hang(p) {
  if (p.dead) return;
  p.xsp = p.gsp = p.ysp = 0;
  cancel(p);
  p.state = 'hook';
}

/** The task for a crane claw, or null when `e` is not one. */
export function createCraneClaw(e, slot, anims) {
  if (e.kind !== CRANE_CLAW) return null;
  const { x, y } = e, far = e.d[2] * 8;
  const claw = makeSprite('craneClaw', { order: 15 }), cable = makeSprite('craneCable', { order: 17 });
  const trolley = makeSprite('craneTrolley', { order: 17 });
  // waiting, closing on him, lifting him, carrying him, letting go, going back, going down and settling; `t`
  // counts each one's frames, `moved` the frames of its trip along
  let phase = 'waiting', t = 0, moved = 0;

  // it goes once its spawn point is more than 128 px off the screen and the claw out of the range around it
  const gone = (cx, cy, cam) => offDisplay(x, y, cam) && offCam(cx, cy, cam);
  // the claw `down` px below the trolley, with the cable down to it in two pieces, the second `cableY` down
  function hanging(ctx, down, cableY) {
    animate(claw, anims); ctx.draw(claw, x, y + down);
    animate(cable, anims); ctx.draw(cable, x, y);
    animate(cable, anims); ctx.draw(cable, x, y + cableY);
    animate(trolley, anims); ctx.draw(trolley, x, y);
  }
  // the claw pulled up to the trolley, `dx` px along
  function along(ctx, dx) {
    animate(claw, anims); ctx.draw(claw, x + dx, y);
    animate(trolley, anims); ctx.draw(trolley, x + dx, y);
  }

  const PHASES = {
    // Task_CraneClawMain: it tests the box its last frame set, before stepping its animation
    waiting(ctx, p) {
      if (claw.boxes[0] && !p.dead && overlap(x, y + DROP, claw.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY])) {
        t = 0;
        startAnim(claw, 'craneClawClose');
        p.carried = true;
        phase = 'closing';
        ctx.world.playSound(SONG.LIFT);
      }
      if (gone(x, y + DROP, ctx.cam)) return false;
      hanging(ctx, DROP, 24);
      return true;
    },
    closing(ctx, p) {
      if (!p.dead) { p.x = x; p.y = y + 104; }
      if (++t >= 4) { t = 0; hang(p); phase = 'lifting'; }
      if (gone(x, y + DROP, ctx.cam)) return false;
      hanging(ctx, DROP, 24);
      return true;
    },
    lifting(ctx, p) {
      const down = Div((LIFT - t) * DROP, LIFT);
      if (!p.dead) { p.x = x; p.y = y + down + 56; }
      if (++t > LIFT) { t = 0; hang(p); phase = 'carrying'; }
      if (gone(x, y + down, ctx.cam)) return false;
      hanging(ctx, down, down >> 1);
      return true;
    },
    carrying(ctx, p) {
      const dx = moved * 2;
      if (!p.dead) { p.x = x + dx; p.y = y + 56; }
      if (dx > far) {
        // it lets go of him where he is, his state as it was but for the spring's top-out pose (charState 18)
        if (!p.dead) { p.carried = false; p.xsp = p.gsp = p.ysp = 0; cancel(p); p.state = 'springPeak'; }
        t = 0;
        startAnim(claw, 'craneClawOpen');
        ctx.world.stopSound(SONG.LIFT);
        phase = 'open';
      } else moved++;
      if (gone(x + dx, y, ctx.cam)) return false;
      along(ctx, dx);
      return true;
    },
    open(ctx) {
      if (gone(x + moved * 2, y, ctx.cam)) return false;
      if (++t > WAIT) phase = 'returning';
      along(ctx, moved * 2);
      return true;
    },
    returning(ctx) {
      const dx = moved * 2;
      if (moved === 0) { t = 0; phase = 'lowering'; } else moved--;
      if (gone(x + dx, y, ctx.cam)) return false;
      along(ctx, dx);
      return true;
    },
    lowering(ctx) {
      const down = DROP - Div((LIFT - t) * DROP, LIFT);
      if (++t > LIFT) { t = 0; phase = 'settling'; }
      if (gone(x, y + down, ctx.cam)) return false;
      hanging(ctx, down, down >> 1);
      return true;
    },
    settling(ctx) {
      if (++t > 3) { t = 0; phase = 'waiting'; }
      if (gone(x, y + DROP, ctx.cam)) return false;
      hanging(ctx, DROP, 24);
      return true;
    },
  };

  return {
    run(ctx) {
      if (PHASES[phase](ctx, ctx.player)) return true;
      slot.live = null;
      return false;
    },
  };
}
