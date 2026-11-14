# XNO threshold adversarial check — offline

**Result:** PASS for the fixed local protocol fixture only.
**Command:** `node property/tests/agent-xno-threshold-protocol-smoke.mjs`
**Protocol revision:** `property-xno-threshold/v2`
**Base revision:** `3a139513a418a24e654cbfac44a0341e6f7b01b4`

Three isolated buyer, seller, and arbiter role reviews found two attacks in the prior client flow: an arbiter coordinator could deliver a validly shaped refund proposal before expiry, and could deliver different valid intents to buyer and seller in the same session. In the early-refund scenario, the buyer still had to approve and contribute a signing share; the arbiter could not spend alone. The simulated group signature was a normal valid Nano-format signature for the selected block, not proof of Nano-node acceptance.

The updated offline fixture passed **23 assertions** using four fixed synthetic identities, one adversarial session, an in-memory message transport, and a mocked development-node adapter. It verifies:

- early refund proposals are rejected by both buyer and seller under their local contract clocks and surfaced as local security alerts;
- release is rejected at the exact expiry boundary, while refund becomes eligible at that boundary;
- all three participants must observe the same intent fingerprint before approval/signing;
- one recipient that receives two coordinator proposals sends a conflict report; all three local session statuses show the report and cannot start the Property signing flow;
- after the parties locally add the reported arbiter to their injected blocklists, a new session using that identity is refused and a different candidate can be invited.
- a stored v1 session refuses to sync under the v2 client.

The v2 wire identifier is intentionally incompatible with v1, so old clients cannot silently participate in the new observation round. Existing v1 sessions must not be resumed with v2 clients.

## Limits

These are synthetic protocol messages; this run did not exercise real NIP-17 event signatures, separate installed daemons, a Nano node, public relays, or any funds. A participant-authenticated conflict report is not cryptographic proof for the other parties that the accused coordinator sent both proposals; a malicious participant could file a false report and freeze a session. The blocklist checks use a local callback fixture; the report does not prove that both humans or agents will permanently block the identity, and no shared or Sybil-resistant reputation exists. One session still has one arbiter; trying multiple candidates means separate sessions. Local clocks and Property-client rules can be bypassed by modified software. Any two threshold-share holders can sign a different valid Nano block outside Property, and Nano consensus does not enforce the escrow policy.

Mainnet creation/signing/publication remains hard-disabled. No faucet balance or real transaction was used. The XNO-T2 private-node acceptance, XNO-T3b real private-relay integration, and XNO-T4 independent cryptographic/security and human UX reviews remain pending.
