import { addSeedLists, findSecret } from "../../../archive/ghostly-source/apps/ui/src/lib/parse/secrets";
import { wordlist as portugueseBip39 } from "../../../archive/ghostly-source/node_modules/@scure/bip39/wordlists/portuguese.js";
import { MONERO_PORTUGUESE } from "../../../archive/ghostly-source/apps/ui/src/lib/parse/monero-seed-lists";

// The shipped Property PWA supports English and Portuguese (Brazil).
// Keep the detector synchronous and entirely local, with only those seed lists bundled.
addSeedLists([portugueseBip39], [[MONERO_PORTUGUESE, 4]]);
window.PropertySecretGuard = Object.freeze({ findSecret });
