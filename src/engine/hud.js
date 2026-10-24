// The stage HUD (SAT-R decompilation, src/game/sa1/stage/stage_ui.c): the ring count over the ring icon,
// the score, the timer and the lives, all sprites in front of everything else. It runs after the rings and
// objects and before Sonic, so it shows this frame's ring count; the timer shows the count from before this
// frame's tick, which comes last.

const RED = 11, COLON = 10;            // the red glyphs follow the eleven white ones
const FLASH = [0, RED, RED, 0];        // the zero-ring string, 8 frames per glyph: white, red, red, white
const RED_AFTER = 9 * 3600, BEEP_AFTER = 9 * 3600 + 40 * 60, TIME_LIMIT = 10 * 3600;   // in frames
const GLYPH_W = 8;

const digits = n => String(n).split('').map(Number);

/**
 * `flash` is the zero-ring flash counter (unk48). The HUD's task never sets it: its data takes the place of the
 * title card's pieces', and the counter starts with what the card leaves there, its fade's done flag, 1.
 */
export function createHud() {
  return { flash: 1, sprites: [] };
}

/**
 * Lays out this frame's HUD sprites as [what, x, y], back to front, where `what` is 'ring', 'face' or a
 * glyph number. Returns true on the frames the timer warning beeps.
 */
export function updateHud(hud, { ringCount, score, lives, courseTime, stageTime }) {
  const icons = [['ring', -2, -1], ['face', 2, 144]];
  const glyphs = [];
  const row = (list, x, y) => list.forEach((g, i) => glyphs.push([g, x + i * GLYPH_W, y]));

  // the ring count: no leading zeros, centred on the icon, 999 at most; at zero it flashes red
  if (ringCount === 0) {
    row([FLASH[hud.flash >> 3]], 9, 5);
    hud.flash = (hud.flash + 1) & 31;
  } else {
    const d = digits(Math.min(ringCount, 999));
    row(d, [9, 5, 1][d.length - 1], 5);
  }

  // the score: nine digits at most, its last one always at x = 73, half off the top of the screen
  const s = digits(score % 1e9);
  row(s, 81 - GLYPH_W * s.length, -2);

  // the timer, M:SS:CC with CC in hundredths, red every other 16 frames after 9:00
  // (10:00 and later read 9:59:99)
  const red = courseTime > RED_AFTER && (stageTime & 0x10) ? RED : 0;
  const sec = Math.floor(courseTime / 60) % 60, hundredths = Math.floor((courseTime % 60) * 100 / 60 + 0.5);   // gMillisUnpackTable
  const time = courseTime >= TIME_LIMIT ? [9, COLON, 5, 9, COLON, 9, 9]
    : [Math.floor(courseTime / 3600), COLON, Math.floor(sec / 10), sec % 10, COLON, Math.floor(hundredths / 10), hundredths % 10];
  row(time.map(g => g + red), 25, 12);

  // the lives digit shows one less than the count, 9 at most
  row([lives > 9 ? 9 : lives === 0 ? 0 : lives - 1], 22, 143);

  hud.sprites = [...icons, ...glyphs];
  return courseTime > BEEP_AFTER && courseTime < TIME_LIMIT && courseTime % 60 === 0;
}
