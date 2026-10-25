// Ice Mountain's background layers (SAT-R decompilation, src/game/sa1/stage/backgrounds/zone_4_init.inc.c and
// zone_4.inc.c: CreateStageBg_Zone4 and StageBgUpdate_Zone4Acts12), both acts. The background (BG3, 256 × 512)
// moves 16 px across the whole act's width and 352 px down its height. The falling snow (BG0, 256 × 256) lies
// over everything: it drifts right with the camera and the clock and falls a pixel a frame, its tiles change
// every 12 frames, and it is added to what is under it (the blend at 16/16 on both). The title card's fade
// darkens every layer instead, which leaves the snow drawn as it is, and so does the card's last frame.

export const ICE_MOUNTAIN = 3;
const BG_X = 16, BG_Y = 352;   // how far the background moves over the act: x << 4, y × (256 + 64 + 32)

const div = (a, b) => Math.trunc(a / b);   // the BIOS's Div rounds toward zero

/**
 * Where the background and the snow start (their scroll registers) for the original screen at camera (x, y)
 * on stage time `time`, and the snow's animation frame after `updates` calls of the update.
 */
export function iceMountainScroll(stage, x, y, time, updates) {
  return {
    bgX: div(x * BG_X, stage.width - 240), bgY: div(y * BG_Y, stage.height - 160),
    snowX: (x + (x >> 2) + (time >> 2)) & 0xFF, snowY: (y + 256 - time) & 0xFF,
    snowFrame: Math.floor(updates / stage.snow.delay) % stage.snow.frames.length,
  };
}
