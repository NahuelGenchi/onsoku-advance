// The page's side of the sound: starts the AudioWorklet (worklet.js) with a copy of the ROM and forwards the
// game's calls to it, the optional Sonic Rush boost's sound archive when it is given one, and the optional
// Boost Mode's Sonic Advance 2 ROM when it is given that. Browsers keep audio paused until the page has been interacted with; choosing the ROM
// counts, and any later key press or tap resumes it too. A multiplayer game on one page has one engine per GBA,
// each GBA's game calling its own (`forGba`).

const GAIN = 0.5;   // the GBA's full scale is loud next to other pages; half of it leaves headroom

export function createSound() {
  let ctx = null, node = null, muted = false, songPlayers = null, rushSound = null, sa2Sound = null, count = 1;
  const waiting = [];
  const post = msg => (node ? node.port.postMessage(msg) : waiting.push(msg));
  const resume = () => { if (ctx?.state === 'suspended') ctx.resume(); };
  addEventListener('pointerdown', resume);
  addEventListener('keydown', resume);

  // the calls a game makes on its GBA's engine
  function gbaSound(gba) {
    const call = (name, ...args) => post({ type: 'call', name, args, gba });
    return {
      /** m4aSongNumStart */
      play(song) { call('songStart', song); },
      /** m4aSongNumStartOrChange: starts the song unless it is already playing on its player */
      playOrChange(song) { call('songStartOrChange', song); },
      /** Plays a Sonic Rush sound effect, [sequence archive, sound], as the DS does (nitro.js) */
      playRush(se) { post({ type: 'rushSe', se }); },
      /** m4aSongNumStart on Sonic Advance 2's own engine */
      playSa2(song) { post({ type: 'sa2Call', name: 'songStart', args: [song] }); },
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
      /** m4aSongNumStop */
      stop(song) { call('songStop', song); },
      /** MPlayStart with the song on music player `player`, and nothing else */
      startOn(player, song) { call('playerStart', player, song); },
      /** MPlayStop on music player `player` */
      stopPlayer(player) { call('playerStop', player); },
      /** m4aSongNumStartOrContinue */
      startOrContinue(song) { call('songStartOrContinue', song); },
      /** m4aMPlayVolumeControl on the tracks `bits` of music player `player` */
      volume(player, bits, volume) { call('volumeControl', player, bits, volume); },
      /** m4aMPlayFadeIn on music player `player`, a step up every `speed` frames */
      fadeIn(player, speed) { call('fadeIn', player, speed); },
      /** m4aMPlayFadeOut on music player `player`, a step down every `speed` frames */
      fadeOut(player, speed) { call('fadeOut', player, speed); },
      /** m4aMPlayTempoControl on the music (0x100 is normal speed) */
      tempo(tempo) { call('tempoControl', 0, tempo); },
      /** The music manager's invincibility: its song in place of the music */
      invincibility() { call('invincibility'); },
      /** The music manager's drowning countdown (gMusicManagerState.unk4): its music in place of the stage's */
      drowning() { call('drowning'); },
      /** What the music manager reads of Sonic each frame */
      playerState(invincible, speedUp, alive) { call('playerState', invincible, speedUp, alive); },
      /** A boss's music state for the music manager (gMusicManagerState.unk1) */
      musicState(value) { call('musicState', value); },
      stopAll() { call('allStop'); },
      /** The pause menu's start (Task_PauseMenuInit): MPlayStop on every music player but `song`'s, then
       *  m4aSongNumStart(song); the music manager rests until continueAll() */
      pause(song) { call('pause', song); },
      /** m4aMPlayAllContinue, as the pause menu closes: every music player goes on from where it stopped */
      continueAll() { call('continueAll'); },
      /** Switches the music manager off until the next stage's music starts, as the act's results do */
      musicOff() { call('off'); },
    };
  }

  return {
    ...gbaSound(0),
    /** The sound of GBA `i` of a multiplayer game, with the same calls as this one's */
    forGba: i => gbaSound(i),

    /** Starts the engine on `romBuffer`, one for each of `gbas` GBAs (the music heard from the first). Resolves
     *  once it runs; without Web Audio the game stays silent. */
    async load(romBuffer, layout, gbas = 1) {
      count = gbas;
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
      node.port.postMessage({ type: 'rom', rom: romBuffer, layout, count });
      if (rushSound) node.port.postMessage({ type: 'rush', sound: rushSound });
      if (sa2Sound) node.port.postMessage({ type: 'sa2', ...sa2Sound });
      node.port.postMessage({ type: 'gain', value: muted ? 0 : GAIN });
      for (const msg of waiting.splice(0)) node.port.postMessage(msg);
      resume();
    },
    /** Gives the engine Sonic Rush's sound archive and tables (rush.js) for the boost's sound effect */
    loadRush(sound) { rushSound = sound; node?.port.postMessage({ type: 'rush', sound }); },
    /** Gives the engine the Sonic Advance 2 ROM and its sound layout (sa2.js), for the extras' sound effects */
    loadSa2(sound) { sa2Sound = sound; node?.port.postMessage({ type: 'sa2', ...sound }); },

    get muted() { return muted; },
    set muted(value) { muted = value; post({ type: 'gain', value: muted ? 0 : GAIN }); },
  };
}
