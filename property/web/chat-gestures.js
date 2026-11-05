'use strict';
(() => {
  const REPLY_SWIPE_MIN_PX = 72;
  const REPLY_SWIPE_AXIS_RATIO = 1.5;

  function shouldReplySwipe({ pointerType, startX, startY, endX, endY, hasEventReference, interactiveTarget = false } = {}) {
    if (!['touch', 'pen'].includes(pointerType) || hasEventReference !== true || interactiveTarget) return false;
    const deltaX = Number(endX) - Number(startX);
    const deltaY = Math.abs(Number(endY) - Number(startY));
    return Number.isFinite(deltaX) && Number.isFinite(deltaY)
      && deltaX >= REPLY_SWIPE_MIN_PX
      && deltaX >= deltaY * REPLY_SWIPE_AXIS_RATIO;
  }

  function isEditLastShortcut(event, value, { editing = false, overlayOpen = false } = {}) {
    return event?.key === 'ArrowUp'
      && value === ''
      && !event.defaultPrevented
      && !event.isComposing
      && !event.shiftKey
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !editing
      && !overlayOpen;
  }

  window.PropertyChatGestures = Object.freeze({ shouldReplySwipe, isEditLastShortcut });
})();
