// The asset viewer: what the extractor decodes from the player's ROM (the ROM's facts, Sonic's animations playing
// with their own timing, the sprite atlas, the act with its collision and the zone's background), drawn like the
// dreamports.net launcher, light or dark as it is. viewer.html shows it on its own page, every part one under the
// other, where its back arrow, Esc or B on a controller goes back; the game's settings show it as one of their
// views (sheet.js), its parts listed on the left and the one picked on the right.

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
const CHEVRON = '<svg class="chev" viewBox="0 0 3 5" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v1h1v1h1v1H2v1H1v1H0z"/></svg>';

/**
 * Renders the viewer into `host`, its back arrow a link to `back.href` named `back.label`. Returns { show(assets,
 * fileName), ask(message, onFile), clear() }: `show` draws what `assets` (extract.js) hold, `ask` asks for the ROM
 * with a button and a drop on the page, and `clear` lets go of it all.
 */
export function createAssetsView(host, { back }) {
  host.innerHTML = `
    <div class="assets-page">
      <div class="setup-bar">
        <a class="setup-back" href="${back.href}" aria-label="${back.label}" title="${back.label}">${BACK}</a>
      </div>
      <header class="setup-head">
        <p class="setup-brand">Sonic Advance Dreamport</p>
        <h1>Asset viewer</h1>
        <p class="setup-intro">Decoded in this browser from your ROM.</p>
      </header>
      <div class="assets-body"></div>
    </div>`;
  const body = host.querySelector('.assets-body'), backEl = host.querySelector('.setup-back');

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

  let stop = () => {};
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
    const shown = assetParts(assets, fileName);
    stop = shown.stop;
    body.append(...shown.parts.map(p => p.el));
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
    stop();
    host.ondragover = host.ondrop = null;
    body.replaceChildren();
  }

  return { show, ask, clear };
}

/**
 * The viewer's parts for `assets` (extract.js), each { title, el }: the ROM's facts, the animations, the sprite
 * atlas, the act and its background. Returns { parts, stop() }; `stop` ends the animations.
 */
export function assetParts(assets, fileName) {
  let stopped = false;
  const parts = [];
  function part(title, inner = '') {
    const el = document.createElement('section');
    el.className = 'assets-part';
    el.innerHTML = `<h2>${escape(title)}</h2>${inner}`;
    parts.push({ title, el });
    return el;
  }
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
  previewAnimations(part('Animations', '<div class="assets-anims"></div>').querySelector('.assets-anims'), sprites, () => stopped);
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
  // a box that scrolls can be picked with the arrows or a controller, which then scroll it
  for (const { el } of parts) el.querySelectorAll('.assets-sheet').forEach(box => { box.tabIndex = 0; box.dataset.nav = box.dataset.scroll = ''; });
  return { parts, stop: () => { stopped = true; } };
}

/**
 * Adds the viewer to the game's settings, `sheet`, as its view 'assets': the parts of what `assets()` gives, the act
 * being played, decoded as the view comes in and let go as it goes.
 */
export function createAssetsSheetView(sheet, assets) {
  let shown = null, at = 0;
  const { el, body } = sheet.view('assets', {
    title: 'Asset viewer',
    show() {
      const from = assets();
      shown = from ? assetParts(from) : null;
      at = 0;
      navs.innerHTML = (shown?.parts ?? []).map((p, i) => `<li><button type="button" class="nav" data-part="${i}" aria-current="false">${escape(p.title)}${CHEVRON}</button></li>`).join('');
      pick(0);
    },
    hide() { shown?.stop(); shown = null; navs.replaceChildren(); main.replaceChildren(); },
    first: () => el.querySelector('[data-back]'),
    tabs: () => [...el.querySelectorAll('[data-part]')],
  });
  body.innerHTML = `
    <div class="split">
      <aside class="side sheet-rise">
        <p class="side-note">Decoded in this browser from your Sonic Advance ROM.</p>
        <ul class="navs"></ul>
      </aside>
      <section class="main"></section>
    </div>`;
  const navs = el.querySelector('.navs'), main = el.querySelector('.main');
  function pick(i) {
    at = i;
    for (const b of navs.querySelectorAll('[data-part]')) b.setAttribute('aria-current', String(+b.dataset.part === at));
    const part = shown?.parts[at]?.el;
    if (!part) { main.innerHTML = '<p class="assets-empty">Add your Sonic Advance ROM to see what it holds.</p>'; return; }
    main.replaceChildren(part);
    main.scrollTop = 0;
  }
  navs.addEventListener('click', e => {
    const b = e.target.closest('[data-part]');
    if (!b) return;
    pick(+b.dataset.part);
    el.querySelector('.split').scrollTop = 0;
    main.firstElementChild?.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  });
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
function previewAnimations(box, { atlas, frames, anims }, stopped) {
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
    if (stopped()) return;
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


function scaled(source, scale) {
  const c = document.createElement('canvas');
  c.width = source.width * scale; c.height = source.height * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(source, 0, 0, c.width, c.height);
  return c;
}
