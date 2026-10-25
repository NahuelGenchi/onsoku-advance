// Draws the Moon Zone's frames (StageInit_Zone7Act2, StageBgUpdate_Zone7Act2 and the Super Egg Robo's display
// code, checked in the USA ROM). Its layers, back to front: the earth and the stars on BG1, still above line 91
// and scrolling each line on its own below it, the ground on BG0 (the act's back layer, scrolled 8 px a frame
// further than the camera), the sprites behind the robot, the robot's body on the rotating background BG2, the
// sprites in front of it, and the HUD. Then the colour effects the robot sets up with the windows and the
// brightness increase: its head flashing white where it is hit, its laser's beam, and the fade to white once
// it is beaten. The widescreen view shows more of the stage around the original screen, as on act 1.

import { SCREEN_W, SCREEN_H } from './constants.js';
import { drawLayer } from './stage.js';
import { SINE } from './trig.js';
import { createRenderer } from './renderer.js';

const DISPCNT_WIN0 = 0x2000, DISPCNT_OBJWIN = 0x8000, ANY_WINDOW = 0xE000;
const BRIGHTEN = 0x80, EFFECTS = 0x20;
const STILL_LINES = 91;   // HBlankCallback_803F92C: lines 0–90 show BG1 unscrolled

// StageBgUpdate_Zone7Act2's line offsets for the lines from 91 down at stage time t: bands of stars that drift
// left slower toward the top, then 31 lines each faster than the last
function bg1Offset(k, t) {
  if (k < 10) return (t >> 6) & 0xFF;
  if (k < 15) return (t >> 5) & 0xFF;
  if (k < 23) return (t >> 4) & 0xFF;
  if (k < 39) return (t >> 3) & 0xFF;
  return ((t >> 3) + ((t * (k - 38)) >> 5)) & 0xFF;
}

// mGBA's brightness increase on its 8-bit colours
const brighten = (c, y) => c + (((255 - c) * y) >> 4);

export function createExtraRenderer(canvas, assets) {
  const base = createRenderer(canvas, assets);
  const parts = base.parts;
  const stage = assets.stage, background = stage.backgrounds.canvases[0];
  // the body's frames, each in BG2's 256 × 256 texture where sub_80039E4 writes its map for a sprite at
  // (128, 128): its left edge down to a multiple of 16 and its top to a whole tile
  const bodies = stage.extra.body.images.map(({ img, anchorX, anchorY }) => ({ img, x0: (128 - anchorX) & ~15, y0: (128 - anchorY) & ~7 }));
  const scratch = () => { const c = document.createElement('canvas'); c.width = parts.w; c.height = parts.h; return c; };
  let bodyCanvas = scratch(), winCanvas = scratch(), topCanvas = scratch();

  // BG2 through the rotation hardware (sub_8003EE4): texel (124, 128) of the texture at (sx, sy) on the original
  // screen, turned by `rotation`, nothing outside the texture
  function drawBody({ frame, sx, sy, rotation }, ox, oy) {
    const W = parts.w, H = parts.h, b = bodies[frame];
    if (!b) return;
    // pc is (-SIN) >> 6, not -(SIN >> 6)
    const cos = SINE[(rotation & 1023) + 256] >> 6, sin = SINE[rotation & 1023] >> 6;
    const pa = cos, pb = sin, pc = -SINE[rotation & 1023] >> 6, pd = cos;
    const x0 = -pa * sx - pb * sy + (0x7C << 8), y0 = -pc * sx - pd * sy + (0x80 << 8);
    const out = new ImageData(W, H), d = out.data, src = b.img.data, iw = b.img.width, ih = b.img.height;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const lx = x - ox, ly = y - oy;
        const u = ((x0 + pa * lx + pb * ly) >> 8) - b.x0, v = ((y0 + pc * lx + pd * ly) >> 8) - b.y0;
        if (u < 0 || v < 0 || u >= iw || v >= ih || u + b.x0 >= 256 || v + b.y0 >= 256) continue;
        const k = (v * iw + u) * 4;
        if (!src[k + 3]) continue;
        const o = (y * W + x) * 4;
        d[o] = src[k]; d[o + 1] = src[k + 1]; d[o + 2] = src[k + 2]; d[o + 3] = 255;
      }
    }
    bodyCanvas.getContext('2d').putImageData(out, 0, 0);
    parts.ctx.drawImage(bodyCanvas, 0, 0);
  }

  function drawList(list, behind, vx, vy, ox, oy) {
    for (const s of list) {
      if (behind !== null && (s.prio >= 2) !== behind) continue;
      const x = s.screen ? s.x + ox : s.x - vx, y = s.screen ? s.y + oy : s.y - vy;
      if (s.affine) parts.drawAffine(s.frame, x, y, s.affine);
      else parts.drawSprite(s.frame, x, y, s.flipX, s.flipY);
    }
  }

  // the sprites a window is made of (a sprite in OBJ window mode draws nothing but the window) as an alpha mask
  function mask(c, draw) {
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    const old = parts.use(g);
    draw(g);
    parts.use(old);
    return g.getImageData(0, 0, c.width, c.height).data;
  }

  // the colour effect where the windows let it through: inside window 0 by WININ, inside the OBJ window by
  // WINOUT's high byte, elsewhere by its low byte, and everywhere without a window. In the OBJ window mGBA
  // brightens only the layers, not the sprites in front of them, when WINOUT's outside effects are off.
  function effects(display, objWindow, objTop, ox, oy) {
    const { dispcnt, winIn, winOut, bldCnt, bldY, win0 } = display;
    if ((bldCnt & 0xC0) !== BRIGHTEN || bldY === 0) return;
    const y16 = Math.min(bldY, 16), W = parts.w, H = parts.h;
    const img = parts.ctx.getImageData(0, 0, W, H), d = img.data;
    const inWin0 = (x, y) => {
      if (!(dispcnt & DISPCNT_WIN0) || !win0) return false;
      const { top, bottom, lines } = win0;
      if (top <= bottom ? y < top || y >= bottom : y < top && y >= bottom) return false;
      if (y < 0 || y >= SCREEN_H) return false;
      const right = lines[y * 2], left = lines[y * 2 + 1];
      return left <= right ? x >= left && x < right : x >= left || x < right;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = y * W + x, sx = x - ox, sy = y - oy;
        let on;
        if (!(dispcnt & ANY_WINDOW)) on = true;
        else if (sx >= 0 && sx < SCREEN_W && inWin0(sx, sy)) on = (winIn & EFFECTS) !== 0;
        else if ((dispcnt & DISPCNT_OBJWIN) && objWindow && objWindow[o * 4 + 3]) {
          on = ((winOut >> 8) & EFFECTS) !== 0 && !(objTop && objTop[o * 4 + 3] && !(winOut & EFFECTS));
        } else on = (winOut & EFFECTS) !== 0;
        if (!on) continue;
        const k = o * 4;
        d[k] = brighten(d[k], y16); d[k + 1] = brighten(d[k + 1], y16); d[k + 2] = brighten(d[k + 2], y16);
      }
    }
    parts.ctx.putImageData(img, 0, 0);
  }

  function render(state) {
    const { tick, view, sprites, windows, body, hud, card, display, scrollX, hblank = true } = state;
    const W = parts.w, H = parts.h, ctx = parts.ctx;
    ctx.imageSmoothingEnabled = false;
    const vx = view.x, vy = view.y, ox = (W - SCREEN_W) >> 1, oy = (H - SCREEN_H) >> 1;
    // BG1: each line from 91 down scrolls by the offset the camera task wrote with this frame's stage time (when
    // the HBlank interrupt sets it); its map is 256 px wide and repeats
    const t = tick - 1;
    for (let line = 0; line < H; line++) {
      const sy = line - oy, bgLine = Math.min(Math.max(sy, 0), background.height - 1);
      let off = (hblank && sy >= STILL_LINES && sy < SCREEN_H ? bg1Offset(sy - STILL_LINES, t) : 0) - ox;
      off = ((off % 256) + 256) % 256;
      for (let x = 0; x < W;) {
        const n = Math.min(256 - off, W - x);
        ctx.drawImage(background, off, bgLine, n, 1, x, line, n, 1);
        x += n; off = 0;
      }
    }
    // BG0: the ground, where the stage's scrolling has taken it
    drawLayer(ctx, stage, 'back', vx + scrollX, vy, W, H, 0, []);
    const list = parts.stack(sprites);
    drawList(list, true, vx, vy, ox, oy);
    if (body) drawBody(body, ox, oy);
    drawList(list, false, vx, vy, ox, oy);
    parts.drawHud(hud.sprites);
    if (!card) {
      let objWindow = null, objTop = null;
      if (display.dispcnt & DISPCNT_OBJWIN) {
        objWindow = mask(winCanvas, () => drawList(windows, null, vx, vy, ox, oy));
        // a sprite is on top where one in front of the body is, or one behind it where the body isn't
        const behind = mask(topCanvas, () => drawList(list, true, vx, vy, ox, oy));
        const bodyMask = body ? mask(topCanvas, () => drawBody(body, ox, oy)) : null;
        const front = mask(topCanvas, () => { drawList(list, false, vx, vy, ox, oy); parts.drawHud(hud.sprites); });
        objTop = front.map((a, k) => (k & 3) === 3 && (a || (behind[k] && !(bodyMask && bodyMask[k]))) ? 255 : 0);
      }
      effects(display, objWindow, objTop, ox, oy);
      return;
    }
    const semi = card.sprites.length > 0 && (card.sprites[0].a0 & 0xC00) === 0x400;
    if (!semi) parts.drawCard(card.sprites);
    if (card.fade.bldY) parts.darken(card.fade.bldY);
    if (semi) parts.drawCard(card.sprites);
  }

  // what the true ending's renderer (endingrender.js) draws with
  render.parts = parts;
  render.resize = (w, h) => {
    base.resize(w, h);
    bodyCanvas = scratch(); winCanvas = scratch(); topCanvas = scratch();
  };
  return render;
}
