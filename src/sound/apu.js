// The GBA's sound hardware as the engine drives it: the registers at 0x04000060–0x040000AF, the four Game Boy
// channels (two squares, wave, noise) with their sweep, envelopes, length counters and wave RAM banks, and the
// final mix with the two DirectSound FIFOs, the bias and the 10-bit clip (GBATEK "GBA Sound Controller", Pan
// Docs "Audio"). Time is counted in CPU cycles at 2^24 Hz; the mix is sampled every 256 cycles (65536 Hz),
// the PWM rate SA1 selects.

export const CPU_HZ = 16777216, TICK = 256;
const SEQ_PERIOD = 32768;   // the frame sequencer steps at 512 Hz
const DUTY = [[0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 1, 1], [0, 1, 1, 1, 1, 1, 1, 0]];

const envelope = () => ({ vol: 0, up: false, period: 0, timer: 0 });
function startEnvelope(e, nrx2) { e.vol = nrx2 >> 4; e.up = !!(nrx2 & 8); e.period = nrx2 & 7; e.timer = e.period || 8; }
function stepEnvelope(e) {
  if (!e.period) return;
  if (--e.timer > 0) return;
  e.timer = e.period;
  if (e.up && e.vol < 15) e.vol++;
  else if (!e.up && e.vol > 0) e.vol--;
}

export function createApu() {
  const regs = new Uint8Array(0x50);
  const reg = r => regs[r - 0x60];
  // two banks of 32 four-bit samples. The playing bank rotates by one sample per step, so `rot` is where its
  // first byte now starts; a retrigger does not rewind it
  const wave = [new Uint8Array(32), new Uint8Array(32)], rot = [0, 0];
  const sq = [0, 1].map(() => ({ on: false, len: 0, freq: 0, timer: 0, pos: 0, env: envelope() }));
  const sweep = { timer: 0, on: false, shadow: 0 };
  const ch3 = { on: false, len: 0, freq: 0, timer: 0, sample: 0 };
  const ch4 = { on: false, len: 0, timer: 0, lfsr: 0x7FFF, out: 0, env: envelope() };
  let seqTimer = SEQ_PERIOD, seqStep = 0;
  regs[0x89 - 0x60] = 0x02;   // SOUNDBIAS resets to 0x200, the middle of the 10-bit range

  const sqBase = i => (i ? 0x68 : 0x62);
  const sqPeriod = c => (2048 - c.freq) * 16;
  const wavePeriod = () => (2048 - ch3.freq) * 8;
  function noisePeriod() {
    const v = reg(0x7C), r = v & 7, s = v >> 4;
    return s >= 14 ? 0 : ((r ? r * 16 : 8) << s) * 4;
  }
  const lengthOn = nrx4 => !!(reg(nrx4) & 0x40);

  function sweepNext() {
    const v = reg(0x60), d = sweep.shadow >> (v & 7);
    const f = v & 8 ? sweep.shadow - d : sweep.shadow + d;
    if (f > 2047) sq[0].on = false;
    return f;
  }

  function trigger(ch) {
    if (ch < 2) {
      const c = sq[ch], b = sqBase(ch);
      c.on = (reg(b + 1) & 0xF8) !== 0;   // the duty step keeps its phase
      if (!c.len) c.len = 64;
      startEnvelope(c.env, reg(b + 1));
      if (ch === 0) {
        const v = reg(0x60), period = (v >> 4) & 7;
        sweep.shadow = c.freq; sweep.timer = period || 8; sweep.on = !!(period || (v & 7));
        if (v & 7) sweepNext();
      }
    } else if (ch === 2) {
      ch3.on = !!(reg(0x70) & 0x80);
      if (!ch3.len) ch3.len = 256;
      ch3.timer = wavePeriod();
    } else {
      ch4.on = (reg(0x79) & 0xF8) !== 0;
      if (!ch4.len) ch4.len = 64;
      ch4.lfsr = reg(0x7C) & 8 ? 0x7F : 0x7FFF; ch4.timer = noisePeriod();
      startEnvelope(ch4.env, reg(0x79));
    }
  }

  function write(r, v) {
    v &= 0xFF;
    if (r >= 0x90 && r < 0xA0) {
      // the CPU sees the bank that is not playing
      const b = ((reg(0x70) >> 6) & 1) ^ 1, i = (r - 0x90) * 2;
      wave[b][(i + rot[b]) & 31] = v >> 4; wave[b][(i + 1 + rot[b]) & 31] = v & 15;
      return;
    }
    if (r < 0x60 || r >= 0xB0) return;
    if (r < 0x82 && !(reg(0x84) & 0x80)) return;   // the PSG registers ignore writes while the PSG is off
    regs[r - 0x60] = v;
    switch (r) {
      case 0x62: case 0x68: sq[r === 0x62 ? 0 : 1].len = 64 - (v & 63); break;
      case 0x63: case 0x69: if (!(v & 0xF8)) sq[r === 0x63 ? 0 : 1].on = false; break;
      case 0x64: case 0x6C: { const c = sq[r === 0x64 ? 0 : 1]; c.freq = (c.freq & 0x700) | v; break; }
      case 0x65: case 0x6D: {
        const i = r === 0x65 ? 0 : 1, c = sq[i];
        c.freq = (c.freq & 0xFF) | (v & 7) << 8;
        if (v & 0x80) trigger(i);
        break;
      }
      case 0x70: if (!(v & 0x80)) ch3.on = false; break;
      case 0x72: ch3.len = 256 - v; break;
      case 0x74: ch3.freq = (ch3.freq & 0x700) | v; break;
      case 0x75: ch3.freq = (ch3.freq & 0xFF) | (v & 7) << 8; if (v & 0x80) trigger(2); break;
      case 0x78: ch4.len = 64 - (v & 63); break;
      case 0x79: if (!(v & 0xF8)) ch4.on = false; break;
      case 0x7D: if (v & 0x80) trigger(3); break;
      case 0x84:
        if (!(v & 0x80)) {
          regs.fill(0, 0, 0x22);
          for (const c of [...sq, ch3, ch4]) c.on = false;
        }
        break;
    }
  }

  function read(r) {
    if (r >= 0x90 && r < 0xA0) {
      const b = ((reg(0x70) >> 6) & 1) ^ 1, i = (r - 0x90) * 2;
      return wave[b][(i + rot[b]) & 31] << 4 | wave[b][(i + 1 + rot[b]) & 31];
    }
    return regs[r - 0x60];
  }

  function frameSequencer() {
    if (!(seqStep & 1)) {
      // length counters, 256 Hz
      if (lengthOn(0x65) && sq[0].len && !--sq[0].len) sq[0].on = false;
      if (lengthOn(0x6D) && sq[1].len && !--sq[1].len) sq[1].on = false;
      if (lengthOn(0x75) && ch3.len && !--ch3.len) ch3.on = false;
      if (lengthOn(0x7D) && ch4.len && !--ch4.len) ch4.on = false;
    }
    if (seqStep === 2 || seqStep === 6) {
      // frequency sweep, 128 Hz
      const v = reg(0x60), period = (v >> 4) & 7;
      if (--sweep.timer <= 0) {
        sweep.timer = period || 8;
        if (sweep.on && period) {
          const f = sweepNext();
          if (f <= 2047 && (v & 7)) { sweep.shadow = f; sq[0].freq = f; sweepNext(); }
        }
      }
    }
    if (seqStep === 7) { stepEnvelope(sq[0].env); stepEnvelope(sq[1].env); stepEnvelope(ch4.env); }
    seqStep = (seqStep + 1) & 7;
  }

  // the next wave sample: the one at the front of the playing bank (both banks in 64-sample mode)
  function stepWave() {
    const b = (reg(0x70) >> 6) & 1;
    if (!(reg(0x70) & 0x20)) { ch3.sample = wave[b][rot[b]]; rot[b] = (rot[b] + 1) & 31; return; }
    // one 64-sample ring through both banks: the front of the playing bank moves to the end of the other one
    ch3.sample = wave[b][rot[b]];
    const carry = wave[b ^ 1][rot[b ^ 1]];
    wave[b][rot[b]] = carry; wave[b ^ 1][rot[b ^ 1]] = ch3.sample;
    rot[0] = (rot[0] + 1) & 31; rot[1] = (rot[1] + 1) & 31;
  }

  // advances every oscillator by `cycles`; the squares' duty steps run even while they are silent
  function run(cycles) {
    if (!(reg(0x84) & 0x80)) return;
    for (const c of sq) {
      c.timer -= cycles;
      while (c.timer <= 0) { c.timer += sqPeriod(c); c.pos = (c.pos + 1) & 7; }
    }
    if (ch3.on) {
      ch3.timer -= cycles;
      while (ch3.timer <= 0) { ch3.timer += wavePeriod(); stepWave(); }
    }
    if (ch4.on) {
      const period = noisePeriod();
      if (period) {
        ch4.timer -= cycles;
        while (ch4.timer <= 0) {
          ch4.timer += period;
          // the LFSR in its shift-and-xor form; the bit shifted out is the output
          ch4.out = ch4.lfsr & 1;
          ch4.lfsr >>= 1;
          if (ch4.out) ch4.lfsr ^= reg(0x7C) & 8 ? 0x60 : 0x6000;
        }
      }
    }
    seqTimer -= cycles;
    while (seqTimer <= 0) { seqTimer += SEQ_PERIOD; frameSequencer(); }
  }

  function waveSample() {
    const v = reg(0x73), s = ch3.sample;
    if (v & 0x80) return (s * 3) >> 2;
    const code = (v >> 5) & 3;
    return code ? s >> (code - 1) : 0;
  }

  /** The output for this instant, given the DirectSound samples now playing on FIFO A and B, as offsets
   *  around the bias in 10-bit units: [left, right]. */
  function mix(fifoA, fifoB) {
    const on = !!(reg(0x84) & 0x80), nr51 = reg(0x81);
    const s1 = on && sq[0].on ? DUTY[reg(0x62) >> 6][sq[0].pos] * sq[0].env.vol : 0;
    const s2 = on && sq[1].on ? DUTY[reg(0x68) >> 6][sq[1].pos] * sq[1].env.vol : 0;
    const s3 = on && ch3.on ? waveSample() : 0;
    const s4 = on && ch4.on ? ch4.out * ch4.env.vol : 0;
    let r = (nr51 & 1 ? s1 : 0) + (nr51 & 2 ? s2 : 0) + (nr51 & 4 ? s3 : 0) + (nr51 & 8 ? s4 : 0);
    let l = (nr51 & 0x10 ? s1 : 0) + (nr51 & 0x20 ? s2 : 0) + (nr51 & 0x40 ? s3 : 0) + (nr51 & 0x80 ? s4 : 0);
    const nr50 = reg(0x80), cnt = reg(0x82) | reg(0x83) << 8, shift = 4 - (cnt & 3);
    r = ((r << 3) * (1 + (nr50 & 7))) >> shift;
    l = ((l << 3) * (1 + ((nr50 >> 4) & 7))) >> shift;
    const a = fifoA << (cnt & 4 ? 2 : 1), b = fifoB << (cnt & 8 ? 2 : 1);
    if (cnt & 0x100) r += a;
    if (cnt & 0x200) l += a;
    if (cnt & 0x1000) r += b;
    if (cnt & 0x2000) l += b;
    const bias = (reg(0x88) | reg(0x89) << 8) & 0x3FE;
    const clip = x => Math.min(0x3FF, Math.max(0, x + bias)) - bias;
    return [clip(l), clip(r)];
  }

  return { read, write, run, mix, regs };
}
