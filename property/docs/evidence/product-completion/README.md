# Product completion evidence

The previous candidate `a2ac830e2c06715bb0f50e377b8dd12b4f889ca4` passed G0 and G1. The unpublished release-signing trust anchor has since been rotated because its matching private key was not available locally. **G0–G10 are being rerun in order on the new candidate; no old gate pass is carried forward.**

The local Ed25519 signing key is kept outside the repository with owner-only permissions. Only its public key is committed. Its fingerprint and preflight details are in [the G0 preflight record](G0/fixed-run-03/signing-key-rotation-preflight.json).

| Gate | Current candidate status |
|---|---|
| G0 | In progress |
| G1–G10 | Not run on the new candidate |

Tests remain offline and isolated to Ubuntu Linux x86_64. Other operating systems, public relays, human review and mainnet funds remain out of scope. The overall plan stays incomplete until every gate passes on the same candidate and G10 publication checks pass. [Português (Brasil)](README.pt-BR.md)
