// Keyboard and pointer input. Held keys give a two-axis steering direction; the pointer gives
// an aim point in arena coordinates and a trigger. One-shot presses (confirm, pause, mute) are
// queued as bit flags and taken once by the loop, so a press between frames is never lost or
// counted twice.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

/** Convert a pointer event's client position to arena coordinates (the arena is letterboxed). */
function toField(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
  const offsetX = (rect.width - FIELD.width * scale) / 2;
  const offsetY = (rect.height - FIELD.height * scale) / 2;
  return {
    x: (clientX - rect.left - offsetX) / scale,
    y: (clientY - rect.top - offsetY) / scale,
  };
}

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let firing = false;
  // Aim at the arena centre until the pointer first moves, so the ship never spins wildly.
  const aim = { x: FIELD.width / 2, y: FIELD.height / 2 - 120 };

  window.addEventListener('keydown', (event) => {
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
    held.add(event.code);
    if (event.repeat) return;
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  // Keys released while the tab is hidden never send keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    firing = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const point = toField(canvas, event.clientX, event.clientY);
    aim.x = point.x;
    aim.y = point.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = toField(canvas, event.clientX, event.clientY);
    aim.x = point.x;
    aim.y = point.y;
    firing = true;
    actions |= ACTION_CONFIRM;
    canvas.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener('pointerup', () => {
    firing = false;
  });
  canvas.addEventListener('pointerleave', () => {
    firing = false;
  });

  return {
    /** Steering direction, each axis -1, 0 or 1 (the world normalises diagonals). */
    direction() {
      return {
        x: (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0),
        y: (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0),
      };
    },
    /** The current aim point, in arena coordinates. */
    aim() {
      return aim;
    },
    /** True while the mouse button (the trigger) is held. */
    firing() {
      return firing;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
