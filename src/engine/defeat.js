// Sonic against enemies and their shots, and what a defeated enemy leaves behind (SAT-R decompilation,
// src/game/shared/stage/collision_3.c Coll_Player_Enemy_Attack and Coll_Player_Projectile, dust_cloud.c,
// enemy_defeat_score.c, entities_manager.c CreateEnemyDefeatScoreAndManageLives, and
// src/game/sa1/stage/trapped_animals.c). Sonic is tested with his sprite's hitboxes: slot 1 is the attack
// box of the moves that destroy enemies, slot 0 his body.

import { makeSprite, animate } from './objects.js';
import { overlap } from './collide.js';
import { tileFloor } from './terrain.js';
import { SONG } from '../sound/songs.js';
import { SINE } from './trig.js';

const SCORES = [100, 200, 400, 800, 1000];   // enemyDefeatScores, for each enemy in a row before landing
// Each zone's three animals, in turn, and how each moves once freed: it sits once it has landed (0), hops away
// left (1) or flies (2) (sAnimsTrappedAnimals, at 0x681154 in the USA ROM). The zone is the level's index halved,
// as LEVEL_TO_ZONE has it. The table holds six zones: from level 12 on the original reads the next table's bytes
// as animals, and this game frees none.
const SITS = 0, HOPS = 1, FLIES = 2;
const ZONE_ANIMALS = [
  [['animalOtter', SITS], ['animalKoala', SITS], ['animalKangaroo', HOPS]],
  [['animalMole', SITS], ['animalSkunk', HOPS], ['animalRobin', FLIES]],
  [['animalLion', SITS], ['animalPeacock', HOPS], ['animalParrot', FLIES]],
  [['animalOtter', SITS], ['animalSeal', SITS], ['animalPenguin', HOPS]],
  [['animalElephant', SITS], ['animalLion', SITS], ['animalGorilla', HOPS]],
  [['animalMole', SITS], ['animalDeer', HOPS], ['animalRabbit', HOPS]],
];
const ANIMAL_GRAVITY = 48, ANIMAL_HOP = 1024, ANIMAL_RUN = 512;   // in 1/256 px

const at = p => [Math.floor(p.x), Math.floor(p.y)];

/**
 * Coll_Player_Enemy_Attack: Sonic's attack box on the enemy's box defeats it, bouncing him back up if he was
 * falling; otherwise his body on it hurts him, or defeats it while he is invincible, without the bounce.
 * The optional Rush boost's box around him defeats it first. Returns true when the enemy is defeated.
 */
export function attackTest(s, x, y, ctx) {
  const p = ctx.player, hb = s.boxes[0];
  if (!hb || p.dead) return false;
  const [px, py] = at(p);
  // the Rush boost's box destroys it without a bounce, and shakes the screen
  if (p.boostBox && overlap(x, y, hb, px, py, p.boostBox)) {
    ctx.world.defeat(x, y);
    ctx.world.shake();
    return true;
  }
  if (p.boxes[1] && overlap(x, y, hb, px, py, p.boxes[1])) {
    if (p.ysp > 0) p.ysp = -p.ysp;
    ctx.world.defeat(x, y);
    return true;
  }
  if (p.boxes[0] && overlap(x, y, hb, px, py, p.boxes[0])) {
    if (p.invincible > 0) { ctx.world.defeat(x, y); return true; }
    ctx.world.damage();
  }
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

/** The dust cloud where an enemy or an item box was (CreateDustCloud): it runs its animation once and stays where it appeared. */
export function dustCloud(x, y) {
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

// the freed animal: it hops up and lands on the ground, then sits there or hops away left; or it flies off up and
// to the left, swaying, its heading swinging between 512 and 640 (1024 a turn) by 6 a frame. Positions and speeds
// in 1/256 px.
function animal(x0, y0, [name, moves]) {
  const s = makeSprite(name, { order: 17 });
  if (moves === FLIES) return flyingAnimal(s, x0, y0);
  let x = x0 * 256, y = y0 * 256, fall = -ANIMAL_HOP, vx = moves === HOPS ? 1 : 0, inAir = 42, bouncing = false;
  return {
    run(ctx) {
      fall += ANIMAL_GRAVITY; y += fall; x += vx;
      if (inAir > 0) inAir--;
      else {
        const d = tileFloor(ctx.world.terrain, x >> 8, y >> 8, 1);
        if (d <= 0) {
          y += d * 256;
          if (moves === HOPS) {
            fall = -ANIMAL_HOP;
            if (!bouncing) vx = -ANIMAL_RUN;
            bouncing = true;
          } else fall = 0;
        }
      }
      if (offAnimalRange(x, y, ctx.cam)) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x >> 8, y >> 8);
      return true;
    },
  };
}

// Task_FlyingAnimal: the robin and the parrot
function flyingAnimal(s, x0, y0) {
  let x = x0 * 256, y = y0 * 256, heading = 576, up = true;
  return {
    run(ctx) {
      if (up) { heading += 6; if (heading > 640) up = false; }
      else { heading -= 6; if (heading < 512) up = true; }
      x += Math.trunc(SINE[(heading & 1023) + 256] / 20); y += Math.trunc(SINE[heading & 1023] / 20);
      if (offAnimalRange(x, y, ctx.cam)) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x >> 8, y >> 8);
      return true;
    },
  };
}

// IS_OUT_OF_RANGE_3(x, y, 32, 32): more than 32 px off the screen
function offAnimalRange(x, y, cam) {
  const sx = (x >> 8) - cam.x, sy = (y >> 8) - cam.y;
  return sx < -32 || sx > 240 + 32 || sy + 32 < 0 || sy > 160 + 32;
}

/**
 * What a defeat leaves at (x, y), in the original's order: the dust, the next animal and the points. The
 * points depend on how many enemies Sonic has defeated since he last landed (p.chain), and every 50000 points
 * give a life. `game` holds score, lives and animal (the next animal's index); `oneUp()` starts the jingle; `zone`
 * picks the animals.
 */
export function defeatEffects(x, y, ctx, game, oneUp, zone = 0) {
  const p = ctx.player;
  ctx.add(dustCloud(x, y));
  if (ZONE_ANIMALS[zone]) ctx.add(animal(x, y, ZONE_ANIMALS[zone][game.animal]));
  game.animal = (game.animal + 1) % 3;
  ctx.world.playSound(SONG.ENEMY_DEFEAT);
  const before = game.score;
  game.score += SCORES[p.chain];
  if (Math.trunc(game.score / 50000) !== Math.trunc(before / 50000)) { game.lives = (game.lives + 1) & 0xFF; oneUp(); }
  ctx.add(scorePopup(x, y, p.chain, ctx.anims));
  if (p.chain < SCORES.length - 1) p.chain++;
}
