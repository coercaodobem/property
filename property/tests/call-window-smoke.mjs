import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/call-window.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { timeout: 5000 });

class FakeTarget {
  constructor() { this.listeners = new Map(); this.captured = null; this.released = null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  emit(type, event) { this.listeners.get(type)?.(event); }
  closest() { return null; }
  setPointerCapture(pointerId) { this.captured = pointerId; }
  releasePointerCapture(pointerId) { this.released = pointerId; }
}

const element = {
  hidden: true,
  style: { left: '', top: '', right: '', bottom: '', removeProperty(name) { this[name] = ''; } },
  baseRect: { left: 800, top: 700, width: 260, height: 160 },
  getBoundingClientRect() {
    return {
      ...this.baseRect,
      left: this.style.left ? Number.parseFloat(this.style.left) : this.baseRect.left,
      top: this.style.top ? Number.parseFloat(this.style.top) : this.baseRect.top
    };
  }
};
const handle = new FakeTarget();
const windowRef = new FakeTarget();
windowRef.innerWidth = 1000;
windowRef.innerHeight = 800;
const player = context.window.PropertyCallWindow.create({ element, handle, windowRef });

assert.equal(player.isVisible(), false);
assert.equal(player.minimize(), true);
assert.equal(player.isMinimized(), true, 'minimizing keeps the call in a visible compact window');
assert.equal(player.isVisible(), true);
handle.emit('pointerdown', { pointerId: 7, button: 0, isPrimary: true, clientX: 810, clientY: 710, target: handle, preventDefault() {} });
handle.emit('pointermove', { pointerId: 7, clientX: 990, clientY: 790 });
assert.equal(element.style.left, '728px', 'dragging clamps the window to the right viewport edge');
assert.equal(element.style.top, '628px', 'dragging clamps the window to the bottom viewport edge');
assert.equal(handle.captured, 7, 'the drag handle captures the active pointer');
handle.emit('pointerup', { pointerId: 7 });
assert.equal(handle.released, 7, 'pointer capture is released at the end of the drag');
windowRef.innerWidth = 600;
windowRef.innerHeight = 500;
windowRef.emit('resize', {});
assert.equal(element.style.left, '328px', 'viewport resize keeps the mini window on-screen');
assert.equal(element.style.top, '328px');
player.restore();
assert.equal(player.isMinimized(), false);
assert.equal(element.hidden, true, 'restoring returns control to the full call view');
player.minimize();
player.hide();
assert.equal(player.isMinimized(), false, 'ending or dismissing a call clears compact-window state');
assert.equal(player.isVisible(), false);
player.destroy();
assert.equal(handle.listeners.size, 0, 'destroy releases every pointer listener');
assert.equal(windowRef.listeners.size, 0, 'destroy releases the viewport listener');

console.log('PASS: Ghostly-style call mini-window toggles, stays within viewport bounds, and releases pointer handlers.');
