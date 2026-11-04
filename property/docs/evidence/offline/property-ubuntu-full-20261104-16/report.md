# Property offline test run

Run: property-ubuntu-full-20261104-16
Profile: full
Candidate: 91f27e6e3e38c4d99eaef1c164e4a76623a57a5d
Observed HEAD matches candidate: true
Working-tree state SHA-256: cb9b1a5d5bbbac39c58f78e3095af11ca3105568fd4fa38f4f7ff2ee2562cb5e
Requested executor: Luna Max
Actual executor: Codex GPT-6
Actual executor source: Active Codex task runtime; identity is provenance, not a gate.
Executor matches request: false
Isolation: PASS
Result: PROPERTY_UBUNTU_OFFLINE_PASS

## Gates
- G00: PASS
- G01: PASS
- G02: PASS
- G03: PASS
- G04: PASS
- G05: PASS
- G06: PASS
- G07: PASS
- G08: PASS
- G09: PASS
- G10: PASS
- G11: PASS
- G12: PENDING

## Case totals
- PASS: 71
- PENDING: 4

## Case results
- G00-01 — PASS: Requirement sources, candidate commit, working tree and tool/host inventory were captured with hashes.
- G00-02 — PASS: Routes, firewall, proxy policy and loopback were checked without public probes.
- G00-03 — PASS: Two and seven real Geode relays completed with isolated loopback endpoints.
- G00-04 — PASS: Interrupted child returned BLOCKED/nonzero; cleanup and evidence hashes verified.
- G01-01 — PASS: The local smoke runner completed.
- G01-02 — PASS: Bridge and native launcher integration both completed.
- G01-03 — PASS: Isolated mutations of signature, bundle hash, atomic price and encrypted backup failed for the expected reasons.
- G02-01 — PASS: Pinned origins, local licenses, package hashes and asset locality passed; the missing cached Gradle distribution was recorded and no rebuild/download was attempted.
- G02-02 — PASS: Fresh root and /property/ pages loaded from the local bundle with no external HTTP, WebSocket or deny-proxy attempts.
- G02-03 — PASS: Remembered identity and the cached PWA shell reopened after the local server stopped; relay status remained offline.
- G02-04 — PASS: Complete update activated; interrupted and mixed packages were rejected while the previous shell, identity and unrelated cache remained available.
- G02-05 — PASS: Legacy backup and database restored the same identity/data; wrong-password/tampered imports and unavailable storage failed visibly without creating another account.
- G02-06 — PASS: CSP blocked remote script execution; malicious text stayed inert; the pinned local TLS/WSS endpoint worked and an untrusted certificate was rejected.
- G03-01 — PASS: A and B were created through the UI in separate persistent browser profiles with the same password; public keys differ and both vaults store encrypted key material without password/nsec fields.
- G03-02 — PASS: Persistent browser restart restored A only when requested; B required the correct password, rejected the wrong one without vault mutation, and manual lock cleared the session.
- G03-03 — PASS: The UI exported an encrypted backup and a clean context imported the same public identity; it could reopen the contact using the other person’s public npub.
- G03-04 — PASS: The public key shown in B profile opened A’s conversation; a valid nprofile preserved its local relay hint and did not connect automatically.
- G03-05 — PASS: Empty, truncated, name-only, nsec and self contacts were rejected in Portuguese without closing the dialog, creating the wrong contact or changing identity.
- G03-06 — PASS: Across creation, lock, backup and contact flows, only localhost assets were requested; passwords/private keys were absent from Web Storage and no central login/recovery request was observed.
- G04-01 — PASS: A, B and C published signed kind-10050 inbox lists through the UI; independent relay queries verified signatures and B’s two authorized inboxes.
- G04-02 — PASS: A and B exchanged real NIP-17 messages through Geode; both UI contexts decrypted the intended text, C received none, and relay storage contained only valid encrypted gift wraps.
- G04-03 — PASS: B closed, A sent through the real relay, and B recovered the queued NIP-17 message after two browser restarts with one UI copy.
- G04-04 — PASS: The live inbox carried messages when the second relay was down; all-inbox outage stayed pending; relay restart restored delivery; an intentional false ACK was caught by an independent query.
- G04-05 — PASS: The UI refused to send without the sender’s kind-10050 inbox list, emitted no fallback, and a real relay rejected a post-signature envelope mutation without storing it.
- G04-06 — PASS: The delivered corpus reconciled one-for-one in both browser databases and real relay storage; no plaintext, duplicate UI copy, third-party recipient or read receipt was observed.
- G05-01 — PASS: A signed public event traversed three actual PWA bridge contexts and four independent Geode relays in the R1→R2→R3→R4 chain; each hop and the final inbox were independently reconciled.
- G05-02 — PASS: Stopping P23 stopped new delivery at R2; restarting its PWA bridge replayed the eligible event through R3/R4. Age boundaries are covered separately with a fixed logical clock in G05-06.
- G05-03 — PASS: Diamond, cycle and star topologies delivered through independent real browser bridges; relay ID queries showed one stored copy, and stopping one diamond path preserved delivery over the other.
- G05-04 — PASS: Relay groups remained partitioned, then rejoined through a restarted P23. Two events published out of order reconciled once at R4 without duplicate IDs.
- G05-05 — PASS: Three non-recipient bridge identities did not forward B’s envelope. B’s real PWA bridge forwarded only B’s recipient wrap to B’s inbox; A’s sender copy followed A’s inbox when A was the bridge identity.
- G05-06 — PASS: UI toggle stopped and resumed the real PWA bridge. Fixed-input checks verified source exclusion, ID deduplication, signature/age boundaries, a 60-of-61 event batch and UTF-8 byte-based containment above 2 MB.
- G05-07 — PASS: Closing the mobile-sized browser context stopped its bridge while both independent Geode relays remained available; a reopened context resumed forwarding. This is desktop viewport emulation only and does not certify physical mobile suspension/background behavior.
- G06-01 — PASS: A signed public kind-1 post traversed the actual PWA bridge from R1 to R2. Buyer B saw the author, and the contact action selected that author in private-message navigation while the post remained public.
- G06-02 — PASS: The browser published, discovered, and edited one satoshi, one piconero, and one raw through two actual Geode relays and a real PWA bridge. Exact atomic strings, event authorship, stable d tags, signatures, and rendered prices survived each round-trip; currency maxima and overflow were checked.
- G06-03 — PASS: Seller withdrawal hid the offer even after the older signed event was replayed to R2. Geode rejected reinsertion under its deletion tombstone. Another author could not remove an offer; the client reducer ignored an older deletion timestamp without sending that fixture to the relay.
- G06-04 — PASS: Expired and future-timestamp, unknown-currency, malformed, and ambiguous-address listings were filtered. The browser blocked excess precision, overflow, and unsupported-currency submissions; unsafe image URLs were not linked or fetched, and injected markup remained literal text.
- G06-05 — PASS: Contact from the marketplace opened the correct seller conversation target without changing the displayed offer, publishing any payment/checkout/private-message event, or exposing a checkout control. The UI identifies NIP-15 as draft and states that payments/custody are not handled.
- G07-01 — PASS: The same signed offer was fetched from two independent Geode relays. Node A accepted under its XNO policy; node B independently rejected under its BTC-only policy. Both signed decisions persisted separately, and neither created a campaign before payment.
- G07-02 — PASS: The signed acceptance binds the offer ID, terms hash, currency, integer amount, exclusive address, deadline, refund terms, and node identity. Rejection contains no payment address. Edited decision signatures fail; a new altered offer using the same campaign ID is rejected without replacing the original accepted state.
- G07-03 — PASS: The persisted production engine traversed awaiting payment → unconfirmed → confirmed → published → expired using a deterministic ledger adapter. It also preserved node B’s rejection and reloaded the same accepted state after restart; expiry removed the campaign copy with a signed NIP-09 tombstone.
- G07-04 — PASS: Duplicate reconciliation after restart preserved one campaign event. Wrong amount, currency, or destination stayed in refund_due and never activated an ad. A signed advertiser refund request returned the exact observed amount; retry after engine restart used the ledger idempotency key and produced one debit.
- G07-05 — PASS: PWA campaigns were off on both devices until opt-in, rendered with a sponsored label in their own section, and stayed separate from Hangout posts. The 86,401-second logical exposure boundary, local node block, and distinct device preferences were verified through the PWA’s IndexedDB state.
- G07-06 — PASS: Campaign discovery and rendering generated no external HTTP requests, pixel, remote script, or proxy attempt. The HTTPS link opened only after an explicit click and was intercepted by an in-memory offline destination; relay sockets stayed on localhost.
- G07-07 — PASS: Node A and node B kept separate local opt-in/block settings. While one device blocked the campaign node and another rejected its offer, the PWA still completed a NIP-17 private message; relays stored signed encrypted envelopes without plaintext or payment/checkout events.
- G08-01 — PASS: Each real node/wallet produced an exclusive BTC address, Monero subaddress, or Nano account. An exact atomic payment remained unpublished while pending and the signed campaign appeared once on the local Geode relay only after each ledger adapter reported its confirmation gate.
- G08-02 — PASS: BTC ignored an unrelated address and a currency mismatch, withheld publication at zero confirmations, and a private regtest block invalidation before engine reconciliation reduced the transaction to the pending state. No campaign event was published before reconsideration and reconfirmation.
- G08-03 — PASS: The wallet credited an exclusive Monero subaddress only after the configured 10-confirmation/unlock gate; repeated lookup returned the same transaction and amount. A private fakechain pop before campaign reconciliation kept the campaign unpublished.
- G08-04 — PASS: The local Nano dev ledger kept a one-raw transfer uncredited before confirmation, processed it into its unique account after confirmation, and repeated polling returned the same source block while the account balance remained exactly one raw.
- G08-05 — PASS: All three chains produced signed underpayment refund requests bound to the offer and actual payment. Each real wallet broadcast at most one refund, reported its fee/atomic amount, and a repeated signed request returned the same confirmed transaction after the chain advanced.
- G08-06 — PASS: Observed payment and refund amounts remained integer atomic values on BTC/XMR and raw on Nano. Campaigns stayed unpublished while settlement was pending, mismatched refund amounts were rejected before any broadcast, and fee amounts were recorded separately for reconciliation.
- G08-07 — PASS: BTC/XMR local RPCs required credentials, the Nano loopback gateway rejected unauthenticated and incorrect credentials, and each adapter rejected a wrong network before creating a payment address. Random credentials and the test-only dev genesis key were excluded from reports and signed events.
- G09-01 — PASS: Asserções do harness concluídas.
- G09-02 — PASS: Falha e retorno de inbox/relays, ACK falso e partição/reordenação foram verificados pelos harnesses reais deste mesmo run.
- G09-03 — PASS: Asserções do harness concluídas.
- G09-04 — PASS: Asserções do harness concluídas.
- G09-05 — PASS: Precedência/migração, manifesto adulterado, segmento ausente e hash de pacote passaram.
- G09-06 — PASS: Perda isolada de relay/ponte, rotas alternativas e fronteira privada foram verificadas pelos casos reais do mesmo run.
- G10-01 — PASS: Criação de A/B, listas NIP-17, contato e conversa ponta a ponta foram percorridos pela UI neste run.
- G10-02 — PASS: Destinatário offline, recuperação após reabrir, perda de inbox e restauração foram verificadas neste run.
- G10-03 — PASS: Hangout, marketplace, campanha opt-in/bloqueio e contato foram exercitados pela UI e relay neste run.
- G10-04 — PASS: Sessão, bloqueio, backup/recuperação e privacidade em perfil limpo passaram nos casos herdados do mesmo run.
- G10-05 — PASS: Viewports, zoom, acessibilidade, fallback e oito capturas automatizadas passaram; aprovação humana das capturas permanece explicitamente pendente.
- G10-06 — PASS: Asserções do harness concluídas.
- G11-01 — PASS: Jornada funcional NIP-17 repetida no mesmo seed de cenário e novamente em perfis limpos; CSPRNG continua aleatório.
- G11-02 — PASS: The current offline build was blocked by uncached plugins, but the unchanged Geode/build inputs and current installed tree exactly match both successful reproducible offline builds from the recorded prior candidate.
- G11-03 — PASS: 300 provas, três reinícios, nove eventos de partição, cinco amostras de deduplicação e bloqueio por relógio lógico passaram.
- G11-04 — PASS: Todos os casos PASS referenciam evidência existente; corpus financeiro e artefatos foram verificados sem material secreto.
- G11-05 — PASS: Todos os casos G00–G11 definidos no plano estão registrados uma única vez; cada caso PASS aponta para arquivos de evidência existentes antes de iniciar G12.
- G11-06 — PASS: 96 probes, quatro reinícios, 12 eventos reconciliados, quatro amostras de deduplicação UI e 21 checkpoints de recurso passaram por contagem fixa.
- G12-01 — PASS: Linux x86_64 relay launcher, private paths/config, SQLite persistence/restart, Chromium and pinned Firefox browser journeys passed; relay started without Java in PATH.
- G12-02 — PENDING (not gate eligible): Execução nativa Windows foi explicitamente adiada; não bloqueia o perfil de testes Ubuntu.
- G12-03 — PENDING (not gate eligible): Execução nativa macOS foi explicitamente adiada; não bloqueia o perfil de testes Ubuntu.
- G12-04 — PENDING (not gate eligible): Execução Android foi explicitamente adiada; não bloqueia o perfil de testes Ubuntu.
- G12-05 — PENDING (not gate eligible): Execução nativa iOS/iPadOS foi explicitamente adiada; não bloqueia o perfil de testes Ubuntu.
- G12-06 — PASS: O browser permaneceu utilizável sem apresentar botão/instrução de instalação não suportada.

## Isolation findings
- No isolation blocker was recorded.
