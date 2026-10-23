// Ties the player, camera, effects and renderer together with a fixed 60 Hz step.

import { TICK_MS, CAMERA } from './constants.js';
import { makeAnimator, setAnim, tickAnim } from './animator.js';
import { createPlayer, stepPlayer } from './player.js';
import { createCamera, updateCamera } from './camera.js';
import { createRenderer } from './renderer.js';

export function createGame(canvas, assets, input) {
  const { anims } = assets.sprites;
  const player = createPlayer({ x: 160, groundY: assets.stage.groundY, spinDashSpeeds: assets.physics.spinDashSpeeds });
  const state = { tick: 0, player, cam: createCamera(player), effects: [] };
  const render = createRenderer(canvas, assets);

  const world = {
    get tick() { return state.tick; },
    freezeCamera() { state.cam.freeze = CAMERA.spinDashFreeze; },
    // a one-shot effect at a point, or one that follows Sonic while he stays in state `follow`
    spawnEffect(name, x, y, facing, follow = null) {
      const e = { anim: makeAnimator(), x, y, facing, follow };
      setAnim(e.anim, name); tickAnim(e.anim, anims);
      state.effects.push(e);
    },
  };

  function step() {
    stepPlayer(player, input, world);
    tickAnim(player.anim, anims);
    const { effects } = state;
    for (const e of effects) tickAnim(e.anim, anims);
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.follow) {
        if (player.state !== e.follow) { effects.splice(i, 1); continue; }
        e.x = player.x; e.y = player.y; e.facing = player.facing;
      } else if (e.anim.done) effects.splice(i, 1);
    }
    updateCamera(state.cam, player);
    state.tick++;
  }

  let frame = 0, last = 0, pending = 0;
  function loop(now) {
    pending += Math.min(100, now - last);   // after a stall, catch up at most 100 ms instead of fast-forwarding
    last = now;
    while (pending >= TICK_MS) { step(); pending -= TICK_MS; }
    render(state);
    frame = requestAnimationFrame(loop);
  }

  return {
    state, step,
    draw: () => render(state),
    start() { input.enabled = true; last = performance.now(); pending = 0; frame = requestAnimationFrame(loop); },
    stop() { input.enabled = false; input.release(); cancelAnimationFrame(frame); },
  };
}
