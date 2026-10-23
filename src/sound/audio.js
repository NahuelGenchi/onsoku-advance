// The page's side of the sound: starts the AudioWorklet (worklet.js) with a copy of the ROM and forwards the
// game's calls to it. Browsers keep audio paused until the page has been interacted with; choosing the ROM
// counts, and any later key press or tap resumes it too.

const GAIN = 0.5;   // the GBA's full scale is loud next to other pages; half of it leaves headroom

export function createSound() {
  let ctx = null, node = null, muted = false, songPlayers = null;
  const waiting = [];
  const post = msg => (node ? node.port.postMessage(msg) : waiting.push(msg));
  const call = (name, ...args) => post({ type: 'call', name, args });
  const resume = () => { if (ctx?.state === 'suspended') ctx.resume(); };
  addEventListener('pointerdown', resume);
  addEventListener('keydown', resume);

  return {
    /** Starts the engine on `romBuffer`. Resolves once it runs; without Web Audio the game stays silent. */
    async load(romBuffer, layout) {
      await ctx?.close();
      ctx = node = null;
      const bytes = new Uint8Array(romBuffer);
      songPlayers = Array.from({ length: layout.songs }, (_, n) => bytes[layout.songTable + n * 8 + 4]);
      if (!globalThis.AudioWorkletNode) { waiting.length = 0; return; }
      const c = new AudioContext({ latencyHint: 'interactive' });
      ctx = c;
      await c.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
      if (ctx !== c) return;   // another ROM was chosen meanwhile
      node = new AudioWorkletNode(c, 'm4a', { numberOfInputs: 0, outputChannelCount: [2] });
      node.connect(c.destination);
      node.port.postMessage({ type: 'rom', rom: romBuffer, layout });
      node.port.postMessage({ type: 'gain', value: muted ? 0 : GAIN });
      for (const msg of waiting.splice(0)) node.port.postMessage(msg);
      resume();
    },

    /** m4aSongNumStart */
    play(song) { call('songStart', song); },
    /** Starts the stage's music and the music manager that brings it back after the 1-up jingle */
    playStageMusic(song) { call('stageMusic', song); },
    /** The music manager's extra life: the 1-up jingle in place of the music */
    oneUp() { call('oneUp'); },
    /** m4aSongNumStart, then m4aMPlayImmInit and m4aMPlayPitchControl on its player (pitch in 1/256 semitones) */
    playPitched(song, pitch) {
      const p = songPlayers?.[song] ?? 0;
      call('songStart', song); call('immInit', p); call('pitchControl', p, 0xFFFF, pitch);
    },
    /** MPlayStart with the song on music player `player`, then m4aMPlayImmInit and the volume and pan controls
     *  on all its tracks (volume 256 is full; pan −64 is left, +63 right) */
    playOn(player, song, volume, pan) {
      call('playerStart', player, song); call('immInit', player);
      call('volumeControl', player, 0xFFFF, volume); call('panpotControl', player, 0xFFFF, pan);
    },
    stopAll() { call('allStop'); },

    get muted() { return muted; },
    set muted(value) { muted = value; post({ type: 'gain', value: muted ? 0 : GAIN }); },
  };
}
