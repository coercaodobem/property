# G5 automated offline gate

**Result:** `PASS_AUTOMATED_OFFLINE`

**Environment:** Ubuntu Linux x86_64, Node.js 22.22.1

**Implementation commit:** `2f7b37ae866e9de16b26f191076d18f436b2f7fe`

**Scope:** synthetic identities and local fixtures only; zero public relay connections, external model calls, real participants, or funds.

## Acceptance evidence

| Requirement | Fixed result | Evidence |
| --- | --- | --- |
| Shared protocol family registry | 8 event families; 800 signed event vectors, 800 malformed parser cases, 50 duplicate copies and 50 reordered batches per family; browser, agent, and JSON matrix agree | [`protocol-contract-report.json`](protocol-contract-report.json) |
| MCP protocol and all tool schemas | 3 synthetic clients × 45 requests; 117 invalid-schema rejections, 3 unknown-tool denials, unsupported versions and legacy `initialize` rejected | [`agent-mcp-contract.json`](agent-mcp-contract.json) |
| Tool dispatch, annotations, permissions and failure paths | 39 unique tool-to-service mappings and risk annotations checked; 35 unavailable/invalid calls failed closed; zero write side effects | [`agent-mcp-tool-boundaries.json`](agent-mcp-tool-boundaries.json) |
| Hostile content and direct-message boundary | 100 hostile fixtures, 100 duplicate replays, 25 unpaired read/send cases, 50 quota over-limit attempts, 20 local block/unblock cycles; 342 assertions | [`G5-offline-report.json`](../../agent-messaging/G5-offline-report.json), [`hostile corpus manifest`](../../agent-messaging/G5-adversarial-corpus-manifest.json) |
| Local package lifecycle | 30 install/update/restart/uninstall cycles; vault and config preserved byte-for-byte; Unix socket mode `0600`; zero TCP listeners; foreign launcher rollback passed | [`agent-package-lifecycle.json`](agent-package-lifecycle.json) |
| Agent-to-agent relayed exchange | 50 encrypted message deliveries across 3 isolated Geode relays; every intended recipient decrypted exactly once; unrelated identity failed all decryption attempts | [`agent-relay-exchanges.json`](agent-relay-exchanges.json) |
| Human PWA and agent conversation | 25 complete round trips (25 messages each way) through 3 local relays; PWA displayed all replies; no human approval record; no plaintext in relay events | [`pwa-agent-exchanges.json`](pwa-agent-exchanges.json), [`screenshot`](pwa-agent-exchanges.png) |
| Repository smoke suite | `bash property/tests/run-smoke.sh` completed with `PASS: suíte smoke local concluída.`; the suite includes G5 MCP contract and tool-boundary checks | [`run-smoke.sh`](../../../../tests/run-smoke.sh) |

## Network and security observations

The PWA test made zero external HTTP requests and opened WebSockets only to local relays. Chromium made 14 background egress attempts to Google-related endpoints; the test's local deny proxy returned HTTP 502 for every attempt. No external connection succeeded. Public relay behavior, external MCP hosts, human participants, and operating systems other than Linux x86_64 were not tested.

This gate proves the listed automated offline cases only. It does not establish independent security review, production relay compatibility, or production payment safety. Nano threshold publication remains dev-only, and direct XNO/custodial paths retain their documented limits.

## Supplemental browser bridge revalidation

The browser bridge was subsequently revalidated in the isolated G6 candidate: all eight fixed G05 browser scenarios passed against four temporary local relays. The report recorded zero external requests and 195 Chromium background attempts, all denied by the local HTTP 502 proxy; WebSockets remained on loopback. This supplements the evidence above and does not claim physical mobile/background execution.

- [G05 browser report](final/browser-g05-report.json)
- SHA-256: `61fdcf40e5427bec09b6194ea2e82237f3c8db9484389a012fb48ff5080fa63f`
