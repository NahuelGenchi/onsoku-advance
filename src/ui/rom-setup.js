// The game page's start: a row for each ROM the game reads, the Sonic Advance ROM it runs on and the two its
// optional extras take from, with the switches for those extras under it. A ROM is chosen on its row or dropped
// on it, or dropped anywhere on the page, where it goes to the row of the game its header names. Each is read as
// soon as it is chosen, and kept in this browser if the player wants, so Play starts the game straight away.

import { loadRememberedRom, rememberRom, forgetRom } from './rom-store.js';
import { bindController } from './setup-controller.js';

const MAX_BYTES = 512 * 1024 * 1024;   // the largest Nintendo DS cartridge; a Game Boy Advance one is 32 MB

// pixel art on the grid of the page's font, Monocraft: a unit is one of its pixels, 2 px at its 18 px size
const pixels = (name, width, height, path) =>
  `<svg class="${name}" viewBox="0 0 ${width} ${height}" width="${width * 2}" height="${height * 2}" shape-rendering="crispEdges" aria-hidden="true"><path d="${path}" fill="currentColor" fill-rule="evenodd"/></svg>`;
const ICONS = {
  empty: pixels('mark-empty', 7, 7, 'M0 0h7v7H0zM1 1v5h5V1z'),
  reading: pixels('mark-reading', 7, 7, 'M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2z'),
  ready: pixels('mark-ready', 7, 7, 'M5 1h2v1H5zM4 2h2v1H4zM0 3h2v1H0zM3 3h2v1H3zM1 4h3v1H1zM2 5h1v1H2z'),
  play: pixels('play-icon', 4, 7, 'M0 0h1v7H0zM1 1h1v5H1zM2 2h1v3H2zM3 3h1v1H3z'),
  drop: pixels('drop-icon', 7, 7, 'M3 0h1v5H3zM1 2h1v1H1zM5 2h1v1H5zM2 3h1v1H2zM4 3h1v1H4zM0 5h1v1H0zM6 5h1v1H6zM0 6h7v1H0z'),
  back: pixels('back-icon', 7, 7, 'M3 0h1v7H3zM2 1h1v5H2zM1 2h1v3H1zM0 3h7v1H0z'),
};

// the game's own page on dreamports.net, where the way back goes when the player didn't come from its menu
const DREAMPORTS = 'https://dreamports.net/dreamports/sonic-advance-dreamport/';
// whether the page before this one is the dreamports.net menu: a page of the same site outside the games, which
// are under /play/
function cameFromMenu() {
  if (history.length < 2 || !location.pathname.startsWith('/play/')) return false;
  try {
    const from = new URL(document.referrer);
    return from.origin === location.origin && !from.pathname.startsWith('/play/');
  } catch {
    return false;
  }
}

const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
// waits for the page to draw what was just set, or a moment when it isn't drawing (a hidden tab)
const drawn = () => new Promise(resolve => { requestAnimationFrame(() => setTimeout(resolve)); setTimeout(resolve, 100); });

/**
 * Renders the screen into `host`. Each of `slots` is { key, store, title, platform, required, accept, claims(buffer),
 * read(buffer, progress), unload(), extras }: `claims` says whether a file's header names this game; `read` reads
 * the ROM and resolves to a line about it (its region), or throws with a message for the player, keeping the ROM
 * it had; `unload` lets go of that one; `extras` are its options, each { label, hint, key, get(), set(on), auto },
 * where `key` is the key that switches it in the game and `auto` turns it on when the ROM is chosen. `onPlay()`
 * starts the game once every required ROM is read.
 */
export function createRomSetup(host, { heading, intro, slots, onPlay }) {
  host.innerHTML = `
    <div class="setup">
      <header class="setup-head">
        <a class="setup-back" href="${DREAMPORTS}">${ICONS.back}<span>Back to dreamports</span></a>
        <div class="setup-top">
          <p class="setup-brand">音速 Sonic Advance Dreamport</p>
          <div class="pad" data-state="gone"><span class="pad-icon" aria-hidden="true"></span><span class="pad-note" role="status" aria-live="polite"></span></div>
        </div>
        <h1>${heading}</h1>
        <p class="setup-intro">${intro}</p>
      </header>
      <ul class="roms" aria-label="Your ROMs">${slots.map(row).join('')}</ul>
      <div class="setup-play">
        <button type="button" class="play" disabled>${ICONS.play}<span>Play</span><kbd>Enter</kbd></button>
        <p class="play-note" aria-live="polite"></p>
      </div>
      <footer class="setup-foot">
        <label class="remember"><input type="checkbox" checked> Remember on this device</label>
        <button type="button" class="link forget" hidden>Forget the saved ROMs</button>
      </footer>
      <div class="setup-drag" aria-hidden="true"><div>${ICONS.drop}<span>Drop your ROMs</span><small>Each one goes to its own game</small></div></div>
    </div>`;

  function row(s) {
    const id = `rom-${s.key}`;
    return `
      <li class="rom" data-slot="${s.key}" data-state="empty">
        <div class="rom-main">
          <span class="rom-mark">${ICONS.empty}${ICONS.reading}${ICONS.ready}</span>
          <div class="rom-text">
            <h2 id="${id}-title">${s.title}</h2>
            <p class="rom-detail" id="${id}-detail"></p>
          </div>
          <button type="button" class="rom-add" aria-describedby="${id}-title ${id}-detail">Add</button>
          <div class="rom-actions">
            <button type="button" class="rom-change" aria-describedby="${id}-title">Change</button>
            <button type="button" class="rom-remove" aria-label="Remove ${s.title}" title="Remove">×</button>
          </div>
          <span class="rom-bar" role="progressbar" aria-label="Reading ${s.title}"><span></span></span>
        </div>
        <p class="rom-status" role="status" aria-live="polite"></p>
        ${s.extras.length ? `<ul class="rom-extras">${s.extras.map((e, i) => `
          <li><label class="switch">
            <span class="switch-text"><span class="switch-label">${e.label}</span><span class="switch-hint">${e.hint}</span></span>
            <kbd title="${e.key} switches it in the game">${e.key}</kbd>
            <input type="checkbox" role="switch" data-extra="${i}">
            <span class="switch-track" aria-hidden="true"><span></span></span>
          </label></li>`).join('')}</ul>` : ''}
        <input type="file" accept="${s.accept}" multiple hidden>
      </li>`;
  }

  const $ = sel => host.querySelector(sel);
  const play = $('.play'), note = $('.play-note');
  const remember = $('.remember input'), forget = $('.forget');
  const rows = Object.fromEntries(slots.map(s => {
    const el = host.querySelector(`.rom[data-slot="${s.key}"]`);
    const q = sel => el.querySelector(sel);
    return [s.key, {
      slot: s, el, token: 0, saved: false, about: '',
      input: q('input[type=file]'), status: q('.rom-status'), text: q('.rom-text'), detail: q('.rom-detail'),
      extras: [...el.querySelectorAll('[data-extra]')],
    }];
  }));

  // back to dreamports.net: from its menu, back in the browser's history, so the menu comes back as it was left
  $('.setup-back').addEventListener('click', e => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !cameFromMenu()) return;
    e.preventDefault();
    history.back();
  });

  // the line under a ROM's name: what it is while it's missing, what was read once it's in (while it's being read,
  // the reading's progress). It wraps after a dot, never before one.
  function setState(c, state) {
    c.el.dataset.state = state;
    const ready = state === 'ready';
    const line = parts => parts.filter(Boolean).join(' · ').replaceAll(' · ', '\u00a0· ');
    if (ready) c.detail.textContent = line([c.about, c.saved && 'remembered']);
    else if (state === 'empty') c.detail.textContent = line([c.slot.platform, c.slot.required ? 'required' : 'optional']);
    c.extras.forEach((box, i) => { box.disabled = !ready; box.checked = ready && c.slot.extras[i].get(); });
    update();
  }

  function say(c, text, kind = 'info') {
    c.status.textContent = text;
    c.status.dataset.kind = kind;
  }

  // the Play button and the line under it
  function update() {
    const all = Object.values(rows);
    const missing = all.filter(c => c.slot.required && c.el.dataset.state !== 'ready');
    const reading = all.some(c => c.el.dataset.state === 'reading');
    play.disabled = missing.length > 0 || reading;
    forget.hidden = !all.some(c => c.saved);
    note.textContent = reading ? 'Reading…'
      : missing.length ? `Add your ${list(missing.map(c => c.slot.title))} ROM to play.` : 'Ready to play.';
  }
  const list = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

  // reads `buffer` into the row's game, resolving to null or what's wrong with it; `store` keeps it in this
  // browser, `auto` turns its extras on. A ROM it can't read leaves the one it had.
  async function load(c, buffer, name, { store = false, auto = false, saved = false } = {}) {
    const token = ++c.token, had = c.el.dataset.state === 'ready';
    say(c, '');
    c.detail.textContent = 'Reading…';
    setState(c, 'reading');
    await drawn();
    try {
      const detail = await c.slot.read(buffer, async text => {
        if (token === c.token) c.detail.textContent = text;
        await drawn();
      });
      if (token !== c.token) return null;
      c.text.title = name;
      c.about = detail;
      c.saved = saved || (store && await rememberRom(name, buffer, c.slot.store));
      if (auto) c.slot.extras.forEach(e => { if (e.auto) e.set(true); });
      setState(c, 'ready');
      return null;
    } catch (error) {
      const message = error.message || String(error);
      if (token !== c.token) return message;
      setState(c, had ? 'ready' : 'empty');
      say(c, message, 'error');
      return message;
    }
  }

  // a chosen or dropped file: to the row of the game its header names, else to `target` (whose check then says
  // what's wrong with it). Resolves to { key, error }: the game it went to and, when it couldn't be read, why.
  async function addFile(file, target, auto, alone) {
    const into = target && rows[target];
    const fail = error => { if (into) say(into, error, 'error'); else showNote(error); return { key: null, error }; };
    if (file.size > MAX_BYTES) return fail(`${file.name} is too large to be a Game Boy Advance or Nintendo DS ROM.`);
    const buffer = await file.arrayBuffer();
    const c = Object.values(rows).find(c => c.slot.claims(buffer)) ?? into;
    if (!c) return fail(`${file.name} isn't Sonic Advance, Sonic Advance 2 or Sonic Rush.`);
    const error = await load(c, buffer, file.name, { store: remember.checked, auto });
    if (!error && alone && into && into !== c) say(into, `That was ${c.slot.title}, so it went to its own row.`);
    return { key: c.slot.key, error };
  }
  function showNote(text) {
    note.textContent = text;
    note.dataset.kind = 'error';
    setTimeout(() => { delete note.dataset.kind; update(); }, 5000);
  }

  /**
   * Adds `files`, each to its game's row (`target`'s when its header names none); `auto` turns their extras on.
   * Resolves to { key, error } for each: the game it went to, and why it couldn't be read when it couldn't.
   */
  async function add(files, target = null, { auto = true } = {}) {
    const results = [];
    for (const file of files) results.push(await addFile(file, target, auto, files.length === 1));
    return results;
  }

  for (const c of Object.values(rows)) {
    const pick = () => c.input.click();
    c.el.querySelector('.rom-add').addEventListener('click', pick);
    c.el.querySelector('.rom-change').addEventListener('click', pick);
    c.el.querySelector('.rom-main').addEventListener('click', e => {
      if (c.el.dataset.state === 'empty' && !e.target.closest('button')) pick();
    });
    c.input.addEventListener('change', () => { const files = [...c.input.files]; c.input.value = ''; add(files, c.slot.key); });
    c.el.querySelector('.rom-remove').addEventListener('click', async () => {
      c.token++;
      c.slot.unload();
      c.slot.extras.forEach(e => e.set(false));
      await forgetRom(c.slot.store);
      c.saved = false;
      c.about = '';
      c.text.removeAttribute('title');
      setState(c, 'empty');
      say(c, `${c.slot.title} was removed${c.slot.required ? '' : '; its extras are off'}.`);
      c.el.querySelector('.rom-add').focus();
    });
    c.extras.forEach((box, i) => box.addEventListener('change', () => c.slot.extras[i].set(box.checked)));
    c.el.addEventListener('dragover', e => { e.preventDefault(); c.el.classList.add('over'); });
    c.el.addEventListener('dragleave', e => { if (!c.el.contains(e.relatedTarget)) c.el.classList.remove('over'); });
  }

  // files dragged over the page: the overlay, and on a drop each file to its game's row
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types ?? [])].includes('Files');
  addEventListener('dragenter', e => { if (host.hidden || !hasFiles(e)) return; depth++; host.classList.add('dragging'); });
  addEventListener('dragleave', () => { if (depth && --depth === 0) host.classList.remove('dragging'); });
  addEventListener('dragover', e => { if (!host.hidden && hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', e => {
    if (host.hidden || !hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    host.classList.remove('dragging');
    host.querySelectorAll('.rom.over').forEach(el => el.classList.remove('over'));
    add([...e.dataTransfer.files], e.target.closest?.('.rom')?.dataset.slot ?? null);
  });

  play.addEventListener('click', () => { if (!play.disabled) onPlay(); });
  host.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !play.disabled && !e.target.closest('button, input, label, a')) { e.preventDefault(); onPlay(); }
  });
  forget.addEventListener('click', async () => {
    for (const c of Object.values(rows)) {
      await forgetRom(c.slot.store);
      c.saved = false;
      if (c.el.dataset.state === 'ready') setState(c, 'ready');
    }
    update();
    note.textContent = 'The saved ROMs were removed from this browser. The ones above stay until you leave the page.';
  });

  bindController(host, {
    blocked: el => say(rows[el.closest('.rom').dataset.slot], 'Your browser opens the file list only from the mouse or the keyboard. You can also drop the file here.'),
  });

  for (const c of Object.values(rows)) setState(c, 'empty');
  // the ROMs kept from an earlier visit, each read again
  const restored = Promise.all(Object.values(rows).map(async c => {
    const saved = await loadRememberedRom(c.slot.store);
    if (saved && c.el.dataset.state === 'empty') await load(c, saved.buffer, saved.name, { saved: true });
  })).then(() => { if (!play.disabled) play.focus({ preventScroll: true }); });

  return {
    add, restored,
    /** Shows the extras as they are now (they can also be changed in the game). */
    refresh() { for (const c of Object.values(rows)) setState(c, c.el.dataset.state); },
    focus() { (play.disabled ? host.querySelector('.rom[data-state="empty"] .rom-add') : play)?.focus(); },
  };
}
