// Ties the player, camera, rings, objects, enemies, effects, HUD, renderer and sound together with a fixed 60 Hz
// step. Each part is a task in one list, at the original's priority, so they run in its order and the tasks
// the objects make fall in where the original's do. Each step also lists the sprites it shows, in the order
// the original puts them in OAM, for the renderer.

import { TICK_MS, CAMERA, PHYSICS, SCREEN_W, SCREEN_H, RUSH_BOOST } from './constants.js';
import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { createPlayer, stepPlayer, animatePlayer, hurt } from './player.js';
import { createRushFx, startRushFx, stepRushFx } from './rushfx.js';
import { createCamera, updateCamera, viewOf } from './camera.js';
import { createRenderer } from './renderer.js';
import { createTerrain } from './terrain.js';
import { createTasks, createEntities } from './objects.js';
import { attackTest, projectileTest, defeatEffects } from './defeat.js';
import { createRings } from './rings.js';
import { createScatter } from './scatter.js';
import { createHud, updateHud } from './hud.js';
import { createTitleCard, runTitleCard } from './titlecard.js';
import { createPaletteAnimation } from './palettes.js';
import { ONE_UP, SHIELD, MAGNETIC_SHIELD, INVINCIBILITY, SPEED_UP, RANDOM_RINGS, RINGS_5, RINGS_10 } from './itembox.js';
import { ITEM_TASKS, shieldTask, starsTask, magneticRing } from './items.js';
import { SONG } from '../sound/songs.js';
import { RUSH_BOOST_SE } from '../rom/rush.js';

const MAX_BRAKE_DUST = 20;   // the original keeps a pool of 20 brake dust clouds
const MAX_RING_SPARKLES = 8;   // with 8 sparkles showing, a ring is still counted but makes no sparkle or sound
const START_LIVES = 3;
const ITEM_TIME = 1200;   // invincibility and speed shoes last 20 seconds
const RANDOM_RING_PRIZES = [1, 5, 10, 20, 30, 40];   // ItemBox_RingAmountTable
const SPEED_UP_TEMPO = 0x200, NORMAL_TEMPO = 0x100;
const MAX_COURSE_TIME = 10 * 3600;
// what Sonic reads while the title card holds him: the jump and attack buttons InitializePlayer leaves held, never pressed
const CARD_INPUT = { left: false, right: false, up: false, down: false, jump: true, attack: true, boost: false, jumpPressed: false, attackPressed: false, boostPressed: false };
// and while an object holds his controls (the forced slide): nothing, as it clears his input
const NO_INPUT = { left: false, right: false, up: false, down: false, jump: false, attack: false, boost: false, jumpPressed: false, attackPressed: false, boostPressed: false };

const SILENT = {
  play() {}, playPitched() {}, playOn() {}, playStageMusic() {}, oneUp() {}, stop() {}, fadeOut() {}, tempo() {}, invincibility() {},
  playerState() {}, stopAll() {},
};

export function createGame(canvas, assets, input, sound = SILENT) {
  const { anims } = assets.sprites;
  const terrain = createTerrain(assets.stage.collision);
  const player = createPlayer({ ...assets.stage.spawn, spinDashSpeeds: assets.physics.spinDashSpeeds });
  const tasks = createTasks(), entities = createEntities(assets.stage, anims, tasks);
  const rings = createRings(assets.stage.rings, anims), scatter = createScatter(anims);
  rings.reset(); scatter.reset();
  const palettes = assets.stage.paletteAnimations.map(createPaletteAnimation);
  const state = {
    tick: 0, player, terrain, tasks, rings, scatter, cam: createCamera(player, terrain), effects: [], sprites: [],
    ringCount: 0, lives: START_LIVES, score: 0, courseTime: 0, clockStopped: false, hud: createHud(), showCollision: false,
    animal: 0,   // gTrappedAnimalVariant: the next defeat's animal
    seed: 0,     // gPseudoRandom: the game's random numbers, one sequence for the whole game, from 0
    palettes: palettes.map(a => a.shown),   // the frame each palette animation has loaded (palettes.js)
    checkpointIndex: 0,   // gBossIndex: the number of the last checkpoint passed
    checkpoint: null,     // where Sonic starts after a death, his checkPointX and Y, and the course time then
    card: null,           // the title card (titlecard.js) while it holds Sonic and the clock
    cardEnded: false,     // the card ended this frame, switching the blending off (gBldRegs.bldCnt = 0)
    view: null,           // what the screen shows around the camera (camera.js viewOf); only drawing reads it
    rush: false,          // the Sonic Rush boost's setting (off unless chosen)
    rushArt: null,        // its effects' art, from the player's Sonic Rush ROM
    rushFx: createRushFx(), // its trail, burst and aura (rushfx.js)
    shake: -1,            // the frame of the boost's screen shake showing, or -1; only drawing reads it
  };
  let viewW = SCREEN_W, viewH = SCREEN_H;   // the original screen, or the widescreen view's size
  state.view = viewOf(state.cam, viewW, viewH);
  const sparkles = new Set();   // the ring sparkles still running their animation
  let cardPad = [];   // the pad directions held on the title card's last frame
  let extraLife = false, restart = false, loading = false, starMusic = false;
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
    // the level's number in the ROM's tables, and its zone (0 Neo Green Hill)
    level: assets.stage.level, zone: assets.stage.zone,
    get tick() { return state.tick; },
    get cameraY() { return Math.floor(state.cam.y); },
    terrain,
    // a hazard touched Sonic (Coll_DamagePlayer): a shield takes the hit, or with rings he drops them all, up
    // to 48 of them scattering, and without any he dies; returns false while he is invincible or still
    // blinking from the last hit
    damage() {
      if (!hurt(player, terrain)) return false;
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
    get checkpointIndex() { return state.checkpointIndex; },
    // Sonic passed checkpoint `index`: the act starts over with his centre at (x, y) and the clock at this time
    passCheckpoint(index, x, y) { state.checkpointIndex = index; state.checkpoint = { x, y, time: state.courseTime }; },
    // Sonic's attack box destroyed an enemy at (x, y)
    defeat(x, y) { defeatEffects(x, y, ctx, state, () => { extraLife = true; }, assets.stage.level >> 1); },
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
    stopSound: song => sound.stop(song),
    fadeOut: (player, speed) => sound.fadeOut(player, speed),
    playSoundPitched: (song, pitch) => sound.playPitched(song, pitch),
    freezeCamera() { state.cam.freeze = CAMERA.spinDashFreeze; },
    // the Rush boost: whether it is on, its start (its effects, Sonic Rush's sound effect, a screen shake, and the
    // camera's delay), and a hit's shake
    get rush() { return state.rush; },
    boosted() {
      startRushFx(state.rushFx, player);
      sound.playRush(RUSH_BOOST_SE);
      state.shake = 0;
      state.cam.scroll = RUSH_BOOST.scrollDelay;
    },
    shake() { state.shake = 0; },
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
  // background priority: 2 behind the front layer, 0 and 1 in front of it); `affine` sends it through the
  // rotation hardware: { rotation (0–1023 per turn), scaleX, scaleY (8.8, negative mirrors), double }
  function draw(s, x, y, affine = null) {
    if (s.frame < 0) return;
    state.sprites.push({ frame: s.frame, x, y, flipX: s.flipX, flipY: s.flipY, affine, order: s.order, prio: s.prio });
  }
  // what the objects' and enemies' tasks see and use
  const ctx = {
    player, world, anims, tiles: assets.sprites.tiles, cam: { x: 0, y: 0 }, view: state.view, draw, input,
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
  // Sonic's sprite (OAM order 16): the walk and run frames go through the rotation hardware (matrix 0, normal
  // size) and follow the slope, mirrored with a negative scale when he faces right, which also moves him 1px
  // left; facing left, the original shifts the other frames 1px right. Dying or grinding puts him in front of
  // the front layer.
  // the Rush boost's sprite effects go just in front of him and its trail just behind (renderer.js)
  function drawSonic() {
    const prio = player.death || player.front ? 1 : 2, fx = state.rushFx.list.length > 0 ? { rush: 'obj', order: 16, prio, sonic: null } : null;
    if (fx) state.sprites.push(fx);
    if (!player.hidden) {
      const s = { frame: frameOf(player.anim, anims), flipX: player.facing > 0, flipY: false, order: 16, prio };
      if (player.state === 'walk' || player.state === 'bounce') {
        const right = player.facing > 0;
        draw(s, player.x - (right ? 1 : 0), player.y, { rotation: player.rotation << 2, scaleX: right ? -256 : 256, scaleY: 256, double: false });
      } else draw(s, player.x + (player.facing < 0 ? 1 : 0), player.y);
      if (fx && s.frame >= 0) fx.sonic = state.sprites[state.sprites.length - 1];
    }
    if (fx) state.sprites.push({ rush: 'trail', order: 16, prio });
  }

  // the title card (sub_80550F8) plays from the act's first frame and after each restart, holding Sonic and
  // the clock while it runs; the HUD's task is made only as it ends
  function startCard() { state.card = createTitleCard(assets.titleCard); state.clockStopped = true; state.hud.sprites = []; }
  const hudTask = { run() { if (updateHud(state.hud, { ...state, stageTime: state.tick })) sound.play(SONG.TIMER); return true; } };

  // HandleLifeLost: a life less, and the act starts over with everything in it, keeping the score, the stage
  // clock and the last checkpoint passed. Sonic starts at that checkpoint, or at the act's start without one,
  // and the course time goes back to what it was there (to 0 if it had run out); the camera starts from him.
  // The act's music starts again at once (StageInit_Zone1Act1), and loading the act takes the original the
  // whole next frame, in which nothing runs. (The game over at no lives left is not built yet.)
  function restartAct() {
    if (state.lives > 0) state.lives--;
    const at = state.checkpoint ?? assets.stage.spawn;
    Object.assign(player, createPlayer({ x: at.x, y: at.y, spinDashSpeeds: assets.physics.spinDashSpeeds }));
    if (state.courseTime >= MAX_COURSE_TIME && state.checkpoint) state.checkpoint.time = 0;
    state.cam = createCamera(player, terrain);
    state.view = viewOf(state.cam, viewW, viewH);
    tasks.reset(); entities.reset(); rings.reset(); scatter.reset(); sparkles.clear();
    for (const a of palettes) a.reset();
    state.palettes = palettes.map(a => a.shown);
    state.ringCount = 0; state.effects = []; state.sprites = []; state.rushFx = createRushFx(); state.shake = -1; state.courseTime = state.checkpoint?.time ?? 0; state.animal = 0;
    startCard();
    sound.playStageMusic(assets.stage.music);
    loading = true; starMusic = false;
  }

  // the stage's own tasks, made in the original's order: the rings manager and the entities manager first
  // among the objects' priority, then the act's two palette animations (which lets what the entities manager
  // spawns run in the same frame), the scattered rings just after them, the HUD, Sonic (with his effects),
  // the music and, last, the stage's clocks
  const STAGE_TASKS = [
    // the camera follows where Sonic was at the end of the last frame, and this frame is drawn with it; the
    // grind rails' ends (0x900) run before it and see the last frame's
    [0x0F00, () => {
      if (state.shake >= 0 && ++state.shake >= RUSH_BOOST.shake.length) state.shake = -1;
      updateCamera(state.cam, player);
      ctx.cam = { x: Math.floor(state.cam.x), y: Math.floor(state.cam.y) };
      ctx.view = state.view = viewOf(state.cam, viewW, viewH);
    }],
    [0x2000, ctx => collectRings(ctx)],
    [0x2000, ctx => entities.manager.run(ctx)],
    ...palettes.map(a => [0x2000, () => { a.run(); state.palettes = palettes.map(b => b.shown); }]),
    // a sparkle the scattered rings leave first runs on the next frame
    [0x2001, () => {
      for (const ring of scatter.update(player, state.view, terrain, state.tick)) addRing(ring);
      const dropped = scatter.visible();
      for (const r of dropped.list) draw({ frame: dropped.frame, flipX: false, flipY: false, order: 20, prio: 2 }, r.x, r.y);
    }],
    // the title card and its pieces (0x2100 and 0x2120): on its 226th frame, or ten frames after A, B or the
    // pad is pressed from its 36th to its 214th, Sonic takes the controls and the clock starts; the buttons he
    // held when it ends aren't presses. The HUD's task (0x2180) it makes then first runs on the next frame.
    [0x2100, () => {
      if (state.card === null) return;
      const pad = ['left', 'right', 'up', 'down'].filter(k => input[k]);
      const pressed = input.jumpPressed || input.attackPressed || pad.some(k => !cardPad.includes(k));
      cardPad = pad;
      input.jumpPressed = false; input.attackPressed = false; input.boostPressed = false;
      if (runTitleCard(state.card, pressed)) return;
      state.card = null; state.clockStopped = false; state.cardEnded = true;
      state.hud = createHud();
      tasks.add(hudTask, 0x2180);
    }],
    [0x3000, () => {
      const held = state.card !== null ? CARD_INPUT : player.ignoreInput ? NO_INPUT : input;
      stepPlayer(player, held, world);
      animatePlayer(player, held, anims, world);
      // the boost's effects run after him, as Rush's objects run after its player
      if (state.rushArt && (state.rush || state.rushFx.list.length > 0)) stepRushFx(state.rushFx, player, state.rushArt, player.boost);
      drawSonic();
      state.effects = state.effects.filter(updateEffect);
      for (const e of state.effects) draw({ frame: frameOf(e.anim, anims), flipX: e.flipX, flipY: e.flipY, order: 8, prio: 2 }, e.x, e.y);
    }],
    // the music manager: invincibility's song and an extra life's 1-up jingle in place of the act's music
    // (synth.js runs it, with what it reads of Sonic)
    [0x4000, () => {
      sound.playerState(player.invincible > 0, player.speedUp > 0, !player.dead);
      if (starMusic) { starMusic = false; sound.invincibility(); }
      if (extraLife) { extraLife = false; sound.oneUp(); }
    }],
    [0xFF00, () => { if (!state.clockStopped) state.courseTime++; state.tick++; }],
  ];
  for (const [priority, run] of STAGE_TASKS) tasks.add({ run: ctx => { run(ctx); return true; } }, priority, true);
  startCard();

  function step() {
    input.poll?.();
    if (loading) { loading = false; return; }
    state.sprites = []; state.cardEnded = false;
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
    /** Sets the size of what the screen shows: 240 × 160, the original's, or wider and taller (widescreen). */
    setView(w, h) {
      if (w === viewW && h === viewH) return;
      viewW = w; viewH = h;
      ctx.view = state.view = viewOf(state.cam, w, h);
      render.resize(w, h);
    },
    /** Turns the Sonic Rush boost on (with `art`, what rush.js read from the Sonic Rush ROM) or off. */
    setRushBoost(on, art = state.rushArt) { state.rushArt = art; state.rush = on && !!art; input.setRush?.(state.rush); },
    // the act's music starts with the act, as the stage's init does (StageInit_ZoneNActM)
    start() {
      input.enabled = true; last = performance.now(); pending = 0; frame = requestAnimationFrame(loop);
      sound.playStageMusic(assets.stage.music);
    },
    stop() { input.enabled = false; input.release(); cancelAnimationFrame(frame); sound.stopAll(); },
  };
}
