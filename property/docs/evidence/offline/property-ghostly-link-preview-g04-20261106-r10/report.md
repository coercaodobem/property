# Property Ghostly/link preview G04 browser evidence

**Result:** PASS — all 18 recorded G04 cases passed; none were blocked.
**Date:** 2026-11-06
**Browser:** Firefox 153.0, Playwright 1.62.1 (pinned hashes recorded in `browser-g04-report.json`).
**Relays:** Two temporary Geode relays on loopback (`127.0.0.1:28470` and `:28471`).

## Required checks

- **G04-13 — PASS:** A fresh browser profile received two distinct random relay suggestions from the app's bundled list. The suggestions were saved locally; identity creation and import remained available without opening settings, and no relay connection started before identity activation.
- **G04-21 — PASS:** Typing an HTTPS link and canceling consent caused zero requests. One explicit confirmation made exactly one mocked request. The test verified that the request omitted credentials and referrer, rejected redirects, and loaded no external images. The recipient recovered and rendered the sender-provided text metadata from the encrypted NIP-17 message without fetching the link. The relay stored the gift-wrap but did not receive the link, title, or preview tag in plaintext.
- The request action, consent warning, and recipient card were checked in English and Portuguese (Brazil), including a 390×844 mobile screenshot.

The entire browser run recorded **zero external HTTP requests** and **zero page errors**. The mocked HTML fixture and both relays were local; no public relay, live website, or real participant was used. The relay check compared before/after event IDs and did not use elapsed-time thresholds.

## Evidence files

- `browser-g04-report.json` — machine-readable case results, network boundary, relay and browser metadata.
- `g04-link-preview-composer-mobile-pt-BR.png` — mobile composer with the optional preview attached to the draft.
- The remaining PNGs are the visual evidence produced by the same G04 browser run for existing mobile, date-separator, scroll, badge, welcome, and NIP-39 cases.

## Reproduction

```bash
bash property/tests/offline/run-isolated.sh node property/tests/offline/browser-g04-smoke.mjs \
  --playwright-module /home/guilherme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
  --engine firefox \
  --executable /home/guilherme/.cache/ms-playwright/firefox-1538/firefox/firefox \
  --playwright-version 1.62.1 \
  --browser-version 153.0 \
  --playwright-package-sha256 f04a718e7b82280e95f0dbe60a25fa53ab1304d9ce38735555b31e2d09a6ed30 \
  --browser-executable-sha256 26e4198abe0dfb93c339239297008b1319711575d8cbae8e2d5122d2017b29a1 \
  --output property/docs/evidence/offline/property-ghostly-link-preview-g04-20261106-r10
```
