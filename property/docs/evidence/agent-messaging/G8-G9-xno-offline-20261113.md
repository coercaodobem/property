# G8–G9 — Agent XNO offline validation

**Run date:** 2026-11-13
**Source commit:** `b7b5dfed35d61df520468e7e31c2d3c331bd65af`
**Remote branch:** `coercaodobem/property:modelo-mvp`
**Remote SHA confirmed after push:** `b7b5dfed35d61df520468e7e31c2d3c331bd65af`

## G8 — Trade state machine

Command: `node property/tests/agent-xno-trades-smoke.mjs`

- Result: **28/28 PASS**.
- Fixed seed: `property-xno-trade-fixed-v1`; logical clock: `1900000000`.
- Synthetic ledger outcome: one send and one receive block.
- Covered signed/forged/expired offer cases, amount and lifetime caps, lost send response/idempotent retry, confirmation gating, lost receive response/retry, duplicate receipt, dispute without freezing funds, encrypted journal, identity/password binding, and fail-closed tamper cases.
- Funds: none. Public relays/live Nano network: none. Escrow: false.

## G9 — Nano wallet adapter

Command: `node property/tests/agent-nano-wallet-smoke.mjs`

- Result: **14/14 PASS**.
- Fixed seed: `property-xno-wallet-fixed-v1`.
- Synthetic RPC requests: 70; synthetic sends: one; `receive` actions: one.
- The fixture drops the first receive response after recording the receive block. A retry finds and verifies that exact block from account history without issuing another receive.
- Covered dedicated-account and network checks, raw caps, same-ID idempotency, unconfirmed/mismatched payment refusal, response-loss recovery, wrong-network/multi-account refusal, remote/localhost endpoint refusal, and unauthenticated gateway refusal.
- Funds: none. External network: none. Fixture bound only to `127.0.0.1`.

## Wider local validation

`bash property/tests/run-smoke.sh` exited `0` and ended with `PASS: suíte smoke local concluída.` It included the G8/G9 tests, package/install checks, and the existing messaging/security smoke checks. G5 reported 341 technical offline cases passing while explicitly keeping independent security review pending. Updated Markdown relative links resolved in all 12 checked files, and `git diff --cached --check` passed before publication.

## Pending boundaries

- Real-person XNO setup/UX evaluation and independent security review: `PENDING`.
- Mainnet/live Nano wallet operation and production wallet-management approval: `PENDING`; no real funds were used.
- Windows, macOS, Android, and iOS: `PENDING`.
- Local budget anti-rollback: not provided by the Nano protocol or this encrypted journal; restoring an older authentic journal can bypass the lifetime history.
- Conditional payment, delivery enforcement, escrow, forced refund, and arbitration: unavailable. The implementation is capped direct payment only.
