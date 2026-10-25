// The SEGA and Sonic Team logos (SAT-R decompilation, src/game/sa1/menus/title_screen.c: CreateSegaLogo and the
// tasks after it), the first screens when the game starts with a saved game. SEGA's logo wipes in from the
// bottom over 160 frames, a line more each frame (the lines below it are the logo, the lines above it its first
// line stretched), holds for 120 frames and wipes out the same way. Then Sonic Team's logo opens out from its
// middle: its top and bottom 40 lines show at once, and its middle 80 lines start split apart, every other
// line shifted the other way, closing in 2 pixels a frame. With SEGA's ring sound it holds for 122 frames, then
// fades to white over 33, and the intro starts. A or Start while it fades goes to the title screen instead.

import { drawBackground, createBackground } from '../gba/background.js';
import { scrollLines, fillLines, shearLines } from '../gba/lines.js';
import { FLAGS, KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';

const TM_PRESENTED_BY_SEGA = 86, TM_CREATED_BY_SONIC_TEAM = 87;
const WIPE = 160, SEGA_HOLD = 120, SONIC_TEAM_HOLD = 120, FADE_STEP = 0x80, FADE_END = 0x1000;

// CreateSegaLogo and CreateSonicTeamLogo: layer 2 alone (map block 30, tiles from 0) with the logo's 20 × 10
// tiles at (5, 5), the map filled with tile 0 first
function showLogo(ctx, tilemapId, main) {
  const e = ctx.engine;
  e.bldCnt = 0; e.bldY = 0;
  e.dispCnt = 0x40;
  e.bgCnt[2] = 0x5E01;
  e.bgScroll[4] = 0; e.bgScroll[5] = 0;
  // for the widescreen view: the logo's map once across, nothing either side of it
  e.wideLayers = [null, null, { x: { once: true } }, null];
  e.video.vram.fill(0, 0, 64);
  e.mapFill[2].value = 0;
  e.mapFill[2].rect.set([0, 0, 0xFF, 0x40]);
  const logo = {
    ctx, unk0: 0, qFade: 0,
    bg: createBackground({ layoutVram: 30 * 0x800, tilemapId, unk22: 5, unk24: 5, targetTilesX: 20, targetTilesY: 10, flags: 2 }),
  };
  e.createTask(main, logo, 0x2000);
  drawBackground(e, ctx.tilemaps, logo.bg);
}

/**
 * CreateSegaLogo. `ctx` has the engine (engine.js), the ROM's tilemap table (`tilemaps`) and what comes next:
 * `intro()`, and `title(playMusic)`.
 */
export function createSegaLogo(ctx) {
  ctx.engine.flags |= FLAGS.NO_RESET;
  showLogo(ctx, TM_PRESENTED_BY_SEGA, t => { t.main = segaWipeIn; t.main(t); });
}

const scroll = e => [e.bgScroll[4], e.bgScroll[5]];

// Task_SegaLogoInit: the logo's lines from the bottom of the screen up, and above them its first line
function segaWipeIn(t) {
  const logo = t.data, e = logo.ctx.engine;
  e.dispCnt |= 0x400;
  logo.unk0++;
  const [h, v] = scroll(e);
  scrollLines(e, 2, 0, WIPE - logo.unk0, h, v + WIPE - logo.unk0);
  fillLines(e, 2, WIPE - logo.unk0, WIPE, h, v);
  if (logo.unk0 === WIPE) { t.main = segaHold; logo.unk0 = 0; }
}

// sub_800D3E0: the logo as it is for 120 frames; nothing writes its lines' scroll now, and the H-blank copy is
// off, so they all show the layer's own
function segaHold(t) {
  if (++t.data.unk0 === SEGA_HOLD) { t.main = segaWipeOut; t.data.unk0 = 0; }
}

// Task_800D11C: the reverse, the logo's last line stretched up from the bottom
function segaWipeOut(t) {
  const logo = t.data, { ctx } = logo, e = ctx.engine;
  logo.unk0++;
  const [h, v] = scroll(e);
  fillLines(e, 2, 0, WIPE - logo.unk0, h, v);
  scrollLines(e, 2, WIPE - logo.unk0, WIPE, h, v + WIPE - logo.unk0);
  if (logo.unk0 === WIPE) {
    e.flags &= ~FLAGS.NO_RESET;
    // SwitchToSonicTeamLogo
    e.flags &= ~FLAGS.HBLANK_COPY;
    e.destroyTask(t);
    showLogo(ctx, TM_CREATED_BY_SONIC_TEAM, t2 => { t2.main = sonicTeamOpen; t2.main(t2); });
  }
}

// Task_800D268: the top and bottom 40 lines as they are, the middle 80 split, closing 2 pixels a frame; once the
// split is under 80 pixels, the middle lines from line 64 - unk0 on (as a byte) show as they are too
function sonicTeamOpen(t) {
  const logo = t.data, e = logo.ctx.engine;
  e.dispCnt |= 0x400;
  logo.unk0 += 2;
  if (logo.unk0 < 280) {
    const [h, v] = scroll(e);
    fillLines(e, 2, 0, 40, h, v);
    fillLines(e, 2, 120, 160, h, v);
    if (logo.unk0 < 200) shearLines(e, 2, 40, 120, 280 - logo.unk0, -1, h, v);
    else {
      shearLines(e, 2, 40, 64 - logo.unk0, 280 - logo.unk0, -1, h, v);
      fillLines(e, 2, 64 - logo.unk0, 120, h, v);
    }
  } else {
    e.playSong(SONG.SEGA_RING);
    e.flags &= ~FLAGS.HBLANK_COPY;
    t.main = sonicTeamHold;
    logo.unk0 = 0;
  }
}

// Task_800D450: 122 frames, then the fade to white starts
function sonicTeamHold(t) {
  const logo = t.data, e = logo.ctx.engine;
  if (logo.unk0++ > SONIC_TEAM_HOLD) {
    logo.qFade = 0;
    t.main = sonicTeamFade;
    e.bldCnt = 0xFF;
    e.bldY = 0;
  }
}

// sub_800D364: brighter by a 32nd a frame; A or Start goes to the title screen (Task_800D4B0). Its last frame
// sets the brightness to 16 as an 8.8 number, which the register reads as 0, so that frame isn't brightened.
function sonicTeamFade(t) {
  const logo = t.data, { ctx } = logo, e = ctx.engine;
  if (e.pressed & (KEY.A | KEY.START)) { t.main = toTitle; return; }
  logo.qFade += FADE_STEP;
  if (logo.qFade > FADE_END) {
    e.bldY = FADE_END;
    e.destroyTask(t);
    ctx.intro();
    return;
  }
  e.bldY = logo.qFade >> 8;
}

// Task_800D4B0
function toTitle(t) {
  const { ctx } = t.data, e = ctx.engine;
  e.flags &= ~(FLAGS.NO_RESET | FLAGS.HBLANK_COPY);
  e.destroyTask(t);
  ctx.title(true);
}
