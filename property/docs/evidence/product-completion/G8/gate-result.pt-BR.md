# Resultado do gate G8 — campanhas de relay e contabilização do operador

**Resultado: PASS — automatizado/offline em Ubuntu Linux x86_64.** Candidato testado: [`5a8c6f2bce3a09f71098005f8eea240245a3bf38`](https://github.com/coercaodobem/property/commit/5a8c6f2bce3a09f71098005f8eea240245a3bf38). Os relatórios e checksums da contagem fixa estão em [`fixed-run-01/`](fixed-run-01/).

## Evidências

- [`campaign-fixed-count.json`](fixed-run-01/campaign-fixed-count.json): 20 fixtures de ciclo de campanha por moeda (BTC, XMR, XNO), uma única decisão durável por proposta assinada válida, cinco assinaturas inválidas rejeitadas por moeda e 10 propostas desativadas/rejeitadas por moeda sem destino de pagamento, registradas como `UNSUPPORTED_RETURN`. A API do operador respondeu por stdio com os nove métodos e não abriu TCP.
- [`private-ledger-summary.json`](fixed-run-01/private-ledger-summary.json): 10 pagamentos exatos com transações distintas, 10 destinos únicos e 10 publicações assinadas por moeda em Bitcoin regtest privado, Monero fakechain e Nano dev. Os sete casos de ledger passaram, incluindo um reembolso de pagamento insuficiente confirmado e idempotente em cada ledger privado de teste.
- As exportações contábeis reconciliam todos os registros de cada moeda. A retenção remove conteúdo e endereços da campanha, preservando decisões assinadas como tombstones contra replay.
- A campanha usa o rótulo padrão em inglês `SPONSORED · PAYMENT NOT VERIFIED BY THE CLIENT` e a tradução para Português (Brasil). A renderização não envia solicitações; a inspeção das fixtures não encontrou contadores de clique/visualização nem analytics de terceiros.
- Tráfego em relays públicos/mainnet, fundos reais e endpoints externos: nenhum. Credenciais RPC, endereços de pagamento e referências brutas de transação foram omitidos do resumo versionado.
- A suíte `run-smoke.sh` inclui o teste G8 com contagem fixa. O operador é uma API JSON-RPC local e incorporável via stdio; o launcher Geode simples não a inicia. Um host precisa fornecer o assinador local, adapters de ledger e publicador de eventos. Essa fronteira de integração está documentada nos READMEs do relay.

## Reprodução

```sh
node property/tests/offline/campaign-g8-fixed-count.mjs property/docs/evidence/product-completion/G8/fixed-run-01/campaign-fixed-count.json
node property/tests/offline/g08-ledger-smoke.mjs --bitcoind "$BITCOIND" --bitcoind-sha256 "$BITCOIND_SHA256" --bitcoin-cli "$BITCOIN_CLI" --bitcoin-cli-sha256 "$BITCOIN_CLI_SHA256" --monerod "$MONEROD" --monerod-sha256 "$MONEROD_SHA256" --monero-wallet-rpc "$MONERO_WALLET_RPC" --monero-wallet-rpc-sha256 "$MONERO_WALLET_RPC_SHA256" --nano-node "$NANO_NODE" --nano-node-sha256 "$NANO_NODE_SHA256" --output "$PRIVATE_OUTPUT"
bash property/tests/run-smoke.sh
```

Os SHA-256 dos binários do runner estão em `private-ledger-summary.json`. O runner de ledgers privados vincula RPC ao loopback, desativa peers e não usa mainnet. `SHA256SUMS` cobre os relatórios de contagem fixa e o manifesto versionados.

Esta é uma evidência de integração automatizada, não uma auditoria humana de segurança. Outros sistemas operacionais e revisão humana permanecem fora desta execução.
