// The time over (SAT-R decompilation, src/game/sa1/ui/time_over.c): what Sonic Advance shows once the course time
// has run out (the end of Task_GameStage) and Sonic has a life left to start the act over with. The act keeps
// running behind it, without Sonic. TIME OVER waits off the right edge for half a second, slides in to the
// middle, 2 px a frame, and stays; from 3.5 seconds the whole screen darkens, and after 5.5 the act starts over
// (CreateGameStage) with the rings gone.
//
// CreateTimeOver makes two tasks: a timer (0x2200), which runs the fade, and the words (0x2220), which place
// themselves from the timer's count. runTimeOver runs both in turn and leaves what the frame shows (renderer.js
// draws it):
// - x: TIME and OVER's x, both at y 60 (TIME is sprite animation 715's variant 4, OVER the game over's right half)
// - bldY: the brightness decrease on the whole screen, the words and the HUD too (0 when none)
// - fading: the fade has started (BLDCNT is then the fade's, so no layer is blended)

const SLIDE_FROM = 30, SLIDE_TO = 120, FADE_FROM = 210, END = 330;   // TIME(0, 0.5), (0, 2), (0, 3.5), (0, 5.5)
const START_X = 240 + 60, MIDDLE_X = 120;
const FADE_SPEED = 0x40, MAX_FADE = 32 * 256;   // a StrcUi_805423C going out to black, 0x40 a frame

/** The time over as CreateTimeOver makes it. */
export function createTimeOver() {
  return { timer: 0, x: START_X, level: 0, bldY: 0, fading: false };
}

/** One frame of the time over. Returns true when the act starts over this frame. */
export function runTimeOver(to) {
  // Task_TimeOverTimerUpdate: the words read the count it had before it moves on; past 3.5 seconds the fade's
  // registers (sub_805423C), half the level's whole part, before the level goes up
  const t = to.timer;
  if (t > FADE_FROM) {
    to.fading = true;
    to.bldY = Math.min(32, to.level >> 8) >> 1;
    to.level = Math.min(MAX_FADE, to.level + FADE_SPEED);
  }
  if (++to.timer > END) return true;
  // Task_TimeOverStateUpdate
  if (t > SLIDE_TO) to.x = MIDDLE_X;
  else if (t > SLIDE_FROM) to.x = START_X - (t - SLIDE_FROM) * 2;
  return false;
}
