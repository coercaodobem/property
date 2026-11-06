'use strict';
(() => {
  const EDGE_PADDING = 12;

  function create({ element, handle, windowRef = globalThis.window } = {}) {
    if (!element || !handle || !windowRef) throw new TypeError('A call window, drag handle, and window are required.');
    let minimized = false;
    let drag = null;

    function viewport() {
      return {
        width: Math.max(1, windowRef.document?.documentElement?.clientWidth || windowRef.innerWidth || 1),
        height: Math.max(1, windowRef.document?.documentElement?.clientHeight || windowRef.innerHeight || 1)
      };
    }

    function position(left, top) {
      const bounds = viewport();
      const rect = element.getBoundingClientRect();
      const maxLeft = Math.max(EDGE_PADDING, bounds.width - rect.width - EDGE_PADDING);
      const maxTop = Math.max(EDGE_PADDING, bounds.height - rect.height - EDGE_PADDING);
      element.style.left = `${Math.max(EDGE_PADDING, Math.min(maxLeft, left))}px`;
      element.style.top = `${Math.max(EDGE_PADDING, Math.min(maxTop, top))}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    }

    function onPointerDown(event) {
      if (event.isPrimary === false || (Number.isFinite(event.button) && event.button !== 0)) return;
      if (event.target?.closest?.('button, a, input, select')) return;
      const rect = element.getBoundingClientRect();
      position(rect.left, rect.top);
      drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      try { handle.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture is optional. */ }
      event.preventDefault?.();
    }

    function onPointerMove(event) {
      if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      position(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    }

    function finishDrag(event) {
      if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      try { handle.releasePointerCapture?.(drag.pointerId); } catch { /* The pointer may already have left. */ }
      drag = null;
    }

    function clampToViewport() {
      if (element.hidden || !element.style.left || !element.style.top) return;
      const rect = element.getBoundingClientRect();
      position(rect.left, rect.top);
    }

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
    windowRef.addEventListener('resize', clampToViewport);
    windowRef.visualViewport?.addEventListener('resize', clampToViewport);

    return Object.freeze({
      minimize() { minimized = true; element.hidden = false; return true; },
      restore() { minimized = false; element.hidden = true; return true; },
      show() { element.hidden = false; },
      hide() { minimized = false; element.hidden = true; drag = null; },
      isMinimized: () => minimized,
      isVisible: () => !element.hidden,
      destroy() {
        handle.removeEventListener('pointerdown', onPointerDown);
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', finishDrag);
        handle.removeEventListener('pointercancel', finishDrag);
        windowRef.removeEventListener('resize', clampToViewport);
        windowRef.visualViewport?.removeEventListener('resize', clampToViewport);
        drag = null;
      }
    });
  }

  window.PropertyCallWindow = Object.freeze({ EDGE_PADDING, create });
})();
