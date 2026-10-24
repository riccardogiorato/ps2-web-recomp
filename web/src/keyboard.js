export const buttonKeys = { ArrowUp: 4, ArrowRight: 5, ArrowDown: 6, ArrowLeft: 7, KeyZ: 14, KeyX: 13, KeyA: 15, KeyS: 12,
  KeyQ: 10, KeyW: 11, Digit1: 8, Digit2: 9, Enter: 3, Backspace: 0 };
export const stickKeys = new Set(['KeyI', 'KeyJ', 'KeyK', 'KeyL']);
export function keyForButton(bit) {
  const key = Object.keys(buttonKeys).find((key) => buttonKeys[key] === bit);
  return key?.replace(/^(Key|Digit)/, '') || '—';
}
