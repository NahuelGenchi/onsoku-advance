// Ties the player, camera, rings, objects, enemies, effects, HUD, renderer and sound together with a fixed 60 Hz
// step. Each part is a task in one list, at the original's priority, so they run in its order and the tasks
// the objects make fall in where the original's do. Each step also lists the sprites it shows, in the order
// the original puts them in OAM, for the renderer.

import { TICK_MS, CAMERA, PHYSICS } from './constants.js';
import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { createPlayer, stepPlayer, animatePlayer, hurt } from './player.js';
import { createCamera, updateCamera } from './camera.js';
import { createRenderer } from './renderer.js';
import { createTerrain } from './terrain.js';
import { createTasks, createEntities } from './objects.js';
import { attackTest, projectileTest, defeatEffects } from './defeat.js';
import { createRings } from './rings.js';
import { createScatter } from './scatter.js';
import { createHud, updateHud } from './hud.js';
import { ONE_UP, SHIELD, MAGNETIC_SHIELD, INVINCIBILITY, SPEED_UP, RANDOM_RINGS, RINGS_5, RINGS_10 } from './itembox.js';
import { ITEM_TASKS, shieldTask, starsTask, magneticRing } from './items.js';
import { SONG } from '../sound/songs.js';

const MAX_BRAKE_DUST = 20;   // the original keeps a pool of 20 brake dust clouds
const MAX_RING_SPARKLES = 8;   // with 8 sparkles showing, a ring is still counted but makes no sparkle or sound
const START_LIVES = 3;
const ITEM_TIME = 1200;   // invincibility and speed shoes last 20 seconds
const RANDOM_RING_PRIZES = [1, 5, 10, 20, 30, 40];   // ItemBox_RingAmountTable
const SPEED_UP_TEMPO = 0x200, NORMAL_TEMPO = 0x100;

const SILENT = {
  play() {}, playPitched() {}, playOn() {}, playStageMusic() {}, oneUp() {}, stop() {}, tempo() {}, invincibility() {},
  playerState() {}, stopAll() {},
};

export function createGame(canvas, assets, input, sound = SILENT) {
  const { anims } = assets.sprites;
  const terrain = createTerrain(assets.stage.collision);
  const player = createPlayer({ ...assets.stage.spawn, spinDashSpeeds: assets.physics.spinDashSpeeds });
  const tasks = createTasks(), entities = createEntities(assets.stage, anims, tasks);
  const rings = createRings(assets.stage.rings, anims), scatter = createScatter(anims);
  rings.reset(); scatter.reset();
  const state = {
    tick: 0, player, terrain, tasks, rings, scatter, cam: createCamera(player, terrain), effects: [], sprites: [],
    ringCount: 0, lives: START_LIVES, score: 0, courseTime: 0, clockStopped: false, hud: createHud(), showCollision: false,
    animal: 0,   // gTrappedAnimalVariant: the next defeat's animal
    seed: 0,     // gPseudoRandom: the game's random numbers, one sequence for the whole game, from 0
  };
  const sparkles = new Set();   // the ring sparkles still running their animation
  let extraLife = false, restart = false, loading = false, startMusic = false, starMusic = false;
  const random = () => (state.seed = (Math.imul(state.seed, 0x196225) + 0x3C6EF35F) >>> 0);
  const render = createRenderer(canvas, assets);

  function spawn(kind, name, x, y, flipX, flipY = false) {
    const e = { kind, anim: makeAnimator(), x, y, flipX, flipY };
    setAnim(e.anim, name);   // first ticked by updateEffect() in the same step
    state.effects.push(e);
    return e;
  }
  const feetY = () => player.y + player.offsetY;
  const centreY = () => player.y;

  const world = {
    get tick() { return state.tick; },
    get cameraY() { return Math.floor(state.cam.y); },
    terrain,
    // a hazard touched Sonic (Coll_DamagePlayer): a shield takes the hit, or with rings he drops them all, up
    // to 48 of them scattering, and without any he dies; returns false while he is invincible or still
    // blinking from the last hit
    damage() {
      if (!hurt(player)) return false;
      if (player.shield) {
        sound.play(SONG.LIFE_LOST);
        player.shield = null;
      } else if (state.ringCount > 0) {
        scatter.launch(Math.floor(player.x), Math.floor(player.y), state.ringCount, player.layer);
        sound.play(SONG.RINGS_LOST);
        state.ringCount = 0;
      } else player.dead = true;
      return true;
    },
    // the frame Sonic dies the camera's target and the clock stop; the music plays on
    died() {
      state.cam.locked = true; state.clockStopped = true;
      sound.play(SONG.LIFE_LOST);
    },
    // the act starts over: the original destroys every task, so nothing after Sonic's runs this frame
    lifeLost() { restart = true; tasks.stop(); },
    // Sonic's attack box destroyed an enemy at (x, y)
    defeat(x, y) { defeatEffects(x, y, ctx, state, () => { extraLife = true; }); },
    playSound: song => sound.play(song),
    random,
    // an item box's prize (Task_Itembox2)
    prize(kind) {
      switch (kind) {
        case ONE_UP: state.lives = (state.lives + 1) & 0xFF; extraLife = true; break;
        case SHIELD: case MAGNETIC_SHIELD: {
          const shield = kind === SHIELD ? 'normal' : 'magnetic';
          player.shield = shield;
          tasks.add(shieldTask(shield), ITEM_TASKS);
          sound.play(SONG.SHIELD);
          break;
        }
        case INVINCIBILITY:
          if (!player.invincible) { tasks.add(starsTask(), ITEM_TASKS); starMusic = true; }
          player.invincible = ITEM_TIME;
          break;
        case SPEED_UP: player.speedUp = ITEM_TIME; sound.tempo(SPEED_UP_TEMPO); break;
        case RANDOM_RINGS: case RINGS_5: case RINGS_10:
          addRings(kind === RINGS_5 ? 5 : kind === RINGS_10 ? 10 : RANDOM_RING_PRIZES[random() % RANDOM_RING_PRIZES.length]);
          sound.play(SONG.RING);
          break;
      }
    },
    speedUpOver() { sound.tempo(NORMAL_TEMPO); },
    invincibilityOver() { sound.stop(SONG.INVINCIBILITY); },
    playSoundPitched: (song, pitch) => sound.playPitched(song, pitch),
    freezeCamera() { state.cam.freeze = CAMERA.spinDashFreeze; },
    // brake dust stays where it appeared, flipped by the game's random numbers
    spawnBrakeDust() {
      if (state.effects.filter(e => e.kind === 'brake').length >= MAX_BRAKE_DUST) return;
      const r = random();
      spawn('brake', 'brakeDust', player.x, feetY(), (r & 0x400) !== 0, (r & 0x800) !== 0);
    },
    // spin dash dust follows Sonic's feet while he charges, bigger while the charge is above 2.0
    spawnDashDust() { spawn('dash', 'dashDust', player.x, feetY(), player.facing > 0); },
    // the insta-shield's flash follows Sonic, facing the way he faced when it started
    spawnInstaShield() { spawn('shield', 'instaShieldFlash', player.x, centreY(), player.facing > 0); },
  };

  // a sprite in this frame's list: `s` has frame, flipX, flipY, order (lower is in front) and prio (the
  // background priority: 2 behind the front layer, 0 and 1 in front of it)
  function draw(s, x, y, angle = 0) {
    if (s.frame < 0) return;
    state.sprites.push({ frame: s.frame, x, y, flipX: s.flipX, flipY: s.flipY, angle, order: s.order, prio: s.prio });
  }
  // what the objects' and enemies' tasks see and use
  const ctx = {
    player, world, anims, tiles: assets.sprites.tiles, cam: { x: 0, y: 0 }, draw,
    attack: (s, x, y) => attackTest(s, x, y, ctx),
    projectile: (s, x, y) => projectileTest(s, x, y, ctx),
    add: (task, priority) => tasks.add(task, priority),
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

  // INCREMENT_RINGS: passing a hundred gives a life
  function addRings(n) {
    const before = state.ringCount;
    state.ringCount = (before + n) & 0xFFFF;
    if (Math.floor(state.ringCount / 100) !== Math.floor(before / 100)) { state.lives = (state.lives + 1) & 0xFF; extraLife = true; }
  }
  // a ring taken, with CreateCollectRingEffect: it leaves a sparkle with the ring sound, alternating sides with
  // the count's parity: odd ones on the second sound effect player to the left, even ones on the first to
  // the right, at half volume
  function addRing(ring) {
    addRings(1);
    if (sparkles.size >= MAX_RING_SPARKLES) return;
    const odd = state.ringCount & 1;
    sound.playOn(odd ? 2 : 1, SONG.RING, 128, odd ? -64 : 64);
    tasks.add(sparkle(ring.x, ring.y));
  }
  // a sparkle is a task among the objects' (OAM order 15); its script starts the ring song again on its first
  // frame, centred on the song's own player, and it shows its last frame as it ends
  function sparkle(x, y) {
    const s = { anim: makeAnimator(), frame: -1, flipX: false, flipY: false, order: 15, prio: 2 };
    setAnim(s.anim, 'ringSparkle');
    sparkles.add(s);
    return {
      run() {
        if (s.anim.done) return false;
        if (s.anim.i < 0) sound.play(SONG.RING);
        if (tickAnim(s.anim, anims)) sparkles.delete(s);
        s.frame = frameOf(s.anim, anims);
        draw(s, x, y);
        return true;
      },
    };
  }
  // the act's rings can't be taken while Sonic is knocked back and blinking, or dead; with the magnetic
  // shield, those near him on screen fly at him
  function collectRings(ctx) {
    if (player.dead || (player.state === 'hurt' && player.invulnerable)) rings.update(null);
    else for (const ring of rings.update(player)) addRing(ring);
    if (player.shield !== 'magnetic') return;
    for (const r of rings.attract(player, ctx.cam)) {
      tasks.add(magneticRing(r.x, r.y, (x, y) => addRing({ x, y }), rings.frame));
    }
  }
  // Sonic's sprite (OAM order 16): the walk and run frames go through the rotation hardware and follow the
  // slope; facing left, the original shifts the other frames 1px right. Dying puts him in front of the front
  // layer.
  function drawSonic() {
    if (player.hidden) return;
    const turning = player.state === 'walk' || player.state === 'bounce', nudge = player.facing < 0 && !turning ? 1 : 0;
    const s = { frame: frameOf(player.anim, anims), flipX: player.facing > 0, flipY: false, order: 16, prio: player.death ? 1 : 2 };
    draw(s, player.x + nudge, player.y, turning ? player.rotation : 0);
  }

  // HandleLifeLost: a life less, and the act starts over with everything in it, keeping the score and the
  // stage clock (no checkpoints yet; the game over at no lives left is not built yet). Loading the act again
  // takes the original the whole next frame, in which nothing runs; the music starts on the frame after.
  function restartAct() {
    if (state.lives > 0) state.lives--;
    Object.assign(player, createPlayer({ ...assets.stage.spawn, spinDashSpeeds: assets.physics.spinDashSpeeds }));
    state.cam = createCamera(player, terrain);
    tasks.reset(); entities.reset(); rings.reset(); scatter.reset(); sparkles.clear();
    state.ringCount = 0; state.effects = []; state.sprites = []; state.courseTime = 0; state.clockStopped = false; state.animal = 0;
    loading = true; startMusic = true; starMusic = false;
  }

  // the stage's own tasks, made in the original's order: the rings manager and the entities manager first
  // among the objects' priority, then the act's two palette animations (814 and 815, not shown yet: they only
  // hold their place, which lets what the entities manager spawns run in the same frame), the scattered rings
  // just after them, the HUD, Sonic (with his effects), the music and, last, the stage's clocks
  const STAGE_TASKS = [
    [0x2000, ctx => collectRings(ctx)],
    [0x2000, ctx => entities.manager.run(ctx)],
    [0x2000, () => {}], [0x2000, () => {}],
    // a sparkle the scattered rings leave first runs on the next frame
    [0x2001, () => {
      for (const ring of scatter.update(player, state.cam, terrain, state.tick)) addRing(ring);
      const dropped = scatter.visible();
      for (const r of dropped.list) draw({ frame: dropped.frame, flipX: false, flipY: false, order: 20, prio: 2 }, r.x, r.y);
    }],
    [0x2180, () => { if (updateHud(state.hud, { ...state, stageTime: state.tick })) sound.play(SONG.TIMER); }],
    [0x3000, () => {
      stepPlayer(player, input, world);
      animatePlayer(player, input, anims, world);
      drawSonic();
      state.effects = state.effects.filter(updateEffect);
      for (const e of state.effects) draw({ frame: frameOf(e.anim, anims), flipX: e.flipX, flipY: e.flipY, order: 8, prio: 2 }, e.x, e.y);
    }],
    // the music manager: the act's music after a restart, invincibility's song and an extra life's 1-up jingle
    // in place of it (synth.js runs it, with what it reads of Sonic)
    [0x4000, () => {
      sound.playerState(player.invincible > 0, player.speedUp > 0, !player.dead);
      if (startMusic) { startMusic = false; sound.playStageMusic(SONG.NEO_GREEN_HILL_1); }
      if (starMusic) { starMusic = false; sound.invincibility(); }
      if (extraLife) { extraLife = false; sound.oneUp(); }
    }],
    [0xFF00, () => { if (!state.clockStopped) state.courseTime++; state.tick++; }],
  ];
  for (const [priority, run] of STAGE_TASKS) tasks.add({ run: ctx => { run(ctx); return true; } }, priority, true);

  // the camera's task (0x0F00) comes before all of them: it follows where Sonic was at the end of the last
  // frame, and this frame is drawn with it
  function step() {
    if (loading) { loading = false; return; }
    state.sprites = [];
    updateCamera(state.cam, player);
    ctx.cam = { x: Math.floor(state.cam.x), y: Math.floor(state.cam.y) };
    tasks.run(ctx);
    if (restart) { restart = false; restartAct(); }
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
      sound.playStageMusic(SONG.NEO_GREEN_HILL_1);
    },
    stop() { input.enabled = false; input.release(); cancelAnimationFrame(frame); sound.stopAll(); },
  };
}
