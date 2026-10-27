// The "choose your ROM" card shared by the game and the asset viewer.

import { loadRememberedRom, rememberRom, forgetRom } from './rom-store.js';

const MAX_ROM_BYTES = 32 * 1024 * 1024;   // largest GBA cartridge

/**
 * Renders the picker into `host`. `onRom(buffer, name, setStatus)` is awaited; when it throws,
 * its message is shown and the player can pick another file.
 */
export function createRomPicker(host, { heading, intro, onRom }) {
  host.innerHTML = `
    <div class="picker-card">
      <p class="eyebrow">音速 · Sonic Advance Dreamport</p>
      <h1>${heading}</h1>
      <p class="intro">${intro}</p>
      <button type="button" class="continue" hidden></button>
      <div class="drop" tabindex="0" role="button" aria-describedby="drop-hint">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M5 20h14v-2H5v2zm7-18-5.5 5.5 1.42 1.42L11 5.83V16h2V5.83l3.08 3.09 1.42-1.42L12 2z"/></svg>
        <strong>Choose your Sonic Advance ROM</strong>
        <span id="drop-hint">or drop the .gba file here</span>
      </div>
      <input type="file" accept=".gba,.agb,.bin" hidden>
      <label class="remember"><input type="checkbox" checked> Remember this ROM on this device</label>
      <p class="status" role="status" aria-live="polite"></p>
      <p class="privacy">Your ROM stays on this device. It is read by this page and, if you choose, kept in this browser only. <button type="button" class="link forget" hidden>Forget the saved ROM</button></p>
    </div>`;

  const $ = sel => host.querySelector(sel);
  const drop = $('.drop'), input = $('input[type=file]'), remember = $('.remember input');
  const status = $('.status'), cont = $('.continue'), forget = $('.forget');
  let busy = false;

  function setStatus(text, kind = 'info') {
    status.textContent = text;
    status.dataset.kind = kind;
  }

  async function use(buffer, name, store) {
    if (busy) return;
    busy = true; host.classList.add('busy');
    try {
      if (buffer.byteLength > MAX_ROM_BYTES) throw new Error('This file is too large to be a Game Boy Advance ROM.');
      await onRom(buffer, name, setStatus);
      if (store && remember.checked) await rememberRom(name, buffer);
    } catch (error) {
      setStatus(error.message || String(error), 'error');
    } finally {
      busy = false; host.classList.remove('busy');
    }
  }

  async function useFile(file) {
    if (!file) return;
    setStatus(`Reading ${file.name}…`);
    await use(await file.arrayBuffer(), file.name, true);
  }

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { useFile(input.files[0]); input.value = ''; });
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('over'); });
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); useFile(e.dataTransfer.files[0]); });

  (async () => {
    const saved = await loadRememberedRom();
    if (!saved) return;
    cont.textContent = `Continue with ${saved.name}`;
    cont.hidden = false; forget.hidden = false;
    cont.addEventListener('click', () => use(saved.buffer, saved.name, false));
    cont.focus();
  })();

  forget.addEventListener('click', async () => {
    await forgetRom();
    cont.hidden = true; forget.hidden = true;
    setStatus('The saved ROM was removed from this browser.');
  });

  return { setStatus, useFile };
}
