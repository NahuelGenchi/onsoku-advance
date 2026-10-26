// Tentou, Secret Base's ladybird (SAT-R decompilation, src/game/sa1/stage/enemies/tentou.c; Task_TentouMain
// and sub_8074928 from their asm, which the decompilation doesn't match). It flies a loop round its spawn point
// for 64 frames, d2 tiles across and d3 up, then hovers for up to 60 frames; if Sonic comes within 80 px of it
// while it hovers, it fires two shots, one each way, on its 15th frame of firing, and flies on after 33. Its
// sprite is a left half, drawn again mirrored for the right.
//
// The original keeps the loop's offsets in 1/256 px, but places the sprite by how far they moved in the frame
// (a 32nd of it across and a 16th up) rather than by where they are, and while hovering by minus the last
// offset across. Up, it takes the frame's move modulo 64 to draw it and leaves it unmoved on a remainder of 63
// (where it tests its box at the spawn point's height), but tests its box with the whole move.

import { startAnim, animate } from './objects.js';
import { I, data, gone, sprite, COS, SIN } from './enemies.js';

export const TENTOU = 6;

const NEAR = 80 * 80;          // TENTOU_ATTACK_INIT_DISTANCE squared
const STEP_X = 8, STEP_Y = 8;  // unk58 and unk5A

export function tentou(e, slot, anims) {
  const { d2, d3 } = data(e), s = sprite('tentouHover', anims, { order: 18, prio: 2 });
  // unk4E counts the loop; ox and oy (unk50, unk54) are the offsets, in 1/256 px
  let phase = 'fly', n = 0, t = 0, ox = 0, oy = 0;
  // the offsets at step `k` of the loop
  const offX = k => Math.imul(d2 << 11, SIN((STEP_X * (k & 0x7F)) & 0x3FF)) >> 14;
  const offY = k => Math.imul(d3 << 11, COS((STEP_Y * (k & 0x3F)) & 0x3FF)) >> 14;
  const show = (ctx, x, y) => {
    animate(s, ctx.anims);
    ctx.draw(s, x, y);
    ctx.draw({ ...s, flipX: true }, x, y);
  };
  return {
    run(ctx) {
      const wx = e.x, wy = e.y, cam = ctx.cam;
      if (phase === 'fly') {
        // Task_TentouMain
        const dx = (offX(n) - ox) >> 5, dy = (offY(n) - oy) >> 4;
        ox = offX(n); oy = offY(n);
        n = (n + 1) & 0xFFFF;
        if (n === 0x40 || n === 0x80) { t = 0; startAnim(s, 'tentouHover'); phase = 'hover'; }
        n &= 0x7F;
        const x = wx + dx;
        let y;
        if (dy % 64 !== 63) {
          y = wy - dy % 64;
          if (ctx.attack(s, x, wy - dy)) { slot.gone = true; slot.live = null; return false; }
        } else {
          if (ctx.attack(s, x, wy)) { slot.gone = true; slot.live = null; return false; }
          y = wy;
        }
        if (gone(wx, wy, x, y, cam)) { slot.live = null; return false; }
        show(ctx, x, y);
        return true;
      }
      // sub_8074928 while it hovers, Task_807473C while it fires
      const dx = -ox >> 5;
      ox = offX(n - 1);
      const was = oy;
      oy = offY(n - 1);
      const dy = (oy - was) >> 4, x = wx + dx, y = wy - dy;
      t++;
      if (phase === 'fire' && t === 15) {
        ctx.add(shot(x, y - 5, 6, ctx), 0x3000);
        ctx.add(shot(x, y - 5, -6, ctx), 0x3000);
      }
      if (gone(wx, wy, x, y, cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      if (phase === 'hover') {
        const px = Math.floor(ctx.player.x) - x, py = Math.floor(ctx.player.y) - y;
        if (px * px + py * py < NEAR) { t = 0; startAnim(s, 'tentouFire'); phase = 'fire'; }
        else if (t >= 60) { t = 0; startAnim(s, 'tentouFly'); phase = 'fly'; }
      } else if (t > 32) { startAnim(s, 'tentouFly'); phase = 'fly'; }
      show(ctx, x, y);
      return true;
    },
  };
}

// a shot (CreateTentouProjectiles, sub_8074C50): GamiGami's, starting 6 px to its side at 1.5 px a frame and
// falling from rest through everything; it goes on through Sonic
function shot(x0, y0, dx, ctx) {
  const s = sprite('gamiShot', ctx.anims, { order: 9 });
  let x4 = (x0 + (dx > 0 ? 6 : -6)) * 4, vy = 0, y = y0;
  return {
    run(ctx) {
      x4 += dx;
      const x = x4 >> 2;
      vy += 40; y += I(vy);
      ctx.projectile(s, x, y);
      const sx = x - ctx.cam.x, sy = y - ctx.cam.y;
      if (((sx + 20) & 0xFFFF) > 276 || sy + 20 < 0 || sy > 240) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
