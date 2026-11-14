# Supplemental Nano mainnet smoke: XNO threshold-signature settlement

- **Date:** 2026-11-14
- **Network:** Nano `live`; network identifier `991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948`
- **Scope:** isolated smoke of the experimental 2-of-3 signature and settlement path with exactly `1 raw`, funded from the existing faucet test wallet.
- **Outside G00–G12 and G13 gates:** this record changes no MVP result and does not enable mainnet settlement in the Property Agent.

## Completed round-trip

**Limited PASS:** before publication, a preflight constructed all four blocks and verified FROST signatures locally and validated work through two distinct public RPC endpoints. Both endpoints then reported each block as confirmed on the first confirmation lookup:

| Step | Amount | Nano block hash | Confirmation |
|---|---:|---|---|
| Test wallet send → 2-of-3 account | `1 raw` | [522788B9375ECF43FD7DD84E9EF970C5EBBB2DC63040751A586FE5BD66A6D923](https://nanexplorer.com/nano/blocks/522788B9375ECF43FD7DD84E9EF970C5EBBB2DC63040751A586FE5BD66A6D923) | Confirmed by both RPCs |
| Open/receive on the 2-of-3 account | `1 raw` | [759C88875230E5D95F384720BA74094B3598FD903B5011C6A5BD5C9691A0DA9F](https://nanexplorer.com/nano/blocks/759C88875230E5D95F384720BA74094B3598FD903B5011C6A5BD5C9691A0DA9F) | Confirmed by both RPCs |
| 2-of-3 account send back to wallet | `1 raw` | [B9844358AB8D9FF309A4D376D2CADFE36BFEBE7AD304BFDA8B322181B3F586A7](https://nanexplorer.com/nano/blocks/B9844358AB8D9FF309A4D376D2CADFE36BFEBE7AD304BFDA8B322181B3F586A7) | Confirmed by both RPCs |
| Wallet receives the returned amount | `1 raw` | [48425E29B06C2138342DFAF49142400553E62A5CF6C3630A8CF5ADFAFF3B5FE2](https://nanexplorer.com/nano/blocks/48425E29B06C2138342DFAF49142400553E62A5CF6C3630A8CF5ADFAFF3B5FE2) | Confirmed by both RPCs |

The send was submitted through public RPC `https://node.somenano.com/proxy`; confirmation and balance were independently checked through `https://rainstorm.city/api`. Both RPCs reported Nano `live`. The control RPC for local Nano Node V28.2 was restricted to loopback; the process was stopped after the run.

- Test-wallet account: `nano_3snjykbirswtxziwpswrnf5ep88inauiypmmwbqcgsq3mf7161ffwq416cjw`.
- 2-of-3 account for this round-trip: `nano_3fqz4uifzjgjowwiytgfgmamw1ffh9ansxo6rty7s1tgxhpo68eoeox6ypoa`.
- Confirmed wallet balance at the start and end of the completed round-trip: `499999999999999999999999998 raw`.
- Final frontier independently confirmed by both RPCs: `48425E29B06C2138342DFAF49142400553E62A5CF6C3630A8CF5ADFAFF3B5FE2`.
- FROST participants and shares were synthetic and remained in process memory. No share, seed, or private key is included in this evidence.
- Mainnet publication is public and permanent. No Nostr relay events were published.

## Incident during the first send

A separate earlier attempt published and confirmed a `1 raw` send to an ephemeral threshold account. A harness variable-order error terminated the process before the account was opened; that attempt's DKG shares were not preserved. Both RPCs confirmed the send below and showed the destination account was still unopened:

- Confirmed send: [72FFBA90CB9337FBA1037E52FE9DB63CE98C5A67161A67DB820130A9F22569F6](https://nanexplorer.com/nano/blocks/72FFBA90CB9337FBA1037E52FE9DB63CE98C5A67161A67DB820130A9F22569F6)
- Unopened threshold destination: `nano_1u8g55b66uutqzpeexrg5kbqciw5cj1xow35nmfe1ctnrcyd5nm5qew9sdre`
- Local error: `Cannot access 'root' before initialization`, before any open block was published.

That `1 raw` remains pending at an account with no recoverable shares and is treated as unrecoverable. It is not counted as a successful round-trip. Across both threshold attempts, the test-wallet balance decreased by `1 raw` total: the first send remains pending, while the second send was fully returned.

## What this result does and does not show

Nano mainnet accepted and confirmed the specific FROST 2-of-3-signed blocks in this run. This demonstrates that the aggregate signature was compatible with Nano block validation for this execution.

The test used a temporary harness, not the Property Agent production flow. It did not test three separately installed agents, encrypted NIP-17 exchange, share persistence/recovery, release/refund policy, adversarial behavior, collusion resistance, or signer UX. The Nano account remains an ordinary account; consensus does not enforce Property contract rules.

The Property integration's settlement creation and publication remain disabled outside Nano dev. This separate mainnet smoke does not satisfy XNO-T2: that case still requires a disposable private dev node and demonstrated rejection of tampered/stale blocks. XNO-T3b and XNO-T4 remain pending. See the [offline adversarial evidence](G13-xno-threshold-adversarial-offline-20261114.md).

## Technical references

- [Official Nano RPC protocol](https://docs.nano.org/commands/rpc-protocol/) — `work_generate`, `work_validate`, `process`, `blocks_info`, and `account_info`.
- [Official work-generation guide](https://docs.nano.org/integration-guides/work-generation/).
