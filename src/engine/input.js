// Keyboard, touch and gamepad input folded into one set of held buttons plus press edges for A (jump),
// B (attack) and the optional Sonic Rush boost. A button is held while any of them holds it, so letting go on
// one doesn't drop it on another.

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyZ: 'jump', KeyJ: 'jump', KeyX: 'attack', KeyK: 'attack',
  KeyL: 'boost', ShiftLeft: 'boost', ShiftRight: 'boost',   // only with the Rush boost on
};
const BUTTONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'boost'];

// the standard gamepad layout (an Xbox controller's): A jumps, B or X attacks, the d-pad or the left stick
// moves. With the Rush boost on, X boosts instead, as in Sonic Rush.
const PAD_BUTTONS = { jump: [0], attack: [1, 2], up: [12], down: [13], left: [14], right: [15], boost: [] };
const RUSH_PAD_BUTTONS = { ...PAD_BUTTONS, attack: [1], boost: [2] };
const DEAD_ZONE = 0.5;

export function createInput() {
  const input = {
    left: false, right: false, up: false, down: false, jump: false, attack: false, boost: false,
    jumpPressed: false, attackPressed: false, boostPressed: false, enabled: false,
    rush: false,   // the Rush boost is on: its buttons count
  };
  const held = { keys: {}, pad: {} };   // what each source holds; the pad's is read once a step by poll()
  let padFresh = true;                  // after a release, what the pad still holds comes back without a press

  function set(button, quiet) {
    const down = !!(held.keys[button] || held.pad[button]);
    if (!quiet && button === 'jump' && down && !input.jump) input.jumpPressed = true;
    if (!quiet && button === 'attack' && down && !input.attack) input.attackPressed = true;
    if (!quiet && button === 'boost' && down && !input.boost) input.boostPressed = true;
    input[button] = down;
  }

  input.press = (button, down) => {
    if (button === 'boost' && !input.rush) return;   // the boost's buttons do nothing with it off
    held.keys[button] = down; set(button);
  };
  input.release = () => {
    held.keys = {}; held.pad = {}; padFresh = true;
    for (const b of BUTTONS) input[b] = false;
    input.jumpPressed = input.attackPressed = input.boostPressed = false;
  };

  /** Turns the Rush boost's buttons on or off; turned off, a held boost button lets go. */
  input.setRush = on => {
    input.rush = on;
    if (on) return;
    held.keys.boost = held.pad.boost = false;
    set('boost', true);
    input.boostPressed = false;
  };

  /** Reads the connected gamepads; the game calls it at the start of each step, as the original reads its keys.
   *  A controller plugged in mid-game is read from then on; one unplugged lets go of its buttons. */
  input.poll = () => {
    if (!input.enabled) return;
    const now = {};
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad?.connected) continue;
      const on = i => pad.buttons[i]?.pressed, map = input.rush ? RUSH_PAD_BUTTONS : PAD_BUTTONS;
      for (const b of BUTTONS) if (map[b].some(on)) now[b] = true;
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

  addEventListener('keydown', e => {
    const button = KEYS[e.code];
    if (!input.enabled || !button || (button === 'boost' && !input.rush) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!e.repeat) input.press(button, true);
  });
  addEventListener('keyup', e => {
    const button = KEYS[e.code];
    if (!button || (button === 'boost' && !input.rush)) return;
    if (input.enabled) e.preventDefault();
    input.press(button, false);
  });
  addEventListener('blur', input.release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.release(); });

  /** On-screen buttons: any element with data-button="left|right|up|down|jump|attack|boost". */
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
