# Property Ghostly/NIP-39 G04 browser evidence

**Result:** PASS, 17/17 recorded G04 cases.

The offline Firefox run exercised two local Geode relays and disposable browser identities. It passed the existing first-use relay-selection case (G04-13): two distinct relays were selected from the bundled list and saved before identity creation, identity creation/import remained available without opening settings, and no relay connection began before activation.

G04-20 published one signed kind 10011 GitHub identity claim through the Property profile UI. The contact loaded that claim from the local relay without a GitHub request. A fixed mocked Gist API response was used only after the explicit Verify action; exactly one request was made with credentials omitted, the matching proof rendered as verified, and verification published no relay event. The run made zero external HTTP requests. No public relay or live GitHub endpoint was contacted.

The report JSON contains per-case results and local WebSocket accounting. The PNG captures cover the empty-state actions in English, Portuguese, and a 390×844 viewport, the NIP-39 profile form and contact proof before and after verification in English and Portuguese on mobile, message date headings in both languages, message-scroll state in both languages, and the profile badge setting.

**Pinned browser:** Playwright 1.62.1, Firefox 153.0.

**Command:** `bash property/tests/offline/run-isolated.sh node property/tests/offline/browser-g04-smoke.mjs --playwright-module /home/guilherme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs --engine firefox --executable /home/guilherme/.cache/ms-playwright/firefox-1538/firefox/firefox --playwright-version 1.62.1 --browser-version 153.0 --playwright-package-sha256 f04a718e7b82280e95f0dbe60a25fa53ab1304d9ce38735555b31e2d09a6ed30 --browser-executable-sha256 26e4198abe0dfb93c339239297008b1319711575d8cbae8e2d5122d2017b29a1 --output property/docs/evidence/offline/property-ghostly-nip39-g04-20261106`

This is local offline evidence for the changed working tree. It does not establish production deployment or verification on other operating systems.
