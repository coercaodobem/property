# Offline test-only vendor code

- `jsQR.js` is `jsqr@1.4.0` (`dist/jsQR.js`), used only as an independent decoder in QR smoke and browser tests. It is not loaded by the Property PWA or shipped in the app/relay package.
- License: Apache-2.0, included in `JSQR-LICENSE.txt`.
- SHA-256: `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`.

This pinned local decoder lets offline tests verify that the QR matrix produced by the bundled Property encoder decodes to the exact contact URL, without downloading a test dependency at runtime.
