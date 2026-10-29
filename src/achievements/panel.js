// The achievements, opened from the settings: each with its trophy, gold once earned, its name, what earns it,
// and when it was earned, in a dialog drawn like the dreamports.net launcher (dialog.js).

import { drawTrophy } from './popup.js';
import { TROPHY_W, TROPHY_H } from './pixels.js';
import { createDialog } from '../ui/dialog.js';

const LOCKED = { G: '#8b93a6', S: '#5d6578', L: '#c3c9d6' };
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/**
 * Returns { dialog, open(), refresh() } for the achievements of `store` (store.js), in a dialog added to `host`;
 * refresh shows a new unlock while it is open, and `onClose()` is called once it closes.
 */
export function createAchievementsPanel(host, store, onClose = () => {}) {
  const { dialog, body: list, note: count, open } = createDialog(host, { id: 'achievements', title: 'Achievements', bodyTag: 'ul', bodyClass: 'ach-list' }, onClose);

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
      </li>`).join('');
    list.querySelectorAll('canvas').forEach((c, i) => drawTrophy(c.getContext('2d'), 0, 0, all[i].earned ? undefined : LOCKED));
  }

  return {
    dialog,
    open() { fill(); open(); },
    refresh() { if (dialog.open) fill(); },
  };
}
