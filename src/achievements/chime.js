// The unlock popup's chime, the project's own: a quick rising arpeggio of four bell notes (G5, C6, E6, G6), each a
// sine with a softer one an octave up, ringing out over about a second with a light echo. It is made in Web Audio,
// on the game's AudioContext so it plays wherever the game's sound does, and stays quiet while the sound is off.

const NOTES = [784, 1047, 1319, 1568];   // Hz
const STEP = 0.07, RING = 0.9, LEVEL = 0.16, ECHO = 0.12, FEEDBACK = 0.25, WET = 0.3;

/** Plays the chime on `sound` (audio.js), unless it has no AudioContext yet or is muted. */
export function playChime(sound) {
  const ctx = sound?.context;
  if (!ctx || sound.muted || ctx.state === 'closed') return;
  const t0 = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = LEVEL;
  out.connect(ctx.destination);
  // the echo: a delay fed back into itself, mixed in under the notes
  const delay = ctx.createDelay(1), feedback = ctx.createGain(), wet = ctx.createGain();
  delay.delayTime.value = ECHO;
  feedback.gain.value = FEEDBACK;
  wet.gain.value = WET;
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(out);

  NOTES.forEach((hz, i) => {
    const at = t0 + i * STEP, ring = RING + (i === NOTES.length - 1 ? 0.4 : 0);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, at + ring);
    env.connect(out);
    env.connect(delay);
    for (const [mult, level] of [[1, 1], [2, 0.25]]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz * mult;
      gain.gain.value = level;
      osc.connect(gain).connect(env);
      osc.start(at);
      osc.stop(at + ring + 0.05);
    }
  });
  // the graph is let go once the echo has died away
  setTimeout(() => out.disconnect(), (NOTES.length * STEP + RING + 1.5) * 1000);
}
