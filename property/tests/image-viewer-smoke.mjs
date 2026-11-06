import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/image-viewer.js', import.meta.url), 'utf8');
const context = {};
context.window = context;
vm.runInNewContext(source, context, { timeout: 5000 });
const Viewer = context.PropertyImageViewer;

const VIEW = { left: 0, top: 0, width: 400, height: 800 };
const BASE = { left: 50, top: 300, width: 300, height: 200 };
assert.equal(Viewer.zoomAt(Viewer.FIT, 2, { x: 100, y: 350 }, BASE).scale, 2);
assert.equal(Viewer.pinch(Viewer.FIT, { x: 200, y: 400 }, 100, { x: 240, y: 400 }, 200, BASE).scale, 2);
assert.deepEqual({ ...Viewer.clamp({ scale: 2, x: 500, y: 90 }, BASE, VIEW) }, { scale: 2, x: 100, y: 0 });
assert.deepEqual({ ...Viewer.laidOut({ left: -60, top: 180, width: 600, height: 400 }, { scale: 2, x: 40, y: -20 }) }, BASE);

class EventTargetFake {
  listeners = new Map();
  addEventListener(type, listener) { const set = this.listeners.get(type) || new Set(); set.add(listener); this.listeners.set(type, set); }
  dispatch(type, props = {}) {
    let prevented = false, stopped = false;
    const event = { type, target: this, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; }, ...props };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return { event, prevented: () => prevented, stopped: () => stopped };
  }
  focus() { this.focused = true; }
}
class DialogFake extends EventTargetFake {
  open = false;
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; this.dispatch('close'); }
}
class ImageFake extends EventTargetFake {
  style = { transform: 'translate(0px,0px) scale(1)' };
  dataset = {};
  alt = '';
  src = '';
  classList = { toggle: (name, on) => { this.zoomed = name === 'is-zoomed' && on; } };
  getBoundingClientRect() {
    const match = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(this.style.transform);
    const x = Number(match?.[1] || 0), y = Number(match?.[2] || 0), scale = Number(match?.[3] || 1);
    const cx = BASE.left + BASE.width / 2 + x, cy = BASE.top + BASE.height / 2 + y;
    return { left: cx - BASE.width * scale / 2, top: cy - BASE.height * scale / 2,
      width: BASE.width * scale, height: BASE.height * scale };
  }
  contains(target) { return target === this; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
}
const dialog = new DialogFake(), view = new EventTargetFake(), image = new ImageFake(), title = { textContent: '' }, closeButton = new EventTargetFake();
view.getBoundingClientRect = () => VIEW;
const windowListeners = new Map();
const windowRef = { addEventListener(type, listener) { windowListeners.set(type, listener); } };
const opener = new EventTargetFake(); opener.isConnected = true;
const controller = Viewer.create({ dialog, view, image, title, closeButton, windowRef });
const touch = (pointerId, clientX, clientY, timeStamp, target = image, isPrimary = pointerId === 1) => ({
  target, pointerId, pointerType: 'touch', clientX, clientY, timeStamp, isPrimary
});

assert.equal(controller.open('blob:property/photo', 'photo.png', opener), true);
assert.equal(dialog.open, true);
assert.equal(title.textContent, 'photo.png');
assert.equal(image.alt, 'photo.png');
assert.equal(closeButton.focused, true);
assert.deepEqual({ ...controller.getZoom() }, { scale: 1, x: 0, y: 0 });

view.dispatch('pointerdown', touch(1, 150, 150, 100, view));
view.dispatch('pointerdown', touch(2, 250, 150, 110, image, false));
view.dispatch('pointermove', touch(1, 50, 150, 120, view));
view.dispatch('pointermove', touch(2, 350, 150, 130, image, false));
assert.equal(controller.getZoom().scale, 3, 'pinching on the dark viewing area zooms the image itself');
view.dispatch('pointerup', touch(2, 350, 150, 140, image, false));
view.dispatch('pointerup', touch(1, 50, 150, 150, view));
assert.equal(controller.isOpen(), true, 'ending a pinch does not close the image viewer');
const beforePan = image.style.transform;
view.dispatch('pointerdown', touch(3, 200, 400, 200));
view.dispatch('pointermove', touch(3, 260, 400, 220));
view.dispatch('pointerup', touch(3, 260, 400, 230));
assert.notEqual(image.style.transform, beforePan, 'one finger pans a zoomed image');

controller.close();
assert.equal(opener.focused, true, 'closing returns focus to the image that opened the viewer');
const tapOpener = new EventTargetFake(); tapOpener.isConnected = true;
assert.equal(controller.open('blob:property/photo', 'photo.png', tapOpener), true);
view.dispatch('pointerdown', touch(4, 300, 400, 1000)); view.dispatch('pointerup', touch(4, 300, 400, 1040));
view.dispatch('pointerdown', touch(5, 302, 401, 1150)); view.dispatch('pointerup', touch(5, 302, 401, 1190));
assert.equal(controller.getZoom().scale, 2.5, 'double tap zooms around the tapped point');
view.dispatch('pointerdown', touch(6, 300, 400, 3000)); view.dispatch('pointerup', touch(6, 300, 400, 3040));
view.dispatch('pointerdown', touch(7, 302, 401, 3150)); view.dispatch('pointerup', touch(7, 302, 401, 3190));
assert.equal(controller.getZoom().scale, 1, 'a second double tap restores the whole image');
view.dispatch('pointerdown', touch(8, 20, 20, 4000, view)); view.dispatch('pointerup', touch(8, 20, 20, 4040, view));
assert.equal(dialog.open, false, 'a tap outside the image closes the viewer');

const mouseOpener = new EventTargetFake(); mouseOpener.isConnected = true;
controller.open('blob:property/photo', 'photo.png', mouseOpener);
view.dispatch('pointerdown', { target: image, pointerId: 9, pointerType: 'mouse', button: 0, clientX: 200, clientY: 400, isPrimary: true });
view.dispatch('pointerup', { target: image, pointerId: 9, pointerType: 'mouse', clientX: 200, clientY: 400, isPrimary: true });
view.dispatch('dblclick', { target: image, clientX: 300, clientY: 400 });
assert.equal(controller.getZoom().scale, 2.5, 'double click zooms on desktop');
const wheel = view.dispatch('wheel', { target: view, clientX: 200, clientY: 400, deltaY: -100, ctrlKey: false });
assert.equal(wheel.prevented(), true, 'image zoom consumes the wheel instead of scrolling the page');
assert.ok(controller.getZoom().scale > 2.5);
const plus = dialog.dispatch('keydown', { key: '+', ctrlKey: false, metaKey: false, altKey: false });
assert.equal(plus.prevented(), true, 'keyboard plus zooms');
dialog.dispatch('keydown', { key: 'ArrowRight', ctrlKey: false, metaKey: false, altKey: false });
dialog.dispatch('keydown', { key: '0', ctrlKey: false, metaKey: false, altKey: false });
assert.deepEqual({ ...controller.getZoom() }, { scale: 1, x: 0, y: 0 }, 'keyboard 0 fits the whole image');
const escape = dialog.dispatch('keydown', { key: 'Escape' });
assert.equal(escape.prevented(), true);
assert.equal(escape.stopped(), true);
assert.equal(dialog.open, false);
assert.equal(image.src, '', 'closing releases the viewer image reference');
assert.ok(windowListeners.has('resize'), 'the viewer resets its measured transform on resize');

console.log('PASS Ghostly-adapted image viewer: bounded zoom, pinch, drag, double tap/click, wheel, keyboard, backdrop close and focus restoration');
