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
const DEAD_ZONE = 0.5;

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
  const held = { keys: {}, pad: {} };   // what each source holds; the pad's is read once a step by poll()
  let padFresh = true;                  // after a release, what the pad still holds comes back without a press

  function set(button, quiet) {
    const down = !!(held.keys[button] || held.pad[button]);
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
    held.keys = {}; held.pad = {}; padFresh = true;
    for (const b of BUTTONS) input[b] = false;
    input.jumpPressed = input.attackPressed = input.boostPressed = input.trickPressed = false;
  };

  /** Turns the Rush boost's buttons on or off; turned off, a held boost button lets go. */
  input.setRush = on => {
    input.rush = on;
    if (on) return;
    held.keys.boost = held.pad.boost = false;
    set('boost', true);
    input.boostPressed = false;
  };

  /** Turns the SA2 tricks' buttons on or off; turned off, a held trick button lets go. */
  input.setTricks = on => {
    input.tricks = on;
    if (on) return;
    held.keys.trick = held.pad.trick = false;
    set('trick', true);
    input.trickPressed = false;
  };

  /** Reads the connected gamepads; the game calls it at the start of each step, as the original reads its keys.
   *  A controller plugged in mid-game is read from then on; one unplugged lets go of its buttons. */
  input.poll = () => {
    if (!input.enabled) return;
    const now = {};
    for (const pad of pads()) {
      const on = i => pad.buttons[i]?.pressed, map = input.rush ? RUSH_PAD_BUTTONS : PAD_BUTTONS;
      for (const b of BUTTONS) if (map[b].some(on)) now[b] = true;
      if (input.tricks && TRICK_PAD_BUTTONS.some(on)) now.trick = true;
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

  /** On-screen buttons: any element with data-button="left|right|up|down|jump|attack|boost|trick". */
  input.bindTouch = root => {
    for (const el of root.querySelectorAll('[data-button]')) {
      const button = el.dataset.button;
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); input.press(button, true); });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, () => input.press(button, false));
      el.addEventListener('contextmenu', e => e.preventDefault());
    }
  };
  return input;
}
