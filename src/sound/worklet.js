// The sound engine on the audio thread: it keeps its own GBA frame clock from the output's sample count, so
// the music keeps time even when the page's frames stall. Messages from the page queue engine calls for the
// start of the next sound frame, as a game call made during one frame is sequenced on the next. The optional
// Sonic Rush boost's sound effects play on their own DS engine and clock (nitro.js), added to the GBA's output.

import { createSynth } from './synth.js';
import { createNitro } from './nitro.js';

class M4AProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = null;
    this.rush = null;
    this.gain = 1;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'rom') this.synth = createSynth(new Uint8Array(data.rom), data.layout, sampleRate);
      else if (data.type === 'call') this.synth?.call(data.name, ...data.args);
      else if (data.type === 'gain') this.gain = data.value;
      else if (data.type === 'rush') this.rush = createNitro(data.sound, sampleRate);
      else if (data.type === 'rushSe') this.rush?.startSeqArc(...data.se);
    };
  }

  process(inputs, outputs) {
    const [left, right] = outputs[0];
    if (this.synth) this.synth.render(left, right, this.gain);
    if (this.rush) this.rush.render(left, right, this.gain);
    return true;
  }
}

registerProcessor('m4a', M4AProcessor);
