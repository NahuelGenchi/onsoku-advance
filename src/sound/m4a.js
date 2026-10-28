// The game's sound engine: Nintendo's MusicPlayer2000 ("m4a", "Sappy"), as SA1 builds and configures it (SAT-R
// decompilation, src/lib/m4a/m4a.c and m4a0.s). It reads the songs, voices and samples straight from the ROM and
// runs once per GBA frame: the four music players step their sequences, the PSG channels get their register
// writes, and the DirectSound mixer writes the 176 signed 8-bit samples per side that play during the next
// frame. Every integer step follows the original, so the mixed bytes match the hardware's byte for byte.

const ROM_BASE = 0x08000000;

// SA1's sound mode (DEFAULT_SOUND_MODE): 5 DirectSound channels, master volume 15, no reverb, 10512 Hz
const NUM_CHANS = 5, MASTER_VOL = 15, SAMPLES = 176, FRAMES_PER_DMA = 9, DIV_FREQ = 798, HALF = 1584;

// channel status bits
const START = 0x80, STOP = 0x40, LOOP = 0x10, IEC = 0x04, ENV = 0x03, ON = START | STOP | IEC | ENV;
// track flags
const EXIST = 0x80, TRACK_START = 0x40, VOLCHG = 0x03, PITCHG = 0x0C;
const PAUSE = 0x80000000;
// what a PSG channel needs written this frame
const MO_VOL = 1, MO_PIT = 2;

const s8 = v => (v << 24) >> 24;
const u8 = v => v & 0xFF;

// note and wait lengths in ticks: 0–24, then 28 … 96
const CLOCK = [...Array(25).keys(), 28, 30, 32, 36, 40, 42, 44, 48, 52, 54, 56, 60, 64, 66, 68, 72, 76, 78, 80, 84, 88, 90, 92, 96];
// 2^31 · 2^(n/12): one octave of DirectSound pitch ratios
const FREQ = Array.from({ length: 12 }, (_, n) => Math.round(2 ** 31 * 2 ** (n / 12)));
// PSG frequency registers for the top octave, as 11-bit values minus 2048
const CGB_FREQ = [-2004, -1891, -1785, -1685, -1591, -1501, -1417, -1337, -1262, -1192, -1125, -1062];
// noise: clock shift and divider from high to low, three dividers per shift, then the fastest four
const NOISE = [...Array.from({ length: 56 }, (_, i) => ((13 - (i >> 2)) << 4) | (7 - (i & 3))), 3, 2, 1, 0];
// wave channel output level (NR32) for each envelope volume
const CGB3_VOL = [0x00, 0x00, 0x60, 0x60, 0x60, 0x60, 0x40, 0x40, 0x40, 0x40, 0x80, 0x80, 0x80, 0x80, 0x20, 0x20];

// the PSG registers each channel uses (offsets from 0x04000000); channels 2 and 4 have no NRx0 of their own
const CGB_REGS = [
  [0x60, 0x62, 0x63, 0x64, 0x65],
  [0x61, 0x68, 0x69, 0x6C, 0x6D],
  [0x70, 0x72, 0x73, 0x74, 0x75],
  [0x71, 0x78, 0x79, 0x7C, 0x7D],
];
export const NR10 = 0x60, NR30 = 0x70, NR32 = 0x73, NR34 = 0x75, NR50 = 0x80, NR51 = 0x81, SOUNDCNT_H = 0x82,
  SOUNDCNT_X = 0x84, SOUNDBIAS_H = 0x89, WAVE_RAM = 0x90;

// high 32 bits of an unsigned 32 × 32 bit product
function umulhi(a, b) {
  const a0 = a & 0xFFFF, a1 = a >>> 16, b0 = b & 0xFFFF, b1 = b >>> 16;
  const m1 = a1 * b0, m2 = a0 * b1;
  const carry = (((a0 * b0) >>> 16) + (m1 & 0xFFFF) + (m2 & 0xFFFF)) >>> 16;
  return (a1 * b1 + (m1 >>> 16) + (m2 >>> 16) + carry) >>> 0;
}

function voiceAt(bytes, at) {
  const w = i => (bytes[at + i] | bytes[at + i + 1] << 8 | bytes[at + i + 2] << 16 | bytes[at + i + 3] << 24) >>> 0;
  return {
    type: bytes[at], key: bytes[at + 1], length: bytes[at + 2], panSweep: bytes[at + 3], wav: w(4),
    attack: bytes[at + 8], decay: bytes[at + 9], sustain: bytes[at + 10], release: bytes[at + 11],
  };
}
const NO_VOICE = { type: 0, key: 0, length: 0, panSweep: 0, wav: 0, attack: 0, decay: 0, sustain: 0, release: 0 };

function newTrack(addr) {
  return {
    addr, flags: 0, wait: 0, patternLevel: 0, repN: 0, gateTime: 0, key: 0, velocity: 0, runningStatus: 0,
    keyShiftCalc: 0, pitchCalc: 0, keyShift: 0, keyShiftPublic: 0, tune: 0, pitchPublic: 0, bend: 0, bendRange: 0,
    volRCalc: 0, volLCalc: 0, vol: 0, volPublic: 0, pan: 0, panPublic: 0, modCalc: 0, modDepth: 0, modType: 0,
    lfoSpeed: 0, lfoSpeedCounter: 0, lfoDelay: 0, lfoDelayCounter: 0, priority: 0, echoVolume: 0, echoLength: 0,
    chan: null, voice: NO_VOICE, cmdPtr: 0, patternStack: [0, 0, 0],
  };
}

// what the first tick after a start clears: everything before the command pointer
function clearTrack(T) {
  Object.assign(T, newTrack(T.addr), { cmdPtr: T.cmdPtr, patternStack: T.patternStack });
  T.flags = EXIST; T.bendRange = 2; T.volPublic = 64; T.lfoSpeed = 22; T.voice = { ...NO_VOICE, type: 1 };
}

function newChannel(addr) {
  return {
    addr, status: 0, type: 0, rightVol: 0, leftVol: 0, attack: 0, decay: 0, sustain: 0, release: 0, key: 0,
    envVol: 0, envR: 0, envL: 0, echoVol: 0, echoLen: 0, gateTime: 0, midiKey: 0, velocity: 0, priority: 0,
    rhythmPan: 0, count: 0, fw: 0, freq: 0, wav: 0, current: 0, track: null, prev: null, next: null,
    // PSG channels only
    envelopeGoal: 0, envelopeCtr: 0, sustainGoal: 0, nrx4: 0, pan: 0, panMask: 0, cgbStatus: 0, length: 0, sweep: 0,
  };
}

/**
 * @param {Uint8Array} rom the whole ROM
 * @param {{songTable: number, playerTable: number, players: number, songs: number}} layout file offsets and counts
 * @param {{read(reg: number): number, write(reg: number, value: number): void}} io the sound registers
 */
export function createM4A(rom, layout, io) {
  const u32 = at => (rom[at] | rom[at + 1] << 8 | rom[at + 2] << 16 | rom[at + 3] << 24) >>> 0;
  const r8 = addr => rom[addr - ROM_BASE];

  const info = { reverb: 0, dmaCounter: 0, c15: 0, pcm: new Int8Array(2 * HALF), memAcc: new Uint8Array(256) };
  // what is left out of the output: `music` silences the notes of the first music player (the BGM's), as the
  // second and later GBAs of a multiplayer game do on one page, where the first one's music is heard
  const muted = { music: false };
  // the five DirectSound channels and the four PSG ones sit in EWRAM in this order (gSoundInfo, gCgbChans)
  const chans = Array.from({ length: NUM_CHANS }, (_, i) => newChannel(0x02001450 + 0x40 * i));
  const cgbChans = Array.from({ length: 4 }, (_, i) => newChannel(0x02002440 + 0x40 * i));
  cgbChans.forEach((C, i) => { C.type = i + 1; C.panMask = 0x11 << i; });

  const players = [];
  for (let i = 0; i < layout.players; i++) {
    const at = layout.playerTable + i * 12, tracks = u32(at + 4), count = rom[at + 8];
    players.push({
      addr: u32(at), songHeader: 0, status: 0, priority: 0, cmd: 0, clock: 0, tempoD: 0, tempoU: 0, tempoI: 0,
      tempoC: 0, fadeInterval: 0, fadeCounter: 0, fadeOV: 0, voicegroup: 0,
      tracks: Array.from({ length: count }, (_, t) => newTrack(tracks + 0x50 * t)),
    });
  }

  // the registers MPlayExtender and SoundInit set
  io.write(SOUNDCNT_X, 0x8F);
  io.write(NR50, 0); io.write(NR51, 0);
  for (const [nr2, nr4] of [[0x63, 0x65], [0x69, 0x6D], [0x79, 0x7D]]) { io.write(nr2, 0x08); io.write(nr4, 0x80); }
  io.write(NR30, 0);
  io.write(NR50, 0x77);
  io.write(SOUNDCNT_H, 0x0E); io.write(SOUNDCNT_H + 1, 0xA9);
  io.write(SOUNDBIAS_H, (io.read(SOUNDBIAS_H) & 0x3F) | 0x40);

  // ---- pitch ----

  function midiKeyToFreq(wav, key, fine) {
    fine = (fine << 24) >>> 0;
    if (key > 178) { key = 178; fine = (255 << 24) >>> 0; }
    const f1 = FREQ[key % 12] >>> (14 - Math.floor(key / 12));
    const f2 = FREQ[(key + 1) % 12] >>> (14 - Math.floor((key + 1) / 12));
    return umulhi(u32(wav + 4 - ROM_BASE), (f1 + umulhi((f2 - f1) >>> 0, fine)) >>> 0);
  }

  function midiKeyToCgbFreq(ch, key, fine) {
    if (ch === 4) return NOISE[key <= 20 ? 0 : Math.min(key - 21, 59)];
    let k;
    if (key <= 35) { k = 0; fine = 0; } else { k = key - 36; if (k > 130) { k = 130; fine = 255; } }
    const v1 = CGB_FREQ[k % 12] >> Math.floor(k / 12), v2 = CGB_FREQ[(k + 1) % 12] >> Math.floor((k + 1) / 12);
    return v1 + ((fine * (v2 - v1)) >> 8) + 2048;
  }

  // ---- tracks ----

  function trkVolPitSet(T) {
    if (T.flags & 0x01) {
      let x = (T.vol * T.volPublic) >>> 5;
      if (T.modType === 1) x = (x * (T.modCalc + 128)) >> 7;
      let y = 2 * T.pan + T.panPublic;
      if (T.modType === 2) y += T.modCalc;
      y = Math.max(-128, Math.min(127, y));
      T.volRCalc = u8(((y + 128) * x) >> 8);
      T.volLCalc = u8(((127 - y) * x) >> 8);
    }
    if (T.flags & 0x04) {
      let p = (T.tune + T.bend * T.bendRange) * 4 + (T.keyShift << 8) + (T.keyShiftPublic << 8) + T.pitchPublic;
      if (T.modType === 0) p += 16 * T.modCalc;
      T.keyShiftCalc = s8(p >> 8);
      T.pitchCalc = u8(p);
    }
    T.flags &= ~0x05;
  }

  function chnVolSet(C, T) {
    const rp = C.rhythmPan, vel = C.velocity;
    C.rightVol = Math.min(255, (T.volRCalc * ((128 + rp) * vel)) >> 14);
    C.leftVol = Math.min(255, (T.volLCalc * ((127 - rp) * vel)) >> 14);
  }

  function clearChain(C) {
    const T = C.track;
    if (!T) return;
    if (C.prev) C.prev.next = C.next; else T.chan = C.next;
    if (C.next) C.next.prev = C.prev;
    C.track = null;
  }

  function cgbOscOff(ch) {
    if (ch === 3) { io.write(NR30, 0); return; }
    const [, , nr2, , nr4] = CGB_REGS[ch - 1];
    io.write(nr2, 0x08); io.write(nr4, 0x80);
  }

  function trackStop(T) {
    if (!(T.flags & EXIST)) return;
    for (let C = T.chan; C; C = C.next) {
      if (C.status) {
        if (C.type & 7) cgbOscOff(C.type & 7);
        C.status = 0;
      }
      C.track = null;
    }
    T.chan = null;
  }

  function clearModM(T) {
    T.modCalc = 0; T.lfoSpeedCounter = 0;
    T.flags |= T.modType === 0 ? PITCHG : VOLCHG;
  }

  // ---- commands 0xB1 … 0xCE ----

  const arg = T => r8(T.cmdPtr++);
  const ptrArg = T => u32(T.cmdPtr - ROM_BASE);

  function fine(P, T) {
    for (let C = T.chan; C; C = C.next) {
      if (C.status & ON) C.status |= STOP;
      clearChain(C);
    }
    T.flags = 0;
  }
  function goto(P, T) { T.cmdPtr = ptrArg(T); }
  function patt(P, T) {
    if (T.patternLevel >= 3) { fine(P, T); return; }
    T.patternStack[T.patternLevel++] = T.cmdPtr + 4;
    goto(P, T);
  }
  function pend(P, T) { if (T.patternLevel) T.cmdPtr = T.patternStack[--T.patternLevel]; }
  function rept(P, T) {
    const n = r8(T.cmdPtr);
    if (n === 0) { T.cmdPtr++; goto(P, T); return; }
    T.repN = u8(T.repN + 1);
    if (T.repN < n) { T.cmdPtr++; goto(P, T); } else { T.repN = 0; T.cmdPtr += 5; }
  }
  // reads and writes the players' shared scratch bytes, or jumps on a comparison with them (no SA1 song uses it)
  function memacc(P, T) {
    const op = arg(T), at = arg(T), data = arg(T), mem = info.memAcc, v = mem[at];
    const ops = [
      () => { mem[at] = data; }, () => { mem[at] += data; }, () => { mem[at] -= data; },
      () => { mem[at] = mem[data]; }, () => { mem[at] += mem[data]; }, () => { mem[at] -= mem[data]; },
    ];
    const tests = [(a, b) => a === b, (a, b) => a !== b, (a, b) => a > b, (a, b) => a >= b, (a, b) => a <= b, (a, b) => a < b];
    if (op < 6) ops[op]();
    else if (op < 18) {
      if (tests[(op - 6) % 6](v, op < 12 ? data : mem[data])) goto(P, T); else T.cmdPtr += 4;
    }
  }
  function xcmd(P, T) {
    const sub = arg(T);
    switch (sub) {
      case 1: T.voice = { ...T.voice, wav: ptrArg(T) }; T.cmdPtr += 4; return;
      case 2: T.voice = { ...T.voice, type: arg(T) }; return;
      case 4: T.voice = { ...T.voice, attack: arg(T) }; return;
      case 5: T.voice = { ...T.voice, decay: arg(T) }; return;
      case 6: T.voice = { ...T.voice, sustain: arg(T) }; return;
      case 7: T.voice = { ...T.voice, release: arg(T) }; return;
      case 8: T.echoVolume = arg(T); return;
      case 9: T.echoLength = arg(T); return;
      case 10: T.voice = { ...T.voice, length: arg(T) }; return;
      case 11: T.voice = { ...T.voice, panSweep: arg(T) }; return;
      default: fine(P, T);
    }
  }
  function eot(P, T) {
    if (r8(T.cmdPtr) < 0x80) T.key = arg(T);
    for (let C = T.chan; C; C = C.next) {
      if ((C.status & (START | ENV)) && !(C.status & STOP) && C.midiKey === T.key) { C.status |= STOP; return; }
    }
  }

  const COMMANDS = [
    fine, goto, patt, pend, rept, fine, fine, fine, memacc,
    (P, T) => { T.priority = arg(T); },
    (P, T) => { P.tempoD = arg(T) * 2; P.tempoI = (P.tempoD * P.tempoU) >> 8; },
    (P, T) => { T.keyShift = s8(arg(T)); T.flags |= PITCHG; },
    (P, T) => { T.voice = voiceAt(rom, P.voicegroup - ROM_BASE + arg(T) * 12); },
    (P, T) => { T.vol = arg(T); T.flags |= VOLCHG; },
    (P, T) => { T.pan = s8(arg(T) - 0x40); T.flags |= VOLCHG; },
    (P, T) => { T.bend = s8(arg(T) - 0x40); T.flags |= PITCHG; },
    (P, T) => { T.bendRange = arg(T); T.flags |= PITCHG; },
    (P, T) => { T.lfoSpeed = arg(T); if (!T.lfoSpeed) clearModM(T); },
    (P, T) => { T.lfoDelay = arg(T); },
    (P, T) => { T.modDepth = arg(T); if (!T.modDepth) clearModM(T); },
    (P, T) => { const t = arg(T); if (t !== T.modType) { T.modType = t; T.flags |= VOLCHG | PITCHG; } },
    fine, fine,
    (P, T) => { T.tune = s8(arg(T) - 0x40); T.flags |= PITCHG; },
    fine, fine, fine,
    (P, T) => { const reg = arg(T); io.write(0x60 + reg, arg(T)); },
    xcmd, eot,
  ];

  // ---- notes ----

  // the DirectSound channel a new note takes: a free one at once, else the lowest priority among the releasing
  // ones (or, when none is releasing, among the playing ones), ties going to the later track
  function pickChannel(prio, T) {
    let best = null, bestPrio = prio, bestTrack = T.addr, stopping = false;
    for (const C of chans) {
      if (!(C.status & ON)) return C;
      if (C.status & STOP) {
        if (!stopping) { stopping = true; bestPrio = C.priority; bestTrack = C.track ? C.track.addr : 0; best = C; continue; }
      } else if (stopping) continue;
      const tr = C.track ? C.track.addr : 0;
      if (C.priority < bestPrio) { bestPrio = C.priority; bestTrack = tr; best = C; }
      else if (C.priority === bestPrio) {
        if (tr > bestTrack) { bestTrack = tr; best = C; } else if (tr === bestTrack) best = C;
      }
    }
    return best;
  }

  function plynote(idx, P, T) {
    T.gateTime = CLOCK[idx];
    if (r8(T.cmdPtr) < 0x80) {
      T.key = arg(T);
      if (r8(T.cmdPtr) < 0x80) {
        T.velocity = arg(T);
        if (r8(T.cmdPtr) < 0x80) T.gateTime = u8(T.gateTime + arg(T));
      }
    }
    let rhythmPan = 0, V = T.voice, key = T.key;
    if (V.type & 0xC0) {
      // key split: a table picks the sub-voice; drum kit: the key does, and the drum brings its own key and pan
      const table = V.attack | V.decay << 8 | V.sustain << 16 | V.release << 24;
      const n = V.type & 0x40 ? r8((table >>> 0) + T.key) : T.key;
      const S = voiceAt(rom, V.wav - ROM_BASE + n * 12);
      if (S.type & 0xC0) return;
      if (V.type & 0x80) {
        if (S.panSweep & 0x80) rhythmPan = s8((S.panSweep - 0xC0) * 2);
        key = S.key;
      }
      V = S;
    }
    const prio = Math.min(P.priority + T.priority, 255);
    const cgb = V.type & 7;
    let C;
    if (cgb) {
      C = cgbChans[cgb - 1];
      if ((C.status & ON) && !(C.status & STOP)) {
        if (C.priority > prio) return;
        if (C.priority === prio && (C.track ? C.track.addr : 0) < T.addr) return;
      }
    } else {
      C = pickChannel(prio, T);
      if (!C) return;
    }
    clearChain(C);
    C.prev = null; C.next = T.chan;
    if (T.chan) T.chan.prev = C;
    T.chan = C; C.track = T; C.music = P === players[0];
    T.lfoDelayCounter = T.lfoDelay;
    if (T.lfoDelay) clearModM(T);
    trkVolPitSet(T);
    C.gateTime = T.gateTime; C.midiKey = T.key; C.velocity = T.velocity;
    C.priority = prio; C.key = key; C.rhythmPan = rhythmPan;
    C.type = V.type; C.wav = V.wav;
    C.attack = V.attack; C.decay = V.decay; C.sustain = V.sustain; C.release = V.release;
    C.echoVol = T.echoVolume; C.echoLen = T.echoLength;
    chnVolSet(C, T);
    const k = Math.max(0, C.key + T.keyShiftCalc);
    if (cgb) {
      C.length = V.length;
      const ps = V.panSweep;
      C.sweep = (ps & 0x80) || !(ps & 0x70) ? 0x08 : ps;
      C.freq = midiKeyToCgbFreq(cgb, k, T.pitchCalc);
    } else {
      C.freq = midiKeyToFreq(C.wav, k, T.pitchCalc);
    }
    C.status = START;
    T.flags &= 0xF0;
  }

  // ---- the sequencer ----

  function tickTrack(P, T) {
    for (let C = T.chan; C; C = C.next) {
      if (C.status & ON) {
        if (C.gateTime && --C.gateTime === 0) C.status |= STOP;
      } else clearChain(C);
    }
    if (T.flags & TRACK_START) clearTrack(T);
    while (T.wait === 0) {
      const b = r8(T.cmdPtr);
      let cmd = b;
      if (b < 0x80) cmd = T.runningStatus;
      else { T.cmdPtr++; if (b >= 0xBD) T.runningStatus = b; }
      if (cmd >= 0xCF) plynote(cmd - 0xCF, P, T);
      else if (cmd >= 0xB1) {
        P.cmd = cmd - 0xB1;
        COMMANDS[cmd - 0xB1](P, T);
        if (T.flags === 0) return;
      } else T.wait = CLOCK[cmd - 0x80];
    }
    T.wait--;
    // the vibrato/tremolo LFO: a triangle, stepped on ticks only
    if (T.lfoSpeed && T.modDepth) {
      if (T.lfoDelayCounter) { T.lfoDelayCounter--; return; }
      const sum = T.lfoSpeedCounter + T.lfoSpeed;
      T.lfoSpeedCounter = u8(sum);
      // the falling half uses the sum before it wraps, as the original does
      const v = u8(sum - 64) & 0x80 ? s8(sum) : 128 - sum;
      const m = (T.modDepth * v) >> 6;
      if (u8(m) !== u8(T.modCalc)) {
        T.modCalc = s8(m);
        T.flags |= T.modType === 0 ? PITCHG : VOLCHG;
      }
    }
  }

  function fadeOutBody(P) {
    if (!P.fadeInterval) return;
    if (--P.fadeCounter !== 0) return;
    P.fadeCounter = P.fadeInterval;
    if (P.fadeOV & 2) {
      P.fadeOV += 16;
      if (P.fadeOV >= 256) { P.fadeOV = 256; P.fadeInterval = 0; }
    } else {
      P.fadeOV -= 16;
      if (P.fadeOV <= 0) {
        for (const T of P.tracks) { trackStop(T); if (!(P.fadeOV & 1)) T.flags = 0; }
        P.status = P.fadeOV & 1 ? (P.status | PAUSE) >>> 0 : PAUSE;
        P.fadeInterval = 0;
        return;
      }
    }
    for (const T of P.tracks) if (T.flags & EXIST) { T.volPublic = P.fadeOV >> 2; T.flags |= VOLCHG; }
  }

  function playerMain(P) {
    if (P.status & PAUSE) return;
    fadeOutBody(P);
    if (P.status & PAUSE) return;
    let t = P.tempoC + P.tempoI;
    for (;;) {
      P.tempoC = t & 0xFFFF;
      if (t < 150) break;
      let mask = 0;
      P.tracks.forEach((T, i) => { if (T.flags & EXIST) { mask |= 1 << i; tickTrack(P, T); } });
      P.clock = (P.clock + 1) >>> 0;
      if (!mask) { P.status = PAUSE; return; }
      P.status = mask;
      t = P.tempoC - 150;
    }
    for (const T of P.tracks) {
      if (!(T.flags & EXIST) || !(T.flags & 0x0F)) continue;
      trkVolPitSet(T);
      for (let C = T.chan; C; C = C.next) {
        if (!(C.status & ON)) { clearChain(C); continue; }
        const cgb = C.type & 7;
        if (T.flags & VOLCHG) {
          chnVolSet(C, T);
          if (cgb) C.cgbStatus |= MO_VOL;
        }
        if (T.flags & PITCHG) {
          const key = Math.max(0, C.key + T.keyShiftCalc);
          if (cgb) { C.freq = midiKeyToCgbFreq(cgb, key, T.pitchCalc); C.cgbStatus |= MO_PIT; }
          else C.freq = midiKeyToFreq(C.wav, key, T.pitchCalc);
        }
      }
      T.flags &= 0xF0;
    }
  }

  // ---- PSG channels ----

  // SA1's version: a channel that is mostly on one side plays on that side only
  function cgbModVol(C) {
    const r = C.rightVol, l = C.leftVol;
    let pan, goal;
    if (r >= l && r >> 1 >= l) { pan = 0x0F; goal = Math.min(15, (r + l) >> 4); }
    else if (l > r && l >> 1 >= r) { pan = 0xF0; goal = Math.min(15, (r + l) >> 4); }
    else { pan = 0xFF; goal = (r + l) >> 4; }
    C.envelopeGoal = goal;
    C.sustainGoal = (goal * C.sustain + 15) >> 4;
    C.pan = pan & C.panMask;
  }

  // the software envelope follows the hardware one, writing the registers and retriggering at each phase change
  function cgbSound() {
    if (muted.music) io.muted = cgbChans.reduce((m, C, i) => m | (C.music ? 1 << i : 0), 0);
    info.c15 = info.c15 ? info.c15 - 1 : 14;
    for (let ch = 1; ch <= 4; ch++) {
      const C = cgbChans[ch - 1];
      if (!(C.status & ON)) continue;
      const [nr0, nr1, nr2, nr3, nr4] = CGB_REGS[ch - 1];
      let c15 = info.c15, dir = io.read(nr2), at;
      if (C.status & START) {
        if (C.status & STOP) at = 'off';
        else {
          C.status = 3; C.cgbStatus = MO_PIT | MO_VOL;
          cgbModVol(C);
          if (ch === 3) {
            if (C.wav !== C.current) {
              io.write(NR30, 0x40);
              for (let i = 0; i < 16; i++) io.write(WAVE_RAM + i, r8(C.wav + i));
              C.current = C.wav;
            }
            io.write(NR30, 0); io.write(nr1, C.length);
            C.nrx4 = C.length ? 0xC0 : 0x80;
          } else {
            if (ch === 1) io.write(nr0, C.sweep);
            if (ch === 4) { io.write(nr1, C.length); io.write(nr3, u8(C.wav << 3)); }
            else io.write(nr1, u8((C.wav << 6) + C.length));
            dir = C.attack + 8;
            C.nrx4 = C.length ? 0x40 : 0x00;
          }
          C.envelopeCtr = C.attack;
          if (s8(C.attack)) { C.envelopeVol = 0; at = 'stepDone'; } else at = 'decayStart';
        }
      } else if (C.status & IEC) {
        C.echoLen = u8(C.echoLen - 1);
        at = s8(C.echoLen) <= 0 ? 'off' : 'done';
      } else if ((C.status & STOP) && (C.status & ENV)) {
        C.status &= ~ENV; C.envelopeCtr = C.release;
        if (s8(C.release)) { C.cgbStatus |= MO_VOL; if (ch !== 3) dir = C.release; at = 'stepDone'; }
        else at = 'echo';
      } else at = 'step';

      // the envelope steps; every 15th frame it steps twice to keep up with the hardware's 64 Hz
      while (at !== 'done' && at !== 'off') {
        switch (at) {
          case 'step':
            at = 'stepDone';
            if (C.envelopeCtr !== 0) break;
            if (ch === 3) C.cgbStatus |= MO_VOL;
            cgbModVol(C);
            switch (C.status & ENV) {
              case 0:
                C.envelopeVol = u8(C.envelopeVol - 1);
                if (s8(C.envelopeVol) <= 0) at = 'echo'; else C.envelopeCtr = C.release;
                break;
              case 1: at = 'sustain'; break;
              case 2:
                C.envelopeVol = u8(C.envelopeVol - 1);
                if (s8(C.envelopeVol) <= s8(C.sustainGoal)) at = 'sustainStart'; else C.envelopeCtr = C.decay;
                break;
              default:
                C.envelopeVol = u8(C.envelopeVol + 1);
                if (C.envelopeVol >= C.envelopeGoal) at = 'decayStart'; else C.envelopeCtr = C.attack;
            }
            break;
          case 'decayStart':
            C.status--; C.envelopeCtr = C.decay;
            if (C.decay) {
              C.cgbStatus |= MO_VOL; C.envelopeVol = C.envelopeGoal;
              if (ch !== 3) dir = C.decay;
              at = 'stepDone';
            } else at = 'sustainStart';
            break;
          case 'sustainStart':
            if (C.sustain === 0) { C.status &= ~ENV; at = 'echo'; break; }
            C.status--; C.cgbStatus |= MO_VOL;
            if (ch !== 3) dir = 0x08;
            at = 'sustain';
            break;
          case 'sustain':
            C.envelopeVol = C.sustainGoal; C.envelopeCtr = 7;
            at = 'stepDone';
            break;
          case 'echo':
            C.envelopeVol = (C.envelopeGoal * C.echoVol + 0xFF) >> 8;
            if (!C.envelopeVol) { at = 'off'; break; }
            C.status |= IEC; C.cgbStatus |= MO_VOL;
            if (ch !== 3) dir = 0x08;
            at = 'done';
            break;
          case 'stepDone':
            C.envelopeCtr = u8(C.envelopeCtr - 1);
            if (c15 === 0) { c15 = -1; at = 'step'; } else at = 'done';
            break;
        }
      }
      if (at === 'off') { cgbOscOff(ch); C.status = 0; C.cgbStatus = 0; continue; }

      if (C.cgbStatus & MO_PIT) {
        // "fixed" voices round the frequency to what the PWM rate can play
        if (ch < 4 && (C.type & 0x08)) {
          const bias = io.read(SOUNDBIAS_H);
          if (bias < 0x40) C.freq = (C.freq + 2) & 0x7FC;
          else if (bias < 0x80) C.freq = (C.freq + 1) & 0x7FE;
        }
        io.write(nr3, ch === 4 ? (io.read(nr3) & 0x08) | C.freq : u8(C.freq));
        C.nrx4 = u8((C.nrx4 & 0xC0) + (C.freq >> 8));
        io.write(nr4, C.nrx4);
      }
      if (C.cgbStatus & MO_VOL) {
        io.write(NR51, (io.read(NR51) & ~C.panMask) | C.pan);
        if (ch === 3) {
          io.write(NR32, CGB3_VOL[C.envelopeVol]);
          if (C.nrx4 & 0x80) { io.write(NR30, 0x80); io.write(NR34, C.nrx4); C.nrx4 &= 0x7F; }
        } else {
          io.write(nr2, u8((dir & 0x0F) + (C.envelopeVol << 4)));
          io.write(nr4, C.nrx4 | 0x80);
          if (ch === 1 && !(io.read(NR10) & 0x08)) io.write(nr4, C.nrx4 | 0x80);
        }
      }
      C.cgbStatus = 0;
    }
  }

  // ---- DirectSound mixer ----

  // one channel's envelope for this frame; false when the channel stops before it is mixed
  function envelope(C) {
    let st = C.status, env;
    const wav = C.wav - ROM_BASE;
    if (st & START) {
      if (st & STOP) { C.status = 0; return false; }
      st = 3; C.current = C.wav + 16; C.count = u32(wav + 12); env = 0; C.fw = 0;
      if (rom[wav + 3] & 0xC0) st |= LOOP;
      C.status = st;
      env += C.attack;
      if (env >= 255) { env = 255; C.status = --st; }
    } else {
      env = C.envVol;
      let echo = false;
      if (st & IEC) {
        const old = C.echoLen;
        C.echoLen = u8(old - 1);
        if (old <= 1) { C.status = 0; return false; }
      } else if (st & STOP) {
        env = (env * C.release) >> 8;
        if (env <= C.echoVol) echo = true;
      } else if ((st & ENV) === 2) {
        env = (env * C.decay) >> 8;
        if (env <= C.sustain) {
          env = C.sustain;
          if (env === 0) echo = true; else C.status = --st;
        }
      } else if ((st & ENV) === 3) {
        env += C.attack;
        if (env >= 255) { env = 255; C.status = --st; }
      }
      if (echo) {
        env = C.echoVol;
        if (env === 0) { C.status = 0; return false; }
        C.status = st | IEC;
      }
    }
    C.envVol = env;
    const v = (env * (MASTER_VOL + 1)) >> 4;
    C.envR = (C.rightVol * v) >> 8;
    C.envL = (C.leftVol * v) >> 8;
    return true;
  }

  function mixChannel(C, base) {
    const pcm = info.pcm, wav = C.wav - ROM_BASE, data = wav + 16;
    const size = u32(wav + 12), loopStart = u32(wav + 8);
    const loopLen = C.status & LOOP ? size - loopStart : 0;
    // with the music muted, its notes still play out, unheard
    const quiet = muted.music && C.music, vr = quiet ? 0 : C.envR, vl = quiet ? 0 : C.envL;
    let cur = C.current - C.wav - 16, count = C.count;
    if (C.type & 0x08) {
      // fixed rate: one sample in per sample out
      for (let i = 0; i < SAMPLES; i++) {
        const s = s8(rom[data + cur++]);
        pcm[base + i] += (s * vr) >> 8;
        pcm[HALF + base + i] += (s * vl) >> 8;
        if (--count === 0) {
          if (!loopLen) { C.status = 0; return; }
          cur = loopStart; count = loopLen;
        }
      }
      C.count = count; C.current = C.wav + 16 + cur;
      return;
    }
    // resampled with linear interpolation; the step is a 23-bit fraction, and the sample after the last one is
    // read from the byte that follows the data
    const step = Math.imul(DIV_FREQ, C.freq) >>> 0;
    let fw = C.fw, s0 = s8(rom[data + cur]), d = s8(rom[data + cur + 1]) - s0;
    for (let i = 0; i < SAMPLES; i++) {
      const s = s0 + (Math.imul(fw, d) >> 23);
      pcm[base + i] += (s * vr) >> 8;
      pcm[HALF + base + i] += (s * vl) >> 8;
      fw = (fw + step) >>> 0;
      const n = fw >>> 23;
      if (n === 0) continue;
      fw = (fw & ~0x3F800000) >>> 0;
      count -= n;
      if (count <= 0) {
        if (!loopLen) { C.status = 0; return; }
        let over = -count;
        count += loopLen;
        while (count <= 0) { over -= loopLen; count += loopLen; }
        cur = loopStart + over;
      } else cur += n;
      s0 = s8(rom[data + cur]); d = s8(rom[data + cur + 1]) - s0;
    }
    C.fw = fw; C.count = count; C.current = C.wav + 16 + cur;
  }

  function mix() {
    const dc = info.dmaCounter, pcm = info.pcm;
    const seg = dc <= 1 ? 0 : FRAMES_PER_DMA - (dc - 1), base = seg * SAMPLES;
    if (info.reverb) {
      // mono feedback from what played 9 and 8 frames ago
      const nxt = dc === 2 ? 0 : base + SAMPLES;
      for (let i = 0; i < SAMPLES; i++) {
        const a = pcm[base + i] + pcm[HALF + base + i] + pcm[nxt + i] + pcm[HALF + nxt + i];
        let v = (a * info.reverb) >> 9;
        if (v & 0x80) v++;
        pcm[base + i] = pcm[HALF + base + i] = v;
      }
    } else {
      pcm.fill(0, base, base + SAMPLES);
      pcm.fill(0, HALF + base, HALF + base + SAMPLES);
    }
    for (const C of chans) if ((C.status & ON) && envelope(C)) mixChannel(C, base);
    return base;
  }

  // ---- song control (m4a.c) ----

  function song(n) {
    const at = layout.songTable + n * 8;
    return { header: u32(at), player: players[rom[at + 4]] };
  }

  function mplayStart(P, header) {
    const h = header - ROM_BASE, trackCount = rom[h];
    P.status = 0; P.songHeader = header; P.voicegroup = u32(h + 4); P.priority = rom[h + 2]; P.clock = 0;
    P.tempoD = 150; P.tempoI = 150; P.tempoU = 0x100; P.tempoC = 0; P.fadeInterval = 0;
    P.tracks.forEach((T, i) => {
      trackStop(T);
      if (i < trackCount) { T.flags = EXIST | TRACK_START; T.chan = null; T.cmdPtr = u32(h + 8 + i * 4); }
      else T.flags = 0;
    });
    const reverb = rom[h + 3];
    if (reverb & 0x80) info.reverb = reverb & 0x7F;
  }

  function mplayStop(P) {
    P.status = (P.status | PAUSE) >>> 0;
    for (const T of P.tracks) trackStop(T);
  }

  const eachTrack = (P, bits, f) => P.tracks.forEach((T, i) => { if ((bits & (1 << i)) && (T.flags & EXIST)) f(T); });

  return {
    info, chans, cgbChans, players, muted,

    /** One GBA frame: the V-blank's DMA bookkeeping, then SoundMain. Returns the offset of the 176 bytes just
     *  mixed into info.pcm (right side; the left side is HALF bytes later). */
    frame() {
      const dc = u8(info.dmaCounter - 1);
      info.dmaCounter = s8(dc) > 0 ? dc : FRAMES_PER_DMA;
      for (const P of players) playerMain(P);
      cgbSound();
      return mix();
    },

    songStart(n) { const s = song(n); mplayStart(s.player, s.header); },
    /** song n's header address, to compare with a player's songHeader */
    songHeader(n) { return song(n).header; },
    /** the number of the music player song n plays on */
    songPlayer(n) { return players.indexOf(song(n).player); },
    /** MPlayStart with song n's header on player p instead of the song's own */
    playerStart(p, n) { mplayStart(players[p], song(n).header); },
    songStop(n) { const s = song(n); if (s.player.songHeader === s.header) mplayStop(s.player); },
    /** MPlayStop on player p, whatever it plays */
    playerStop(p) { mplayStop(players[p]); },
    /** m4aSongNumStartOrContinue: restarts a different song or an ended one, and lets a stopped one go on */
    songStartOrContinue(n) {
      const s = song(n), P = s.player;
      if (P.songHeader !== s.header || (P.status & 0xFFFF) === 0) mplayStart(P, s.header);
      else if (P.status & PAUSE) P.status = (P.status & ~PAUSE) >>> 0;
    },
    /** m4aSongNumStartOrChange: restarts only a different song, or the same one once it has ended */
    songStartOrChange(n) {
      const s = song(n), P = s.player;
      if (P.songHeader !== s.header || (P.status & 0xFFFF) === 0 || (P.status & PAUSE)) mplayStart(P, s.header);
    },
    allStop() { for (const P of players) mplayStop(P); },
    /** m4aMPlayAllContinue: every player that MPlayStop stopped goes on from where it was */
    allContinue() { for (const P of players) P.status = (P.status & ~PAUSE) >>> 0; },
    immInit(p) {
      for (const T of players[p].tracks) if ((T.flags & EXIST) && (T.flags & TRACK_START)) clearTrack(T);
    },
    pitchControl(p, bits, pitch) {
      eachTrack(players[p], bits, T => { T.keyShiftPublic = s8(pitch >> 8); T.pitchPublic = u8(pitch); T.flags |= PITCHG; });
    },
    volumeControl(p, bits, volume) {
      eachTrack(players[p], bits, T => { T.volPublic = u8(volume >> 2); T.flags |= VOLCHG; });
    },
    panpotControl(p, bits, pan) {
      eachTrack(players[p], bits, T => { T.panPublic = s8(pan); T.flags |= VOLCHG; });
    },
    fadeIn(p, speed) {
      const P = players[p];
      P.fadeCounter = P.fadeInterval = speed; P.fadeOV = 2;
      P.status = (P.status & ~PAUSE) >>> 0;
    },
    fadeOut(p, speed) { const P = players[p]; P.fadeCounter = P.fadeInterval = speed; P.fadeOV = 256; },
    tempoControl(p, tempo) { const P = players[p]; P.tempoU = tempo; P.tempoI = (P.tempoD * tempo) >> 8; },
  };
}

export const SOUND = { SAMPLES, HALF, FRAMES_PER_DMA };
