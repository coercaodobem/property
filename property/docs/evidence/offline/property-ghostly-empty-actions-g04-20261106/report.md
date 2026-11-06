# Property G04 — empty-state actions and first-use relay suggestions

- Result: **PASS** (16/16 executed browser cases)
- Profile: isolated offline browser run with local loopback relays
- Browser: Firefox 153.0; Playwright 1.62.1
- External network requests: none
- Criteria: fixed case outcomes; no duration threshold

## Relevant cases

- **G04-13 — PASS:** A fresh profile receives two distinct bundled relay suggestions, stores them locally, and can create or import an identity without manually configuring relays. Relay settings remain optional, and no relay connection starts before identity activation.
- **G04-19 — PASS:** The signed-in empty state offers **New conversation**, **Join with a contact link or code**, and **Share my contact** in English and Brazilian Portuguese. The actions fit the mobile viewport. Sharing produces the existing public contact URL, `nprofile`, and local QR; joining opens the existing contact flow and focuses the public-key field. Neither action publishes a relay event.

## Executed cases

All executed cases passed: G04-01, G04-02, G04-03, G04-04, G04-05, G04-06, G04-09, G04-11, G04-12, G04-13, G04-14, G04-15, G04-16, G04-17, G04-18, and G04-19.

The complete machine-readable result is in `browser-g04-report.json`. Screenshots are included for the English desktop empty state, English mobile layout, and Brazilian Portuguese desktop empty state. `SHA256SUMS` records hashes for the report and screenshots.

This evidence covers the Ubuntu Firefox run only. Other operating systems and physical devices remain pending.
