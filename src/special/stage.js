// A special stage (SAT-R decompilation, src/game/sa1/special_stage/main.c: CreateSpecialStage and its tasks): the
// tunnel the character flies down, what they meet in it (objects.js), and how the stage goes: four seconds of the
// title card with the character held still, then the checkpoint and the goal, each with its rings target. Short
// of it at the checkpoint, or at the goal, the stage fades out to the results; with the goal's, to the Chaos
// Emerald's scene.
//
// The tunnel is four quarters of one picture on layer 2 (the others flipped), 16 frames of it running by at the
// character's speed, over the background on layer 3; both move against the character's place, by up to 32 and 4 px.
// The stage's own colours run on two palette animations.
//
// ctx.special holds the stage's globals:
//   data           the stage (stages.js)
//   collected      gSpecialStageCollectedRings
//   target         gSpecialStageTargetRings: the checkpoint's target, then the goal's
//   targets        gUnknown_03005028 and gUnknown_03005070: the checkpoint's and the goal's
//   extra          gUnknown_0300507C, what the stage's type 10 objects count
//   muted          gUnknown_03005730: the sound effects are off while the trick jingle plays
//   controls       gPlayerControls: the jump and attack buttons
//   checkpoint     gUnknown_030055E0: { kind (0, 1 the goal reached, 2 the checkpoint), timer, blend }
//   bg             gUnknown_03005780: { x, y (unk4, unk6) how far the tunnel moves against the character, frame
//                  (unk12) its picture's frame, 0 to 63 }
//   stageFlags     gStageFlags
//   player, depths, matrices, loaded   the character (player.js) and the sprites' matrices (sprites.js)
//   hudBlink       what the rings counter's blink starts from (hud.js)
//   chunks         where each 4096 lines of the layout start, for the rings (objects.js)
//   music          the stage's music and sound effects

import { createBackground, drawBackground } from '../gba/background.js';
import { createSprite, updateSprite } from '../gba/sprite.js';
import { soundLayout } from '../rom/sound.js';
import { songFrames } from '../sound/synth.js';
import { SONG } from '../sound/songs.js';
import { stageData, stageTables } from './stages.js';
import { createPlayer, createPlayerState, FLAG } from './player.js';
import { createSpawner, createRings, createMessage, MESSAGE } from './objects.js';
import { s16, div, I, clearShared } from './sprites.js';

// what the original keeps in IWRAM from one special stage to the next, as nothing sets it again: the character's
// bob and sprite, the depths and matrices of the last frame and the animations loaded
const kept = { player: createPlayerState(), depths: new Int16Array(16), matrices: new Int8Array(32), loaded: new Uint16Array(32) };

const GOAL = 1, CHECKPOINT = 2;
const START = 240, END_WAIT = 0x1A4;
const END = { CHECKPOINT: 0x40, GOAL: 0x80 };
const SE3 = 3;
// SetPlayerControls with the save's default button setting
const CONTROLS = { jump: 0x1, attack: 0x2 };

// the tunnel: its four quarters, 19 × 14 tiles each, around the middle of layer 2's map, the others flipped
// across, down and both; and the background on layer 3
const TILEMAP = { BACKGROUND: 54, TUNNEL: 55 };
const QUARTERS = [[0xC01A, 0x2, 136, 32], [0xC39A, 0x9A, 0, 0], [0xC800, 0x11A, 0, 0], [0xCB80, 0x19A, 0, 0]];
const MIDDLE = { x: 0x88, y: 0x20 };

/** CreateSpecialStage: the stage of ctx.stageIndex, after the fall into it. */
export function createSpecialStage(ctx) {
  const e = ctx.engine;
  ctx.tables ??= stageTables(ctx.rom, ctx.offsets);
  const data = stageData(ctx.rom, ctx.offsets, ctx.stageIndex);
  const sp = ctx.special = {
    data, collected: 0, targets: data.targets, target: data.targets[0], extra: 0, muted: 0, controls: CONTROLS,
    checkpoint: { kind: 0, timer: 0, blend: 0 }, bg: { x: 0, y: 0, frame: 0, unk13: 0 }, stageFlags: 0,
    ...kept, chunks: new Uint16Array(16), music: null,
    // the count the rings counter blinks by starts at what its task's memory held (hud.js): at the stage's
    // start what the fall's streaks left there, and 0 for the counter after the checkpoint (player.js)
    hudBlink: 99,
  };
  sp.music = createMusic(ctx);
  // (the original also takes Sonic's speed shoes away here; the act gives him a new start when he comes back)
  // sub_802D158
  e.createTask(startMusic, ctx, 0x1000);
  e.createTask(pauseMenu, ctx, 0x1000);
  createPlayer(ctx);
  createSpawner(ctx);
  createTunnel(ctx);
  createRings(ctx);
  ctx.titleCard(1);
}

// Task_SpStageInitializeSomethingAndStartMusic: the music, and the character held still through the title card
function startMusic(t) {
  const ctx = t.data, cp = ctx.special.checkpoint;
  cp.kind = 0; cp.timer = START; cp.blend = 0;
  t.main = holding;
  ctx.engine.playSong(SONG.SPECIAL_STAGE);
}

// Task_802D238
function holding(t) {
  const ctx = t.data, sp = ctx.special;
  if (--sp.checkpoint.timer > 0) return;
  t.main = watch;
  sp.player.flags &= ~FLAG.STILL;
  clearShared(sp);
}

// Task_80299B0: the checkpoint or the goal reached: the character glides back to the middle, held still, for
// 420 frames, and the message if they haven't enough rings
function watch(t) {
  const ctx = t.data, sp = ctx.special, cp = sp.checkpoint, p = sp.player;
  if (cp.kind === CHECKPOINT) {
    cp.timer = END_WAIT;
    p.flags |= FLAG.STILL;
    p.end = END.CHECKPOINT;
    t.main = checkpointWait;
    if (sp.targets[0] > sp.collected) createMessage(ctx, MESSAGE.NOT_ENOUGH_RINGS);
  }
  if (cp.kind === GOAL) {
    cp.timer = END_WAIT;
    p.flags |= FLAG.STILL;
    p.end = END.GOAL;
    t.main = goalWait;
    if (sp.targets[1] > sp.collected) createMessage(ctx, MESSAGE.NOT_ENOUGH_RINGS);
  }
}

// sub_8029A50: on, or the end
function checkpointWait(t) {
  const ctx = t.data, sp = ctx.special, cp = sp.checkpoint;
  if (--cp.timer > 0) return;
  if (sp.targets[0] <= sp.collected) {
    cp.kind = 0;
    sp.player.flags &= ~FLAG.STILL;
    clearShared(sp);
    t.main = watch;
  } else {
    sp.stageFlags |= 0x20;
    t.main = fadeOut;
  }
}

// sub_802D274
function goalWait(t) {
  const sp = t.data.special;
  if (--sp.checkpoint.timer > 0) return;
  sp.stageFlags |= 0x20;
  t.main = fadeOut;
}

// Task_8029AC4: a fade to white over 64 frames, then the emerald's scene if the goal's target was reached, the
// results otherwise
function fadeOut(t) {
  const ctx = t.data, sp = ctx.special, cp = sp.checkpoint, e = ctx.engine;
  cp.blend += 0x40;
  e.bldCnt = 0x3F9F;
  e.bldAlpha = 0;
  e.bldY = I(cp.blend);
  if (cp.blend < 0x1000) return;
  e.bldAlpha = 0x10;
  e.destroyTasks();
  e.clearQueues();
  e.bldCnt |= 0x3F1F;
  if (cp.kind === CHECKPOINT) ctx.results(0);
  else if (sp.target <= sp.collected) ctx.emeralds();
  else ctx.results(0);
}

// sub_802D680: Start opens the pause menu (CreatePauseMenu), which isn't ported yet; the act has none either
function pauseMenu() {}

// sub_8029B74: the layers, the tunnel and its task, and the stage's two palette animations
function createTunnel(ctx) {
  const e = ctx.engine, sp = ctx.special, bg = sp.bg;
  e.dispCnt = 0x1C40;
  e.bgCnt[1] = 0x201; e.bgCnt[2] = 0x5806; e.bgCnt[3] = 0x1C0B;
  bg.x = 0; bg.y = 0;
  scroll(e, bg);
  const quarters = QUARTERS.map(([layoutVram, flags, scrollX, scrollY]) => createBackground({
    graphics: { src: 0, dest: 0x4000, size: 0, anim: 0 }, layoutVram, tilemapId: TILEMAP.TUNNEL,
    targetTilesX: 19, targetTilesY: 14, flags, scrollX, scrollY, prevScrollX: 0x7FFF, prevScrollY: 0x7FFF,
  }));
  const back = createBackground({
    graphics: { src: 0, dest: 0x8000, size: 0, anim: 0 }, layoutVram: 0xE000, tilemapId: TILEMAP.BACKGROUND,
    targetTilesX: 32, targetTilesY: 32, flags: 3, prevScrollX: 0x7FFF, prevScrollY: 0x7FFF,
  });
  for (const b of quarters) drawBackground(e, ctx.tilemaps, b);
  drawBackground(e, ctx.tilemaps, back);
  e.createTask(tunnelStart, { ctx, quarters }, 0x1200);
  // the big lights across, then the small diagonal ones
  for (const variant of [0, 1]) {
    const s = createSprite({ graphics: { src: 0, dest: 0, size: 0, anim: sp.data.paletteAnim }, variant, oamFlags: 0, frameFlags: 0 });
    e.createTask(paletteStep, { ctx, s }, 0x2000);
  }
  // the layers past the screen's edges, for the widescreen view: as the hardware wraps them
  e.wideLayers = [null, null, null, null];
}

// the layers' scroll: the tunnel by the whole move, the background by an eighth of it, in tiles
function scroll(e, bg) {
  const x = MIDDLE.x - bg.x, y = MIDDLE.y + bg.y;
  e.bgScroll[6] = (x < 0 ? x + 7 : x) >> 3; e.bgScroll[7] = (y < 0 ? y + 7 : y) >> 3;
  e.bgScroll[4] = x; e.bgScroll[5] = y;
}

// Task_802D2BC
function tunnelStart(t) {
  const d = t.data, e = d.ctx.engine, bg = d.ctx.special.bg;
  e.bldCnt = 0; e.bldY = 0;
  bg.frame = 0; bg.unk13 = 8;
  tunnel(t);
  t.main = tunnel;
}

// sub_8029CDC: the tunnel moved against the character's place, and its frame on by their speed
function tunnel(t) {
  const { ctx, quarters } = t.data, e = ctx.engine, sp = ctx.special, bg = sp.bg, p = sp.player;
  bg.x = s16(-(div(p.x, 134) * 32) >> 8);
  bg.y = s16(-(div(p.y, 94) << 5) >> 8);
  if (bg.y < -0x20) bg.y = -0x20;
  if (bg.y > 0x20) bg.y = 0x20;
  if (bg.x < -0x20) bg.x = -0x20;
  if (bg.x > 0x20) bg.x = 0x20;
  scroll(e, bg);
  bg.frame = ((p.speed >> 9) + bg.frame) & 0x3F;
  for (const q of quarters) q.tilemapId = TILEMAP.TUNNEL + (bg.frame >> 2);
  quarters[0].flags &= ~0x8;
  for (const q of quarters) drawBackground(e, ctx.tilemaps, q);
}

// Task_StagePaletteLoader: the animation's colours into the backgrounds' palette, until it ends
function paletteStep(t) {
  const { ctx, s } = t.data;
  if (updateSprite(ctx.engine, ctx.sprites, s, true) === 0) ctx.engine.destroyTask(t);
}

// the length of the trick jingle in frames, for each ROM
const jingles = new WeakMap();

/**
 * The stage's sounds: se() a sound effect, off while the trick jingle plays; trick() the bumper trick's jingle
 * (CreateSpStageTrickSoundTask), which stops the music and plays on the third sound effects' player, and when it
 * has ended brings the music back where it stopped, fading in. The jingle doesn't start again over itself.
 */
function createMusic(ctx) {
  const e = ctx.engine, sp = ctx.special, rom = ctx.rom, sound = ctx.sound;
  const layout = soundLayout(rom, ctx.offsets.musicPlayers);
  const playerOf = song => rom.u8(layout.songTable + song * 8 + 4);
  // the song the third sound effects' player last started (the act's sounds aren't counted)
  let se3 = -1;
  const play = song => {
    if (playerOf(song) === SE3) se3 = song;
    e.playSong(song);
  };
  return {
    play,
    se(song) { if (!sp.muted) play(song); },
    trick() {
      sound?.stopPlayer(playerOf(SONG.SPECIAL_STAGE));
      if (se3 === SONG.SPECIAL_STAGE_TRICK) return;
      if (!jingles.has(rom)) jingles.set(rom, songFrames(rom.bytes, layout, SE3, SONG.SPECIAL_STAGE_TRICK));
      // Task_CallSpStageTrickTask, then Task_SpStageTrick from the next frame
      e.createTask(t => { t.main = jingle; }, { frames: 0, length: jingles.get(rom) }, 0x3000);
      sp.muted = 0xFF;
      se3 = SONG.SPECIAL_STAGE_TRICK;
      sound?.startOn(SE3, SONG.SPECIAL_STAGE_TRICK);
    },
  };
  function jingle(t) {
    const d = t.data;
    if (++d.frames < d.length) return;
    const bgm = playerOf(SONG.SPECIAL_STAGE);
    sound?.startOrContinue(SONG.SPECIAL_STAGE);
    sound?.volume(bgm, 0xFF, 4);
    sound?.fadeIn(bgm, 4);
    e.destroyTask(t);
    sp.muted = 0;
  }
}
