// The achievements, a view of the settings (sheet.js): how many are earned, how far the game is from Beaten and
// Mastered, and the latest earned on the left; every achievement as a card on the right, with its trophy, gold once
// earned, its name, what earns it and when it was earned, those the game needs to be Beaten marked. Either status,
// pressed, shows only what it needs, with a line saying so, until it is pressed again; All, Earned and Locked
// (also Q and E, or LB and RB) show those of them. The settings' tile for them shows the count and the statuses.

import { drawTrophy } from './popup.js';
import { TROPHY_W, TROPHY_H } from './pixels.js';

const LOCKED = { G: '#8b93a6', S: '#5d6578', L: '#c3c9d6' };
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// the statuses: their names, what each needs out of every achievement, and what that is in a few words
const STATUSES = {
  beaten: { name: 'Beaten', needs: all => all.filter(a => a.beaten), hint: 'Clear every zone and the X Zone' },
  mastered: { name: 'Mastered', needs: all => all, hint: 'Earn every achievement' },
};
const SHOWN = { all: () => true, earned: a => !!a.earned, locked: a => !a.earned };

// the line over a status's achievements
function noteFor(status, wanted) {
  const { name } = STATUSES[status], n = wanted.length;
  const these = status === 'mastered' ? `all ${n} achievements` : `these ${n} achievements`;
  return wanted.every(a => a.earned) ? `You have the ${name} status: you earned ${these}.` : `Earn ${these} to get the ${name} status.`;
}
const cells = (n, on) => Array.from({ length: n }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('');

/**
 * Adds the achievements of `store` (store.js) to `sheet` as its view 'achievements', and fills the settings' `tile`
 * for them. Returns { refresh() }, which shows a new unlock.
 */
export function createAchievementsPanel(sheet, store, tile) {
  const { el, body } = sheet.view('achievements', {
    title: 'Achievements',
    show: () => { status = null; shown = 'all'; fill(); main.scrollTop = 0; },
    first: () => el.querySelector('[data-back]'),
    tabs: () => [...el.querySelectorAll('[data-show]')],
  });
  body.innerHTML = `
    <div class="split">
      <aside class="side sheet-rise">
        <div class="sum">
          <p class="sum-num"><b></b><span></span></p>
          <span class="cells" aria-hidden="true"></span>
        </div>
        <button type="button" class="status" data-status="beaten" aria-pressed="false"></button>
        <button type="button" class="status" data-status="mastered" aria-pressed="false"></button>
        <p class="latest"></p>
      </aside>
      <section class="main" aria-label="Every achievement">
        <div class="tools">
          <button type="button" class="chip" data-show="all" aria-pressed="true">All<em></em></button>
          <button type="button" class="chip" data-show="earned" aria-pressed="false">Earned<em></em></button>
          <button type="button" class="chip" data-show="locked" aria-pressed="false">Locked<em></em></button>
          <p class="ach-note" hidden></p>
        </div>
        <ul class="cards sheet-rise"></ul>
      </section>
    </div>`;
  const $ = sel => el.querySelector(sel);
  const main = $('.main'), list = $('.cards'), note = $('.ach-note');
  let status = null;   // the status whose achievements alone are shown, or null for all of them
  let shown = 'all';   // all of those, the earned or the locked

  drawTrophy(tile.querySelector('canvas').getContext('2d'));
  function fillTile(all, earned) {
    const beaten = STATUSES.beaten.needs(all);
    tile.querySelector('.count').textContent = `${earned.length}/${all.length}`;
    tile.querySelector('.ach-tile-status').textContent = `Beaten ${beaten.filter(a => a.earned).length}/${beaten.length} · Mastered ${earned.length}/${all.length}`;
    tile.querySelector('.cells').innerHTML = cells(all.length, earned.length);
    tile.setAttribute('aria-label', `Achievements, ${earned.length} of ${all.length} earned`);
  }

  function fill() {
    const all = store.list(), earned = all.filter(a => a.earned);
    fillTile(all, earned);
    $('.sum-num b').textContent = earned.length;
    $('.sum-num span').textContent = `/${all.length} earned`;
    $('.sum .cells').innerHTML = cells(all.length, earned.length);
    for (const b of el.querySelectorAll('[data-status]')) {
      const s = STATUSES[b.dataset.status], wanted = s.needs(all), got = wanted.filter(a => a.earned).length, done = got === wanted.length;
      b.toggleAttribute('data-done', done);
      b.setAttribute('aria-pressed', String(status === b.dataset.status));
      b.innerHTML = `<span class="status-top"><span>${s.name}</span><span>${done ? 'Reached' : `${got}/${wanted.length}`}</span></span>
        <span class="meter" aria-hidden="true"><i style="width: ${(got / wanted.length) * 100}%"></i></span><small>${s.hint}</small>`;
    }
    const latest = earned.reduce((a, b) => (!a || b.earned > a.earned ? b : a), null);
    $('.latest').innerHTML = latest ? `Latest<b>${escape(latest.title)}</b>${day.format(latest.earned)}` : '';
    const pool = status ? STATUSES[status].needs(all) : all;
    for (const b of el.querySelectorAll('[data-show]')) {
      b.setAttribute('aria-pressed', String(shown === b.dataset.show));
      b.querySelector('em').textContent = pool.filter(SHOWN[b.dataset.show]).length;
    }
    note.hidden = !status;
    note.textContent = status ? noteFor(status, pool) : '';
    const cards = pool.filter(SHOWN[shown]);
    // each card can be picked with the arrows or a controller, so a long list scrolls to it
    list.innerHTML = cards.length ? cards.map(a => `
      <li class="card" data-nav tabindex="-1"${a.earned ? ' data-earned' : ''}>
        <canvas width="${TROPHY_W}" height="${TROPHY_H}" aria-hidden="true"></canvas>
        <div>
          <h3>${escape(a.title)}</h3>
          <p>${escape(a.description)}</p>
          <div class="card-meta">${a.earned ? `<span class="card-when">${day.format(a.earned)}</span>` : '<span>Locked</span>'}${a.beaten ? '<span class="tag">To beat</span>' : ''}</div>
        </div>
      </li>`).join('') : `<li class="cards-empty">${shown === 'earned' ? 'None earned yet.' : 'Every one is earned.'}</li>`;
    list.querySelectorAll('canvas').forEach((c, i) => drawTrophy(c.getContext('2d'), 0, 0, cards[i].earned ? undefined : LOCKED));
  }

  for (const b of el.querySelectorAll('[data-status]')) {
    b.addEventListener('click', () => {
      status = status === b.dataset.status ? null : b.dataset.status;
      fill();
      main.scrollTop = 0;
    });
  }
  for (const b of el.querySelectorAll('[data-show]')) {
    b.addEventListener('click', () => { shown = b.dataset.show; fill(); main.scrollTop = 0; });
  }
  fill();

  return {
    refresh() {
      if (sheet.current === 'achievements') fill();
      else fillTile(store.list(), store.list().filter(a => a.earned));
    },
  };
}
