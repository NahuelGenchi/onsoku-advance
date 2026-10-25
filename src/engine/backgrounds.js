// How each zone's background scrolls (SAT-R decompilation, src/game/sa1/stage/backgrounds/), for the levels
// whose row in levels.js names a `backgroundScroll`: for each line of the original 240 × 160 screen, where in
// the background map its first pixel comes from, as [x, y], the map row shown being y + the line. Each act's
// StageBgUpdate sets BG3's scroll from the camera once a frame, or fills a table that the HBlank interrupt
// copies into it line by line. Neo Green Hill's own scrolling is in renderer.js.

const mod = (a, n) => ((a % n) + n) % n;

// Inside Secret Base (StageBgUpdate_Zone2_Interior): the wall, rows 0–63 of the map, scrolls a quarter of the
// camera's way and repeats every 64 lines. Three bars of 16 lines, rows 64–79, scroll half its way, and a
// bigger one of 24 lines, rows 80–103, two thirds, each 256 lines from the next of its kind; the later ones
// cover the earlier ones.
function secretBaseInside(line, cx, cy) {
  let x = (cx >> 2) & 0xFF, row = (line + ((cy >> 2) & 63)) & 63;
  for (let i = 0; i < 3; i++) {
    const k = mod(line + ((cy >> 1) + (i << 6)) + 16, 256);
    if (k < 16) { x = ((cx >> 1) + (i << 5)) & 0xFF; row = 64 + k; }
  }
  const k = mod(line + Math.trunc((cy << 1) / 3) + 288 + 24, 256);
  if (k < 24) { x = (Math.trunc((cx << 1) / 3) + 96) & 0xFF; row = 80 + k; }
  return [x, row - line];
}

export const BACKGROUND_SCROLL = {
  // StageBgUpdate_Zone2Act1: outside, before x 1488, all of it scrolls a 78th of the camera's way across and
  // shows the map's bottom 160 rows; the map repeats every 512 rows. From x 1488 on, the inside's.
  secretBase1(line, tick, cx, cy) {
    return cx < 1488 ? [Math.trunc((cx * 16) / (78 * 16)), 512 - 160] : secretBaseInside(line, cx, cy);
  },
};
