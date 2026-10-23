// Keyboard and touch input folded into one set of held buttons plus a jump-press edge.

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyZ: 'jump', KeyX: 'jump', KeyJ: 'jump', KeyK: 'jump',
};
const BUTTONS = ['left', 'right', 'up', 'down', 'jump'];

export function createInput() {
  const input = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, enabled: false };

  input.press = (button, down) => {
    if (button === 'jump' && down && !input.jump) input.jumpPressed = true;
    input[button] = down;
  };
  input.release = () => { for (const b of BUTTONS) input[b] = false; input.jumpPressed = false; };

  addEventListener('keydown', e => {
    const button = KEYS[e.code];
    if (!input.enabled || !button || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!e.repeat) input.press(button, true);
  });
  addEventListener('keyup', e => {
    const button = KEYS[e.code];
    if (!button) return;
    if (input.enabled) e.preventDefault();
    input.press(button, false);
  });
  addEventListener('blur', input.release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.release(); });

  /** On-screen buttons: any element with data-button="left|right|up|down|jump". */
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
