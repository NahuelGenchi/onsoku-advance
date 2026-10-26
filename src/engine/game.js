// Ties the player, camera, rings, objects, enemies, effects, HUD, renderer and sound together with a fixed 60 Hz
// step. Each part is a task in one list, at the original's priority, so they run in its order and the tasks
// the objects make fall in where the original's do. Each step also lists the sprites it shows, in the order
// the original puts them in OAM, for the renderer. Once an act's results are over the next act starts, with
// the score and the lives carried over. A special spring hands the game over to the special stage
// (options.onSpecialStage), and the act starts again from what that hands back (options.resume).

import { TICK_MS, CAMERA, PHYSICS, SCREEN_W, SCREEN_H, RUSH_BOOST, BOOST_MODE } from './constants.js';
import { makeAnimator, setAnim, tickAnim, frameOf, spritePalette } from './animator.js';
import { createPlayer, stepPlayer, animatePlayer, hurt } from './player.js';
import { createRushFx, startRushFx, stepRushFx } from './rushfx.js';
import { createBoostFx, recordSonic, stepAfterimages, startBurst, stepBursts, particleAnims } from './boostmode.js';
import { TRICK_FX_PRIORITY, createTrail, recordTrail, spinEffect, boundTrail } from './trickfx.js';
import { createCamera, updateCamera, viewOf } from './camera.js';
import { animateStageTiles } from './stage.js';
import { createRenderer } from './renderer.js';
import { createTerrain } from './terrain.js';
import { createTasks, createEntities } from './objects.js';
import { attackTest, projectileTest, defeatEffects } from './defeat.js';
import { createRings } from './rings.js';
import { createScatter } from './scatter.js';
import { createHud, updateHud } from './hud.js';
import { createTitleCard, runTitleCard } from './titlecard.js';
import { createResults, runResults } from './results.js';
import { createPaletteAnimation } from './palettes.js';
import { createActTasks } from './acts.js';
import { BACKGROUND_UPDATE } from './backgrounds.js';
import { WATER_TASK, createWater, waterTask, endFrame as endWaterFrame, surfaceSplash, drownCountdown, bubble, bubblesAfterDrowning } from './water.js';
import { ONE_UP, SHIELD, MAGNETIC_SHIELD, INVINCIBILITY, SPEED_UP, RANDOM_RINGS, RINGS_5, RINGS_10 } from './itembox.js';
import { ITEM_TASKS, shieldTask, starsTask, magneticRing } from './items.js';
import { createBossCapsule } from './capsule.js';
import { SPECIAL_SPRING } from './specialspring.js';
import { SONG } from '../sound/songs.js';
import { RUSH_BOOST_SE } from '../rom/rush.js';
import { BOOST_MODE_SE } from '../rom/sa2boost.js';

const MAX_BRAKE_DUST = 20;   // the original keeps a pool of 20 brake dust clouds
const MAX_RING_SPARKLES = 8;   // with 8 sparkles showing, a ring is still counted but makes no sparkle or sound
const START_LIVES = 3;
const ITEM_TIME = 1200;   // invincibility and speed shoes last 20 seconds
const RANDOM_RING_PRIZES = [1, 5, 10, 20, 30, 40];   // ItemBox_RingAmountTable
const SPEED_UP_TEMPO = 0x200, NORMAL_TEMPO = 0x100;
const MAX_COURSE_TIME = 10 * 3600;
// what an act's stage init (StageInit_ZoneNActM) sets up besides its music (levels.js): in single player how
// far short of the act's right edge the camera and Sonic stop, by level (Neo Green Hill act 2 keeps its boss's
// arena out)
const CAMERA_STOPS = { 1: 768 };
// GoToNextLevel: the frames from the one the results end in to the next act's first, while the original
// writes the save (as long as it takes mGBA, the reference) and loads the act; GameStageStart sets the act up,
// and its stage init starts its music, two frames before its first
const NEXT_ACT_FRAMES = 16, NEXT_ACT_LOADS = 2;
// gFrameCount, the frames since the GBA was switched on, which counts up as each frame starts: on the act's first
// frame it is 3838 when the act is started straight from the course select (the Egg Ball seeds the random numbers
// with it)
const START_FRAME_COUNT = 3838;
// what Sonic reads while the title card holds him: the jump and attack buttons InitializePlayer leaves held, never pressed
const CARD_INPUT = { left: false, right: false, up: false, down: false, jump: true, attack: true, boost: false, trick: false, jumpPressed: false, attackPressed: false, boostPressed: false, trickPressed: false };
// and while an object holds his controls (the forced slide): nothing, as it clears his input
const NO_INPUT = { left: false, right: false, up: false, down: false, jump: false, attack: false, boost: false, trick: false, jumpPressed: false, attackPressed: false, boostPressed: false, trickPressed: false };

const SILENT = {
  play() {}, playOrChange() {}, playPitched() {}, playOn() {}, playStageMusic() {}, oneUp() {}, stop() {}, fadeOut() {}, tempo() {}, invincibility() {},
  drowning() {}, playerState() {}, stopAll() {}, musicOff() {}, musicState() {}, playSa2() {},
};

/**
 * The act on `canvas`. `options`: onSpecialStage(game), called the frame a special spring sends Sonic out of the
 * act, after which it stops; resume, such a `game` as the special stage hands it back, to start the act again
 * from; emeralds, the Chaos Emeralds won so far (a bit per special stage), and continues, the continues the
 * player has, which it hands on; onNextZone({ level, score, lives, seed }), called as the results of the last
 * act decoded end, to go on to the next zone's first act with what the game carries over; carry, those
 * { score, lives, seed } to start with; levelPick, set when the act is started from the level pick (?level=N).
 */
export function createGame(canvas, assets, input, sound = SILENT, options = {}) {
  const { spinDashSpeeds } = assets.physics;
  // the animations, and which colours their palette loads last left in each row of the sprite palette (animator.js)
  const anims = { ...assets.sprites.anims, objPalette: new Array(16).fill(-1) };
  // the act being played (assets.acts, by level), and what is its own: its map, its objects and their tasks,
  // its rings and its palette animations, and a renderer for its art
  let act = assets.acts[assets.first ?? 0], stage = act.stage, terrain = createTerrain(stage.collision);
  let tasks = createTasks(), entities = createEntities(stage, anims, tasks), rings = createRings(stage.rings, anims);
  let palettes = stage.paletteAnimations.map(createPaletteAnimation);
  const player = createPlayer({ ...stage.spawn, spinDashSpeeds });
  const scatter = createScatter(anims);
  rings.reset(); scatter.reset();
  const state = {
    level: act.level,   // gCurrentLevel: 0 is Neo Green Hill act 1, 1 its act 2, 2 Secret Base act 1
    tick: 0, player, terrain, tasks, rings, scatter, cam: null, effects: [], sprites: [],
    ringCount: 0, lives: START_LIVES, score: 0, courseTime: 0, clockStopped: false, hud: createHud(), showCollision: false,
    animal: 0,   // gTrappedAnimalVariant: the next defeat's animal
    blendOff: false,   // whether a boss turned the colour blending off this frame (gBldRegs.bldCnt = 0)
    seed: 0,     // gPseudoRandom: the game's random numbers, one sequence for the whole game, from 0
    frameCount: START_FRAME_COUNT - 1,   // gFrameCount: every frame counts, the title card's and restarts' too
    palettes: palettes.map(a => a.shown),   // the frame each palette animation has loaded (palettes.js)
    objPalette: anims.objPalette,           // the sprite palette's rows as the frame ends, which the screen shows
    checkpointIndex: 0,   // gBossIndex: the number of the last checkpoint passed
    checkpoint: null,     // where Sonic starts after a death, his checkPointX and Y, and the course time then
    goalReached: false,   // gMultiplayerRanks[0] is no longer -1: a goal has been passed
    ringsStopped: false,  // STAGE_FLAG__2: past the goal the rings manager neither takes nor draws rings
    card: null,           // the title card (titlecard.js) while it holds Sonic and the clock
    results: null,        // the act's results (results.js) once Sonic is past the goal
    cardsShown: -1,       // gFinalBossActive: the last level whose title card has ended
    cardOver: false,      // the frame the title card ended
    view: null,           // what the screen shows around the camera (camera.js viewOf); only drawing reads it
    rush: false,          // the Sonic Rush boost's setting (off unless chosen)
    rushArt: null,        // its effects' art, from the player's Sonic Rush ROM
    rushFx: createRushFx(), // its trail, burst and aura (rushfx.js)
    shake: -1,            // the frame of the boost's screen shake showing, or -1; only drawing reads it
    boostMode: false,     // Sonic Advance 2's Boost Mode's setting (off unless chosen)
    boostArt: null,       // its art and sound, from the player's Sonic Advance 2 ROM
    boostFx: createBoostFx(player), // its afterimages and particles (boostmode.js)
    tricks: false,        // Sonic Advance 2's tricks' setting (off unless chosen)
    trickArt: null,       // their sprites, from the player's Sonic Advance 2 ROM
    trail: createTrail(), // where Sonic was on his last frames, for the Bound's afterimages
    spotlights: null,     // Secret Base act 1's spotlights (spotlights.js) while they last; only drawing reads them
    // how many times the camera's task has run since the act started, which sets the layers' animated tiles
    // (UpdateBgAnimationTiles); only drawing reads it
    bgAnim: 0,
    // Sonic's row of the sprite palette, which the spotlights' tables run over (spotlights.js): the bytes written
    // over his colours since his script last loaded them (`written`, a bit for each colour), and the colours
    // the screen shows, copied at the end of each frame on which a sprite's script loaded colours (`shown`,
    // null while they are his own); only drawing reads `shown`
    spriteRow: { bytes: new Uint8Array(32), written: 0, shown: null, uploaded: false },
    water: createWater(stage.water),   // the act's water (water.js), or null
  };
  let boostAnims = null;   // the particles' animations, numbered as the renderer's boost atlas has them
  let playerAnims = anims;   // Sonic's animations, with the tricks' once their art is read
  let viewW = SCREEN_W, viewH = SCREEN_H;   // the original screen, or the widescreen view's size
  // the camera as InitCamera sets it up, with the act's stage init's right edge
  const newCamera = () => {
    const cam = createCamera(player, terrain);
    cam.maxX -= CAMERA_STOPS[state.level] ?? 0;
    return cam;
  };
  state.cam = newCamera();
  state.view = viewOf(state.cam, viewW, viewH);
  const sparkles = new Set();   // the ring sparkles still running their animation
  let cardPad = [];   // the pad directions held on the title card's last frame
  let firstCard = true;
  // Act 1 starts from the character select, and the acts after it from the act before. Any other act the level
  // pick starts as the course select does: its task (0x2000) makes the act, so on that frame only the title
  // card's task and those after it run (Sonic, the clock), not the scattered rings' (0x2001), and the next frame
  // is spent loading; and the HUD's data holds what that leaves there (levels.js, hudFlash)
  let madeBy = options.levelPick && stage.level !== 0 ? 0x2001 : -1;
  const hudFlash = options.levelPick ? stage.hudFlash : 1;
  let extraLife = false, restart = false, loading = false, starMusic = false;
  let nextAct = 0;    // the frames left until the next act starts, once the results are over
  let ended = false;  // past the last act built so far, the screen keeps its last frame
  let frozen = null;  // until then, the last act's last frame, which the screen keeps: { render, state }
  let drawShift = 0;   // how far right of the view the rest of this frame draws, after the act looped back
  let special = null;   // the special spring Sonic left the act on, after which the act stops
  let shiftX = 0, shiftY = 0;   // how far from the camera the layers are drawn with this frame's sprites are placed
  const random = () => (state.seed = (Math.imul(state.seed, 0x196225) + 0x3C6EF35F) >>> 0);
  const addTask = entry => { if (entry) tasks.add(...entry); };
  const newRenderer = () => {
    const r = createRenderer(canvas, { ...assets, stage, titleCard: act.titleCard, results: act.results });
    r.resize(viewW, viewH);
    return r;
  };
  let render = newRenderer();

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
    get level() { return stage.level; }, get zone() { return stage.zone; },
    get tick() { return state.tick; },
    get cameraY() { return Math.floor(state.cam.y); },
    // the camera and its bounds, which a boss's arena changes (bosses.js) and Sonic's edges follow
    get camera() { return state.cam; },
    get terrain() { return terrain; },
    // the camera's right edge (its maxX), where Sonic stops
    get rightEdge() { return state.cam.maxX + SCREEN_W; },
    // the rings Sonic drops (scatter.js), which a boss lets bounce off ceilings
    scatter,
    // InitWaterPalettes: the colours under the water line taken from the stage's and the sprites' as they are now
    // (a boss's task does it every frame). The sprites' are each one's own by then, not palette 423's from the act's
    // start.
    initWaterPalettes() { if (state.water) { state.water.shown = state.palettes.slice(); state.water.ownColours = true; } },
    // a boss clears the colour blending the stage's background sets every frame: Ice Mountain's snow is drawn
    // over the frame then, not added to it
    blendOff() { state.blendOff = true; },
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
    // the frame Sonic dies the camera's target and the clock stop; the music plays on, but not invincibility's
    // song or the drowning music, and drowning has its own sound
    died(drowned) {
      state.cam.locked = true; state.clockStopped = true;
      sound.stop(SONG.INVINCIBILITY); sound.stop(SONG.DROWNING);
      sound.play(drowned ? SONG.DROWNED : SONG.LIFE_LOST);
    },
    // the act's water (water.js): its line, -1 without any; Sonic going in or out, the drowning countdown,
    // the bubbles he lets out, and drowning
    get water() { return state.water; },
    get waterLevel() { return state.water ? state.water.level : -1; },
    surfaceSplash(x) { addTask(surfaceSplash(state.water, x)); sound.play(SONG.SURFACE_HIT); },
    drownCountdown(n) { addTask(drownCountdown(player, ctx.cam, n)); },
    drowningMusic() { sound.drowning(); },
    breathOut(x, y) { addTask(bubble(state.water, world, Math.round(x * 256), Math.round(y * 256), 0, false)); },
    drowned() {
      addTask(bubble(state.water, world, Math.round(player.x * 256), Math.round((player.y - 12) * 256), 0, true));
      addTask(bubblesAfterDrowning(state.water, world, player, addTask));
    },
    // the act starts over: the original destroys every task, so nothing after Sonic's runs this frame
    lifeLost() { restart = true; tasks.stop(); },
    // the goal (goal.js): the clock and the rings stop (STAGE_FLAG__ACT_START and STAGE_FLAG__2), and it holds
    // the camera and, once Sonic is in his act-clear run, hands over to the results (CreateStageResults): the
    // act-clear jingle and no more music manager, and the results' task, which first runs this frame
    get goalReached() { return state.goalReached; },
    reachGoal() { state.goalReached = true; state.clockStopped = true; state.ringsStopped = true; },
    // the act's end has Sonic now (STAGE_FLAG__2: past the goal, or a beaten boss), for the optional Boost Mode
    get actOver() { return state.ringsStopped; },
    stageResults() {
      state.results = createResults(act.results, { rings: state.ringCount, courseTime: state.courseTime, level: state.level });
      sound.play(state.level & 1 ? SONG.BOSS_CLEAR : SONG.ACT_CLEAR);
      sound.musicOff();
      tasks.add(resultsTask, 0x2100);
    },
    // past the act's loop point (sub_80232D0), Sonic and the camera go back by its distance while the camera
    // moves and follows him; the background doesn't move with them. Returns how far he goes. Everything drawn so
    // far this frame was placed with the camera where it was, and so is what comes after: the original draws
    // it with both moved.
    loopBack(x) {
      const loop = stage.loop, cam = state.cam;
      if (!loop || x < loop.x || cam.speedX === 0 || cam.locked) return 0;
      cam.x += loop.shift; cam.wrapped += loop.shift; drawShift -= loop.shift;
      return loop.shift;
    },
    // STAGE_FLAG__ACT_START: the course clock stops
    stopClock() { state.clockStopped = true; },
    // the special spring holds the camera (specialspring.js): it puts it back where it was after the camera's
    // task has moved it and drawn the layers there, so what is drawn after it this frame is placed from there
    holdCamera(x, y) {
      shiftX += ctx.cam.x - x; shiftY += ctx.cam.y - y;
      state.cam.x = x; state.cam.y = y;
      ctx.cam = { x, y };
    },
    // whether there is a special stage to go to; without one the special springs are plain springs
    specialStages: !!options.onSpecialStage,
    // a special spring sent Sonic out of the top of the screen: the act stops here for the special stage
    // (TasksDestroyAll, then CreateSpecialStageIntro), so nothing after the spring runs this frame
    specialStage(x, y) { special = { x, y }; tasks.stop(); },
    get checkpointIndex() { return state.checkpointIndex; },
    // Sonic passed checkpoint `index`: the act starts over with his centre at (x, y) and the clock at this time
    passCheckpoint(index, x, y) { state.checkpointIndex = index; state.checkpoint = { x, y, time: state.courseTime }; },
    // Sonic's attack box destroyed an enemy at (x, y)
    defeat(x, y) { defeatEffects(x, y, ctx, state, () => { extraLife = true; }, stage.level >> 1); },
    playSound: song => sound.play(song),
    playSoundOrChange: song => sound.playOrChange(song),
    // a boss's music state (gMusicManagerState.unk1), which the music manager reads (synth.js)
    musicState: value => sound.musicState(value),
    // INCREMENT_SCORE_A: points with a life every 50000, without the jingle
    addScore(points) {
      const before = state.score;
      state.score += points;
      if (Math.trunc(state.score / 50000) !== Math.trunc(before / 50000)) state.lives = (state.lives + 1) & 0xFF;
    },
    // a boss is beaten at (x, y): it leaves the capsule that ends the act (CreateBossCapsule)
    bossDefeated(x, y) { tasks.add(createBossCapsule(x, y, anims, state.level >> 1), 0x2000); },
    // the capsule opens: the clock and the rings stop as at the goal (STAGE_FLAG__ACT_START and STAGE_FLAG__2)
    stopStage() { state.clockStopped = true; state.ringsStopped = true; },
    random,
    get frameCount() { return state.frameCount; },
    // gPseudoRandom set (the Egg Ball sets it to gFrameCount)
    setSeed(value) { state.seed = value >>> 0; },
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
    // the camera stops where it is, until the act starts over
    stopCamera() { state.cam.speedX = 0; state.cam.speedY = 0; },
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
    // Boost Mode: whether it is on, the ring count its meter reads, and its start (its particles, Sonic Advance
    // 2's sound effect, and the camera's sideways speed limit dropping)
    get boostMode() { return state.boostMode; },
    get ringCount() { return state.ringCount; },
    boostModeStarted() {
      state.cam.boostSpeedX = BOOST_MODE.cameraStart;
      startBurst(state.boostFx, player, ctx.cam.x, boostAnims);
      sound.playSa2(BOOST_MODE_SE);
    },
    // Sonic Advance 2's tricks: whether they are on, a trick's points (INCREMENT_SCORE, a life every 50000),
    // Sonic Advance 2's sounds, and the effects that run with them
    get tricks() { return state.tricks; },
    trickScore(points) {
      const before = state.score;
      state.score += points;
      if (Math.trunc(state.score / 50000) !== Math.trunc(before / 50000)) { state.lives = (state.lives + 1) & 0xFF; extraLife = true; }
    },
    playSa2: song => sound.playSa2(song),
    trickEffect(kind) {
      tasks.add(kind === 'spin' ? spinEffect(state.trickArt) : boundTrail(state.trickArt, state.trail), TRICK_FX_PRIORITY);
    },
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
  // background priority: 3 behind both layers, 2 behind the front layer, 0 and 1 in front of it), and `sheet`
  // when its frame is from another game's sprites than Sonic Advance's; `affine` sends it through the rotation
  // hardware: { rotation (0–1023 per turn), scaleX, scaleY (8.8, negative mirrors), double }. With `white`, it is
  // a window that turns everything in its shape white (a boss's hit flash). An affine's `matrix` names the OAM
  // matrix it shares with other sprites, which all show the last transform written to it.
  function draw(s, x, y, affine = null) {
    if (s.frame < 0) return;
    state.sprites.push({ frame: s.frame, x: x + drawShift + shiftX, y: y + shiftY, flipX: s.flipX, flipY: s.flipY, affine, order: s.order, prio: s.prio, sheet: s.sheet, white: s.white });
  }
  // what the objects' and enemies' tasks see and use
  const ctx = {
    player, world, anims, tiles: assets.sprites.tiles, cam: { x: 0, y: 0 }, view: state.view, draw, input, get level() { return stage.level; },
    attack: (s, x, y) => attackTest(s, x, y, ctx),
    projectile: (s, x, y) => projectileTest(s, x, y, ctx),
    add: (task, priority) => tasks.add(task, priority),
    removeTasks: (from, to) => tasks.removeRange(from, to),
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
    if (state.ringsStopped) return;
    if (player.dead || (player.state === 'hurt' && player.invulnerable)) rings.update(null);
    else for (const ring of rings.update(player)) addRing(ring);
    if (player.shield !== 'magnetic') return;
    for (const r of rings.attract(player, ctx.cam)) {
      tasks.add(magneticRing(r.x, r.y, (x, y) => addRing({ x, y }), rings.frame));
    }
  }
  // Sonic's sprite (OAM order 16): the walk and run frames go through the rotation hardware (matrix 0, normal
  // size) and follow the slope, mirrored with a negative scale when he faces right, which also moves him 1px
  // left; facing left, the original shifts the other frames 1px right. In a marble track he goes through it
  // too, at his scale, keeping the rotation he was last drawn with. Dying or grinding puts him in front of
  // the front layer, and half of his swing round a rope behind both.
  // the Rush boost's sprite effects go just in front of him and its trail just behind (renderer.js)
  function drawSonic() {
    player.prio = anims[player.anim.name]?.prio?.[player.anim.i] ?? player.prio;
    const prio = player.death || player.front ? 1 : player.prio, fx = state.rushFx.list.length > 0 ? { rush: 'obj', order: 16, prio, sonic: null } : null;
    const affine = player.state === 'walk' || player.state === 'bounce' || player.state === 'marbleTrack';
    if (!affine) player.drawRotation = 0;
    else if (player.state !== 'marbleTrack') player.drawRotation = player.rotation << 2;
    if (fx) state.sprites.push(fx);
    if (!player.hidden) {
      const s = { frame: frameOf(player.anim, playerAnims), flipX: player.facing > 0, flipY: false, order: player.order, prio, sheet: playerAnims[player.anim.name]?.sheet };
      if (affine) {
        const right = player.facing > 0, scale = player.scale;
        draw(s, player.x - (right ? 1 : 0), player.y, { rotation: player.drawRotation, scaleX: right ? -scale : scale, scaleY: scale, double: false });
      } else draw(s, player.x + (player.facing < 0 ? 1 : 0), player.y);
      if (s.frame >= 0) state.sprites[state.sprites.length - 1].sonicRow = true;   // palette row 0, his
      if (fx && s.frame >= 0) fx.sonic = state.sprites[state.sprites.length - 1];
    }
    if (fx) state.sprites.push({ rush: 'trail', order: 16, prio });
  }

  // the title card (sub_80550F8) plays from the act's first frame and after each restart, holding Sonic and
  // the clock while it runs; the HUD's task is made only as it ends. A zone's second act, the first time
  // round, takes up the band the first act's results left on the screen. The tasks some acts add come after the
  // stage's own (acts.js), from his checkpoint's x or the act's start.
  function startCard() {
    const extra = createActTasks(stage.level, (state.checkpoint ?? stage.spawn).x, state.spriteRow);
    for (const task of extra.tasks) tasks.add(task, 0x2000);
    state.spotlights = extra.spotlights;
    state.card = createTitleCard(act.titleCard, { fromResults: (state.level & 1) === 1 && state.cardsShown !== state.level, blank: extra.cardBlank });
    state.clockStopped = true; state.hud.sprites = [];
  }
  const hudTask = { run() { if (updateHud(state.hud, { ...state, stageTime: state.tick })) sound.play(SONG.TIMER); return true; } };
  // the results' task and their pieces' (0x2100 and 0x2120): the score counts up, and once they are over the
  // original destroys every task and goes on to the next act (GoToNextLevel), stopping all sound
  const resultsTask = {
    run() {
      const r = runResults(state.results, {
        player, camera: state.cam, stageTime: state.tick, playSound: song => sound.play(song),
        addScore(n) {
          const before = state.score;
          state.score += n;
          if (Math.trunc(state.score / 50000) !== Math.trunc(before / 50000)) state.lives = (state.lives + 1) & 0xFF;
        },
      });
      if (r) return true;
      frozen = { render, state: { ...state } };
      state.results = null;
      tasks.stop();
      sound.stopAll();
      if (assets.acts[state.level + 1]) nextAct = NEXT_ACT_FRAMES;
      else {
        // the next zone's acts are decoded from the ROM in their turn, the screen keeping this frame meanwhile
        ended = true;
        options.onNextZone?.({ level: state.level + 1, score: state.score, lives: state.lives, seed: state.seed });
      }
      return false;
    },
  };

  // HandleLifeLost: a life less, and the act starts over with everything in it, keeping the score, the stage
  // clock and the last checkpoint passed. Sonic starts at that checkpoint, or at the act's start without one,
  // and the course time goes back to what it was there (to 0 if it had run out); the camera starts from him.
  // The act's music starts again at once (its stage init), and loading the act takes the original the
  // whole next frame, in which nothing runs. (The game over at no lives left is not built yet.)
  function restartAct() {
    if (state.lives > 0) state.lives--;
    const at = state.checkpoint ?? stage.spawn;
    Object.assign(player, createPlayer({ x: at.x, y: at.y, spinDashSpeeds }));
    if (state.courseTime >= MAX_COURSE_TIME && state.checkpoint) state.checkpoint.time = 0;
    state.cam = newCamera();
    state.view = viewOf(state.cam, viewW, viewH);
    tasks.reset(); entities.reset(); rings.reset(); scatter.reset(); sparkles.clear();
    for (const a of palettes) a.reset();
    state.palettes = palettes.map(a => a.shown);
    state.ringCount = 0; state.effects = []; state.sprites = []; state.rushFx = createRushFx(); state.shake = -1; state.courseTime = state.checkpoint?.time ?? 0; state.animal = 0;
    state.boostFx = createBoostFx(player);
    state.trail = createTrail();
    if (state.water) Object.assign(state.water, createWater(stage.water));
    startCard();
    sound.playStageMusic(stage.music);
    loading = true; starMusic = false;
  }

  // GameStageStart: the next act, with everything in it new and the score, the lives and the game's random
  // numbers carried over, and its music (its stage init)
  function startNextAct() {
    state.level++;
    act = assets.acts[state.level]; stage = act.stage;
    terrain = createTerrain(stage.collision);
    Object.assign(player, createPlayer({ ...stage.spawn, spinDashSpeeds }));
    tasks = createTasks(); entities = createEntities(stage, anims, tasks); rings = createRings(stage.rings, anims);
    palettes = stage.paletteAnimations.map(createPaletteAnimation);
    rings.reset(); scatter.reset(); sparkles.clear();
    Object.assign(state, {
      tick: 0, terrain, tasks, rings, cam: newCamera(), effects: [], sprites: [], ringCount: 0, courseTime: 0,
      clockStopped: false, hud: createHud(), animal: 0, palettes: palettes.map(a => a.shown), checkpointIndex: 0,
      checkpoint: null, goalReached: false, ringsStopped: false, card: null, results: null, rushFx: createRushFx(), shake: -1,
      boostFx: createBoostFx(player), trail: createTrail(), water: createWater(stage.water), cardOver: false,
    });
    ctx.view = state.view = viewOf(state.cam, viewW, viewH);
    render = newRenderer();
    addStageTasks();
    startCard();
    sound.playStageMusic(stage.music);
  }

  // the stage's own tasks, made in the original's order: the rings manager and the entities manager first
  // among the objects' priority, then the act's palette animations (which lets what the entities manager
  // spawns run in the same frame), the scattered rings just after them, the HUD, Sonic (with his effects),
  // the music and, last, the stage's clocks
  const stageTasks = () => [
    // the camera follows where Sonic was at the end of the last frame, and this frame is drawn with it; it also
    // counts the act's animated tiles. The grind rails' ends (0x900) run before it and see the last frame's
    [0x0F00, () => {
      if (state.shake >= 0 && ++state.shake >= RUSH_BOOST.shake.length) state.shake = -1;
      const moves = state.cam.started;
      updateCamera(state.cam, player);
      animateStageTiles(stage, state.cam.tiles);
      ctx.cam = { x: Math.floor(state.cam.x), y: Math.floor(state.cam.y) };
      ctx.view = state.view = viewOf(state.cam, viewW, viewH, state.view);
      // once it moves, it updates the zone's background (backgrounds.js)
      if (moves) BACKGROUND_UPDATE[stage.backgroundScroll]?.(ctx, state.cam);
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
      state.cardOver = false;
      if (state.card === null) return;
      // the colours under water are taken from the stage's as they are on each of its frames (InitWaterPalettes)
      if (state.water) state.water.shown = state.palettes.slice();
      const pad = ['left', 'right', 'up', 'down'].filter(k => input[k]);
      const pressed = input.jumpPressed || input.attackPressed || pad.some(k => !cardPad.includes(k));
      cardPad = pad;
      input.jumpPressed = false; input.attackPressed = false; input.boostPressed = false; input.trickPressed = false;
      if (runTitleCard(state.card, pressed)) return;
      state.card = null; state.clockStopped = false; state.cardsShown = state.level;
      state.cardOver = true;   // its last frame, which clears the blend it set
      state.hud = createHud(firstCard ? hudFlash : 1);
      firstCard = false;
      tasks.add(hudTask, 0x2180);
    }],
    [0x3000, () => {
      const held = state.card !== null ? CARD_INPUT : player.ignoreInput ? player.heldInput ?? NO_INPUT : input;
      stepPlayer(player, held, world);
      animatePlayer(player, held, playerAnims, world);
      if (!player.dead) recordSonic(state.boostFx, player);
      recordTrail(state.trail, player);
      if (player.anim.loaded) state.spriteRow.written = 0;
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
    // Boost Mode's afterimages (0x4000), in Sonic's OAM order just behind him, while he is alive and in it or
    // boosting with the Rush boost; and its particles (0x5050), in front of him
    [0x4000, () => {
      if (!state.boostMode) return;
      // the afterimages replay his animations, a trick's too; a trick's frames are in Sonic Advance 2's own
      // sheet, which Boost Mode's palette doesn't cover, so those are left out
      const shown = stepAfterimages(state.boostFx, playerAnims, !player.dead && (player.boostMode || player.boost));
      if (shown && shown.frame >= 0 && !playerAnims[shown.name]?.sheet) state.sprites.push({ ...shown, flipY: false, order: 16, boost: true });
    }],
    [0x5050, () => {
      if (!state.boostMode || state.boostFx.bursts.length === 0) return;
      stepBursts(state.boostFx, player, ctx.cam.x, boostAnims, (frame, x, y) => {
        state.sprites.push({ frame, x, y, flipX: false, flipY: false, affine: null, order: 8, prio: 2, boost: true });
      });
    }],
    [0xFF00, () => { if (!state.clockStopped) state.courseTime++; state.tick++; }],
    // the water's (water.js), after the clock has ticked
    ...(state.water ? [[WATER_TASK, (run => ctx => run(ctx))(waterTask(state.water, () => state.tick).run)]] : []),
  ];
  function addStageTasks() {
    for (const [priority, run] of stageTasks()) tasks.add({ run: ctx => { run(ctx); return true; } }, priority, true);
  }
  if (options.carry) Object.assign(state, options.carry);
  addStageTasks();
  startCard();
  if (options.resume) comeBack(options.resume);

  // sub_805D4F0, as the special stage's results end: its checkpoint 16 px up and left of the spring Sonic left
  // on, the act starts again (CreateGameStage) as after a death but without losing a life, with its title
  // card, and the original spends the next frame loading it. The checkpoint then goes back to the one he had
  // passed, and the special springs are plain until the act starts over (unk99[1]). The course time, the
  // stage clock, the rings, the last checkpoint passed and the next freed animal are what they were when he
  // left; the score, the lives and the game's random numbers what the special stage leaves.
  function comeBack({ level, score, lives, courseTime, seed, act }) {
    while (state.level < level) startNextAct();
    Object.assign(player, createPlayer({ x: act.spring.x - 16, y: act.spring.y - 16, spinDashSpeeds: assets.physics.spinDashSpeeds }));
    player.plainSprings = true;
    const checkpoint = act.checkpoint && { ...act.checkpoint };
    if (courseTime >= MAX_COURSE_TIME && checkpoint) checkpoint.time = 0;
    Object.assign(state, {
      score, lives, courseTime, seed, tick: act.stageTime, ringCount: act.rings, animal: act.animal,
      checkpoint, checkpointIndex: act.checkpointIndex, cam: newCamera(),
    });
    ctx.view = state.view = viewOf(state.cam, viewW, viewH);
    loading = true;
  }

  // the VBlank copy of the sprite palette, on the frames a script loaded colours into it
  function endFrame() {
    const row = state.spriteRow;
    row.uploaded = spritePalette.update;
    if (!spritePalette.update) return;
    spritePalette.update = false;
    row.shown = row.written ? Array.from({ length: 16 }, (_, c) => (row.written >> c & 1 ? row.bytes[c * 2] | row.bytes[c * 2 + 1] << 8 : null)) : null;
  }

  // the VBlank copy of the sprite palette, on the frames a script loaded colours into it
  function endFrame() {
    const row = state.spriteRow;
    row.uploaded = spritePalette.update;
    if (!spritePalette.update) return;
    spritePalette.update = false;
    row.shown = row.written ? Array.from({ length: 16 }, (_, c) => (row.written >> c & 1 ? row.bytes[c * 2] | row.bytes[c * 2 + 1] << 8 : null)) : null;
  }

  function step() {
    if (special) return;
    input.poll?.();
    state.frameCount = (state.frameCount + 1) >>> 0;
    if (loading) { loading = false; return; }
    if (ended) return;
    // between two acts the screen keeps the last act's last frame
    if (nextAct > 0) {
      if (--nextAct === NEXT_ACT_LOADS) startNextAct();
      if (nextAct > 0) return;
    }
    frozen = null;
    state.sprites = []; drawShift = 0; shiftX = 0; shiftY = 0;
    state.blendOff = false;
    tasks.run(ctx, madeBy);
    endFrame();
    if (state.water) endWaterFrame(state.water);
    if (madeBy >= 0) { madeBy = -1; loading = true; }
    if (restart) { restart = false; restartAct(); }
    if (special) options.onSpecialStage?.(handOver(state, special, { ...options, level: state.level }));
  }

  const show = () => (frozen ? frozen.render(frozen.state) : render(state));
  let frame = 0, last = 0, pending = 0;
  function loop(now) {
    pending += Math.min(100, now - last);   // after a stall, catch up at most 100 ms instead of fast-forwarding
    last = now;
    while (pending >= TICK_MS && !special) { step(); pending -= TICK_MS; }
    if (special) return;   // the special stage has the screen now
    show();
    frame = requestAnimationFrame(loop);
  }

  return {
    state, step,
    draw: show,
    /** Sets the size of what the screen shows: 240 × 160, the original's, or wider and taller (widescreen). */
    setView(w, h) {
      if (w === viewW && h === viewH) return;
      viewW = w; viewH = h;
      ctx.view = state.view = viewOf(state.cam, w, h);
      render.resize(w, h);
    },
    /** Turns the Sonic Rush boost on (with `art`, what rush.js read from the Sonic Rush ROM) or off. */
    setRushBoost(on, art = state.rushArt) { state.rushArt = art; state.rush = on && !!art; input.setRush?.(state.rush); },
    /** Turns Boost Mode on (with `art`, what sa2boost.js read from the Sonic Advance 2 ROM) or off. */
    setBoostMode(on, art = state.boostArt) {
      if (art !== state.boostArt) boostAnims = art && particleAnims(art, assets.sprites.frames.length);
      state.boostArt = art; state.boostMode = on && !!art;
      if (!state.boostMode) state.boostFx.bursts = [];
    },
    /** Turns Sonic Advance 2's tricks on (with `art`, what sa2tricks.js read from the Sonic Advance 2 ROM) or off.
     *  A trick under way plays out. */
    setSa2Tricks(on, art = state.trickArt) {
      if (art && art !== state.trickArt) playerAnims = { ...anims, ...art.anims };
      state.trickArt = art; state.tricks = on && !!art; input.setTricks?.(state.tricks);
    },
    // the act's music starts with the act, as the stage's init does (StageInit_ZoneNActM)
    start() {
      input.enabled = true; last = performance.now(); pending = 0; frame = requestAnimationFrame(loop);
      sound.playStageMusic(stage.music);
    },
    stop() { input.enabled = false; input.release(); cancelAnimationFrame(frame); sound.stopAll(); },
  };
}

/**
 * What the act hands the special stage (options.onSpecialStage) when Sonic leaves it on the special spring at
 * `spring`, and gets back to start again from (options.resume): { level, character, score, lives, courseTime,
 * emeralds, continues, seed (gPseudoRandom, which the special stage goes on with), act }, where `act` is what
 * only the act reads: the spring, the checkpoint he had (gSpecialStageReturnX and Y, with its course time, or
 * null for the act's start), the last checkpoint passed (gBossIndex), the stage clock (gStageTime), the rings
 * and the next freed animal.
 */
function handOver(state, spring, { level = 0, emeralds = 0, continues = 0 }) {
  return {
    level, character: 0, score: state.score, lives: state.lives, courseTime: state.courseTime, emeralds, continues, seed: state.seed,
    act: {
      spring, checkpoint: state.checkpoint, checkpointIndex: state.checkpointIndex, stageTime: state.tick, rings: state.ringCount,
      animal: state.animal,
    },
  };
}

/**
 * What the act would hand over had Sonic gone straight from its start to its special spring (the ?special test):
 * a new game, with nothing done in the act. `options` as createGame's. Null for an act without a special spring.
 */
export function specialSpringStart(assets, options = {}) {
  const spring = assets.stage.interactables.find(e => e.kind === SPECIAL_SPRING);
  if (!spring) return null;
  return handOver({
    score: 0, lives: START_LIVES, courseTime: 0, seed: 0, checkpoint: null, checkpointIndex: 0, tick: 0, ringCount: 0, animal: 0,
  }, { x: spring.x, y: spring.y }, { ...options, level: assets.stage.level });
}
