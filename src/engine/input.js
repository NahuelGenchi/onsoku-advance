// Keyboard, touch and gamepad input folded into one set of held buttons plus press edges for A (jump),
// B (attack), the optional Sonic Rush boost and the optional Sonic Advance 2 tricks (R). A button is held while
// any of them holds it, so letting go on one doesn't drop it on another. Start, Select, L and R are for the
// screens before the act, and Start also pauses it (pause.js).

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyZ: 'jump', KeyJ: 'jump', KeyX: 'attack', KeyK: 'attack',
  KeyL: 'boost', ShiftLeft: 'boost', ShiftRight: 'boost',   // only with the Rush boost on
  KeyE: ['trick', 'r'], KeyI: 'trick',                       // the trick only with the SA2 tricks on
  KeyQ: 'l', Enter: 'start', Backspace: 'select',
};
const BUTTONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'boost', 'trick', 'start', 'select', 'l', 'r'];

// the standard gamepad layout (an Xbox controller's): A jumps, B or X attacks, the d-pad or the left stick
// moves, Menu is Start, View is Select, and LB and RB are L and R. With the Rush boost on, X boosts instead, as in
// Sonic Rush; with the SA2 tricks on, RB is the trick too.
const PAD_BUTTONS = { jump: [0], attack: [1, 2], up: [12], down: [13], left: [14], right: [15], boost: [], trick: [], start: [9], select: [8], l: [4], r: [5] };
const RUSH_PAD_BUTTONS = { ...PAD_BUTTONS, attack: [1], boost: [2] };
const TRICK_PAD_BUTTONS = [5];
const DPAD = { up: 12, down: 13, left: 14, right: 15 };
const DEAD_ZONE = 0.5;
const XBOX = /xbox|xinput|045e|microsoft/i;   // the names browsers give Microsoft's controllers
const SETTINGS_COMBO = [8, 9];                 // View + Menu (Select + Start) together open the settings, not the game's
const COMBO_WAIT = 4;                          // steps a controller's Start or Select waits for the other to join it

// the multiplayer modes' two players on one keyboard: the first on WASD with F to jump and G to attack, the
// second on the arrows with . to jump and / to attack; the players after them play with controllers
export const PLAYER_KEYS = [
  { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'jump', KeyG: 'attack' },
  { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Period: 'jump', Slash: 'attack' },
  {}, {},
];

const SWAPPED = { jump: 'attack', attack: 'jump', jumpPressed: 'attackPressed', attackPressed: 'jumpPressed' };

/**
 * SetPlayerControls: the jump and attack buttons as the game reads them, from `input` (A jumps and B attacks), or
 * with A and B swapped when the save's button setting is REVERSE (btnConfig 1). The swapped buttons are a view of
 * `input`: what is pressed or cleared on one is on the other.
 */
export function playerControls(input, btnConfig) {
  if (btnConfig !== 1) return input;
  return new Proxy(input, {
    get: (target, key) => target[SWAPPED[key] ?? key],
    set: (target, key, value) => { target[SWAPPED[key] ?? key] = value; return true; },
  });
}

/** The connected controllers in the browser's order. */
export const connectedPads = () => [...(navigator.getGamepads?.() ?? [])].filter(p => p?.connected);

/** Whether `pad` holds View and Menu together, which open or close the settings; the game sees neither then. */
export const holdsSettingsCombo = pad => SETTINGS_COMBO.every(i => pad.buttons[i]?.pressed);

/** Whether an Xbox controller is connected. */
export const xboxConnected = () => connectedPads().some(p => XBOX.test(p.id));

/**
 * The controllers player `player` of `count` plays with: they go to the players without keys first, the
 * third and the fourth, then to the first and the second.
 */
export function playerPads(player, count) {
  const order = [...Array.from({ length: Math.max(0, count - 2) }, (_, i) => i + 2), 0, 1];
  return () => connectedPads().filter((_, k) => order[k] === player);
}

/**
 * The buttons one player holds: from `keys` (the single-player keys by default) and the controllers `pads()`
 * gives (all of them by default).
 */
export function createInput({ keys = KEYS, pads = connectedPads } = {}) {
  const input = {
    left: false, right: false, up: false, down: false, jump: false, attack: false, boost: false, trick: false, start: false, select: false,
    l: false, r: false,
    jumpPressed: false, attackPressed: false, boostPressed: false, trickPressed: false, enabled: false,
    rush: false,     // the Rush boost is on: its buttons count
    tricks: false,   // the SA2 tricks are on: theirs count
  };
  // the buttons of an extra that is off do nothing
  const off = button => (button === 'boost' && !input.rush) || (button === 'trick' && !input.tricks);
  const held = { keys: {}, pad: {}, touch: {} };   // what each source holds; the pad's is read once a step by poll()
  const touched = new Set();            // the on-screen controller's buttons a finger is on, by their standard numbers
  let padFresh = true;                  // after a release, what the pad still holds comes back without a press
  const spent = new Set();              // Start and Select held for the settings: the game doesn't see them until let go
  const waiting = {};                   // Start or Select just pressed alone: the steps left before the game sees it

  function set(button, quiet) {
    const down = !!(held.keys[button] || held.pad[button] || held.touch[button]);
    if (!quiet && button === 'jump' && down && !input.jump) input.jumpPressed = true;
    if (!quiet && button === 'attack' && down && !input.attack) input.attackPressed = true;
    if (!quiet && button === 'boost' && down && !input.boost) input.boostPressed = true;
    if (!quiet && button === 'trick' && down && !input.trick) input.trickPressed = true;
    input[button] = down;
  }

  input.press = (button, down) => {
    if (off(button)) return;
    held.keys[button] = down; set(button);
  };
  input.release = () => {
    held.keys = {}; held.pad = {}; held.touch = {}; touched.clear(); padFresh = true;
    for (const b of BUTTONS) input[b] = false;
    input.jumpPressed = input.attackPressed = input.boostPressed = input.trickPressed = false;
  };

  /** Turns the Rush boost's buttons on or off; turned off, a held boost button lets go. */
  input.setRush = on => {
    input.rush = on;
    if (on) return;
    held.keys.boost = held.pad.boost = held.touch.boost = false;
    set('boost', true);
    input.boostPressed = false;
  };

  /** Turns the SA2 tricks' buttons on or off; turned off, a held trick button lets go. */
  input.setTricks = on => {
    input.tricks = on;
    if (on) return;
    held.keys.trick = held.pad.trick = held.touch.trick = false;
    set('trick', true);
    input.trickPressed = false;
  };

  // the game's buttons a controller holds, `on(i)` telling whether its button i (standard layout) is down
  function padHolds(on, now = {}) {
    const map = input.rush ? RUSH_PAD_BUTTONS : PAD_BUTTONS;
    for (const b of BUTTONS) if (map[b].some(on)) now[b] = true;
    if (input.tricks && TRICK_PAD_BUTTONS.some(on)) now.trick = true;
    return now;
  }
  // the on-screen controller, read like a real one; again each step, for an extra turned on or off under a finger
  function touchSync() {
    const now = padHolds(i => touched.has(i));
    for (const b of BUTTONS) {
      if (!!held.touch[b] === !!now[b]) continue;
      held.touch[b] = !!now[b];
      set(b);
    }
  }

  /** Reads the connected gamepads; the game calls it at the start of each step, as the original reads its keys.
   *  A controller plugged in mid-game is read from then on; one unplugged lets go of its buttons. */
  input.poll = () => {
    if (!input.enabled) return;
    touchSync();
    const now = {};
    let combo = false;
    for (const pad of pads()) {
      combo ||= holdsSettingsCombo(pad);
      padHolds(i => pad.buttons[i]?.pressed, now);
      // the left stick, and the d-pad of a pad the browser doesn't map to the standard layout (axes 6 and 7)
      for (const [x, y] of pad.mapping === 'standard' ? [[0, 1]] : [[0, 1], [6, 7]]) {
        const ax = pad.axes[x] ?? 0, ay = pad.axes[y] ?? 0;
        if (ax < -DEAD_ZONE) now.left = true;
        if (ax > DEAD_ZONE) now.right = true;
        if (ay < -DEAD_ZONE) now.up = true;
        if (ay > DEAD_ZONE) now.down = true;
      }
    }
    const quiet = padFresh;
    padFresh = false;
    // View + Menu are the settings' (settings-pad.js), so a pad's Start or Select reaches the game a few steps late,
    // in case the other is on its way; held together, neither reaches it until let go
    for (const b of ['start', 'select']) {
      if (combo) { spent.add(b); delete waiting[b]; }
      if (!now[b]) spent.delete(b);
      if (spent.has(b)) { now[b] = false; continue; }
      if (now[b] && !held.pad[b] && !quiet) waiting[b] ??= COMBO_WAIT;
      if (!(b in waiting)) continue;
      if (now[b] && waiting[b] > 0) { waiting[b]--; now[b] = false; }
      else { delete waiting[b]; now[b] = true; }   // waited long enough, or let go first: the game gets its press
    }
    for (const b of BUTTONS) {
      if (!!held.pad[b] === !!now[b]) continue;
      held.pad[b] = !!now[b];
      set(b, quiet);
    }
  };

  // the buttons a key holds, but those of an extra that is off
  const buttonsOf = code => [].concat(keys[code] ?? []).filter(b => !off(b));
  addEventListener('keydown', e => {
    const buttons = buttonsOf(e.code);
    if (!input.enabled || !buttons.length || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!e.repeat) for (const b of buttons) input.press(b, true);
  });
  addEventListener('keyup', e => {
    const buttons = buttonsOf(e.code);
    if (!buttons.length) return;
    if (input.enabled) e.preventDefault();
    for (const b of buttons) input.press(b, false);
  });
  addEventListener('blur', input.release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.release(); });

  /**
   * The on-screen controller: any element with data-pad-button set to an Xbox controller's button by its number in
   * the standard layout (0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Menu), marked `held` while a finger is
   * on it, and a d-pad (data-pad) whose directions follow the finger as it slides. They do what the controller's
   * buttons do.
   */
  input.bindTouch = root => {
    for (const el of root.querySelectorAll('[data-pad-button]')) {
      const button = Number(el.dataset.padButton);
      const hold = down => {
        el.classList.toggle('held', down);
        if (down) touched.add(button); else touched.delete(button);
        touchSync();
      };
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); hold(true); });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, () => hold(false));
      el.addEventListener('contextmenu', e => e.preventDefault());
    }
    for (const pad of root.querySelectorAll('[data-pad]')) bindPad(pad);
    // iOS brings up its magnifier on a finger held down unless the touch itself is cancelled
    root.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  };

  // the d-pad: the direction from its middle to the finger, two at once on a diagonal, as a real one presses two.
  // The straight ways are 60° wide and the diagonals 30°, so running doesn't roll or look up by a slip of the
  // finger; the very middle holds nothing. It marks the ways held in data-held.
  function bindPad(pad) {
    let finger = null;
    const hold = ways => {
      for (const [way, i] of Object.entries(DPAD)) if (ways.includes(way)) touched.add(i); else touched.delete(i);
      pad.dataset.held = ways.join(' ');
      touchSync();
    };
    const follow = e => {
      const r = pad.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(x, y) < r.width * 0.1) return hold([]);
      const a = Math.atan2(y, x) * 180 / Math.PI;   // 0 is right, 90 down
      const ways = [];
      if (Math.abs(a) < 60) ways.push('right');
      if (Math.abs(a) > 120) ways.push('left');
      if (a > 30 && a < 150) ways.push('down');
      if (a < -30 && a > -150) ways.push('up');
      hold(ways);
    };
    pad.addEventListener('pointerdown', e => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      finger = e.pointerId;
      follow(e);
    });
    pad.addEventListener('pointermove', e => { if (e.pointerId === finger) follow(e); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      pad.addEventListener(type, e => { if (e.pointerId === finger) { finger = null; hold([]); } });
    }
    pad.addEventListener('contextmenu', e => e.preventDefault());
  }
  return input;
}
