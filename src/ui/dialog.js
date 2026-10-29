// A dialog over the game, opened from the settings, drawn like the dreamports.net launcher, light or dark as it
// is: its title, a note beside it, a close button and what it holds. The close button, Esc, a click outside it
// or B on a controller closes it.

import { isDark } from './theme.js';
import { connectedPads } from '../engine/input.js';

const PAD_B = 1;

/**
 * Returns { dialog, body, note, open(), close() } for a dialog titled `title` added to `host`, its body a `bodyTag`
 * with the class `bodyClass`; `onClose()` is called once it closes.
 */
export function createDialog(host, { id, title, bodyTag = 'div', bodyClass = '' }, onClose = () => {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = `
    <div class="dialog-panel">
    <header class="dialog-head">
      <h2 id="${id}-title">${title}</h2>
      <span class="dialog-note"></span>
      <button type="button" class="dialog-close" aria-label="Close" title="Close">×</button>
    </header>
    <${bodyTag} class="${bodyClass}"></${bodyTag}>
    </div>`;
  host.append(dialog);

  // B on a controller closes it, from a press that starts while it is open
  let bHeld = true;
  function watchPads() {
    if (!dialog.open) return;
    const held = connectedPads().some(p => p.buttons[PAD_B]?.pressed);
    if (held && !bHeld) dialog.close();
    bHeld = held;
    requestAnimationFrame(watchPads);
  }

  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // outside the panel
  dialog.addEventListener('close', onClose);

  return {
    dialog,
    body: dialog.querySelector('.dialog-panel > :last-child'),
    note: dialog.querySelector('.dialog-note'),
    open() {
      dialog.dataset.look = isDark() ? 'dark' : 'light';
      dialog.showModal();
      bHeld = true;
      requestAnimationFrame(watchPads);
    },
    close() { dialog.close(); },
  };
}
