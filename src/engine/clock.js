// The fixed-step clock the frame loops run on: how many of the game's own frames (steps of `stepMs`) each of
// the display's frames (requestAnimationFrame's times) runs.
//
// A display frame's time wobbles around the display's rate (by over half a millisecond in Firefox), and a 60 Hz
// display is often a little off 60 Hz. Counting that time as it comes now and then runs no step on a frame,
// which shows the last picture again, and two on the next, which skips one: a visible stutter. With `snap`, the
// clock learns the display's frame time from the frames that aren't late, and on a display within 1% of the
// game's rate (or of twice it) counts each frame as exactly one step (or half of one), so every step is shown
// once, in order. The game then keeps the display's pace: at 59.94 Hz it runs 0.1% slow, which no one sees. A
// late frame, and any frame on another display, counts as the time it took. Without `snap` (the screens on the
// GBA's 59.73 Hz, whose timing the music follows) time always counts as it comes.

const MAX_FRAME_MS = 100;    // after a stall, catch up at most 100 ms instead of fast-forwarding
const RATE_TOLERANCE = 0.01; // how far off the game's rate a display can be and still show one step a frame
const LATE = 0.25;           // a frame this much longer or shorter than the display's is late (or early)
const LEARN = 0.05;          // how much each frame moves the learnt frame time
const RELEARN = 8;           // after this many late frames in a row, the display has changed: learn it again

export function createClock(stepMs, { snap = false } = {}) {
  let last = 0, pending = 0, period = 0, late = 0;
  return {
    /** Counts from `now` on, with nothing owed. */
    reset(now = performance.now()) { last = now; pending = 0; period = 0; late = 0; },
    /** How many steps the display frame at `now` runs. */
    steps(now) {
      let ms = Math.min(MAX_FRAME_MS, now - last);
      last = now;
      if (snap && ms > 0) {
        if (Math.abs(ms - period) < period * LATE) { period += (ms - period) * LEARN; late = 0; }
        else if (!period || ++late >= RELEARN) { period = ms; late = 0; }
        for (const share of [1, 0.5]) {
          const one = share * stepMs;
          if (Math.abs(period - one) < one * RATE_TOLERANCE && Math.abs(ms - one) < one * LATE) { ms = one; break; }
        }
      }
      pending += ms;
      let n = 0;
      while (pending >= stepMs) { n++; pending -= stepMs; }
      return n;
    },
  };
}
