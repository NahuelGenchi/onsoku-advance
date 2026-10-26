// Asset viewer: shows what the extractor decodes from the player's ROM.

import { createRomPicker } from './ui/rom-picker.js';
import { extractAssets } from './rom/extract.js';
import { drawLayer, collisionImage } from './engine/stage.js';
import { createTerrain } from './engine/terrain.js';

const picker = document.getElementById('picker');
const viewer = document.getElementById('viewer');
const hex = n => '0x' + n.toString(16).toUpperCase().padStart(6, '0');
// the level shown, as on the game page: viewer.html?level=8 is Angel Island Zone act 1
const level = Number(new URLSearchParams(location.search).get('level') ?? 0) | 0;

createRomPicker(picker, {
  heading: 'Asset viewer',
  intro: 'Choose your Sonic Advance ROM to see the sprites, animations and stage art the extractor decodes from it.',
  async onRom(buffer, name, setStatus) {
    const assets = await extractAssets(buffer, setStatus, { level });
    show(assets, name);
    picker.hidden = true;
    viewer.hidden = false;
  },
});

function show(assets, fileName) {
  const { info, sprites, stage, physics } = assets;
  const facts = {
    File: fileName,
    Game: `${info.title} · ${info.code} (${info.region}) · revision ${info.revision}`,
    Version: info.version ?? 'Not on the tested list; tables found by search',
    'SHA-1': info.sha1 ?? 'Unavailable (open this page from localhost or https)',
    'Sprite tables': hex(info.offsets.spriteTables),
    'Tilemap table': hex(info.offsets.tilemaps),
    'Collision table': hex(info.offsets.collision),
    'Start positions': `${hex(info.offsets.spawns)} → level ${stage.level} starts at (${stage.spawn.x}, ${stage.spawn.y})`,
    Interactables: `${hex(info.offsets.interactables)} → ${stage.layerToggles.length} layer toggles and ${stage.interactables.filter(e => e.kind >= 8 && e.kind <= 15).length} springs in level ${stage.level}`,
    'Spin dash speeds': `${hex(info.offsets.spinDashSpeeds)} → ${physics.spinDashSpeeds.slice(0, 9).join(', ')}; overcharged: ${physics.spinDashSpeeds.slice(9).join(', ')}`,
  };
  document.getElementById('facts').innerHTML = Object.entries(facts).map(([k, v]) => `<dt>${k}</dt><dd></dd>`).join('');
  [...document.querySelectorAll('#facts dd')].forEach((dd, i) => { dd.textContent = Object.values(facts)[i]; });

  document.getElementById('atlas').append(scaled(sprites.atlas, 2));
  document.getElementById('background').append(scaled(stage.background, 2));
  showMap(stage);
  previewAnimations(sprites);
}

// the whole act at full size: back layer, front layer, and the collision on top when asked
function showMap(stage) {
  const map = document.createElement('canvas');
  map.width = stage.width; map.height = stage.height;
  const g = map.getContext('2d');
  const draw = () => {
    g.clearRect(0, 0, map.width, map.height);
    drawLayer(g, stage, 'back', 0, 0, map.width, map.height);
    drawLayer(g, stage, 'front', 0, 0, map.width, map.height);
  };
  draw();
  document.getElementById('map').append(map);
  document.getElementById('act').textContent =
    `${stage.levelX} × ${stage.levelY} metatiles, ${stage.width} × ${stage.height} px, ${stage.collision.angles.length} collision tiles.`;

  let overlay = null;
  document.getElementById('show-collision').addEventListener('change', e => {
    draw();
    if (!e.target.checked) return;
    if (!overlay) {
      const terrain = createTerrain(stage.collision);
      overlay = document.createElement('canvas');
      overlay.width = map.width; overlay.height = map.height;
      overlay.getContext('2d').putImageData(collisionImage(terrain, 0, 0, map.width, map.height), 0, 0);
    }
    g.drawImage(overlay, 0, 0);
  });
}

function scaled(source, scale) {
  const c = document.createElement('canvas');
  c.width = source.width * scale; c.height = source.height * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

// plays every animation with its own frame delays (60 ticks per second), anchored like in the game
function previewAnimations({ atlas, frames, anims }) {
  const SIZE = 64, SCALE = 2;
  const players = Object.entries(anims).map(([name, anim]) => {
    const card = document.createElement('figure');
    card.className = 'anim';
    const canvas = document.createElement('canvas');
    canvas.width = SIZE * SCALE; canvas.height = SIZE * SCALE;
    card.append(canvas);
    card.insertAdjacentHTML('beforeend', `<b>${name}</b><small>${anim.frames.length} frames${anim.loop === null ? ' · once' : ''}</small>`);
    document.getElementById('anims').append(card);
    return { anim, g: canvas.getContext('2d'), i: 0, left: anim.frames[0][1] };
  });
  let last = performance.now(), acc = 0;
  function tick(now) {
    acc += Math.min(250, now - last); last = now;
    while (acc >= 1000 / 60) {
      acc -= 1000 / 60;
      for (const p of players) {
        if (--p.left > 0) continue;
        p.i++;
        if (p.i >= p.anim.frames.length) p.i = p.anim.loop ?? 0;   // replay one-shot animations for the preview
        p.left = Math.max(1, p.anim.frames[p.i][1]);
      }
    }
    for (const p of players) {
      p.g.clearRect(0, 0, SIZE * SCALE, SIZE * SCALE);
      const index = p.anim.frames[p.i][0];
      if (index < 0) continue;
      const [sx, sy, w, h, ax, ay] = frames[index];
      p.g.imageSmoothingEnabled = false;
      p.g.drawImage(atlas, sx, sy, w, h, (SIZE / 2 - ax) * SCALE, (SIZE - 20 - ay) * SCALE, w * SCALE, h * SCALE);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
