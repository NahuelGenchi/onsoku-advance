// The asset viewer: what the extractor decodes from the player's ROM (the ROM's facts, Sonic's animations playing
// with their own timing, the sprite atlas, the act with its collision and the zone's background), drawn like the
// dreamports.net launcher, light or dark as it is. The game page opens it from its settings over the waiting game;
// viewer.html shows it on its own. Its back arrow, Esc or B on a controller goes back.

import { drawLayer, collisionImage } from '../engine/stage.js';
import { createTerrain } from '../engine/terrain.js';
import { levelInfo } from '../rom/levels.js';
import { connectedPads } from '../engine/input.js';
import { padsHeld } from './pad-nav.js';
import { pickedTheme, isDark } from './theme.js';

const hex = n => '0x' + n.toString(16).toUpperCase().padStart(6, '0');
const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const BACK = '<svg viewBox="0 0 7 7" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" fill="currentColor"/></svg>';
const SCROLL = 60;   // px a step of the d-pad scrolls

/**
 * Renders the viewer into `host`. Its back arrow is a link to `back.href`, or a button calling `back.go()`, named
 * `back.label`. Returns { show(assets, fileName), ask(message, onFile), clear() }: `show` draws what `assets`
 * (extract.js) hold, `ask` asks for the ROM with a button and a drop on the page, and `clear` lets go of it all.
 */
export function createAssetsView(host, { back }) {
  host.innerHTML = `
    <div class="assets-page">
      <div class="setup-bar">
        ${back.href ? `<a class="setup-back" href="${back.href}"` : '<button type="button" class="setup-back"'} aria-label="${back.label}" title="${back.label}">${BACK}${back.href ? '</a>' : '</button>'}
      </div>
      <header class="setup-head">
        <p class="setup-brand">Sonic Advance Dreamport</p>
        <h1>Asset viewer</h1>
        <p class="setup-intro">Decoded in this browser from your ROM.</p>
      </header>
      <div class="assets-body"></div>
    </div>`;
  const body = host.querySelector('.assets-body'), backEl = host.querySelector('.setup-back');
  if (back.go) backEl.addEventListener('click', () => back.go());
  let stopped = true;

  // the launcher's look, picked in its settings or else the device's
  function paint() {
    const theme = pickedTheme();
    if (theme) host.dataset.theme = theme;
    else delete host.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#050a24' : '#ffffff');
  }

  // Esc, or B on a controller, goes back; the d-pad or the left stick scrolls
  addEventListener('keydown', e => { if (e.code === 'Escape' && !host.hidden) backEl.click(); });
  const held = new Set();
  let showing = false;
  (function read() {
    requestAnimationFrame(read);
    const pads = connectedPads();
    if (host.hidden || !pads.length) { showing = false; return; }
    const now = padsHeld(pads);
    if (showing) {
      if (now.has('b') && !held.has('b')) backEl.click();
      if (now.has('up')) scrollBy({ top: -SCROLL / 4 });
      if (now.has('down')) scrollBy({ top: SCROLL / 4 });
    }
    showing = true;
    held.clear();
    now.forEach(b => held.add(b));
  })();

  function part(title, inner = '') {
    const el = document.createElement('section');
    el.className = 'assets-part';
    el.innerHTML = `<h2>${escape(title)}</h2>${inner}`;
    body.append(el);
    return el;
  }

  function show(assets, fileName) {
    clear();
    paint();
    stopped = false;
    const { info, sprites, stage, physics } = assets;
    const name = (() => { try { return levelInfo(stage.level).name; } catch { return `Level ${stage.level}`; } })();
    const facts = {
      ...(fileName ? { File: fileName } : {}),
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
    part('ROM', `<dl class="assets-facts">${Object.entries(facts).map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl>`);
    previewAnimations(part('Animations', '<div class="assets-anims"></div>').querySelector('.assets-anims'), sprites);
    // the atlas is 2048 px wide, so at its own size; the box scrolls
    part('Sprite atlas', '<div class="assets-sheet"></div>').querySelector('.assets-sheet').append(scaled(sprites.atlas, 1));
    showMap(part(name, `
      <p class="assets-note"></p>
      <label class="switch">
        <span class="switch-text"><span class="switch-label">Show the collision</span><span class="switch-hint">Front layer red, back layer blue, jump-through lighter</span></span>
        <input type="checkbox"><span class="switch-track" aria-hidden="true"><span></span></span>
      </label>
      <div class="assets-sheet"></div>`), stage);
    part(`${name.replace(/ act \d+$/, '')} background`, '<div class="assets-sheet"></div>').querySelector('.assets-sheet').append(scaled(stage.background, 2));
  }

  function ask(message, onFile) {
    clear();
    paint();
    const el = part('Your ROM', `
      <p class="assets-note">${escape(message)}</p>
      <p class="assets-status" role="status" aria-live="polite"></p>
      <button type="button" class="assets-choose">Choose your Sonic Advance ROM</button>
      <input type="file" accept=".gba,.agb,.bin" hidden>`);
    const input = el.querySelector('input'), status = el.querySelector('.assets-status');
    const use = async file => {
      if (!file) return;
      try { await onFile(await file.arrayBuffer(), file.name, text => { status.textContent = text; }); }
      catch (err) { status.textContent = err.message || String(err); }
    };
    el.querySelector('.assets-choose').addEventListener('click', () => input.click());
    input.addEventListener('change', () => use(input.files[0]));
    host.ondragover = e => e.preventDefault();
    host.ondrop = e => { e.preventDefault(); use(e.dataTransfer.files[0]); };
  }

  function clear() {
    stopped = true;
    host.ondragover = host.ondrop = null;
    body.replaceChildren();
  }

  // the whole act at full size: back layer, front layer, and the collision on top when asked
  function showMap(el, stage) {
    const map = document.createElement('canvas');
    map.width = stage.width; map.height = stage.height;
    const g = map.getContext('2d');
    const draw = () => {
      g.clearRect(0, 0, map.width, map.height);
      drawLayer(g, stage, 'back', 0, 0, map.width, map.height);
      drawLayer(g, stage, 'front', 0, 0, map.width, map.height);
    };
    draw();
    el.querySelector('.assets-sheet').append(map);
    el.querySelector('.assets-note').textContent =
      `${stage.levelX} × ${stage.levelY} metatiles, ${stage.width} × ${stage.height} px, ${stage.collision.angles.length} collision tiles.`;
    let overlay = null;
    el.querySelector('input').addEventListener('change', e => {
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

  // plays every animation with its own frame delays (60 ticks per second), anchored like in the game, until the
  // viewer is cleared
  function previewAnimations(box, { atlas, frames, anims }) {
    const SIZE = 64, SCALE = 2;
    const players = Object.entries(anims).map(([name, anim]) => {
      const card = document.createElement('figure');
      card.className = 'assets-anim';
      const canvas = document.createElement('canvas');
      canvas.width = SIZE * SCALE; canvas.height = SIZE * SCALE;
      card.append(canvas);
      card.insertAdjacentHTML('beforeend', `<b>${escape(name)}</b><small>${anim.frames.length} frames${anim.loop === null ? ' · once' : ''}</small>`);
      box.append(card);
      return { anim, g: canvas.getContext('2d'), i: 0, left: anim.frames[0][1] };
    });
    let last = performance.now(), acc = 0;
    function tick(now) {
      if (stopped) return;
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

  return { show, ask, clear };
}

function scaled(source, scale) {
  const c = document.createElement('canvas');
  c.width = source.width * scale; c.height = source.height * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(source, 0, 0, c.width, c.height);
  return c;
}
