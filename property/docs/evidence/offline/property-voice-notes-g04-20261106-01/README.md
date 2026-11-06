# Property voice notes: offline integration evidence

Status: **technical checks PASS; interactive UX review PENDING**.

## Implemented scope

- Record a short voice note in the existing Property conversation composer, review it locally, then explicitly send or discard it.
- Send the audio as a bounded Property tag inside the encrypted NIP-17 rumor for direct and group conversations. The relays receive only NIP-17 gift wraps; other clients can show the encrypted fallback text but do not play the audio tag.
- Verify the audio SHA-256 before storing or constructing a local playback URL. No upload endpoint, transcription, autoplay, or background recording is used.
- Enforce 400 ms–10 s, 18,000 audio bytes, and 60,000 serialized bytes per wrapped relay event. Discard an active recording when the app leaves the foreground or the conversation changes.

## Checks run

- `node --check property/web/app.js` — PASS.
- `node --check property/web/voice-messages.js` — PASS.
- `node property/tests/voice-messages-smoke.mjs` — PASS. One maximum-size fixed fixture, direct wrapping for two participants, group wrapping for three participants, recipient isolation, malformed/duplicate/tampered/oversized rejection, and microphone-track release.
- `node property/tests/app-contract-smoke.mjs` — PASS. Checks CSP, bundled script, PWA shell, visible controls, and app integration.
- `bash property/tests/run-smoke.sh` — PASS, including the voice test, app contract, relay packaging, and existing agent offline checks.
- `git diff --check` — PASS.

## Pending checks

- Interactive record, preview, discard, and send flow has not been manually inspected. The local page and its assets loaded in Firefox, but this session exposed no controllable browser surface; the Snap WebDriver could not start. The actual microphone permission prompt and browser codec playback therefore remain unverified.
- Other operating systems and mobile browsers remain PENDING, in line with the existing platform-test boundary.

No voice message was published to a public relay and no real payment was made during these checks.
