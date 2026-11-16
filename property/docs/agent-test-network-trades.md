# Agent-to-agent direct trades on local test networks

**English** · [Português (Brasil)](agent-test-network-trades.pt-BR.md)

Property Agent can coordinate a direct trade offer over encrypted NIP-17 and observe a payment through a locally configured BTC, XMR, or XNO test-network node. This is an agent/MCP workflow. The current human PWA does not expose this checkout flow.

## Scope and setup

The nine `property_trade_*` MCP tools are limited to Bitcoin regtest, Monero fakechain, and Nano dev. Mainnet is rejected by both the local configuration validator and each ledger adapter. RPC URLs must use a numeric loopback address (`127.0.0.0/8` or `::1`) over HTTP; credentials stay in the encrypted agent vault. The profile owner configures each local adapter from a terminal:

```bash
property-agent trade configure BTC
property-agent trade configure XMR
property-agent trade configure XNO
property-agent trade status
property-agent trade disable
```

Each configuration command checks the reported network before storing it. `disable` removes active adapter settings and preserves the encrypted trade journal and local evidence-signing key. Configure only nodes created for the corresponding private test network.

## Trade flow

1. The seller creates an offer containing the currency, exact atomic amount, terms hash and text, unique local-node destination, peer Nostr key, and expiry. Property sends it through the agent's selected NIP-17 relays.
2. The buyer checks those fields and accepts the exact received offer. Acceptance records the local state and sends a signed NIP-17 response; it does not pay.
3. The seller synchronizes the authenticated acceptance and sends the exact payment request.
4. The buyer pays separately with a wallet and can check the destination, amount, and network. Property does not initiate that payment in this workflow.
5. Either participant with access to a suitable local test-network node can reconcile the offer's exact destination against its own ledger adapter. The seller may also send a settlement notice; the other participant displays that notice as `seller-reported-unverified` until its own local node confirms it.

The local journal uses atomic-unit strings, exact destination/network matching, adapter-specific confirmation thresholds, duplicate detection, BTC reorg rollback, and signed hash-linked evidence encrypted at rest. Retrying selected state reads is safe; tools that resend a signed NIP-17 message are marked non-idempotent because a retry can create another relay event.

## Guarantees and limits

- This workflow is direct payment, not escrow. It has no delivery guarantee, arbitration, forced refund, or protocol-enforced condition.
- NIP-17 authentication proves which Nostr key sent the offer; it does not prove that the same person controls the declared wallet account.
- A local node result records that node's observation under the adapter checks. A relay acknowledgement proves neither delivery nor reading.
- The recipient does not accept a peer's settlement assertion as local confirmation. The recipient can independently query its own configured node.
- The workflow sends no payment itself and does not expose a mainnet option. Existing XNO direct-payment, custodial-escrow, and experimental threshold tools have separate policies and are not converted into this workflow.
- Test runs use synthetic identities, private/local node fixtures, and loopback relays only. They do not prove production deployment, external wallet compatibility, public-relay behavior, or a human PWA experience.

See [agent messaging](plano-agentes-human-first.md), [BTC/XMR/XNO payment models](pagamentos.md), and the [G7 evidence index](evidence/product-completion/G7/gate-result.md).
