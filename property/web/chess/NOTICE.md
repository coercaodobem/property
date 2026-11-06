# Bundled chess component notices

The Property chess component adapts the Ghostly mini-chess controller, protocol, toss logic, UI, and English/Brazilian Portuguese strings. Original source is preserved in `archive/ghostly-source/apps/mini/chess/` under the repository's Ghostly MIT license. The adapted code is included in `src/` and the generated browser modules in `build/`.

The chess rules engine is `chess.js` 1.4.0, Copyright (c) 2025 Jeff Hlywa, under BSD-2-Clause; its license is `vendor/CHESSJS-BSD-2-CLAUSE.txt`.

The bundled hashing functions come from `@noble/hashes` 2.4.0, Copyright (c) 2022 Paul Miller (paulmillr.com), under MIT; its license is `vendor/noble-hashes/MIT-LICENSE.txt`.

All runtime files are served from this repository. The game uses Property's Nostr identity, local settings/message stores, and NIP-17 gift wraps; it does not execute code received from a relay.
