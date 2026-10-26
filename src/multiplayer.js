// The multiplayer modes on one page: one GBA's game for each player, each on its own screen, all stepped
// together a frame at a time and joined by a link cable (engine/link.js). The first two players share the
// keyboard, the others play with controllers. Each GBA has its own sound engine; the first one's is heard.

import { createLink } from './engine/link.js';
import { createGame } from './engine/game.js';
import { createChaoHunt } from './engine/chaohunt.js';
import { createResultsScreen } from './engine/mpresults.js';
import { createInput, PLAYER_KEYS, playerPads } from './engine/input.js';
import { TICK_MS } from './engine/constants.js';

// what the link hands every GBA as the round starts, by default as in the link recordings (docs/ROM.md):
// the shared random number and the Chao's place among the stage's eight
export const DEFAULT_SEED = 0x16AF, DEFAULT_CHAO_PLACE = 2;

/**
 * Starts a round for `count` players on `assets`' multiplayer stage, a screen for each in `container`.
 * Returns { gbas, link, stop }.
 */
export function startMultiplayer({ container, assets, count, sound, seed = DEFAULT_SEED, chaoPlace = DEFAULT_CHAO_PLACE }) {
  const link = createLink(count);
  const gbas = [];
  container.replaceChildren();
  container.dataset.players = String(count);
  for (let id = 0; id < count; id++) {
    const canvas = document.createElement('canvas');
    canvas.className = 'screen';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', `Player ${id + 1}'s screen`);
    container.append(canvas);
    const input = createInput({ keys: PLAYER_KEYS[id], pads: playerPads(id, count) });
    const gbaSound = sound.forGba(id);
    const gba = { id, canvas, input, sound: gbaSound, screen: null };
    const mode = createChaoHunt({
      link, id, count, stage: assets.stage, anims: assets.sprites.anims, seed, chaoPlace,
      // the round over, the results screen takes the place of the stage
      onResults(mp) {
        gba.screen = createResultsScreen({ canvas, assets, link, id, count, ranks: mp.ranks.slice(), sound: gbaSound, input });
      },
    });
    gba.game = createGame(canvas, assets, input, gbaSound, { mode });
    gba.mode = mode;
    gba.screen = gba.game;
    gbas.push(gba);
  }

  // every GBA steps its frame, then the link carries what each sent
  let frame = 0, last = performance.now(), pending = 0;
  function loop(now) {
    pending += Math.min(100, now - last);
    last = now;
    while (pending >= TICK_MS) {
      for (const g of gbas) g.screen.step();
      link.endFrame();
      pending -= TICK_MS;
    }
    for (const g of gbas) g.screen.draw();
    frame = requestAnimationFrame(loop);
  }
  for (const g of gbas) g.game.start(false);
  frame = requestAnimationFrame(loop);
  gbas[0].canvas.focus();

  return {
    gbas, link,
    stop() {
      cancelAnimationFrame(frame);
      for (const g of gbas) g.game.stop();
      container.replaceChildren();
    },
  };
}
