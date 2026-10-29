// The achievements, opened from the settings: each with its trophy, gold once earned, its name, what earns it,
// when it was earned and its points, drawn like the dreamports.net launcher, light or dark as it is. The close
// button, Esc, a click outside it or B on a controller closes it.

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
    </header>
    <ul class="ach-list"></ul>
    </div>`;
  host.append(dialog);
  const list = dialog.querySelector('.ach-list'), count = dialog.querySelector('.ach-count');

  function fill() {
    const all = store.list(), earned = all.filter(a => a.earned);
    count.textContent = `${earned.length}/${all.length}`;
    list.innerHTML = all.map(a => `
      <li class="ach"${a.earned ? ' data-earned' : ''}>
        <canvas width="${TROPHY_W}" height="${TROPHY_H}" aria-hidden="true"></canvas>
        <div class="ach-text">
          <h3>${escape(a.title)}</h3>
          <p>${escape(a.description)}${a.earned ? `<span class="ach-when"> · ${day.format(a.earned)}</span>` : ''}</p>
        </div>
        <span class="ach-points">${a.points} pts</span>
      </li>`).join('');
    list.querySelectorAll('canvas').forEach((c, i) => drawTrophy(c.getContext('2d'), 0, 0, all[i].earned ? undefined : LOCKED));
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
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // outside the panel
  dialog.addEventListener('close', onClose);

  return {
    open() {
      dialog.dataset.look = isDark() ? 'dark' : 'light';
      fill();
      dialog.showModal();
      bHeld = true;
      requestAnimationFrame(watchPads);
    },
    refresh() { if (dialog.open) fill(); },
  };
}
