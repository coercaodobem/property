import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/chat-gestures.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const gestures = window.PropertyChatGestures;

assert.equal(gestures.shouldReplySwipe({ pointerType: 'touch', startX: 20, startY: 20, endX: 100, endY: 35, hasEventReference: true }), true);
assert.equal(gestures.shouldReplySwipe({ pointerType: 'pen', startX: 20, startY: 20, endX: 92, endY: 20, hasEventReference: true }), true, 'the exact horizontal threshold is accepted');
assert.equal(gestures.shouldReplySwipe({ pointerType: 'touch', startX: 20, startY: 20, endX: 91, endY: 20, hasEventReference: true }), false, 'a swipe below the fixed threshold is ignored');
assert.equal(gestures.shouldReplySwipe({ pointerType: 'touch', startX: 20, startY: 20, endX: 100, endY: 74, hasEventReference: true }), false, 'vertical intent must not become a reply');
assert.equal(gestures.shouldReplySwipe({ pointerType: 'touch', startX: 100, startY: 20, endX: 20, endY: 20, hasEventReference: true }), false, 'left swipes do not start a reply');
assert.equal(gestures.shouldReplySwipe({ pointerType: 'mouse', startX: 0, startY: 0, endX: 100, endY: 0, hasEventReference: true }), false, 'mouse gestures leave desktop selection and clicks alone');
assert.equal(gestures.shouldReplySwipe({ pointerType: 'touch', startX: 0, startY: 0, endX: 100, endY: 0, hasEventReference: false }), false, 'messages without a Nostr reference cannot be replied to');
assert.equal(gestures.shouldReplySwipe({ pointerType: 'touch', startX: 0, startY: 0, endX: 100, endY: 0, hasEventReference: true, interactiveTarget: true }), false, 'swipes starting on links or controls do not trigger a reply');
assert.equal(gestures.shouldReplySwipe({ pointerType: 'touch', startX: NaN, startY: 0, endX: 100, endY: 0, hasEventReference: true }), false, 'non-finite pointer coordinates fail closed');

assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp' }, '', {}), true);
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowDown' }, '', {}), false);
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp' }, 'draft', {}), false, 'nonempty drafts are preserved');
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp', isComposing: true }, '', {}), false, 'IME composition keeps its key handling');
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp', defaultPrevented: true }, '', {}), false);
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp', shiftKey: true }, '', {}), false);
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp', altKey: true }, '', {}), false);
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp', ctrlKey: true }, '', {}), false);
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp', metaKey: true }, '', {}), false);
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp' }, '', { editing: true }), false, 'editing cannot recursively activate edit-last');
assert.equal(gestures.isEditLastShortcut({ key: 'ArrowUp' }, '', { overlayOpen: true }), false, 'open picker/dialog controls keep their keyboard navigation');

console.log('PASS: fixed touch-reply thresholds and safe ArrowUp edit-last guards');
