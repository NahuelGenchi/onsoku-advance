// The controls, a view of the settings (sheet.js): every key with a keyboard, or every button with a controller,
// and what it does, in kinds listed on the left, the one picked on the right. A controller connected, or a touch
// screen with an Xbox controller's buttons drawn around the game, starts on the controller's.

import { connectedPads } from '../engine/input.js';
import { keyHtml } from './keys.js';

const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const CHEVRON = '<svg class="chev" viewBox="0 0 3 5" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v1h1v1h1v1H2v1H1v1H0z"/></svg>';

// {jump}, {attack}, {pick} and {back} in a row are the keys or the buttons for those, for the input shown
const TOKENS = {
  keys: { jump: ['Z', 'Space'], attack: ['X'], pick: ['Z'], back: ['X'] },
  pad: { jump: ['A'], attack: ['B', 'X'], pick: ['A'], back: ['B'] },
};
// Each row's keys, its controller's buttons (the same as the keys when left out, or null when a controller has it
// only in the settings) and what it does. Every key the game takes is here, and a controller's binding for each.
const CONTROLS = [
  { name: 'Moving', rows: [
    { keys: ['←', '→'], pad: ['D-pad', 'L stick'], what: 'Run' },
    { keys: ['{jump}'], what: 'Jump · again in the air: insta-shield' },
    { keys: ['←←', '→→'], what: 'In a jump: mid-air dash' },
    { keys: ['{attack}'], what: 'Spin attack · again: kick, then {attack} slide or {jump} backflip' },
    { keys: ['↓'], what: 'Crouch · roll while moving' },
    { keys: ['↓', '+', '{jump}'], what: 'Spin dash' },
    { keys: ['↑'], what: 'Look up' },
  ] },
  { name: 'Tails and Knuckles', rows: [
    { group: 'Tails' },
    { keys: ['{jump}'], what: 'Again in a jump: fly, or swim under water, each press lifting him' },
    { keys: ['{attack}'], what: 'Tail swipe' },
    { group: 'Knuckles' },
    { keys: ['{jump}'], what: 'Hold it again in a jump: glide, or swim under water' },
    { keys: ['↑', '↓'], what: 'Into a wall: climb · {jump} leaps off' },
    { keys: ['{attack}'], what: 'Punch, three times for the uppercut' },
    { keys: ['↓'], what: 'Sink from floating on the water' },
  ] },
  { name: 'Menus and pause', rows: [
    { keys: ['Enter'], pad: ['Menu'], what: 'Start: skips the intro, opens the menu on the title screen, jumps to END in the name input, and pauses the act and the special stage, then goes on again' },
    { keys: ['{pick}', '{back}'], pad: ['A', 'B'], what: 'Skip the intro, as Start does' },
    { keys: ['Backspace'], pad: ['View'], what: 'Select' },
    { keys: ['Q', 'E'], pad: ['LB', 'RB'], what: 'L and R · in the name input, move along the name' },
    { keys: ['↑', '↓'], what: 'In the menu, choose · {pick} picks' },
    { keys: ['←', '→'], what: 'In Options, change the setting picked · {back} goes back' },
    { keys: ['↑', '↓'], what: 'On the language screen, choose · {pick} keeps the language (the first time, Start too) · {back} goes back to Options' },
    { keys: ['{pick}', '/', '{attack}'], what: 'Continue screen: continue / skip to the next number' },
  ] },
  { name: 'Settings', rows: [
    { keys: ['H'], pad: ['View', '+', 'Menu'], what: 'Open or close the settings, which hold the game' },
    { keys: ['↑↓←→'], pad: ['D-pad', 'L stick'], what: 'Move between the buttons' },
    { keys: ['Z'], pad: ['A'], what: 'Press the button picked' },
    { keys: ['Esc', 'X'], pad: ['B'], what: 'Back a step, or close the settings' },
    { keys: ['Q', 'E'], pad: ['LB', 'RB'], what: 'The previous or the next tab' },
    { keys: ['↑', '↓'], pad: ['R stick'], what: 'Scroll a list or a picture once it is picked' },
  ] },
  { name: 'Extras', rows: [
    { keys: ['V'], pad: null, what: 'Widescreen: more of the game around the original screen' },
    { keys: ['R'], pad: null, what: "Rush boost: Sonic Rush's boost, on top of the original game (with your Sonic Rush ROM)" },
    { keys: ['L', 'Shift'], pad: ['X'], what: 'With the Rush boost on: boost (press on the ground, hold to keep it)' },
    { keys: ['B'], pad: null, what: "Boost Mode: Sonic Advance 2's Boost Mode and its afterimages (with your Sonic Advance 2 ROM). Keep running at top speed to enter it" },
    { keys: ['T'], pad: null, what: "SA2 tricks: Sonic Advance 2's mid-air tricks (with your Sonic Advance 2 ROM)" },
    { keys: ['E', 'I'], pad: ['RB'], what: 'With the SA2 tricks on, once in the air: trick · with ↑ Hop Jump, ↓ Bound, forward Humming Top, alone or back Back Star' },
    { keys: ['C'], pad: null, what: 'Show the collision' },
    { keys: ['M'], pad: null, what: 'Sound on or off' },
  ] },
  { name: 'Multiplayer', rows: [
    { group: 'Player 1' },
    { keys: ['W', 'A', 'S', 'D'], what: 'Move' },
    { keys: ['F'], what: 'Jump' },
    { keys: ['G'], what: 'Attack' },
    { group: 'Player 2' },
    { keys: ['←', '↑', '↓', '→'], what: 'Move' },
    { keys: ['.'], what: 'Jump' },
    { keys: ['/'], what: 'Attack' },
    { group: 'Players 3 and 4' },
    { keys: [], pad: ['D-pad', 'A', 'B', 'X'], what: 'A controller each: they go to players 3 and 4 first, then 1 and 2' },
    { keys: ['F', '.'], pad: ['A'], what: 'On the results screen, go on' },
  ] },
];
const NOTE = 'With BUTTON CONFIG. on REVERSE in Options, jump and attack swap places in the act, the special stage and Chao Hunt.';

/** Adds the controls to `sheet` as its view 'controls'. */
export function createControlsView(sheet) {
  let mode = null, at = 0;   // 'keys' or 'pad', null until the player picks one; the kind of control shown
  const { el, body } = sheet.view('controls', {
    title: 'Controls',
    show() {
      at = 0;
      fill(mode ?? (connectedPads().length || matchMedia('(pointer: coarse)').matches ? 'pad' : 'keys'));
      main.scrollTop = 0;
    },
    first: () => el.querySelector('[data-back]'),
    tabs: () => [...el.querySelectorAll('[data-part]')],
  });
  body.innerHTML = `
    <div class="split">
      <aside class="side sheet-rise">
        <div class="modes" role="group" aria-label="Show the controls of">
          <button type="button" class="chip" data-mode="keys" aria-pressed="true">Keyboard</button>
          <button type="button" class="chip" data-mode="pad" aria-pressed="false">Controller</button>
        </div>
        <ul class="navs">${CONTROLS.map((c, i) => `<li><button type="button" class="nav" data-part="${i}" aria-current="false">${c.name}${CHEVRON}</button></li>`).join('')}</ul>
        <p class="side-note">${NOTE}</p>
      </aside>
      <section class="main">
        <div class="controls-part">
          <h3></h3>
          <ul class="ctl-list sheet-rise"></ul>
        </div>
        <p class="main-note">${NOTE}</p>
      </section>
    </div>`;
  const main = el.querySelector('.main'), list = el.querySelector('.ctl-list');
  let shownMode = 'keys';

  // a key, or what a {token} stands for, for the input shown
  const expand = keys => keys.flatMap(k => { const t = k.match(/^\{(\w+)\}$/); return t ? TOKENS[shownMode][t[1]] : [k]; });
  const keysHtml = keys => keys.map(k => (k === '+' || k === '/' ? `<span>${k}</span>` : keyHtml(k, shownMode === 'pad'))).join('');

  function fill(how) {
    shownMode = how;
    for (const b of el.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === how));
    for (const b of el.querySelectorAll('[data-part]')) b.setAttribute('aria-current', String(+b.dataset.part === at));
    const part = CONTROLS[at];
    el.querySelector('.controls-part h3').textContent = part.name;
    // each row can be picked with the arrows or a controller, so a long list scrolls to it
    list.innerHTML = part.rows.map(r => {
      if (r.group) return `<li class="ctl-group">${r.group}</li>`;
      const keys = how === 'pad' && r.pad !== undefined ? r.pad : r.keys;
      const shown = keys === null ? '<span class="ctl-none">In the settings</span>' : keysHtml(expand(keys));
      const what = escape(r.what).replace(/\{(\w+)\}/g, (_, t) => TOKENS[how][t].map(k => keyHtml(k, how === 'pad')).join(''));
      return `<li class="ctl" data-nav tabindex="-1"><span class="ctl-keys">${shown}</span><span class="ctl-what">${what}</span></li>`;
    }).join('');
  }

  el.addEventListener('click', e => {
    const part = e.target.closest('[data-part]'), how = e.target.closest('[data-mode]');
    if (!part && !how) return;
    if (part) { at = +part.dataset.part; main.scrollTop = 0; el.querySelector('.split').scrollTop = 0; }
    if (how) mode = how.dataset.mode;
    fill(mode ?? shownMode);
    list.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  });
}
