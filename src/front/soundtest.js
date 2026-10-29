// The sound test (SAT-R decompilation, src/game/sa1/ui/sound_test.c: CreateSoundTest and its tasks), from the
// Options menu's SOUND TEST. It fades in from black over 32 frames while whatever was playing fades out: a
// chequered background scrolling up and to the left a pixel a frame, SOUND TEST in its corner, the song's number
// on a star between two bobbing arrows, Amy on a stand, and A PLAY B EXIT along the bottom. Amy waves until the
// 119th frame, then stands.
//
// Left and Right choose among 39 songs, or 42 once the Moon Zone has been cleared (the save's unk424), wrapping
// round; held, they repeat 20 frames after the press and every 9 after that. From the 121st frame A plays the song:
// the players' songs fade out over 16 frames, Amy dances to it, the star pulses, and EXIT turns to STOP. An A after
// the fade-in and before the 121st frame plays it at once too. B while a song plays fades it out, and B is then
// ignored for 10 frames; a song ending, or stopped, makes Amy blow a kiss for 120 frames. B with nothing playing
// fades out to black over 43 frames, Amy waving goodbye, and the Options menu comes back, its cursor on PLAYER
// DATA.
//
// What the screen does depends on whether the four music players are playing, which it reads each frame. The
// sound plays on its own thread, so the screen keeps a copy of the engine that gets the same calls and runs a
// frame as the game's frame starts, as SoundMain does (EngineMainLoop). The copy starts with nothing playing.
// The game's players aren't empty then (the Options menu's music, its sounds), but the fade-outs at the start
// empty them all by the 16th frame, and nothing reads them before the 32nd: until the fade-in has finished, A
// starts no song, and Amy's kiss and the STOP need the 101st and 121st frames.

import { createSprite, updateSprite, displaySprite, transformSprite, rotateSprite, SPRITE } from '../gba/sprite.js';
import { KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';
import { createM4A } from '../sound/m4a.js';
import { createApu } from '../sound/apu.js';
import { soundLayout } from '../rom/sound.js';
import { SINE } from '../engine/trig.js';
import { createUiTask, uiGfxStackInit, uiGraphics, loadUiGfx, drawUiText, createFade, fadeStep, fadeShow } from './ui.js';
import { createOptionsMenu } from './options.js';

const OBJ_VRAM = 0x10000;
const ANIM_AMY_BYE = 853, ANIM_AMY_IDLE = 854, ANIM_AMY_SHAKE = 855, ANIM_AMY_KISS = 856;
// the arrows (variant 2), and STOP (0) or EXIT (1); A PLAY B; SOUND TEST; the corner; the stand's left half; the star
const ANIM_WORDS = 870, ANIM_PLAY = 873, ANIM_TITLE = 871, ANIM_CORNER = 874, ANIM_STAND = 875, ANIM_STAR = 876;
const ARROWS = 2, STOP = 0, EXIT = 1;
const SONGS = 39, ALL_SONGS = 42;
const PLAYERS = 4;   // BGM, SE1, SE2, SE3
// Amy's states (unk10D): waving, standing, dancing, blowing a kiss
const BYE = 0, IDLE = 1, SHAKE = 2, KISS = 3;
// gUnknown_0868B0CC: how far the arrows are out, by the frame's eighth
const BOB = [0, 1, 2, 3, 4, 3, 2, 1];
const BACKGROUND_GFX = 0x3D, DIGITS_GFX = 0;
const S16 = v => (v << 16) >> 16;

const sprite = (anim, dest, fields) => createSprite({ graphics: { src: 0, dest: OBJ_VRAM + dest, size: 0, anim }, prevVariant: 0xFF, animSpeed: 0x10, ...fields });

/**
 * CreateSoundTest. `ctx` has the engine, the sprite tables, the save and the ROM's offsets (`soundTestSongs`,
 * `soundTestBackground`, `uiGraphics` and `musicPlayers`).
 */
export function createSoundTest(ctx) {
  const e = ctx.engine, show = s => displaySprite(e, ctx.sprites, s), update = s => updateSprite(e, ctx.sprites, s);
  e.firstRepeat.fill(20);
  e.nextRepeat.fill(8);
  createUiTask(e);
  e.dispCnt = 0x1140;
  e.bgCnt[0] = 0x1E07;
  e.bgScroll[0] = 0;
  e.bgScroll[1] = 0;

  // SoundTestState: the frame (unk24), the song chosen (unk28), whether one plays (unk29), the players playing
  // (unk2A) and B's rest (unk2C)
  const test = {
    ctx, fade: createFade(0, 1, 2, 0, 0x100, 1), frame: 0, song: 0, playing: 0, players: 0, rest: 0,
    m4a: createM4A(e.rom.bytes, soundLayout(e.rom, ctx.offsets.musicPlayers), createApu()),
    tasks: new Map(),
  };
  e.createTask(runSoundTest, test, 0x2000);
  const sub = (main, data, priority = 0x2020) => test.tasks.set(main, e.createTask(main, { test, ...data }, priority));

  // the subtasks read the frame, the song and whether one plays from the main task, which runs before them; the
  // original copies them to each (unk108, unk10C, unk10D)
  test.amy = { s: sprite(ANIM_AMY_SHAKE, 0x20, { x: 180, y: 120, oamFlags: 0, frameFlags: 0x2000 }), state: BYE, count: 60 };
  sub(amyTask, {});
  update(test.amy.s);

  // DoSpriteTransformAndDisplay as the original has it, TransformSprite before the sprite has a frame. It reads the
  // frame's size from whatever an earlier screen left in the sprite's memory, which on the way from the Options menu
  // puts the four quarters far off the screen (22328, -5626 in mGBA), so only their rotation counts on this frame, a
  // black one, and none of them is drawn
  const stars = [0x3067, 0x3068, 0x3069, 0x307B].map(frameFlags => {
    const s = sprite(ANIM_STAR, 0xC80, { x: 76, y: 92, oamFlags: 0x480, frameFlags });
    rotateSprite(e, s, { rotation: 0xC8, qScaleX: 0x101, qScaleY: 0x101 });
    update(s);
    return s;
  });
  sub(starTask, { stars, angle: 0 });

  const arrows = sprite(ANIM_WORDS, 0x1C80, { x: 100, y: 93, oamFlags: 0, variant: ARROWS });
  sub(arrowsTask, { s: arrows });
  update(arrows);
  show(arrows);

  const words = sprite(ANIM_WORDS, 0x2040, { x: 98, y: 136, oamFlags: 0x100, frameFlags: 0x2000 });
  sub(wordsTask, { s: words });
  update(words);

  // GameOverB: one glyph at y 82, from the digits' slot (0), in palette row 15, at OAM order 8
  sub(numberTask, { o: { unk8: 0x40, unkA: 0, unkC: 0x52, unkE: 1, unk10: 0, unk12: 15, unk16: 1 } }, 0x2040);

  const still = [
    sprite(ANIM_CORNER, 0x2600, { x: 0, y: 0, oamFlags: 0x140, frameFlags: 0x2000 }),
    sprite(ANIM_PLAY, 0x3200, { x: 26, y: 136, oamFlags: 0x140, frameFlags: 0x2000 }),
    sprite(ANIM_TITLE, 0x1CC0, { x: 17, y: 24, oamFlags: 0x80, frameFlags: 0x2000 }),
    sprite(ANIM_STAND, 0x2380, { x: 180, y: 144, oamFlags: 0x100, frameFlags: 0x2000 }),
  ];
  sub(stillTask, { still });
  still.forEach(update);

  for (let p = 0; p < PLAYERS; p++) fadeOut(test, p);
  fadeShow(e, test.fade);
  loadGraphics(ctx);
}

// sub_805E9B4: the background's tiles, colours and map into layer 0, and the digits' glyphs (UI graphics 0 from
// tile 32) and colours into sprite VRAM and palette row 15, for slot 0
function loadGraphics(ctx) {
  const e = ctx.engine, { offsets } = ctx;
  uiGfxStackInit(e);
  const bg = uiGraphics(e.rom, offsets.uiGraphics, BACKGROUND_GFX);
  loadUiGfx(e, {
    uiGfxID: BACKGROUND_GFX, unk2B: 1, unk0: bg.unk0, unk28: 0, unk29: 0, unk2A: 0x15,
    tiles: bg.tiles, tilesSize: 0x800, palette: bg.palette, paletteSize: 0x20,
    layout: offsets.soundTestBackground, layoutSize: 0x800,
  });
  const digits = uiGraphics(e.rom, offsets.uiGraphics, DIGITS_GFX);
  loadUiGfx(e, {
    uiGfxID: DIGITS_GFX, unk2B: 0, unk0: digits.unk0, unk28: 15, unk2A: 0xD, vramC: OBJ_VRAM + 0x3480,
    tiles: digits.tiles + 0x400, tilesSize: 0x280, palette: digits.palette, paletteSize: 0x20,
  });
}

// the game's calls on the music players, to the sound and to the screen's copy of the engine
function play(test, song) { test.ctx.engine.playSong(song); test.m4a.songStart(song); }
function fadeOut(test, p) { test.ctx.engine.fadeOutPlayer(p, 1); test.m4a.fadeOut(p, 1); }
function resume(test, p) { test.ctx.engine.continuePlayer(p); test.m4a.playerContinue(p); }

// sub_805FF0C: Amy to a state, 120 frames on its count
function setAmy(test, state) {
  test.amy.state = state;
  test.amy.count = 120;
}

// Task_SoundTestInit
function runSoundTest(t) {
  const test = t.data, { ctx, fade, m4a } = test, e = ctx.engine;
  m4a.frame();
  let frame = test.frame + 1;
  if (fade.unk4 === 1 && fade.unk6 > 0x1FFF) {
    for (const main of [numberTask, amyTask, wordsTask, starTask, stillTask, arrowsTask]) e.destroyTask(test.tasks.get(main));
    t.main = toOptions;
    return;
  }
  e.bgScroll[0] = (e.bgScroll[0] + 1) & 0xFF;
  e.bgScroll[1] = (e.bgScroll[1] + 1) & 0xFF;
  const count = ctx.save.unk424 ? ALL_SONGS : SONGS;
  if (e.repeated & KEY.LEFT) test.song = test.song === 0 ? count - 1 : test.song - 1;
  else if (e.repeated & KEY.RIGHT) test.song = (test.song + 1) % count;
  if (frame === 2) for (let p = 0; p < PLAYERS; p++) resume(test, p);

  const a = e.pressed & KEY.A, b = e.pressed & KEY.B;
  // sub_805FD54: an A once the fade-in is over skips to the 121st frame, Amy dancing from the start of it
  if (fadeStep(e, fade) && a && frame <= 120 && !b) {
    frame = 121;
    const s = test.amy.s;
    setAmy(test, SHAKE);
    s.prevVariant = 0xFF;
    s.graphics.anim = ANIM_AMY_SHAKE;
    s.variant = 0;
    updateSprite(e, ctx.sprites, s);
  }
  if (frame > 1 && a && fade.unk4 !== 1 && frame > 120 && !b) {
    for (let p = 0; p < PLAYERS; p++) fadeOut(test, p);
    play(test, e.rom.u16(ctx.offsets.soundTestSongs + test.song * 2));
    setAmy(test, SHAKE);
  } else {
    for (let p = 0; p < PLAYERS; p++) {
      const bit = 1 << p;
      if (m4a.players[p].status & 0xFFFF) test.players |= bit;
      else {
        if (test.players & bit && frame > 100 && fade.unk4 !== 1) setAmy(test, KISS);
        test.players &= ~bit;
      }
    }
  }
  if (test.players !== 0 && fade.unk4 !== 1) {
    if (frame > 120) {
      setAmy(test, SHAKE);
      test.playing = 1;
    }
  } else test.playing = 0;

  let rest = true;
  if (b) {
    if (fade.unk4 !== 1 && !test.playing && !test.rest && frame > 120 && !a) {
      play(test, SONG.RETURN);
      fade.unk4 = 1;
      fade.unk6 = S16(0x2000 - (fade.unk6 & 0xFFFF));
      fade.unk8 = 0xC0;
      setAmy(test, BYE);
    }
    // the players playing fade out: BGM and SE1 as such, and SE2 or SE3 as SE3
    if (fade.unk4 !== 1 && test.playing && !test.rest) {
      for (let p = 0; p < PLAYERS; p++) {
        if (!(test.players & (1 << p))) continue;
        test.rest = 10;
        fadeOut(test, p < 2 ? p : 3);
      }
      rest = false;
    }
  }
  if (rest && test.rest) test.rest--;
  test.frame = frame;
}

// Task_TransitionOptionsMenu: the windows and the fade off, and the Options menu
function toOptions(t) {
  const { ctx } = t.data, e = ctx.engine;
  e.dispCnt &= ~0xE000;
  e.bldCnt = 0;
  e.bldY = 0;
  e.destroyTask(t);
  createOptionsMenu(ctx);
}

// sub_805F950: Amy waves until the 119th frame, then stands; dancing, she moves left, then to the right facing
// left, then back to the middle for the last of every 250 frames; a kiss lasts 120 frames
function amyTask(t) {
  const { test } = t.data, amy = test.amy, s = amy.s, e = test.ctx.engine, frame = test.frame;
  const pose = (x, anim, variant) => { s.x = x; s.y = 120; s.graphics.anim = anim; s.variant = variant; };
  if (amy.state === BYE || frame < 120) {
    pose(180, ANIM_AMY_BYE, 0);
    if (frame === 119) {
      s.prevVariant = 0xFF;
      amy.state = IDLE;
      s.graphics.anim = ANIM_AMY_IDLE;
    }
    s.frameFlags &= ~SPRITE.X_FLIP;
  } else if (amy.state === IDLE) {
    pose(180, ANIM_AMY_IDLE, 0);
    s.frameFlags &= ~SPRITE.X_FLIP;
  } else if (amy.state === SHAKE) {
    const m = frame % 250;
    if (m <= 119) {
      pose(164, ANIM_AMY_SHAKE, 0);
      s.frameFlags &= ~SPRITE.X_FLIP;
    } else if (m > 124 && m < 245) {
      pose(196, ANIM_AMY_SHAKE, 0);
      s.frameFlags |= SPRITE.X_FLIP;
    } else {
      pose(180, ANIM_AMY_SHAKE, 1);
      amy.count = 5;
    }
  } else if (amy.state === KISS) {
    pose(180, ANIM_AMY_KISS, 0);
    amy.count = (amy.count - 1) & 0xFFFF;
    if (amy.count === 0) {
      s.prevVariant = 0xFF;
      amy.state = IDLE;
      s.graphics.anim = ANIM_AMY_IDLE;
    }
    s.frameFlags &= ~SPRITE.X_FLIP;
  }
  updateSprite(e, test.ctx.sprites, s);
  displaySprite(e, test.ctx.sprites, s);
}

// sub_805FAD4: the star, four quarters of it turned through the rotation hardware, swelling and shrinking with the
// sine of its angle while a song plays, and once more after, until the angle comes round to 4
function starTask(t) {
  const star = t.data, { test } = star, e = test.ctx.engine;
  if (test.playing) star.angle = (star.angle + 0x10) & 0x3FF;
  else if (star.angle !== 4) {
    const end = star.angle < 0x200 ? 0x200 : 0x3FF;
    star.angle += 0x10;
    if (star.angle > end) star.angle = 4;
  }
  const scale = (SINE[star.angle] >> 8) + 0x100;
  star.stars.forEach((s, i) => {
    s.x = 76;
    s.y = 92;
    transformSprite(e, s, { rotation: i * 0x100, qScaleX: scale, qScaleY: scale, x: 76, y: 92 });
    displaySprite(e, test.ctx.sprites, s);
  });
}

// Task_805FEAC: the arrows either side of the number, a pixel further out every 8 frames and back
function arrowsTask(t) {
  const { test, s } = t.data, e = test.ctx.engine, out = BOB[(test.frame >> 3) % BOB.length];
  s.frameFlags &= ~SPRITE.X_FLIP;
  s.x = out + 102;
  displaySprite(e, test.ctx.sprites, s);
  s.frameFlags |= SPRITE.X_FLIP;
  s.x = 52 - out;
  displaySprite(e, test.ctx.sprites, s);
}

// sub_805FDE4: STOP once a song has played for 24 frames of the screen, else EXIT
function wordsTask(t) {
  const { test, s } = t.data, e = test.ctx.engine;
  s.prevVariant = 0xFF;
  s.variant = test.playing && test.frame > 24 ? STOP : EXIT;
  updateSprite(e, test.ctx.sprites, s);
  displaySprite(e, test.ctx.sprites, s);
}

// sub_805FC88: the song's number from 1, its digits 10 px apart and centred on the star (sub_805321C, one glyph
// at a time)
function numberTask(t) {
  const { test, o } = t.data, e = test.ctx.engine, n = (test.song + 1) & 0xFF;
  const digit = d => drawUiText(e, () => d + 0x20, o, true);
  let left = 0;
  o.unkC = 0x52;
  if (n > 99) {
    o.unkA = 0x40;
    digit(Math.trunc(n / 100));
  } else left = n >= 10 ? 5 : 10;
  if (n > 9) {
    o.unkA = 74 - left;
    digit(Math.trunc((n % 100) / 10));
  }
  o.unkA = 84 - left;
  digit(n % 10);
}

// sub_805FE48: the corner, SOUND TEST, A PLAY B and the stand, its left half and then the same flipped
function stillTask(t) {
  const { test, still } = t.data, e = test.ctx.engine, show = s => displaySprite(e, test.ctx.sprites, s);
  const [corner, playWord, title, stand] = still;
  show(corner);
  show(playWord);
  show(title);
  stand.frameFlags &= ~SPRITE.X_FLIP;
  show(stand);
  stand.frameFlags |= SPRITE.X_FLIP;
  show(stand);
}
