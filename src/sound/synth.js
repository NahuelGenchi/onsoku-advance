// The engine and the sound hardware on one clock: a GBA frame (280896 CPU cycles) runs the engine once, the
// DirectSound samples it mixes play during the next frame at 176 per frame, and the hardware mix is sampled
// every 256 cycles and averaged down to the output rate.

import { createM4A, SOUND } from './m4a.js';
import { createApu, CPU_HZ, TICK } from './apu.js';

const FRAME_CYCLES = 280896, SAMPLE_CYCLES = FRAME_CYCLES / SOUND.SAMPLES;   // 1596 cycles per DirectSound sample
const FULL_SCALE = 512;   // the 10-bit DAC swings ±512 around the bias
const DC_POLE = 0.9995;   // the output's coupling capacitor, as a one-pole high-pass
const BGM = 0, ONE_UP = 307;
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
// the game uses so far. It runs after the game's other calls each frame. An extra life replaces the music
// with the 1-up jingle on the same player; on any later frame where that player has stopped, the stage
// music starts over from its beginning, fading in from 1/64 (MusManager_UpdateBgmParams). It watches the
// player as SoundMain left it at the start of the frame, and leaves it alone the frame the music starts.
export function createMusicManager(engine) {
  let stageSong = null, oneUp = false, starting = false;
  const own = {
    stageMusic(song) { stageSong = song; starting = true; engine.songStart(song); },
    oneUp() { oneUp = true; },
    allStop() { stageSong = null; engine.allStop(); },
  };
  return {
    /** Runs one frame's queued calls ([name, args] pairs), then the manager itself. */
    frame(calls) {
      const { status } = engine.players[BGM];
      const stopped = (status & 0xFFFF) === 0 || (status & PAUSE) !== 0;
      for (const [name, args] of calls) (own[name] ?? engine[name])(...args);
      if (stageSong === null || starting) { starting = false; return; }
      if (oneUp) { oneUp = false; engine.songStart(ONE_UP); }
      else if (stopped) {
        engine.songStart(stageSong); engine.immInit(BGM);
        engine.volumeControl(BGM, 0xFF, 4); engine.fadeIn(BGM, 4);
      }
    },
  };
}
