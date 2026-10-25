// The sound engine on the audio thread: it keeps its own GBA frame clock from the output's sample count, so
// the music keeps time even when the page's frames stall. Messages from the page queue engine calls for the
// start of the next sound frame, as a game call made during one frame is sequenced on the next. The optional
// Sonic Rush boost's sound effects play on their own DS engine and clock (nitro.js), added to the GBA's output.
// A multiplayer game on one page runs one engine per GBA (`count`), added together, with the music heard from
// the first one only.

import { createSynth } from './synth.js';
import { createNitro } from './nitro.js';

class M4AProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synths = [];
    this.rush = null;
    this.gain = 1;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'rom') {
        const rom = new Uint8Array(data.rom);
        this.synths = Array.from({ length: data.count ?? 1 }, (_, i) => {
          const synth = createSynth(rom, data.layout, sampleRate);
          synth.engine.muted.music = i > 0;
          return synth;
        });
      } else if (data.type === 'call') this.synths[data.gba ?? 0]?.call(data.name, ...data.args);
      else if (data.type === 'gain') this.gain = data.value;
      else if (data.type === 'rush') this.rush = createNitro(data.sound, sampleRate);
      else if (data.type === 'rushSe') this.rush?.startSeqArc(...data.se);
    };
  }

  process(inputs, outputs) {
    const [left, right] = outputs[0];
    if (this.synths.length === 1) this.synths[0].render(left, right, this.gain);
    else if (this.synths.length > 1) {
      const l = (this.l ??= new Float32Array(left.length)), r = (this.r ??= new Float32Array(right.length));
      left.fill(0); right.fill(0);
      for (const synth of this.synths) {
        synth.render(l, r, this.gain);
        for (let i = 0; i < left.length; i++) { left[i] += l[i]; right[i] += r[i]; }
      }
    }
    if (this.rush) this.rush.render(left, right, this.gain);
    return true;
  }
}

registerProcessor('m4a', M4AProcessor);
