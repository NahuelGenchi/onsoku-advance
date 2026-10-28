// The engine and the sound hardware on one clock: a GBA frame (280896 CPU cycles) runs the engine once, the
// DirectSound samples it mixes play during the next frame at 176 per frame, and the hardware mix is sampled
// every 256 cycles and averaged down to the output rate.

import { createM4A, SOUND } from './m4a.js';
import { createApu, CPU_HZ, TICK } from './apu.js';

const FRAME_CYCLES = 280896, SAMPLE_CYCLES = FRAME_CYCLES / SOUND.SAMPLES;   // 1596 cycles per DirectSound sample
const FULL_SCALE = 512;   // the 10-bit DAC swings ±512 around the bias
const DC_POLE = 0.9995;   // the output's coupling capacitor, as a one-pole high-pass
const BGM = 0, DROWNING = 27, INVINCIBILITY = 28, ONE_UP = 307;
// sBossSongIndices: the boss fight, its intro, Mecha Knuckles, Egg Snake, Egg Wrecker, Egg Drillster, the final boss
const BOSS_SONGS = [29, 30, 31, 32, 49, 50, 25];
const PAUSE = 0x80000000;

/**
 * @param {Uint8Array} rom
 * @param {{songTable: number, playerTable: number, players: number}} layout
 * @param {number} rate output sample rate in Hz
 */
export function createSynth(rom, layout, rate) {
  const apu = createApu();
  const engine = createM4A(rom, layout, apu);
  const queue = [], manager = createMusicManager(engine);
  const n = SOUND.SAMPLES;
  let playing = new Int8Array(2 * n), pending = new Int8Array(2 * n);
  let cycle = 0, frameStart = 0, nextFrame = 0;
  let curL = 0, curR = 0, frac = 1;
  let inL = 0, inR = 0, outL = 0, outR = 0;
  const ticksPerSample = CPU_HZ / TICK / rate;

  function frame() {
    [playing, pending] = [pending, playing];
    manager.frame(queue.splice(0));
    const base = engine.frame(), pcm = engine.info.pcm;
    pending.set(pcm.subarray(base, base + n), 0);
    pending.set(pcm.subarray(SOUND.HALF + base, SOUND.HALF + base + n), n);
  }

  // the cycle counts start again from 0 with each frame, so they stay small whole numbers: a growing one would
  // become a new object at every step on the audio thread
  function tick() {
    if (cycle >= nextFrame) { cycle -= nextFrame; frameStart = 0; nextFrame = FRAME_CYCLES; frame(); }
    const i = Math.floor((cycle - frameStart) / SAMPLE_CYCLES);
    apu.run(TICK);
    const out = apu.mix(playing[i], playing[n + i]);
    curL = out[0]; curR = out[1];
    cycle += TICK;
  }

  return {
    engine,
    /** Queues an engine call (songStart, pitchControl, …) or a music manager one (stageMusic, oneUp,
     *  allStop) for the start of the next frame. */
    call(name, ...args) { queue.push([name, args]); },
    /** Fills `left` and `right` with the next samples, in [-1, 1] times `gain`. */
    render(left, right, gain = 1, dcBlock = true) {
      // the running fractions in local variables while the block is made: kept outside the function, each new
      // value would be a new object
      let f = frac, iL = inL, iR = inR, oL = outL, oR = outR;
      for (let j = 0; j < left.length; j++) {
        let need = ticksPerSample, l = 0, r = 0;
        while (need > 1e-9) {
          if (f >= 1) { tick(); f -= 1; }
          const take = Math.min(1 - f, need);
          l += curL * take; r += curR * take;
          f += take; need -= take;
        }
        l /= ticksPerSample * FULL_SCALE; r /= ticksPerSample * FULL_SCALE;
        if (dcBlock) {
          oL = l - iL + DC_POLE * oL; iL = l;
          oR = r - iR + DC_POLE * oR; iR = r;
          l = oL; r = oR;
        }
        left[j] = l * gain; right[j] = r * gain;
      }
      frac = f; inL = iL; inR = iR; outL = oL; outR = oR;
    },
  };
}

/**
 * How many frames song `song` plays on music player `player` before it ends, counted as a task watching the
 * player's status from the frame after it starts sees it (the special stage's trick jingle, Task_SpStageTrick).
 */
export function songFrames(rom, layout, player, song, limit = 60 * 60) {
  const engine = createM4A(rom, layout, createApu()), P = engine.players[player];
  engine.playerStart(player, song);
  for (let n = 1; n < limit; n++) {
    engine.frame();
    if ((P.status & PAUSE) || (P.status & 0xFFFF) === 0) return n;
  }
  return limit;
}

// The stage's music manager (SAT-R decompilation, src/game/shared/stage/music_manager.c), reduced to what
// the game uses so far. It runs after the game's other calls each frame, and does nothing while Sonic is
// dead. While the drowning music plays it holds the music player and drops what invincibility and an extra life
// asked for; the drowning countdown starts it. Invincibility's song takes the music player while he is
// invincible and stops when he is not; an extra life replaces the music with the 1-up jingle. On any frame where the music player has stopped, the
// stage music starts over from its beginning, fading in from 1/64 and at double tempo while Sonic has speed
// shoes (MusManager_UpdateBgmParams). It leaves the player alone the frame the stage music starts, and from
// when the act's results switch it off (gMusicManagerState.unk0 = 0xFF) until the next act's music starts.
// A boss sets its state (gMusicManagerState.unk1): 0x10 and a boss song's index starts that song, which then
// takes the stage music's place (0x20); 0x30 stops it and brings the stage music back, and after every boss
// but Egg Wrecker and Egg Drillster the manager switches itself off for the rest of the act.
// The pause menu stops every music player but its sound's own and plays its sound (Task_PauseMenuInit), after
// the manager has run on that frame; the manager's task doesn't run while the game is paused, nor on the frame
// the menu closes and every player goes on (m4aMPlayAllContinue).
export function createMusicManager(engine) {
  let stageSong = null, oneUp = false, star = false, drown = false, starting = false, boss = 0, off = false;
  let invincible = false, speedUp = false, alive = true, paused = false, resuming = false;
  const own = {
    stageMusic(song) { stageSong = song; starting = true; boss = 0; off = false; drown = false; engine.songStart(song); },
    off() { off = true; },
    /** a boss's music state (gMusicManagerState.unk1) */
    musicState(value) { boss = value; },
    oneUp() { oneUp = true; },
    /** an item box's invincibility (gMusicManagerState.unk2) */
    invincibility() { star = true; },
    /** the drowning countdown's music (gMusicManagerState.unk4) */
    drowning() { drown = true; },
    /** what the manager reads of Sonic each frame */
    playerState(isInvincible, hasSpeedUp, isAlive) { invincible = isInvincible; speedUp = hasSpeedUp; alive = isAlive; },
    allStop() { stageSong = null; engine.allStop(); },
    continueAll() { engine.allContinue(); resuming = true; },
  };
  function bgmParams() {
    engine.immInit(BGM); engine.volumeControl(BGM, 0xFF, 4); engine.fadeIn(BGM, 4);
    if (speedUp) engine.tempoControl(BGM, 0x200);
  }
  function pause(song) {
    const its = engine.songPlayer(song);
    for (let p = 0; p < engine.players.length; p++) if (p !== its) engine.playerStop(p);
    engine.songStart(song);
    paused = true;
  }
  // the manager's task (Task_StageMusicManager)
  function manage() {
    if (stageSong === null || starting || off) { starting = false; return; }
    if (!alive) return;
    const { status, songHeader } = engine.players[BGM];
    const playing = (status & 0xFFFF) !== 0 && (status & PAUSE) === 0;
    const is = n => songHeader === engine.songHeader(n);
    if (is(DROWNING) && playing) { star = false; oneUp = false; }
    else if (drown) { drown = false; engine.songStart(DROWNING); }
    else if (is(INVINCIBILITY) && playing && !invincible) engine.songStop(INVINCIBILITY);
    else if (!is(ONE_UP) && !is(INVINCIBILITY) && invincible && !star) { engine.songStart(INVINCIBILITY); bgmParams(); }
    else if (star) { star = false; engine.songStart(INVINCIBILITY); }
    else if (oneUp) { oneUp = false; engine.songStart(ONE_UP); }
    else if ((boss & 0xF0) === 0x10) { boss &= 0xF; engine.songStart(BOSS_SONGS[boss]); boss |= 0x20; }
    else if ((boss & 0xF0) === 0x30) {
      boss &= 0xF; engine.songStop(BOSS_SONGS[boss]);
      engine.songStart(stageSong); bgmParams();
      if (((boss - 4) & 0xFF) > 1) off = true;
      boss = 0;
    } else if (!playing) {
      if ((boss & 0xF0) === 0x20) engine.songStart(BOSS_SONGS[boss & 0xF]);
      else engine.songStart(stageSong);
      bgmParams();
    }
  }
  return {
    /** Runs one frame's queued calls ([name, args] pairs), then the manager itself unless the game is paused. */
    frame(calls) {
      let ran = false;
      for (const [name, args] of calls) {
        if (name !== 'pause') { (own[name] ?? engine[name])(...args); continue; }
        if (!ran && !paused) manage();
        ran = true;
        pause(...args);
      }
      if (!ran && !paused) manage();
      if (resuming) { resuming = false; paused = false; }
    },
  };
}
