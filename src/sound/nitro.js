// Sonic Rush's own sound effects (Nintendo DS), for the optional boost: a sequence from the player's Sonic Rush
// ROM played the way the DS plays it, in three parts on the DS's clocks.
// - NitroSystem's sequence player on the ARM9 (snd_player.c and sndarc_player.c in RushRE's Sonic Rush
//   Adventure decompilation): which player a sequence takes, how many it may hold, its volume.
// - NitroSDK's sequencer and channels on the ARM7, once a sound frame: tracks reading the sequence, notes on
//   channels with their envelope, sweep and LFO, worked into the timer, volume and pan the hardware takes.
//   The ARM7's code is not decompiled; this follows its behaviour, checked against Rush's ARM7 binary (the
//   channel order, the volume shifts, the PSG timer mask) and against melonDS frame by frame (every timer,
//   volume and envelope of the boost's sound effect).
// - The DS sound hardware those settings drive (melonDS's SPU.cpp): sixteen channels of PCM, ADPCM, square
//   waves or noise, mixed every 1024 cycles.
// The sound archive and the SDK's tables come from the ROM (rush.js); the BIOS's pitch and volume tables are
// worked out here.

export const DS_HZ = 33513982;     // the ARM7's bus clock
const FRAME_CYCLES = 0xAA8 * 64;   // the sound thread's alarm: a sound frame every 174592 cycles (5.21 ms)
const MIX_CYCLES = 1024;           // the mixer: an output sample every 1024 cycles
const FULL_SCALE = 32768;          // the mixer's 16-bit output, the same 10-bit DAC swing as the GBA's ±512
const PSG_TIMER = 8006;            // a square wave's or the noise's timer at its instrument's base key

// the BIOS's tables (its GetPitchTable and GetVolumeTable calls)
const PITCH = Uint16Array.from({ length: 768 }, (_, i) => Math.round(65536 * (2 ** (i / 768) - 1)));
const VOLUME = Uint8Array.from({ length: 724 }, (_, i) => {
  const dB = i - 723, scale = dB < -240 ? 16 : dB < -120 ? 4 : dB < -60 ? 2 : 1;
  return Math.min(127, Math.round(128 * 10 ** (dB / 200) * scale));
});
VOLUME[602] = VOLUME[662] = VOLUME[722] = 126;

const PCM = 0, PSG = 1, NOISE = 2;                                 // channel types
const ATTACK = 0, DECAY = 1, SUSTAIN = 2, RELEASE = 3;             // envelope stages
const LFO_PITCH = 0, LFO_VOLUME = 1, LFO_PAN = 2;
const SYNC_START = 1, SYNC_STOP = 2, SYNC_TIMER = 4, SYNC_VOLUME = 8, SYNC_PAN = 16;
const DROP = 0, FINISH = 1;                                        // why a channel leaves its track
const INST_PCM = 1, INST_PSG = 2, INST_NOISE = 3, INST_DRUMSET = 16, INST_KEYSPLIT = 17;
const ALLOC_ORDER = [4, 5, 6, 7, 2, 0, 3, 1, 8, 9, 10, 11, 14, 12, 15, 13];
const VOLUME_SHIFT = [0, 1, 2, 4];                                 // for comparing two channels' volumes
const ARG_U8 = 0, ARG_S16 = 1, ARG_VARLEN = 2, ARG_RANDOM = 3, ARG_VARIABLE = 4;
const PLAYERS = 16, TRACKS = 32;

// the hardware's square waves, by duty (melonDS PSGTable)
const PSG_WAVE = Array.from({ length: 8 }, (_, duty) => Int16Array.from({ length: 8 }, (_, i) => (duty < 7 && i >= 7 - duty ? 0x7FFF : -0x7FFF)));
const ADPCM_STEP = Uint16Array.of(
  0x0007, 0x0008, 0x0009, 0x000A, 0x000B, 0x000C, 0x000D, 0x000E, 0x0010, 0x0011, 0x0013, 0x0015, 0x0017, 0x0019, 0x001C, 0x001F,
  0x0022, 0x0025, 0x0029, 0x002D, 0x0032, 0x0037, 0x003C, 0x0042, 0x0049, 0x0050, 0x0058, 0x0061, 0x006B, 0x0076, 0x0082, 0x008F,
  0x009D, 0x00AD, 0x00BE, 0x00D1, 0x00E6, 0x00FD, 0x0117, 0x0133, 0x0151, 0x0173, 0x0198, 0x01C1, 0x01EE, 0x0220, 0x0256, 0x0292,
  0x02D4, 0x031C, 0x036C, 0x03C3, 0x0424, 0x048E, 0x0502, 0x0583, 0x0610, 0x06AB, 0x0756, 0x0812, 0x08E0, 0x09C3, 0x0ABD, 0x0BD0,
  0x0CFF, 0x0E4C, 0x0FBA, 0x114C, 0x1307, 0x14EE, 0x1706, 0x1954, 0x1BDC, 0x1EA5, 0x21B6, 0x2515, 0x28CA, 0x2CDF, 0x315B, 0x364B,
  0x3BB9, 0x41B2, 0x4844, 0x4F7E, 0x5771, 0x602F, 0x69CE, 0x7462, 0x7FFF);
const ADPCM_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The sound archive (.sdat): its sequence archives, banks with their wave archives, and players. */
function readArchive(sdat) {
  const view = new DataView(sdat.buffer, sdat.byteOffset, sdat.byteLength);
  const u16 = (b, at) => b.view.getUint16(at, true), u32 = (b, at) => b.view.getUint32(at, true);
  const at = (bytes) => ({ bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
  const sd = at(sdat), info = view.getUint32(0x18, true), fat = view.getUint32(0x20, true);
  const record = (kind, i) => {
    const table = info + u32(sd, info + 8 + kind * 4);
    if (i < 0 || i >= u32(sd, table)) return 0;
    const p = u32(sd, table + 4 + i * 4);
    return p ? info + p : 0;
  };
  const file = id => {
    const start = u32(sd, fat + 12 + id * 16);
    return at(sdat.subarray(start, start + u32(sd, fat + 16 + id * 16)));
  };
  const banks = new Map(), waveArcs = new Map();

  function waveArc(n) {
    if (!waveArcs.has(n)) {
      const r = record(3, n), f = r ? file(u32(sd, r) & 0xFFFFFF) : null;
      waveArcs.set(n, f && (i => {
        if (i >= u32(f, 0x38)) return null;
        const w = u32(f, 0x3C + i * 4);
        // SNDWaveParam: format, loop, rate, timer, loop start and length in words; the samples follow
        return { format: f.bytes[w], loop: f.bytes[w + 1], timer: u16(f, w + 4), loopStart: u16(f, w + 6), loopLen: u32(f, w + 8), data: f.bytes.subarray(w + 12) };
      }));
    }
    return waveArcs.get(n);
  }

  function bank(n) {
    if (!banks.has(n)) {
      const r = record(2, n);
      if (!r) { banks.set(n, null); return null; }
      const f = file(u32(sd, r)), arcs = [0, 1, 2, 3].map(k => u16(sd, r + 4 + k * 2));
      const param = (type, p) => ({
        type, wave: [u16(f, p), u16(f, p + 2)], key: f.bytes[p + 4], attack: f.bytes[p + 5],
        decay: f.bytes[p + 6], sustain: f.bytes[p + 7], release: f.bytes[p + 8], pan: f.bytes[p + 9],
      });
      banks.set(n, {
        // SND_ReadInstData: a program's instrument, or for a drum set or key split the one for this key
        inst(program, key) {
          if (program < 0 || program >= u32(f, 0x38)) return null;
          const word = u32(f, 0x3C + program * 4), type = word & 0xFF, p = word >>> 8;
          if (type >= INST_PCM && type <= 5) return param(type, p);
          if (type === INST_DRUMSET) {
            const min = f.bytes[p], max = f.bytes[p + 1];
            if (key < min || key > max) return null;
            const e = p + 2 + (key - min) * 12;
            return param(f.bytes[e], e + 2);
          }
          if (type === INST_KEYSPLIT) {
            let i = 0;
            while (key > f.bytes[p + i]) if (++i >= 8) return null;
            const e = p + 8 + i * 12;
            return param(f.bytes[e], e + 2);
          }
          return null;
        },
        wave(arc, i) {
          const n = arcs[arc];
          return n === 0xFFFF || n === undefined ? null : waveArc(n)?.(i) ?? null;
        },
      });
    }
    return banks.get(n);
  }

  return {
    bank,
    /** a sequence archive's sound `index`: its data and where it starts, its bank, volume, priorities, player */
    seqArcSound(arcNo, index) {
      const r = record(1, arcNo);
      if (!r) return null;
      const f = file(u32(sd, r)), data = u32(f, 0x18);
      if (index < 0 || index >= u32(f, 0x1C)) return null;
      const e = 0x20 + index * 12, offset = u32(f, e);
      if (offset === 0xFFFFFFFF) return null;
      return {
        data: f.bytes, base: data, start: data + offset, bank: u16(f, e + 4), volume: f.bytes[e + 6],
        channelPrio: f.bytes[e + 7], playerPrio: f.bytes[e + 8], playerNo: f.bytes[e + 9],
      };
    },
    player(n) {
      const r = record(4, n);
      return r ? { seqMax: sd.bytes[r], channels: u16(sd, r + 2) } : { seqMax: 0, channels: 0 };
    },
  };
}

/** One of the sixteen hardware channels (melonDS SPUChannel), set up and started by the channels above. */
function hardwareChannel(num) {
  const h = {
    num, on: false, keyOn: false, format: 0, repeat: 0, volume: 0, shift: 4, pan: 64, duty: 0,
    reload: 0, data: null, loopPos: 0, length: 0,
    timer: 0, pos: 0, sample: 0, noise: 0x7FFF, adpcm: 0, index: 0, adpcmLoop: 0, indexLoop: 0, byte: 0,
    // SOUNDxCNT's volume, divider and pan
    setVolume(vol, div) { h.volume = vol === 127 ? 128 : vol; h.shift = [4, 3, 2, 0][div]; },
    setPan(pan) { h.pan = pan === 127 ? 128 : pan; },
    setTimer(t) { h.reload = (0x10000 - t) & 0xFFFF; },
    setup(format, vol, div, timer, pan) { h.on = false; h.format = format; h.setVolume(vol, div); h.setPan(pan); h.setTimer(timer); },
    start() { if (!h.on) { h.on = true; h.keyOn = true; } },
    run(cycles) {
      if (!h.on) return 0;
      if (h.format < 3 && h.length + h.loopPos < 16) return 0;
      if (h.keyOn) {
        h.keyOn = false;
        h.timer = h.reload; h.pos = h.format === 3 ? -1 : -3; h.noise = 0x7FFF; h.sample = 0;
      }
      h.timer += cycles;
      while (h.timer >= 0x10000) {
        h.timer = h.reload + (h.timer - 0x10000);
        next();
        if (!h.on) break;
      }
      return (h.sample << h.shift) * h.volume;
    },
  };
  const end = () => { h.sample = 0; h.on = false; };
  function next() {
    const d = h.data;
    switch (h.format) {
      case 0:   // 8-bit PCM
        if (++h.pos < 0) return;
        if (h.pos >= h.loopPos + h.length) { if (h.repeat & 1) h.pos = h.loopPos; else if (h.repeat & 2) return end(); }
        h.sample = ((d[h.pos] << 24) >> 24) << 8;
        return;
      case 1:   // 16-bit PCM
        if (++h.pos < 0) return;
        if (h.pos << 1 >= h.loopPos + h.length) { if (h.repeat & 1) h.pos = h.loopPos >> 1; else if (h.repeat & 2) return end(); }
        h.sample = (d[h.pos * 2] | (d[h.pos * 2 + 1] << 8)) << 16 >> 16;
        return;
      case 2:   // IMA-ADPCM: a header word, then a nibble a sample
        if (++h.pos < 8) {
          if (h.pos === 0) {
            h.adpcm = (d[0] | (d[1] << 8)) << 16 >> 16;
            h.index = Math.min(d[2] & 0x7F, 88);
            h.adpcmLoop = h.adpcm; h.indexLoop = h.index;
          }
          return;
        }
        if (h.pos >> 1 >= h.loopPos + h.length) {
          if (h.repeat & 1) { h.pos = h.loopPos << 1; h.adpcm = h.adpcmLoop; h.index = h.indexLoop; h.byte = d[h.pos >> 1]; }
          else if (h.repeat & 2) return end();
        } else {
          h.byte = h.pos & 1 ? h.byte >> 4 : d[h.pos >> 1];
          const step = ADPCM_STEP[h.index];
          let diff = step >> 3;
          if (h.byte & 1) diff += step >> 2;
          if (h.byte & 2) diff += step >> 1;
          if (h.byte & 4) diff += step;
          h.adpcm = h.byte & 8 ? Math.max(h.adpcm - diff, -0x7FFF) : Math.min(h.adpcm + diff, 0x7FFF);
          h.index = clamp(h.index + ADPCM_INDEX[h.byte & 7], 0, 88);
          if (h.pos === h.loopPos << 1) { h.adpcmLoop = h.adpcm; h.indexLoop = h.index; }
        }
        h.sample = h.adpcm;
        return;
      default:
        if (h.num >= 14) {   // noise
          if (h.noise & 1) { h.noise = (h.noise >> 1) ^ 0x6000; h.sample = -0x7FFF; }
          else { h.noise >>= 1; h.sample = 0x7FFF; }
        } else if (h.num >= 8) {
          h.sample = PSG_WAVE[h.duty][++h.pos & 7];
        }
    }
  }
  return h;
}

/**
 * The engine on `sound` (rush.js: the archive and the SDK's tables), mixed at `rate` Hz. startSeqArc queues a
 * sound effect for the next sound frame, as the ARM7 takes the ARM9's commands; render adds the output.
 */
export function createNitro(sound, rate) {
  const { dBsq, sine, attackTable, decibel } = sound;
  const archive = readArchive(sound.sdat);
  const hw = Array.from({ length: 16 }, (_, i) => hardwareChannel(i));
  const channels = Array.from({ length: 16 }, (_, id) => ({
    id, type: PCM, active: false, start: false, autoSweep: true, sync: 0, key: 60, rootKey: 60, velocity: 127,
    initPan: 0, userDecay: 0, userDecay2: 0, userPitch: 0, userPan: 0, panRange: 127,
    envelope: 0, envStatus: ATTACK, attack: 0, decay: 0, sustain: 0, release: 0,
    prio: 0, volume: 0, timer: 0, pan: 0, waveTimer: 0, duty: 0, wave: null,
    lfo: lfoParam(), sweepPitch: 0, sweepCounter: 0, sweepLength: 0, length: 0, track: null,
  }));
  const players = Array.from({ length: PLAYERS }, () => ({ active: false, prepared: false, tracks: [] }));
  const seqPlayers = [];   // NitroSystem's: {player (the ARM7's), playerNo, prio}, lowest priority first
  const globals = new Int16Array(16).fill(-1);
  const commands = [];
  let tracksFree = TRACKS, random = 0x12345678;
  let nextFrame = 0, nextMix = 0, curL = 0, curR = 0, frac = 1;
  const mixesPerSample = DS_HZ / rate / MIX_CYCLES;

  function lfoParam() { return { target: LFO_PITCH, speed: 16, depth: 0, range: 1, delay: 0, delayCounter: 0, counter: 0 }; }
  function calcRandom() { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random >>> 16; }

  // ---- channels (NitroSDK SND_ExChannel*) ----

  const setAttack = (ch, a) => { ch.attack = a < 109 ? 255 - a : attackTable[127 - a]; };
  const rate7 = x => (x === 127 ? 0xFFFF : x === 126 ? 0x3C00 : x < 50 ? x * 2 + 1 : Math.trunc(0x1E00 / (126 - x)));
  const setDecay = (ch, d) => { ch.decay = rate7(d); };
  const setSustain = (ch, s) => { ch.sustain = s; };
  const setRelease = (ch, r) => { ch.release = rate7(r); };

  function sinIdx(i) {
    if (i < 32) return sine[i];
    if (i < 64) return sine[32 - (i - 32)];
    if (i < 96) return -sine[i - 64];
    return -sine[32 - (i - 96)];
  }

  function calcTimer(timer, pitch) {
    let octave = 0, p = -pitch;
    while (p < 0) { octave--; p += 768; }
    while (p >= 768) { octave++; p -= 768; }
    let result = (PITCH[p] + 0x10000) * timer;
    const shift = octave - 16;
    if (shift <= 0) result = Math.floor(result / 2 ** -shift);
    else if (shift < 32) { if (result >= 2 ** (32 - shift)) return 0xFFFF; result *= 2 ** shift; }
    else return 0x10;
    return clamp(result, 0x10, 0xFFFF);
  }

  function channelVolume(dB) {
    dB = clamp(dB, -723, 0);
    const div = dB < -240 ? 3 : dB < -120 ? 2 : dB < -60 ? 1 : 0;
    return VOLUME[dB + 723] | (div << 8);
  }

  function freeChannel(ch) { ch.track = null; }

  // a channel the track no longer drives: finished (free for any use) or dropped for another note
  function leaveTrack(ch, status) {
    const track = ch.track;
    if (status === FINISH) { ch.prio = 0; freeChannel(ch); }
    if (track) track.channels.splice(track.channels.indexOf(ch), 1);
  }
  function finish(ch) {
    if (ch.track) leaveTrack(ch, FINISH);
    else ch.prio = 0;
  }

  // SND_AllocExChannel: the free or least important allowed channel, the quieter one of two equals
  function allocChannel(mask, prio, track) {
    let best = null;
    const loudness = c => ((c.volume & 0xFF) << 4) >> VOLUME_SHIFT[c.volume >> 8];
    for (const n of ALLOC_ORDER) {
      if (!(mask & (1 << n))) continue;
      const c = channels[n];
      if (best === null) { best = c; continue; }
      if (c.prio > best.prio) continue;
      if (c.prio !== best.prio || loudness(best) > loudness(c)) best = c;
    }
    if (best === null || prio < best.prio) return null;
    if (best.track) leaveTrack(best, DROP);
    best.sync = SYNC_STOP;
    best.active = false;
    Object.assign(best, {
      track, length: 0, prio, volume: 127, start: false, autoSweep: true, key: 60, rootKey: 60, velocity: 127,
      initPan: 0, userDecay: 0, userDecay2: 0, userPitch: 0, userPan: 0, panRange: 127,
      sweepPitch: 0, sweepLength: 0, sweepCounter: 0, lfo: lfoParam(),
    });
    setAttack(best, 127); setDecay(best, 127); setSustain(best, 127); setRelease(best, 127);
    return best;
  }

  // SND_NoteOn
  function noteOn(ch, key, velocity, length, bank, inst) {
    if (inst.type === INST_PCM) {
      const wave = bank.wave(inst.wave[1], inst.wave[0]);
      if (!wave) return false;
      ch.type = PCM; ch.wave = wave; ch.waveTimer = wave.timer;
    } else if (inst.type === INST_PSG) {
      ch.type = PSG; ch.duty = inst.wave[0]; ch.waveTimer = PSG_TIMER;
    } else if (inst.type === INST_NOISE) {
      ch.type = NOISE; ch.waveTimer = PSG_TIMER;
    } else return false;
    ch.envelope = -92544; ch.envStatus = ATTACK; ch.length = length;
    ch.lfo.counter = 0; ch.lfo.delayCounter = 0;
    ch.start = true; ch.active = true;
    ch.key = key; ch.rootKey = inst.key; ch.velocity = velocity;
    setAttack(ch, inst.attack); setDecay(ch, inst.decay); setSustain(ch, inst.sustain); setRelease(ch, inst.release);
    ch.initPan = inst.pan - 64;
    return true;
  }

  function envelope(ch, update) {
    if (update) {
      if (ch.envStatus === ATTACK) {
        ch.envelope = -Math.floor(-ch.envelope * ch.attack / 256);
        if (ch.envelope === 0) ch.envStatus = DECAY;
      } else if (ch.envStatus === DECAY) {
        const sustain = dBsq[ch.sustain] << 7;
        ch.envelope -= ch.decay;
        if (ch.envelope <= sustain) { ch.envelope = sustain; ch.envStatus = SUSTAIN; }
      } else if (ch.envStatus === RELEASE) ch.envelope -= ch.release;
    }
    return ch.envelope >> 7;
  }

  function sweep(ch, update) {
    if (ch.sweepPitch === 0 || ch.sweepCounter >= ch.sweepLength) return 0;
    const result = Math.trunc(ch.sweepPitch * (ch.sweepLength - ch.sweepCounter) / ch.sweepLength);
    if (update && ch.autoSweep) ch.sweepCounter++;
    return result;
  }

  // the LFO's value before this frame's step
  function lfo(ch, update) {
    const l = ch.lfo;
    let value = 0;
    if (l.depth !== 0 && l.delayCounter >= l.delay) value = sinIdx(l.counter >> 8) * l.depth * l.range;
    if (value !== 0) value = Math.floor((l.target === LFO_VOLUME ? value * 60 : value * 64) / 16384);
    if (update) {
      if (l.delayCounter < l.delay) l.delayCounter++;
      else {
        const sum = l.counter + (l.speed << 6);
        l.counter = (sum & 0xFF) | (((sum >> 8) % 128) << 8);
      }
    }
    return value;
  }

  // SND_ExChannelMain: each channel's volume, timer and pan for the hardware, marked for the next frame
  function exChannelMain(update) {
    for (const ch of channels) {
      if (!ch.active) continue;
      if (ch.start) { ch.sync |= SYNC_START; ch.start = false; }
      else if (!hw[ch.id].on) { finish(ch); ch.volume = 0; ch.active = false; continue; }
      let vol = dBsq[ch.velocity], pitch = (ch.key - ch.rootKey) * 64;
      vol += envelope(ch, update);
      pitch += sweep(ch, update);
      vol += ch.userDecay + ch.userDecay2;
      pitch += ch.userPitch;
      const mod = lfo(ch, update);
      let pan = ch.initPan;
      if (ch.panRange !== 127) pan = (pan * ch.panRange + 0x40) >> 7;
      pan += ch.userPan;
      if (ch.lfo.target === LFO_VOLUME) { if (vol > -0x8000) vol += mod; }
      else if (ch.lfo.target === LFO_PAN) pan += mod;
      else pitch += mod;
      if (ch.envStatus === RELEASE && vol <= -723) {
        ch.sync = SYNC_STOP;
        finish(ch);
        ch.volume = 0;
        ch.active = false;
        continue;
      }
      const volume = channelVolume(vol);
      let timer = calcTimer(ch.waveTimer, pitch);
      if (ch.type === PSG) timer &= 0xFFFC;
      pan = clamp(pan + 64, 0, 127);
      if (volume !== ch.volume) { ch.volume = volume; ch.sync |= SYNC_VOLUME; }
      if (timer !== ch.timer) { ch.timer = timer; ch.sync |= SYNC_TIMER; }
      if (pan !== ch.pan) { ch.pan = pan; ch.sync |= SYNC_PAN; }
    }
  }

  // SND_UpdateExChannel: last frame's settings to the hardware, the new notes started together
  function updateExChannels() {
    for (const ch of channels) {
      if (!ch.sync) continue;
      const h = hw[ch.id], vol = ch.volume & 0xFF, div = ch.volume >> 8;
      if (ch.sync & SYNC_STOP) h.on = false;
      if (ch.sync & SYNC_START) {
        if (ch.type === PCM) {
          const w = ch.wave;
          h.setup(w.format, vol, div, ch.timer, ch.pan);
          h.data = w.data; h.repeat = w.loop ? 1 : 2; h.loopPos = w.loopStart << 2; h.length = (w.loopLen & 0x1FFFFF) << 2;
        } else {
          h.setup(3, vol, div, ch.timer, ch.pan);
          h.duty = ch.duty;
        }
      } else {
        if (ch.sync & SYNC_TIMER) h.setTimer(ch.timer);
        if (ch.sync & SYNC_VOLUME) h.setVolume(vol, div);
        if (ch.sync & SYNC_PAN) h.setPan(ch.pan);
      }
    }
    for (const ch of channels) {
      if (ch.sync & SYNC_START) hw[ch.id].start();
      ch.sync = 0;
    }
  }

  // ---- the sequencer (NitroSDK SND_Seq*) ----

  function newTrack(data, base, start) {
    tracksFree--;
    return {
      data, base, cur: start, noteWait: true, muted: false, tie: false, noteFinishWait: false, portamento: false,
      cmp: true, channelMask: 0xFFFF, stack: [], loops: [], program: 0, prio: 64, volume: 127, volume2: 127,
      extFader: 0, pan: 0, extPan: 0, pitchBend: 0, extPitch: 0, attack: 0xFF, decay: 0xFF, sustain: 0xFF,
      release: 0xFF, panRange: 127, bendRange: 2, portaKey: 60, portaTime: 0, sweepPitch: 0, transpose: 0,
      mod: lfoParam(), wait: 0, channels: [],
    };
  }

  function releaseChannels(track, player, release) {
    updateTrackChannels(track, player, false);
    for (const ch of track.channels) {
      if (!ch.active) continue;
      if (release >= 0) setRelease(ch, release & 0xFF);
      ch.prio = 1;
      ch.envStatus = RELEASE;
    }
  }
  function freeChannels(track) {
    for (const ch of track.channels) freeChannel(ch);
    track.channels = [];
  }
  function stopTrack(player, i) {
    const track = player.tracks[i];
    if (!track) return;
    releaseChannels(track, player, -1);
    freeChannels(track);
    player.tracks[i] = null;
    tracksFree++;
  }
  function stopPlayer(player) {
    for (let i = 0; i < 16; i++) stopTrack(player, i);
    player.active = false;
  }

  // TrackUpdateChannel: the track's volume, pitch, pan and LFO onto its notes; a note whose length ran out is let go
  function updateTrackChannels(track, player, release) {
    const vol = Math.max(dBsq[track.volume] + dBsq[track.volume2] + dBsq[player.volume], -0x8000);
    const fader = Math.max(track.extFader + player.extFader, -0x8000);
    const pitch = ((track.pitchBend * (track.bendRange << 6)) >> 7) + track.extPitch;
    let pan = track.pan;
    if (track.panRange !== 127) pan = (pan * track.panRange + 0x40) >> 7;
    pan += track.extPan;
    for (const ch of track.channels) {
      ch.userDecay2 = fader;
      if (ch.envStatus === RELEASE) continue;
      ch.userDecay = vol;
      ch.userPitch = pitch;
      ch.userPan = pan;
      ch.panRange = track.panRange;
      const { target, speed, depth, range, delay } = track.mod;
      Object.assign(ch.lfo, { target, speed, depth, range, delay });
      if (ch.length === 0 && release) { ch.prio = 1; ch.envStatus = RELEASE; }
    }
  }

  function playNote(track, player, key, velocity, length) {
    let ch = null;
    if (track.tie) {
      ch = track.channels[0] ?? null;
      if (ch) { ch.key = key; ch.velocity = velocity; }
    }
    if (!ch) {
      const inst = player.bank?.inst(track.program, key);
      if (!inst) return;
      const allowed = inst.type === INST_PCM || inst.type === 4 ? 0xFFFF : inst.type === INST_PSG ? 0x3F00 : inst.type === INST_NOISE ? 0xC000 : 0;
      if (!allowed) return;
      ch = allocChannel(allowed & track.channelMask, player.prio + track.prio, track);
      if (!ch) return;
      if (track.tie) length = -1;
      if (!noteOn(ch, key, velocity, length, player.bank, inst)) { ch.prio = 0; freeChannel(ch); return; }
      track.channels.unshift(ch);
    }
    if (track.attack !== 0xFF) setAttack(ch, track.attack);
    if (track.decay !== 0xFF) setDecay(ch, track.decay);
    if (track.sustain !== 0xFF) setSustain(ch, track.sustain);
    if (track.release !== 0xFF) setRelease(ch, track.release);
    ch.sweepPitch = track.sweepPitch;
    if (track.portamento) ch.sweepPitch += (track.portaKey - key) << 6;
    if (track.portaTime === 0) { ch.sweepLength = length; ch.autoSweep = false; }
    else ch.sweepLength = (track.portaTime * track.portaTime * Math.abs(ch.sweepPitch)) >> 11;
    ch.sweepCounter = 0;
  }

  function variable(player, n) {
    if (n < 16) return { get: () => player.vars[n], set: v => { player.vars[n] = v; } };
    if (n < 32) return { get: () => globals[n - 16], set: v => { globals[n - 16] = v; } };
    return null;
  }

  // TrackStepTicks: one tick of a track; false once it reads the end of its sequence
  function stepTrack(track, player) {
    const d = track.data;
    for (const ch of track.channels) {
      if (ch.length > 0) ch.length--;
      if (!ch.autoSweep && ch.sweepCounter < ch.sweepLength) ch.sweepCounter++;
    }
    if (track.noteFinishWait) {
      if (track.channels.length) return true;
      track.noteFinishWait = false;
    }
    if (track.wait > 0 && --track.wait > 0) return true;
    const u8 = () => d[track.cur++];
    const u16 = () => { const v = d[track.cur] | (d[track.cur + 1] << 8); track.cur += 2; return v; };
    const u24 = () => { const v = d[track.cur] | (d[track.cur + 1] << 8) | (d[track.cur + 2] << 16); track.cur += 3; return v; };
    const arg = type => {
      if (type === ARG_U8) return u8();
      if (type === ARG_S16) return (u16() << 16) >> 16;
      if (type === ARG_VARLEN) { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7F); } while (b & 0x80); return v; }
      if (type === ARG_RANDOM) { const lo = (u16() << 16) >> 16, hi = (u16() << 16) >> 16; return lo + ((calcRandom() * (hi - lo + 1)) >> 16); }
      return variable(player, u8())?.get() ?? 0;
    };
    while (track.wait === 0 && !track.noteFinishWait) {
      let cmd = u8(), execute = true, type = null;
      if (cmd === 0xA2) { cmd = u8(); execute = track.cmp; }
      if (cmd === 0xA0) { cmd = u8(); type = ARG_RANDOM; }
      if (cmd === 0xA1) { cmd = u8(); type = ARG_VARIABLE; }
      if (cmd < 0x80) {   // a note: its velocity and length
        const velocity = u8(), length = arg(type ?? ARG_VARLEN);
        if (!execute) continue;
        const key = clamp(cmd + track.transpose, 0, 127);
        if (!track.muted) playNote(track, player, key, velocity, length);
        track.portaKey = key;
        if (track.noteWait) { track.wait = length; if (length === 0) track.noteFinishWait = true; }
        continue;
      }
      switch (cmd & 0xF0) {
        case 0x80: {
          const v = arg(type ?? ARG_VARLEN);
          if (!execute) break;
          if (cmd === 0x80) track.wait = v;
          else if (cmd === 0x81 && v < 0x10000) track.program = v;
          break;
        }
        case 0x90:
          if (cmd === 0x93) {   // open a track at an offset
            const n = u8(), off = u24();
            if (execute) {
              const other = player.tracks[n];
              if (other && other !== track) {
                releaseChannels(other, player, -1); freeChannels(other);
                other.cur = track.base + off;
              }
            }
          } else if (cmd === 0x94) { const off = u24(); if (execute) track.cur = track.base + off; }
          else if (cmd === 0x95) {
            const off = u24();
            if (execute && track.stack.length < 3) { track.stack.push(track.cur); track.loops.push(0); track.cur = track.base + off; }
          }
          break;
        case 0xC0: case 0xD0: {
          const v = arg(type ?? ARG_U8);
          if (!execute) break;
          const s8 = (v << 24) >> 24;
          switch (cmd) {
            case 0xC0: track.pan = v - 64; break;
            case 0xC1: track.volume = v; break;
            case 0xC2: player.volume = v; break;
            case 0xC3: track.transpose = s8; break;
            case 0xC4: track.pitchBend = s8; break;
            case 0xC5: track.bendRange = v; break;
            case 0xC6: track.prio = v; break;
            case 0xC7: track.noteWait = (v & 1) === 1; break;
            case 0xC8: track.tie = (v & 1) === 1; releaseChannels(track, player, -1); freeChannels(track); break;
            case 0xC9: track.portaKey = v + track.transpose; track.portamento = true; break;
            case 0xCA: track.mod.depth = v; break;
            case 0xCB: track.mod.speed = v; break;
            case 0xCC: track.mod.target = v; break;
            case 0xCD: track.mod.range = v; break;
            case 0xCE: track.portamento = (v & 1) === 1; break;
            case 0xCF: track.portaTime = v; break;
            case 0xD0: track.attack = v; break;
            case 0xD1: track.decay = v; break;
            case 0xD2: track.sustain = v; break;
            case 0xD3: track.release = v; break;
            case 0xD4: if (track.stack.length < 3) { track.stack.push(track.cur); track.loops.push(v); } break;
            case 0xD5: track.volume2 = v; break;
            case 0xD7:   // mute: off, no new notes, and also let go of the notes or stop them
              track.muted = v !== 0;
              if (v === 2) releaseChannels(track, player, -1);
              else if (v === 3) { releaseChannels(track, player, 127); freeChannels(track); }
              break;
          }
          break;
        }
        case 0xE0: {
          const v = arg(type ?? ARG_S16);
          if (!execute) break;
          if (cmd === 0xE0) track.mod.delay = v & 0xFFFF;
          else if (cmd === 0xE1) player.tempo = v;
          else if (cmd === 0xE3) track.sweepPitch = v;
          break;
        }
        case 0xB0: {   // the sequence's variables
          const ref = variable(player, u8()), v = arg(type ?? ARG_S16);
          if (!execute || !ref) break;
          const x = ref.get(), s16 = n => (n << 16) >> 16;
          switch (cmd) {
            case 0xB0: ref.set(v); break;
            case 0xB1: ref.set(s16(x + v)); break;
            case 0xB2: ref.set(s16(x - v)); break;
            case 0xB3: ref.set(s16(x * v)); break;
            case 0xB4: if (v !== 0) ref.set(s16(Math.trunc(x / v))); break;
            case 0xB5: ref.set(s16(v >= 0 ? x << v : x >> -v)); break;
            case 0xB6: { const r = (calcRandom() * (Math.abs(v) + 1)) >> 16; ref.set(v < 0 ? -r : r); break; }
            case 0xB8: track.cmp = x === v; break;
            case 0xB9: track.cmp = x >= v; break;
            case 0xBA: track.cmp = x > v; break;
            case 0xBB: track.cmp = x <= v; break;
            case 0xBC: track.cmp = x < v; break;
            case 0xBD: track.cmp = x !== v; break;
          }
          break;
        }
        case 0xF0:
          if (cmd === 0xFC) {   // the end of a loop
            if (!execute || !track.stack.length) break;
            const top = track.stack.length - 1;
            let count = track.loops[top];
            if (count !== 0 && --count === 0) { track.stack.pop(); track.loops.pop(); break; }
            track.loops[top] = count;
            track.cur = track.stack[top];
          } else if (cmd === 0xFD) {
            if (execute && track.stack.length) { track.loops.pop(); track.cur = track.stack.pop(); }
          } else if (cmd === 0xFE) u16();
          else if (cmd === 0xFF && execute) return false;
          break;
      }
    }
    return true;
  }

  function seqMain(update) {
    for (const player of players) {
      if (!player.active || !player.prepared) continue;
      if (update && !player.paused) {
        let ticks = 0;
        while (player.tempoCounter >= 240) { player.tempoCounter -= 240; ticks++; }
        for (let t = 0; t < ticks; t++) {
          let playing = false;
          player.tracks.forEach((track, i) => {
            if (!track || track.cur === null) return;
            if (stepTrack(track, player)) playing = true;
            else stopTrack(player, i);
          });
          if (!playing) { stopPlayer(player); break; }
        }
        player.tempoCounter += (player.tempo * player.tempoRatio) >> 8;
      }
      for (const track of player.tracks) if (track) updateTrackChannels(track, player, true);
    }
  }

  // SND_PrepareSeq and SND_StartPreparedSeq: a player's first track at the sound, more if it opens with 0xFE
  function startSeq(player, sound, bank) {
    if (player.active) stopPlayer(player);
    Object.assign(player, {
      active: true, prepared: false, paused: false, tempo: 120, tempoRatio: 256, tempoCounter: 240, volume: 127,
      extFader: 0, prio: 64, bank, tracks: Array(16).fill(null), vars: new Int16Array(16).fill(-1),
    });
    if (tracksFree <= 0) return;
    const first = newTrack(sound.data, sound.base, sound.start);
    player.tracks[0] = first;
    if (sound.data[first.cur] === 0xFE) {
      const d = sound.data, mask = d[first.cur + 1] | (d[first.cur + 2] << 8);
      first.cur += 3;
      for (let i = 1, m = mask >> 1; m; i++, m >>= 1) {
        if (!(m & 1)) continue;
        if (tracksFree <= 0) break;
        player.tracks[i] = newTrack(sound.data, sound.base, null);   // idle until a track opens it
      }
    }
    player.prepared = true;
  }

  // NitroSystem's NNS_SndArcPlayerStartSeqArc, as Rush's PlaySfxEx calls it (its sound effect volume 127)
  function startSeqArc(arcNo, index) {
    const sound = archive.seqArcSound(arcNo, index);
    if (!sound) return;
    for (let i = seqPlayers.length - 1; i >= 0; i--) if (!seqPlayers[i].player.active) seqPlayers.splice(i, 1);
    const prio = sound.playerPrio, mine = seqPlayers.filter(s => s.playerNo === sound.playerNo);
    if (mine.length >= archive.player(sound.playerNo).seqMax) {
      if (!mine.length || prio < mine[0].prio) return;
      stopSeqPlayer(mine[0]);
    }
    let player = players.find(p => !p.active);
    if (!player) {
      const lowest = seqPlayers.reduce((a, s) => (s.prio < a.prio ? s : a), seqPlayers[0]);
      if (!lowest || prio < lowest.prio) return;
      stopSeqPlayer(lowest);
      player = lowest.player;
    }
    const at = seqPlayers.findIndex(s => prio < s.prio);
    seqPlayers.splice(at < 0 ? seqPlayers.length : at, 0, { player, playerNo: sound.playerNo, prio });
    startSeq(player, sound, archive.bank(sound.bank));
    player.prio = sound.channelPrio;
    const dB = v => decibel[clamp(v, 0, 127)];
    player.extFader = clamp(dB(sound.volume) + dB(127) + dB(127) + dB(127), -32768, 32767);
  }
  function stopSeqPlayer(s) {
    stopPlayer(s.player);
    seqPlayers.splice(seqPlayers.indexOf(s), 1);
  }

  // ---- the sound thread and the mixer ----

  function soundFrame() {
    updateExChannels();
    for (const [arc, index] of commands.splice(0)) startSeqArc(arc, index);
    seqMain(true);
    exChannelMain(true);
    calcRandom();
  }

  function mix() {
    let left = 0, right = 0;
    for (const h of hw) {
      if (!h.on) continue;
      const v = h.run(MIX_CYCLES >> 1);
      left += Math.floor(v * (128 - h.pan) / 1024);
      right += Math.floor(v * h.pan / 1024);
    }
    curL = clamp(left >> 8, -0x8000, 0x7FFF);   // the master volume, 127, mixes at full
    curR = clamp(right >> 8, -0x8000, 0x7FFF);
  }

  function step() {
    while (nextFrame <= nextMix) { soundFrame(); nextFrame += FRAME_CYCLES; }
    mix();
    nextMix += MIX_CYCLES;
  }

  return {
    /** Plays sound `index` of sequence archive `arcNo`, from the next sound frame. */
    startSeqArc(arcNo, index) { commands.push([arcNo, index]); },
    /** Adds the next samples to `left` and `right`, in [-1, 1] times `gain`. */
    render(left, right, gain = 1) {
      const scale = gain / (mixesPerSample * FULL_SCALE);
      for (let j = 0; j < left.length; j++) {
        let need = mixesPerSample, l = 0, r = 0;
        while (need > 1e-9) {
          if (frac >= 1) { step(); frac -= 1; }
          const take = Math.min(1 - frac, need);
          l += curL * take; r += curR * take;
          frac += take; need -= take;
        }
        left[j] += l * scale; right[j] += r * scale;
      }
    },
    /** For checks: runs one sound frame on its own and shows the channels it left for the hardware. */
    debugFrame() { soundFrame(); return channels; },
  };
}
