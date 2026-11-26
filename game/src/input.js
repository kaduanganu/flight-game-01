// Keyboard and mouse: arrows or WASD fly the plane, W/S or Shift/Ctrl work the
// throttle, Space starts and pauses, M mutes. Dragging with the mouse steers too:
// the pointer's offset from the screen centre is the stick.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

export function createInput(canvas) {
  const keys = new Set();
  const actions = { value: 0 };
  const mouse = { x: 0, y: 0, down: false, active: false };

  function keyName(event) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
  }

  window.addEventListener('keydown', (event) => {
    const key = keyName(event);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(key);
    if (key === ' ' || key === 'Enter') actions.value |= ACTION_CONFIRM;
    if (key === 'p' || key === 'Escape') actions.value |= ACTION_PAUSE;
    if (key === 'm') actions.value |= 4;
  });
  window.addEventListener('keyup', (event) => keys.delete(keyName(event)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    mouse.down = true;
    mouse.active = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!mouse.down) return;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  canvas.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function has(...names) {
    return names.some((name) => keys.has(name));
  }

  return {
    /** -1..1 pitch (up is positive) and roll (right is positive), throttle -1..1. */
    read() {
      let pitch = 0;
      let roll = 0;
      if (has('ArrowUp', 'w')) pitch += 1;
      if (has('ArrowDown', 's')) pitch -= 1;
      if (has('ArrowLeft', 'a')) roll -= 1;
      if (has('ArrowRight', 'd')) roll += 1;
      let throttle = 0;
      if (has('Shift')) throttle += 1;
      if (has('Control')) throttle -= 1;
      if (mouse.down && mouse.active) {
        const rect = canvas.getBoundingClientRect();
        const nx = (mouse.x - rect.left) / rect.width - 0.5;
        const ny = (mouse.y - rect.top) / rect.height - 0.5;
        roll = Math.max(-1, Math.min(1, nx * 3));
        pitch = Math.max(-1, Math.min(1, -ny * 3));
      }
      return { pitch, roll, throttle, brake: has('b') };
    },
    takeActions() {
      const value = actions.value;
      actions.value = 0;
      return value;
    },
    /** Where the mouse last pointed, for clickable buttons. */
    pointer() {
      return { ...mouse };
    },
  };
}
