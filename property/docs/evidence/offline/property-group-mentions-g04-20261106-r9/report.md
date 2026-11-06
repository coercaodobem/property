# Group mentions and first-use relays — G04 evidence

**Result:** PASS — all 19 recorded G04 cases passed in the offline browser run.
**Environment:** Two local Geode relays over loopback, disposable browser identities, Firefox 153.0 and Playwright 1.62.1.

## Results

- **G04-22:** The group composer offered local member suggestions; keyboard selection inserted a participant-bound name. A second browser decrypted the NIP-17 message and resolved its NIP-27 `nostr:npub` reference to the intended group member. Relay storage contained encrypted gift wraps and exposed neither the message text nor the visible mention name.
- **Mobile layout:** At 390×844, the suggestion panel ended at pixel 597 and the textarea began at pixel 605, leaving an 8-pixel gap with the draft visible. Screenshot: [`g04-group-mention-picker-mobile-en.png`](./g04-group-mention-picker-mobile-en.png).
- **G04-13:** A fresh profile received two distinct randomly selected relays from the bundled list and saved them locally. Creating or importing an identity remained available without visiting settings, and relay connections did not begin before identity activation. Choosing relays remains optional.
- The run recorded zero external HTTP requests and zero browser page errors. It used no public relay or real participant.

## Evidence

- [`browser-g04-report.json`](./browser-g04-report.json) — results for all 19 cases, relay checks, network boundary, and browser hashes.
- [`g04-group-mention-picker-mobile-en.png`](./g04-group-mention-picker-mobile-en.png) — mobile composer screenshot.

The full offline unit and contract suite also passed with:

```bash
bash property/tests/offline/run-isolated.sh bash property/tests/run-smoke.sh
```
