// The engine and the sound hardware on one clock: a GBA frame (280896 CPU cycles) runs the engine once, the
// DirectSound samples it mixes play during the next frame at 176 per frame, and the hardware mix is sampled
// every 256 cycles and averaged down to the output rate.

import { createM4A, SOUND } from './m4a.js';
import { createApu, CPU_HZ, TICK } from './apu.js';

const FRAME_CYCLES = 280896, SAMPLE_CYCLES = FRAME_CYCLES / SOUND.SAMPLES;   // 1596 cycles per DirectSound sample
const FULL_SCALE = 512;   // the 10-bit DAC swings ±512 around the bias
const DC_POLE = 0.9995;   // the output's coupling capacitor, as a one-pole high-pass

/**
 * @param {Uint8Array} rom
 * @param {{songTable: number, playerTable: number, players: number}} layout
 * @param {number} rate output sample rate in Hz
 */
export function createSynth(rom, layout, rate) {
  const apu = createApu();
  const engine = createM4A(rom, layout, apu);
  const queue = [];
  const n = SOUND.SAMPLES;
  let playing = new Int8Array(2 * n), pending = new Int8Array(2 * n);
  let cycle = 0, frameStart = 0, nextFrame = 0;
  let curL = 0, curR = 0, frac = 1;
  let inL = 0, inR = 0, outL = 0, outR = 0;
  const ticksPerSample = CPU_HZ / TICK / rate;

  function frame() {
    [playing, pending] = [pending, playing];
    for (const [name, args] of queue.splice(0)) engine[name](...args);
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
    /** Queues an engine call (songStart, pitchControl, …) for the start of the next frame. */
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
