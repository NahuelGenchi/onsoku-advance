// The game page's start: a card for each ROM the game reads, the Sonic Advance ROM it runs on and the two its
// optional extras take from. A ROM is chosen or dropped on its card, or dropped anywhere on the page, where it
// goes to the card of the game its header names. Each is read as soon as it is chosen, and kept in this browser
// if the player wants, so Play starts the game straight away.

import { loadRememberedRom, rememberRom, forgetRom } from './rom-store.js';

const MAX_BYTES = 512 * 1024 * 1024;   // the largest Nintendo DS cartridge; a Game Boy Advance one is 32 MB

const ICONS = {
  gba: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h12.6l6.9 6.9v14.6a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 5 25.5z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><rect x="9" y="9" width="14" height="10" rx="1.6" fill="currentColor"/><path d="M10 24.5h1.6M13.5 24.5h1.6M17 24.5h1.6M20.5 24.5h1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  nds: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 5.5A1.5 1.5 0 0 1 9.5 4h10.3L24 8.2v18.3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 8 26.5z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M11.5 7.5v2.6M14.5 7.5v2.6M17.5 7.5v2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="11" y="13" width="10" height="10" rx="1.4" fill="currentColor"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4.5m0 0-4.5 4.5M12 4.5 16.5 9M4.5 15v2.5A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2V15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m7.5 12.4 3 3 6-6.4" fill="none" stroke="#062814" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 7v6.2M12 16.6v.2" fill="none" stroke="#2a0606" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" fill="currentColor"/></svg>`,
};

const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const megabytes = bytes => `${Math.round(bytes / (1024 * 1024))} MB`;
// waits for the page to draw what was just set, or a moment when it isn't drawing (a hidden tab)
const drawn = () => new Promise(resolve => { requestAnimationFrame(() => setTimeout(resolve)); setTimeout(resolve, 100); });

/**
 * Renders the screen into `host`. Each of `slots` is { key, store, title, platform, icon, color, required, role,
 * accept, kind, claims(buffer), read(buffer, progress), unload(), extras }: `claims` says whether a file's header
 * names this game; `read` reads the ROM and resolves to a line about it (its region), or throws with a message
 * for the player, keeping the ROM it had; `unload` lets go of that one; `extras` are its options, each { label,
 * name, hint, get(), set(on), auto }, where `name` is how the line under Play names it and `auto` turns it on
 * when the ROM is chosen. `onPlay()` starts the game once every required ROM is read.
 */
export function createRomSetup(host, { heading, intro, slots, onPlay }) {
  host.innerHTML = `
    <div class="setup">
      <header class="setup-head">
        <p class="eyebrow">音速 · Onsoku Advance</p>
        <h1>${heading}</h1>
        <p class="setup-intro">${intro}</p>
      </header>
      <ol class="setup-meter" aria-label="Your ROMs">
        ${slots.map(s => `<li data-for="${s.key}" style="--game: ${s.color}"><span class="dot"></span>${s.title}</li>`).join('')}
        <li class="count" aria-live="polite"></li>
      </ol>
      <div class="setup-cards">${slots.map(card).join('')}</div>
      <div class="setup-play">
        <button type="button" class="play" disabled>${ICONS.play}<span class="play-label">Play</span><kbd>Enter</kbd></button>
        <p class="play-note" aria-live="polite"></p>
      </div>
      <footer class="setup-foot">
        <label class="remember"><input type="checkbox" checked> Remember these ROMs on this device</label>
        <p class="privacy">${ICONS.lock}<span>Your ROMs never leave this device: this page reads them in your browser, and only keeps them here if you choose. <button type="button" class="link forget" hidden>Forget the saved ROMs</button></span></p>
      </footer>
      <div class="setup-drag" aria-hidden="true"><div>${ICONS.upload}<strong>Drop your ROMs</strong><span>Each one goes to its own game</span></div></div>
    </div>`;

  function card(s) {
    const id = `rom-${s.key}`;
    return `
      <article class="rom" data-slot="${s.key}" data-state="empty" style="--game: ${s.color}" aria-labelledby="${id}-title">
        <header class="rom-head">
          <span class="rom-art">${ICONS[s.icon]}</span>
          <div class="rom-name">
            <p class="rom-platform">${s.platform}</p>
            <h2 id="${id}-title">${s.title}</h2>
          </div>
          <span class="rom-tag" data-required="${s.required}">${s.required ? 'Required' : 'Optional'}</span>
        </header>
        <p class="rom-role">${s.role}</p>
        <div class="rom-body">
          <div class="rom-drop">
            <span class="rom-drop-icon">${ICONS.upload}</span>
            <button type="button" class="rom-select" aria-describedby="${id}-hint">Select your file</button>
            <span class="rom-hint" id="${id}-hint">or drop the ${s.kind} file here</span>
          </div>
          <div class="rom-reading" role="progressbar" aria-label="Reading ${s.title}">
            <span class="rom-progress-text">Reading…</span>
            <span class="rom-bar"><span></span></span>
          </div>
          <div class="rom-ready">
            <span class="rom-check">${ICONS.check}</span>
            <div class="rom-file">
              <strong class="rom-file-name"></strong>
              <span class="rom-detail"></span>
            </div>
            <div class="rom-actions">
              <button type="button" class="link rom-change">Change</button>
              <button type="button" class="link rom-remove">Remove</button>
            </div>
          </div>
        </div>
        <p class="rom-status" role="status" aria-live="polite"></p>
        ${s.extras.length ? `<ul class="rom-extras">${s.extras.map((e, i) => `
          <li><label class="switch">
            <span class="switch-text"><span class="switch-label">${e.label}</span><span class="switch-hint">${e.hint}</span></span>
            <input type="checkbox" role="switch" data-extra="${i}">
            <span class="switch-track" aria-hidden="true"><span></span></span>
          </label></li>`).join('')}</ul>` : ''}
        <input type="file" accept="${s.accept}" multiple hidden>
      </article>`;
  }

  const $ = sel => host.querySelector(sel);
  const play = $('.play'), note = $('.play-note'), count = $('.count');
  const remember = $('.remember input'), forget = $('.forget');
  const cards = Object.fromEntries(slots.map(s => {
    const el = host.querySelector(`.rom[data-slot="${s.key}"]`);
    const q = sel => el.querySelector(sel);
    return [s.key, {
      slot: s, el, token: 0, saved: false,
      input: q('input[type=file]'), status: q('.rom-status'), progress: q('.rom-progress-text'),
      name: q('.rom-file-name'), detail: q('.rom-detail'), extras: [...el.querySelectorAll('[data-extra]')],
      meter: host.querySelector(`.setup-meter [data-for="${s.key}"]`),
    }];
  }));

  function setState(c, state) {
    c.el.dataset.state = state;
    c.meter.dataset.state = state;
    const ready = state === 'ready';
    c.extras.forEach((box, i) => { box.disabled = !ready; box.checked = ready && c.slot.extras[i].get(); });
    update();
  }

  function say(c, text, kind = 'info') {
    c.status.textContent = text;
    c.status.dataset.kind = kind;
  }

  // the Play button, the count and the line under the button
  function update() {
    const all = Object.values(cards);
    const ready = all.filter(c => c.el.dataset.state === 'ready');
    const missing = all.filter(c => c.slot.required && c.el.dataset.state !== 'ready');
    const reading = all.some(c => c.el.dataset.state === 'reading');
    count.textContent = `${ready.length} of ${all.length} ready`;
    play.disabled = missing.length > 0 || reading;
    forget.hidden = !all.some(c => c.saved);
    if (missing.length) {
      note.textContent = `Add your ${missing.map(c => c.slot.title).join(' and ')} ROM to play.`;
      return;
    }
    const on = ready.flatMap(c => c.slot.extras.filter(e => e.get()).map(e => e.name));
    const absent = all.filter(c => !c.slot.required && c.el.dataset.state !== 'ready').map(c => c.slot.title);
    note.textContent = (reading ? 'Reading… ' : on.length ? `Ready, with ${list(on)}.` : 'Ready to play.')
      + (absent.length ? ` ${list(absent)} ${absent.length > 1 ? 'are' : 'is'} optional.` : '');
  }
  const list = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

  // reads `buffer` into the card's game, resolving to null or what's wrong with it; `store` keeps it in this
  // browser, `auto` turns its extras on. A ROM it can't read leaves the one it had.
  async function load(c, buffer, name, { store = false, auto = false, saved = false } = {}) {
    const token = ++c.token, had = c.el.dataset.state === 'ready';
    say(c, '');
    c.progress.textContent = 'Reading…';
    setState(c, 'reading');
    await drawn();
    try {
      const detail = await c.slot.read(buffer, async text => {
        if (token === c.token) c.progress.textContent = text;
        await drawn();
      });
      if (token !== c.token) return null;
      c.name.textContent = name;
      c.name.title = name;
      c.saved = saved || (store && await rememberRom(name, buffer, c.slot.store));
      c.detail.textContent = [detail, megabytes(buffer.byteLength), c.saved ? 'saved on this device' : ''].filter(Boolean).join(' · ');
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

  // a chosen or dropped file: to the card of the game its header names, else to `target` (whose check then says
  // what's wrong with it). Resolves to { key, error }: the game it went to and, when it couldn't be read, why.
  async function addFile(file, target, auto, alone) {
    const into = target && cards[target];
    const fail = error => { if (into) say(into, error, 'error'); else showNote(error); return { key: null, error }; };
    if (file.size > MAX_BYTES) return fail(`${file.name} is too large to be a Game Boy Advance or Nintendo DS ROM.`);
    const buffer = await file.arrayBuffer();
    const c = Object.values(cards).find(c => c.slot.claims(buffer)) ?? into;
    if (!c) return fail(`${file.name} isn't Sonic Advance, Sonic Advance 2 or Sonic Rush.`);
    const error = await load(c, buffer, file.name, { store: remember.checked, auto });
    if (!error && alone && into && into !== c) say(into, `That was ${c.slot.title}, so it went to its own card.`);
    return { key: c.slot.key, error };
  }
  function showNote(text) {
    note.textContent = text;
    note.dataset.kind = 'error';
    setTimeout(() => { delete note.dataset.kind; update(); }, 5000);
  }

  /**
   * Adds `files`, each to its game's card (`target`'s when its header names none); `auto` turns their extras on.
   * Resolves to { key, error } for each: the game it went to, and why it couldn't be read when it couldn't.
   */
  async function add(files, target = null, { auto = true } = {}) {
    const results = [];
    for (const file of files) results.push(await addFile(file, target, auto, files.length === 1));
    return results;
  }

  for (const c of Object.values(cards)) {
    const pick = () => c.input.click();
    c.el.querySelector('.rom-select').addEventListener('click', pick);
    c.el.querySelector('.rom-change').addEventListener('click', pick);
    c.el.querySelector('.rom-drop').addEventListener('click', e => { if (!e.target.closest('button')) pick(); });
    c.input.addEventListener('change', () => { const files = [...c.input.files]; c.input.value = ''; add(files, c.slot.key); });
    c.el.querySelector('.rom-remove').addEventListener('click', async () => {
      c.token++;
      c.slot.unload();
      c.slot.extras.forEach(e => e.set(false));
      await forgetRom(c.slot.store);
      c.saved = false;
      setState(c, 'empty');
      say(c, `${c.slot.title} was removed${c.slot.required ? '' : '; its extras are off'}.`);
      c.el.querySelector('.rom-select').focus();
    });
    c.extras.forEach((box, i) => box.addEventListener('change', () => { c.slot.extras[i].set(box.checked); update(); }));
    c.el.addEventListener('dragover', e => { e.preventDefault(); c.el.classList.add('over'); });
    c.el.addEventListener('dragleave', e => { if (!c.el.contains(e.relatedTarget)) c.el.classList.remove('over'); });
  }

  // files dragged over the page: the overlay, and on a drop each file to its game's card
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
    for (const c of Object.values(cards)) {
      await forgetRom(c.slot.store);
      if (c.saved) c.detail.textContent = c.detail.textContent.replace(' · saved on this device', '');
      c.saved = false;
    }
    update();
    note.textContent = 'The saved ROMs were removed from this browser. The ones above stay until you leave the page.';
  });

  // the ROMs kept from an earlier visit, each read again
  const restored = Promise.all(Object.values(cards).map(async c => {
    const saved = await loadRememberedRom(c.slot.store);
    if (saved && c.el.dataset.state === 'empty') await load(c, saved.buffer, saved.name, { saved: true });
  })).then(() => { if (!play.disabled) play.focus({ preventScroll: true }); });
  update();

  return {
    add, restored,
    /** Shows the extras as they are now (they can also be changed in the game). */
    refresh() { for (const c of Object.values(cards)) setState(c, c.el.dataset.state); },
    focus() { (play.disabled ? host.querySelector('.rom[data-state="empty"] .rom-select') : play)?.focus(); },
  };
}
