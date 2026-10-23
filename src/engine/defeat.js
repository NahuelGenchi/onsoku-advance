// Sonic against enemies and their shots, and what a defeated enemy leaves behind (SAT-R decompilation,
// src/game/shared/stage/collision_3.c Coll_Player_Enemy_Attack and Coll_Player_Projectile, dust_cloud.c,
// enemy_defeat_score.c, entities_manager.c CreateEnemyDefeatScoreAndManageLives, and
// src/game/sa1/stage/trapped_animals.c). Sonic is tested with his sprite's hitboxes: slot 1 is the attack
// box of the moves that destroy enemies, slot 0 his body.

import { makeSprite, animate } from './objects.js';
import { overlap } from './collide.js';
import { tileFloor } from './terrain.js';
import { SONG } from '../sound/songs.js';

const SCORES = [100, 200, 400, 800, 1000];   // enemyDefeatScores, for each enemy in a row before landing
const ANIMALS = ['animalOtter', 'animalKoala', 'animalKangaroo'];   // Neo Green Hill's, in turn
const BOUNCING = 2;
const ANIMAL_GRAVITY = 48, ANIMAL_HOP = 1024, ANIMAL_RUN = 512;   // in 1/256 px

const at = p => [Math.floor(p.x), Math.floor(p.y)];

/**
 * Coll_Player_Enemy_Attack: Sonic's attack box on the enemy's box defeats it, bouncing him back up if he was
 * falling; otherwise his body on it hurts him. Returns true when the enemy is defeated.
 */
export function attackTest(s, x, y, ctx) {
  const p = ctx.player, hb = s.boxes[0];
  if (!hb || p.dead) return false;
  const [px, py] = at(p);
  if (p.boxes[1] && overlap(x, y, hb, px, py, p.boxes[1])) {
    if (p.ysp > 0) p.ysp = -p.ysp;
    ctx.world.defeat(x, y);
    return true;
  }
  if (p.boxes[0] && overlap(x, y, hb, px, py, p.boxes[0])) ctx.world.damage();
  return false;
}

/** Coll_Player_Projectile: a shot on Sonic's body hurts him. Returns true on any touch, hurt or not. */
export function projectileTest(s, x, y, ctx) {
  const p = ctx.player, hb = s.boxes[0];
  if (!hb || p.dead || !p.boxes[0]) return false;
  const [px, py] = at(p);
  if (!overlap(x, y, hb, px, py, p.boxes[0])) return false;
  ctx.world.damage();
  return true;
}

// the dust cloud where an enemy was: it runs its animation once and stays where it appeared
function dustCloud(x, y) {
  const s = makeSprite('dustCloud', { order: 15 });
  return {
    run(ctx) {
      const ended = animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return !ended;
    },
  };
}

// the points: they rise 1 px a frame for 60 frames, stay 30 more, and go
function scorePopup(x, y, chain, anims) {
  const s = makeSprite(`score${chain}`, { order: 0 });
  animate(s, anims);
  let dy = 0, holding = false;
  return {
    run(ctx) {
      dy++;
      if (!holding) {
        ctx.draw(s, x, y - dy);
        if (dy >= 60) { holding = true; y -= dy; dy = 0; }
        return true;
      }
      if (dy > 30) return false;
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// the freed animal: it hops up and lands on the ground; the otter and the koala then sit, and the kangaroo
// hops away left. Positions and speeds in 1/256 px.
function animal(x0, y0, variant) {
  const s = makeSprite(ANIMALS[variant], { order: 17 });
  let x = x0 * 256, y = y0 * 256, fall = -ANIMAL_HOP, vx = variant === BOUNCING ? 1 : 0, inAir = 42, bouncing = false;
  return {
    run(ctx) {
      fall += ANIMAL_GRAVITY; y += fall; x += vx;
      if (inAir > 0) inAir--;
      else {
        const d = tileFloor(ctx.world.terrain, x >> 8, y >> 8, 1);
        if (d <= 0) {
          y += d * 256;
          if (variant === BOUNCING) {
            fall = -ANIMAL_HOP;
            if (!bouncing) vx = -ANIMAL_RUN;
            bouncing = true;
          } else fall = 0;
        }
      }
      const sx = (x >> 8) - ctx.cam.x, sy = (y >> 8) - ctx.cam.y;
      if (sx < -32 || sx > 240 + 32 || sy + 32 < 0 || sy > 160 + 32) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x >> 8, y >> 8);
      return true;
    },
  };
}

/**
 * What a defeat leaves at (x, y), in the original's order: the dust, the next animal and the points. The
 * points depend on how many enemies Sonic has defeated since he last landed (p.chain), and every 50000 points
 * give a life. `game` holds score, lives and animal (the next animal's index); `oneUp()` starts the jingle.
 */
export function defeatEffects(x, y, ctx, game, oneUp) {
  const p = ctx.player;
  ctx.add(dustCloud(x, y));
  ctx.add(animal(x, y, game.animal));
  game.animal = (game.animal + 1) % ANIMALS.length;
  ctx.world.playSound(SONG.ENEMY_DEFEAT);
  const before = game.score;
  game.score += SCORES[p.chain];
  if (Math.trunc(game.score / 50000) !== Math.trunc(before / 50000)) { game.lives = (game.lives + 1) & 0xFF; oneUp(); }
  ctx.add(scorePopup(x, y, p.chain, ctx.anims));
  if (p.chain < SCORES.length - 1) p.chain++;
}
