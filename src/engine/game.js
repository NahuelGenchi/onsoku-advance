// Ties the player, camera, objects, effects, renderer and sound together with a fixed 60 Hz step.

import { TICK_MS, CAMERA, PHYSICS } from './constants.js';
import { makeAnimator, setAnim, tickAnim } from './animator.js';
import { createPlayer, stepPlayer, animatePlayer } from './player.js';
import { createCamera, updateCamera } from './camera.js';
import { createRenderer } from './renderer.js';
import { createTerrain } from './terrain.js';
import { createObjects } from './objects.js';
import { SONG } from '../sound/songs.js';

const MAX_BRAKE_DUST = 20;   // the original keeps a pool of 20 brake dust clouds

const SILENT = { play() {}, playPitched() {}, stopAll() {} };

export function createGame(canvas, assets, input, sound = SILENT) {
  const { anims } = assets.sprites;
  const terrain = createTerrain(assets.stage.collision);
  const player = createPlayer({ ...assets.stage.spawn, spinDashSpeeds: assets.physics.spinDashSpeeds });
  const objects = createObjects(assets.stage.interactables, anims);
  const state = { tick: 0, player, terrain, objects, cam: createCamera(player, terrain), effects: [], showCollision: false };
  const render = createRenderer(canvas, assets);

  function spawn(kind, name, x, y, flipX, flipY = false) {
    const e = { kind, anim: makeAnimator(), x, y, flipX, flipY };
    setAnim(e.anim, name);   // first ticked by updateEffect() in the same step
    state.effects.push(e);
    return e;
  }
  const feetY = () => player.y + player.offsetY;
  const centreY = () => player.y;
  const toggles = assets.stage.layerToggles;

  const world = {
    get tick() { return state.tick; },
    terrain,
    // falling out of the act: back to the start until there are lives and checkpoints; the act starts over,
    // and so does its music
    respawn() {
      Object.assign(player, createPlayer({ ...assets.stage.spawn, spinDashSpeeds: assets.physics.spinDashSpeeds }));
      state.cam = createCamera(player, terrain);
      sound.play(SONG.NEO_GREEN_HILL_1);
    },
    playSound: song => sound.play(song),
    playSoundPitched: (song, pitch) => sound.playPitched(song, pitch),
    freezeCamera() { state.cam.freeze = CAMERA.spinDashFreeze; },
    // brake dust stays where it appeared, flipped at random
    spawnBrakeDust() {
      if (state.effects.filter(e => e.kind === 'brake').length >= MAX_BRAKE_DUST) return;
      spawn('brake', 'brakeDust', player.x, feetY(), Math.random() < 0.5, Math.random() < 0.5);
    },
    // spin dash dust follows Sonic's feet while he charges, bigger while the charge is above 2.0
    spawnDashDust() { spawn('dash', 'dashDust', player.x, feetY(), player.facing > 0); },
    // the insta-shield's flash follows Sonic, facing the way he faced when it started
    spawnInstaShield() { spawn('shield', 'instaShieldFlash', player.x, centreY(), player.facing > 0); },
  };

  function updateEffect(e) {
    if (e.kind === 'dash') {
      if (!player.spinDashing) return false;
      setAnim(e.anim, player.dashAccel > PHYSICS.dashDustBigAbove ? 'dashDustBig' : 'dashDust');
      e.x = player.x; e.y = feetY(); e.flipX = player.facing > 0;
      tickAnim(e.anim, anims);
      return true;
    }
    if (e.anim.done) return false;
    if (e.kind === 'shield') { e.x = player.x; e.y = centreY(); }
    tickAnim(e.anim, anims);
    return true;
  }

  // layer toggles: while Sonic's centre is inside one, it puts him on its layer. They run before him, so
  // they see where he was at the end of the last frame.
  function toggleLayers() {
    const x = Math.floor(player.x), y = Math.floor(player.y);
    for (const z of toggles) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) player.layer = z.layer;
  }

  // the original runs the camera, then the objects, then Sonic; the camera update at the end of a step is
  // the one the next step starts from
  function step() {
    toggleLayers();
    objects.update(player, state.cam, world);
    stepPlayer(player, input, world);
    animatePlayer(player, input, anims, world);
    state.effects = state.effects.filter(updateEffect);
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
    // the act's music starts with the act, as the stage's init does (StageInit_Zone1Act1)
    start() {
      input.enabled = true; last = performance.now(); pending = 0; frame = requestAnimationFrame(loop);
      sound.play(SONG.NEO_GREEN_HILL_1);
    },
    stop() { input.enabled = false; input.release(); cancelAnimationFrame(frame); sound.stopAll(); },
  };
}
