# Secret guard notices

`property/web/secret-guard.js` bundles the local secret detector adapted from the archived Ghostly source. Ghostly is MIT licensed; its license is included at `property/web/GHOSTLY-MIT-LICENSE.txt`.

The bundle includes code and word lists from:

- `@noble/hashes` 2.4.0, MIT; see `NOBLE-HASHES-MIT.txt`.
- `@scure/base`, MIT; see `SCURE-BASE-MIT.txt`.
- `@scure/bip39` 2.4.0, MIT; see `SCURE-BIP39-MIT.txt`.
- The English Monero seed list, BSD 3-Clause; see `MONERO-ENGLISH-BSD-3-CLAUSE.txt`.
- The Portuguese Monero seed list, MIT; see `MONERO-PORTUGUESE-MIT-NOTICE.txt`.

The browser bundle contains no runtime fetches. It detects recognized secret formats on the device and returns only a category and, for ecash, decoded amount and unit; it never returns or logs the matched text.
