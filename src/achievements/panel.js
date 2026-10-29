// The achievements, opened from the settings: each with its trophy, gold once earned, its name, what earns it,
// and when it was earned, those the game needs to be Beaten marked, and how far the game is from Beaten and
// Mastered at the top. Either status, pressed, shows only what it needs, with a line saying so, until it is
// pressed again. Drawn like the dreamports.net launcher, light or dark as it is. The close button, Esc, a click
// outside it or B on a controller closes it.

import { drawTrophy } from './popup.js';
import { TROPHY_W, TROPHY_H } from './pixels.js';
import { isDark } from '../ui/theme.js';
import { connectedPads } from '../engine/input.js';

const LOCKED = { G: '#8b93a6', S: '#5d6578', L: '#c3c9d6' };
const PAD_B = 1;
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/**
 * Returns { open(), refresh() } for the achievements of `store` (store.js), in a dialog added to `host`; refresh
 * shows a new unlock while it is open, and `onClose()` is called once it closes.
 */
export function createAchievementsPanel(host, store, onClose = () => {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'achievements';
  dialog.setAttribute('aria-labelledby', 'achievements-title');
  dialog.innerHTML = `
    <div class="ach-panel">
    <header class="ach-head">
      <h2 id="achievements-title">Achievements</h2>
      <span class="ach-count"></span>
      <button type="button" class="ach-close" aria-label="Close" title="Close">×</button>
      <p class="ach-status">
        <button type="button" data-status="beaten" aria-pressed="false"></button>
        <button type="button" data-status="mastered" aria-pressed="false"></button>
      </p>
      <p class="ach-note" hidden></p>
    </header>
    <ul class="ach-list"></ul>
    </div>`;
  host.append(dialog);
  const list = dialog.querySelector('.ach-list'), count = dialog.querySelector('.ach-count');
  const statuses = [...dialog.querySelectorAll('[data-status]')], note = dialog.querySelector('.ach-note');
  // the statuses: what each needs out of every achievement, and its name
  const STATUSES = {
    beaten: { name: 'Beaten', needs: all => all.filter(a => a.beaten) },
    mastered: { name: 'Mastered', needs: all => all },
  };
  let filter = null;   // the status whose achievements alone are shown, or null for all of them

  // a status reached shows its name alone; one to go, how many of its achievements are earned
  function showStatus(el, all) {
    const { name, needs } = STATUSES[el.dataset.status], wanted = needs(all);
    const got = wanted.filter(a => a.earned).length, done = got === wanted.length;
    el.textContent = done ? name : `${name} ${got}/${wanted.length}`;
    el.toggleAttribute('data-done', done);
    el.setAttribute('aria-pressed', String(filter === el.dataset.status));
  }

  // the line over a status's achievements
  function noteFor(status, wanted) {
    const { name } = STATUSES[status], n = wanted.length;
    const these = status === 'mastered' ? `all ${n} achievements` : `these ${n} achievements`;
    return wanted.every(a => a.earned) ? `You have the ${name} status: you earned ${these}.` : `Earn ${these} to get the ${name} status.`;
  }

  function fill() {
    const all = store.list(), earned = all.filter(a => a.earned);
    count.textContent = `${earned.length}/${all.length}`;
    for (const el of statuses) showStatus(el, all);
    const shown = filter ? STATUSES[filter].needs(all) : all;
    note.hidden = !filter;
    note.textContent = filter ? noteFor(filter, shown) : '';
    list.innerHTML = shown.map(a => `
      <li class="ach"${a.earned ? ' data-earned' : ''}>
        <canvas width="${TROPHY_W}" height="${TROPHY_H}" aria-hidden="true"></canvas>
        <div class="ach-text">
          <h3>${escape(a.title)}${a.beaten ? ' <span class="ach-tag">To beat</span>' : ''}</h3>
          <p>${escape(a.description)}${a.earned ? `<span class="ach-when"> · ${day.format(a.earned)}</span>` : ''}</p>
        </div>
      </li>`).join('');
    list.querySelectorAll('canvas').forEach((c, i) => drawTrophy(c.getContext('2d'), 0, 0, shown[i].earned ? undefined : LOCKED));
  }

  // B on a controller closes it, from a press that starts while it is open
  let bHeld = true;
  function watchPads() {
    if (!dialog.open) return;
    const held = connectedPads().some(p => p.buttons[PAD_B]?.pressed);
    if (held && !bHeld) dialog.close();
    bHeld = held;
    requestAnimationFrame(watchPads);
  }

  dialog.querySelector('.ach-close').addEventListener('click', () => dialog.close());
  for (const el of statuses) {
    el.addEventListener('click', () => {
      filter = filter === el.dataset.status ? null : el.dataset.status;
      fill();
      dialog.querySelector('.ach-panel').scrollTop = 0;
    });
  }
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // outside the panel
  dialog.addEventListener('close', onClose);

  return {
    open() {
      dialog.dataset.look = isDark() ? 'dark' : 'light';
      filter = null;
      fill();
      dialog.showModal();
      bHeld = true;
      requestAnimationFrame(watchPads);
    },
    refresh() { if (dialog.open) fill(); },
  };
}
