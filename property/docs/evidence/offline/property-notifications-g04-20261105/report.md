# G04 browser run: notifications and relay onboarding

- Result: **PASS**, 12/12 browser cases.
- Branch and checkout base: `modelo-mvp`, `2322669fa9efe78039236c65741c1c99b8a201e1`; run used the working-tree changes listed below.
- Browser: Firefox 153.0; Playwright 1.62.1.
- Network: two isolated loopback Geode relays; 0 external browser HTTP requests; 57 WebSocket connections, all checked against loopback URLs.
- G04-13: two distinct bundled random relays were selected and saved; create/import remained available before relay setup; no relay connection opened before identity activation.
- G04-15: no notification prompt on identity activation/settings open; one prompt after the explicit tap; no duplicate notice while visible; one generic notice while hidden without message/sender payload; a 15-minute chat mute suppressed the next notice while unread count reached 2; preference changes produced zero relay events.
- All other G04 cases passed, including NIP-17 delivery, relay recovery, message reconciliation, edits/gestures, profile cards, search, and local pin behavior.

## Checksums

- `browser-g04-report.json`: `a662f72a9133275ad96777ae6fd212802b81ff9925bb96ea0d73d329b64fcd18`
- `property/web/app.js`: `6776ce88b1b17cfc32315614ae037c2ccdd855c3bd21aa0a5957cc8ec7abfa37`
- `property/web/notification-preferences.js`: `5add774b5f25172548b430e80448638109b249837ea1ed7bda57ee15a187c662`
- `property/tests/offline/browser-g04-smoke.mjs`: `28851198cd81cd9bc962691962ad6f5cec8e6372a7e47724697f44609e498781`
- `property/docs/plano-de-testes-central.md`: `85e7a10996b2b2329405aa792591778dd5542d81d1e52cb62ee875d8cba231b1`

The report contains synthetic identities and loopback-only test data; it contains no private keys, real accounts, or funds. Platforms outside this Firefox/Ubuntu run remain pending.
