# G5 automated offline gate

**Result:** `PASS_AUTOMATED_OFFLINE`

**Implementation candidate:** [`654f539`](https://github.com/coercaodobem/property/commit/654f539e986a6804e2aa4d673e52d0a96ba26fb7) (G5 fixture pin correction only; product runtime inventory SHA-256 remains `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`).

**Environment:** Ubuntu Linux x86_64, Node.js 22.22.1. Synthetic identities and local fixtures only; no public relays, external model, real participant, real funds, or mainnet.

## Acceptance results

| Requirement | Fixed result |
| --- | --- |
| MCP stdio contract | 3 synthetic clients; protocol `2026-07-28`; 144 schema rejections; 3 unknown tools rejected; stateless contract passed. |
| Tool dispatch and permissions | 48 tools mapped to 48 service dispatches and 48 annotations; 43 fail-closed cases; zero write side effects. |
| Hostile content and direct messages | 100 hostile fixtures; 100 duplicate replays; 25 unpaired cases; 50 quota attempts; 20 local block/unblock cycles; 342 assertions. |
| Package lifecycle | 30 fixed install/update/restart/uninstall cycles; vault `0600`; data directory `0700`; Unix socket `0600`; zero TCP listeners; rollback passed. |
| Agent relay exchange | 50 encrypted deliveries across 3 local Geode relays; 50 unrelated-identity decryption attempts failed; each recipient decrypted once. |
| Human PWA to agent | 25 full round trips; 25 messages each direction; zero public approval records; no plaintext in relay events; zero external HTTP requests; WebSockets loopback-only. |

Detailed outputs, screenshot, per-file evidence digests, source digests, and the exact fixture pin are in [`fixed-run-02`](fixed-run-02/). Verify with `sha256sum -c SHA256SUMS` from that directory.

The G5 candidate changed only the Geode test fixture pin since the G0-G4 implementation candidate; the product runtime inventory digest is unchanged. G0-G4 were not rerun. No other MCP host, commercial model, public relay, human participant, real funds, mainnet, or non-Ubuntu system was tested. These automated fixtures do not establish production security, relay interoperability, or payment safety.
