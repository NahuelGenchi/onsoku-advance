// The engine and the sound hardware on one clock: a GBA frame (280896 CPU cycles) runs the engine once, the
// DirectSound samples it mixes play during the next frame at 176 per frame, and the hardware mix is sampled
// every 256 cycles and averaged down to the output rate.

import { createM4A, SOUND } from './m4a.js';
import { createApu, CPU_HZ, TICK } from './apu.js';

const FRAME_CYCLES = 280896, SAMPLE_CYCLES = FRAME_CYCLES / SOUND.SAMPLES;   // 1596 cycles per DirectSound sample
const FULL_SCALE = 512;   // the 10-bit DAC swings ±512 around the bias
const DC_POLE = 0.9995;   // the output's coupling capacitor, as a one-pole high-pass
const BGM = 0, DROWNING = 27, INVINCIBILITY = 28, ONE_UP = 307;
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

  function tick() {
    if (cycle >= nextFrame) { frameStart = nextFrame; nextFrame += FRAME_CYCLES; frame(); }
    const i = Math.floor((cycle - frameStart) / SAMPLE_CYCLES);
    apu.run(TICK);
    [curL, curR] = apu.mix(playing[i], playing[n + i]);
    cycle += TICK;
  }

  return {
    engine,
    /** Queues an engine call (songStart, pitchControl, …) or a music manager one (stageMusic, oneUp,
     *  allStop) for the start of the next frame. */
    call(name, ...args) { queue.push([name, args]); },
    /** Fills `left` and `right` with the next samples, in [-1, 1] times `gain`. */
    render(left, right, gain = 1, dcBlock = true) {
      for (let j = 0; j < left.length; j++) {
        let need = ticksPerSample, l = 0, r = 0;
        while (need > 1e-9) {
          if (frac >= 1) { tick(); frac -= 1; }
          const take = Math.min(1 - frac, need);
          l += curL * take; r += curR * take;
          frac += take; need -= take;
        }
        l /= ticksPerSample * FULL_SCALE; r /= ticksPerSample * FULL_SCALE;
        if (dcBlock) {
          outL = l - inL + DC_POLE * outL; inL = l;
          outR = r - inR + DC_POLE * outR; inR = r;
          l = outL; r = outR;
        }
        left[j] = l * gain; right[j] = r * gain;
      }
    },
  };
}

// The stage's music manager (SAT-R decompilation, src/game/shared/stage/music_manager.c), reduced to what
// the game uses so far. It runs after the game's other calls each frame, and does nothing while Sonic is
// dead. While the drowning music plays it holds the music player and drops what invincibility and an extra life
// asked for; the drowning countdown starts it. Invincibility's song takes the music player while he is
// invincible and stops when he is not; an extra life replaces the music with the 1-up jingle. On any frame where the music player has stopped, the
// stage music starts over from its beginning, fading in from 1/64 and at double tempo while Sonic has speed
// shoes (MusManager_UpdateBgmParams). It leaves the player alone the frame the stage music starts.
export function createMusicManager(engine) {
  let stageSong = null, oneUp = false, star = false, drown = false, starting = false;
  let invincible = false, speedUp = false, alive = true;
  const own = {
    stageMusic(song) { stageSong = song; starting = true; drown = false; engine.songStart(song); },
    oneUp() { oneUp = true; },
    /** an item box's invincibility (gMusicManagerState.unk2) */
    invincibility() { star = true; },
    /** the drowning countdown's music (gMusicManagerState.unk4) */
    drowning() { drown = true; },
    /** what the manager reads of Sonic each frame */
    playerState(isInvincible, hasSpeedUp, isAlive) { invincible = isInvincible; speedUp = hasSpeedUp; alive = isAlive; },
    allStop() { stageSong = null; engine.allStop(); },
  };
  function bgmParams() {
    engine.immInit(BGM); engine.volumeControl(BGM, 0xFF, 4); engine.fadeIn(BGM, 4);
    if (speedUp) engine.tempoControl(BGM, 0x200);
  }
  return {
    /** Runs one frame's queued calls ([name, args] pairs), then the manager itself. */
    frame(calls) {
      for (const [name, args] of calls) (own[name] ?? engine[name])(...args);
      if (stageSong === null || starting) { starting = false; return; }
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
      else if (!playing) { engine.songStart(stageSong); bgmParams(); }
    },
  };
}
