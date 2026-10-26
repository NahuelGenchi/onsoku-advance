// Secret Base's swinging hooks (SAT-R decompilation, src/game/sa1/stage/interactables/swinging_hook.c), kind 76:
// a hook on a chain of three links, hanging from an anchor and swinging to and fro on the stage clock (a hook with
// d0 set swings half a cycle behind). Sonic's centre within 16 px of the hook catches him and he hangs from it as
// it swings, until jump throws him up at 5 px a frame, at 2 px a frame left or right if one is held. It doesn't
// catch him again for 20 frames.

import { makeSprite, animate, offCam, offDisplay } from './objects.js';
import { endAttack, curlUp } from './player.js';
import { SINE } from './trig.js';

export const SWINGING_HOOK = 76;

const Div = (a, b) => Math.trunc(a / b);
const LEFT = 1, RIGHT = 2;   // Sonic's held d-pad bits (player.js)
const WAIT = 20;             // frames after he lets go before it can catch him again (unkB0)
const JUMP = 5, JUMP_X = 2;

// Player_TransitionCancelFlyingAndBoost; his speeds and whether he is in the air stay as they were
function cancel(p) { endAttack(p); p.pushing = false; }

// the swing at stage time `tick`: the angle the chain makes (sine and cosine, 1 = 16384, the cosine with a
// slight lean added, which the decompilation's C adds to both) and the hook's rotation
function swing(tick, phase) {
  let m = (Div(tick * 8, 3) + phase) % 512, lean;
  if (m > 256) { m = 512 - m; lean = SINE[m * 2] >> 8; } else lean = -(SINE[m * 2] >> 8);
  m = (SINE[((m - 0x7E) & 0x1FF) * 2] >> 7) & 0x1FF;
  m = m < 256 ? m >> 1 : 512 - ((512 - m) >> 1);
  m = (m << 1) & 0x3FF;
  return { sin: SINE[m], cos: SINE[m + 256] + lean, rotation: 0x3FF & ~m };
}

// gOamMatrixIndex, counted up by each hook's sprite in a frame: the hook puts it in its flags' priority bits,
// so the first hook to run in a frame is drawn at priority 0 and the next at 1, both in front of the layers
const matrixIndex = new WeakMap();
function nextIndex(world) {
  let m = matrixIndex.get(world);
  if (!m || m.tick !== world.tick) matrixIndex.set(world, m = { tick: world.tick, n: 0 });
  return m.n++;
}

// thrown off it, curled up, his speeds gone (it leaving with him, or his jump)
function letGo(p) {
  cancel(p);
  p.carried = false; p.air = true; p.onObject = null;
  p.curled = true; p.state = 'spin';
  curlUp(p);
}

/** The task for a swinging hook, or null when `e` is not one. */
export function createSwingingHook(e, slot, anims) {
  if (e.kind !== SWINGING_HOOK) return null;
  const { x, y } = e;
  const hook = makeSprite('swingingHook'), link = makeSprite('hookLink'), anchor = makeSprite('hookAnchor');
  animate(anchor, anims); animate(link, anims);
  const phase = e.d[0] !== 0 ? 0x100 : 0;
  let holding = false, wait = 0;

  return {
    run(ctx) {
      const p = ctx.player, { sin, cos, rotation } = swing(ctx.world.tick, phase);
      if (offDisplay(x, y, ctx.cam) && offCam(x, y, ctx.cam)) {
        if (p.onObject === hook) { letGo(p); p.xsp = p.gsp = p.ysp = 0; }
        slot.live = null;
        return false;
      }
      ctx.draw(anchor, x, y - 8);
      let dx = 0, dy = 0;
      for (let i = 0; i < 3; i++) {
        dx += Div(sin * 90, 100); dy += Div(cos * 90, 100);
        ctx.draw(link, x + (dx >> 10), y + (dy >> 10));
      }
      dx += Div(sin * 110, 100); dy += Div(cos * 110, 100);

      if (p.dead) {
        if (holding) { p.carried = false; wait = WAIT; holding = false; }
      } else if (holding) {
        p.x = x + Div(dx, 780) - 4 + (p.facing < 0 ? 10 : 0);
        p.y = y + Div(dy, 680) + 2;
        p.rotation = 0;
        if (p.jumpPressed) {
          letGo(p);
          p.jumped = true;
          p.ysp = -JUMP;
          const held = p.held[0];
          if (held & (LEFT | RIGHT)) {
            p.facing = held & LEFT ? -1 : 1;
            p.xsp = p.gsp = JUMP_X * p.facing;
          } else p.xsp = p.gsp = 0;
          wait = WAIT; holding = false;
        } else p.ysp = 0;
      } else if (wait) wait--;
      else {
        const hx = x + Div(dx, 950), hy = y + Div(dy, 950), px = Math.floor(p.x), py = Math.floor(p.y);
        if (hx - 16 <= px && hx + 16 >= px && hy - 16 <= py && hy + 16 >= py) {
          holding = true;
          cancel(p);
          p.onObject = hook; p.carried = true;
          p.xsp = p.gsp = p.ysp = 0;
          p.state = 'hook';
        }
      }

      hook.prio = nextIndex(ctx.world) & 3;
      animate(hook, anims);
      ctx.draw(hook, x + (dx >> 10), y + (dy >> 10), { rotation, scaleX: 256, scaleY: 256, double: true });
      return true;
    },
  };
}
