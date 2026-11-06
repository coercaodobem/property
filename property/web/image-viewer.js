'use strict';
(() => {
  // Adapted from Ghostly's MIT-licensed pictureZoom.ts and usePictureZoom hook.
  const FIT = Object.freeze({ scale: 1, x: 0, y: 0 });
  const MAX_SCALE = 5;
  const TAP_SCALE = 2.5;
  const DOUBLE_TAP_MS = 300;
  const DOUBLE_TAP_PX = 30;
  const TAP_SLOP_PX = 8;
  const KEY_STEP = 1.5;
  const KEY_PAN_PX = 48;

  const isZoomed = zoom => zoom.scale > 1.001;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const center = (base, zoom) => ({ x: base.left + base.width / 2 + zoom.x, y: base.top + base.height / 2 + zoom.y });
  const zoomAt = (zoom, scale, at, base) => {
    const next = Math.min(MAX_SCALE, Math.max(1, scale));
    const c = center(base, zoom), ratio = next / zoom.scale;
    return { scale: next, x: zoom.x + (at.x - c.x) * (1 - ratio), y: zoom.y + (at.y - c.y) * (1 - ratio) };
  };
  const pinch = (start, startMid, startSpread, mid, spread, base) => {
    const scale = Math.min(MAX_SCALE, Math.max(1, start.scale * (startSpread > 0 ? spread / startSpread : 1)));
    const c = center(base, start);
    const px = (startMid.x - c.x) / start.scale, py = (startMid.y - c.y) / start.scale;
    return { scale, x: mid.x - (base.left + base.width / 2) - px * scale, y: mid.y - (base.top + base.height / 2) - py * scale };
  };
  function clampAxis(offset, start, size, scale, viewStart, viewSize) {
    const drawn = size * scale, mid = start + size / 2;
    if (drawn <= viewSize) return 0;
    const most = viewStart - (mid - drawn / 2), least = viewStart + viewSize - (mid + drawn / 2);
    return Math.min(most, Math.max(least, offset));
  }
  const clamp = (zoom, base, view) => {
    const scale = Math.min(MAX_SCALE, Math.max(1, zoom.scale));
    if (scale <= 1.001) return FIT;
    return { scale, x: clampAxis(zoom.x, base.left, base.width, scale, view.left, view.width),
      y: clampAxis(zoom.y, base.top, base.height, scale, view.top, view.height) };
  };
  const toggleAt = (zoom, at, base, view) => isZoomed(zoom) ? FIT : clamp(zoomAt(zoom, TAP_SCALE, at, base), base, view);
  const laidOut = (drawn, zoom) => {
    const width = drawn.width / zoom.scale, height = drawn.height / zoom.scale;
    const cx = drawn.left + drawn.width / 2 - zoom.x, cy = drawn.top + drawn.height / 2 - zoom.y;
    return { left: cx - width / 2, top: cy - height / 2, width, height };
  };

  function create({ dialog, view, image, title, closeButton, windowRef = globalThis.window || globalThis }) {
    if (!dialog || !view || !image || !title || !closeButton) throw new TypeError('The Property image viewer needs its local dialog elements.');
    let zoom = FIT, opener = null, active = false;
    const pointers = new Map();
    let gesture = null, gestured = false, downAt = null, lastTap = null, lastType = 'mouse';

    function measure() {
      if (!active || !image.getBoundingClientRect || !view.getBoundingClientRect) return null;
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, width: box.width, height: box.height };
      };
      return { base: laidOut(rect(image), zoom), area: rect(view) };
    }

    function paint(next) {
      zoom = next;
      image.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
      image.dataset.zoom = zoom.scale.toFixed(2);
      image.classList.toggle('is-zoomed', isZoomed(zoom));
    }

    function resetGesture() {
      pointers.clear(); gesture = null; gestured = false; downAt = null; lastTap = null;
    }

    function close() {
      if (!active && !dialog.open) return;
      if (dialog.open) dialog.close();
      else finishClose();
    }

    function finishClose() {
      active = false; resetGesture(); paint(FIT);
      image.removeAttribute?.('src');
      image.alt = '';
      title.textContent = '';
      const back = opener?.isConnected ? opener : null;
      opener = null;
      back?.focus?.({ preventScroll: true });
    }

    function open(src, name, returnFocus) {
      if (active || dialog.open || typeof src !== 'string' || !src.startsWith('blob:')) return false;
      opener = returnFocus || null;
      image.alt = String(name || '');
      title.textContent = String(name || '');
      image.src = src;
      paint(FIT); resetGesture();
      try { dialog.showModal(); }
      catch { image.removeAttribute?.('src'); opener = null; return false; }
      active = true;
      closeButton.focus?.({ preventScroll: true });
      return true;
    }

    function points() { return [...pointers.values()]; }
    function begin() {
      const current = points();
      if (current.length >= 2) gesture = { kind: 'pinch', start: zoom, mid: midpoint(current[0], current[1]), spread: distance(current[0], current[1]) };
      else if (current.length === 1) gesture = { kind: 'pan', start: zoom, from: current[0] };
      else gesture = null;
    }

    function point(event) { return { x: event.clientX, y: event.clientY }; }
    function onPointerDown(event) {
      if (!active || (event.pointerType === 'mouse' && event.button !== 0)) return;
      lastType = event.pointerType || 'mouse';
      if (event.isPrimary) pointers.clear();
      if (pointers.size === 0) { gestured = false; downAt = point(event); }
      pointers.set(event.pointerId, point(event));
      try { view.setPointerCapture?.(event.pointerId); } catch { /* The browser may not support capture for this pointer. */ }
      if (pointers.size > 1) gestured = true;
      begin();
    }
    function onPointerMove(event) {
      if (!active || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, point(event));
      const currentGesture = gesture, m = measure();
      if (!currentGesture || !m) return;
      const currentPoints = points();
      if (currentGesture.kind === 'pinch' && currentPoints.length >= 2) {
        gestured = true;
        paint(clamp(pinch(currentGesture.start, currentGesture.mid, currentGesture.spread,
          midpoint(currentPoints[0], currentPoints[1]), distance(currentPoints[0], currentPoints[1]), m.base), m.base, m.area));
      } else if (currentGesture.kind === 'pan') {
        const at = currentPoints[0];
        if (downAt && distance(at, downAt) > TAP_SLOP_PX) gestured = true;
        if (isZoomed(currentGesture.start)) paint(clamp({ ...currentGesture.start,
          x: currentGesture.start.x + at.x - currentGesture.from.x, y: currentGesture.start.y + at.y - currentGesture.from.y }, m.base, m.area));
      }
    }
    function onPointerUp(event) {
      if (!active || !pointers.delete(event.pointerId)) return;
      begin();
      if (pointers.size > 0 || gestured) return;
      const onImage = event.target === image || image.contains?.(event.target);
      if (event.pointerType === 'mouse') { if (!onImage) close(); return; }
      if (onImage) {
        const at = point(event), last = lastTap;
        if (last && event.timeStamp - last.time < DOUBLE_TAP_MS && distance(at, last.at) < DOUBLE_TAP_PX) {
          lastTap = null;
          const m = measure();
          if (m) paint(toggleAt(zoom, at, m.base, m.area));
        } else lastTap = { at, time: event.timeStamp };
        return;
      }
      lastTap = null;
      close();
    }
    function onPointerCancel(event) { pointers.delete(event.pointerId); gestured = true; begin(); }
    function onDoubleClick(event) {
      if (!active || lastType !== 'mouse') return;
      const m = measure();
      if (m) paint(toggleAt(zoom, point(event), m.base, m.area));
    }
    function onWheel(event) {
      if (!active) return;
      const m = measure();
      if (!m) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      paint(clamp(zoomAt(zoom, zoom.scale * factor, point(event), m.base), m.base, m.area));
    }
    function onKeyDown(event) {
      if (!active) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const m = measure();
      if (!m) return;
      const middle = { x: m.base.left + m.base.width / 2, y: m.base.top + m.base.height / 2 };
      const pan = { ArrowLeft: [KEY_PAN_PX, 0], ArrowRight: [-KEY_PAN_PX, 0], ArrowUp: [0, KEY_PAN_PX], ArrowDown: [0, -KEY_PAN_PX] }[event.key];
      let next;
      if (event.key === '+' || event.key === '=') next = zoomAt(zoom, Math.min(MAX_SCALE, zoom.scale * KEY_STEP), middle, m.base);
      else if (event.key === '-' || event.key === '_') next = zoomAt(zoom, zoom.scale / KEY_STEP, middle, m.base);
      else if (event.key === '0') next = FIT;
      else if (pan && isZoomed(zoom)) next = { ...zoom, x: zoom.x + pan[0], y: zoom.y + pan[1] };
      else return;
      event.preventDefault(); paint(clamp(next, m.base, m.area));
    }
    function onCancel(event) { event.preventDefault(); event.stopPropagation(); close(); }
    function onResize() { if (active) paint(FIT); }

    view.addEventListener('pointerdown', onPointerDown);
    view.addEventListener('pointermove', onPointerMove);
    view.addEventListener('pointerup', onPointerUp);
    view.addEventListener('pointercancel', onPointerCancel);
    view.addEventListener('dblclick', onDoubleClick);
    view.addEventListener('wheel', onWheel, { passive: false });
    view.addEventListener('gesturestart', event => { if (active) event.preventDefault(); }, { passive: false });
    view.addEventListener('gesturechange', event => { if (active) event.preventDefault(); }, { passive: false });
    dialog.addEventListener('keydown', onKeyDown);
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', finishClose);
    closeButton.addEventListener('click', close);
    windowRef.addEventListener?.('resize', onResize);

    return Object.freeze({ open, close, getZoom: () => zoom, isOpen: () => active });
  }

  globalThis.PropertyImageViewer = Object.freeze({ FIT, MAX_SCALE, TAP_SCALE, isZoomed, zoomAt, pinch, clamp, toggleAt, laidOut, distance, midpoint, create });
})();
