# Resultado do gate G8 — campanhas de relay e contabilização do operador

**Resultado: PASS — automatizado/offline em Ubuntu Linux x86_64.** Candidato: [`3ca0f84a7afda1514e8f061ddb9e7ecc9fceeb5a`](https://github.com/coercaodobem/property/commit/3ca0f84a7afda1514e8f061ddb9e7ecc9fceeb5a). Os relatórios com checksums estão em [`fixed-run-02/`](fixed-run-02/).

## Evidências

- [`campaign-fixed-count.json`](fixed-run-02/campaign-fixed-count.json): 20 fixtures do ciclo de campanha por moeda (BTC, XMR, XNO); passaram as decisões de política, replay, substituição, expiração, assinatura inválida, devolução não suportada e retenção. O operador expõe nove ferramentas JSON-RPC por stdio, sem listener TCP.
- [`private-ledger-summary.json`](fixed-run-02/private-ledger-summary.json): passaram os sete casos de ledger G8. Cada moeda concluiu 10 publicações de campanha após pagamentos exatos, em 10 destinos únicos, usando Bitcoin regtest, Monero fakechain ou Nano dev. Passaram as verificações de reorganização BTC, confirmação/desbloqueio e remoção de bloco XMR, e confirmação Nano de um raw. Foi verificado um reembolso assinado, confirmado e idempotente de pagamento insuficiente por moeda.
- A exportação contábil de contagem fixa reconciliou **69 de 69** registros, com IDs por moeda, valores, assinantes e estados. Pagamentos pendentes ou incompatíveis não liberaram publicação; incompatibilidades no valor do reembolso foram rejeitadas antes da transmissão.
- A renderização de campanhas não enviou solicitações e o esquema não contém campos de clique/visualização. Não houve analytics de terceiros nem endpoints externos.
- O relay descartável em memória usado no lote fixo teve limites de taxa desativados para evitar que a aprovação dependesse da velocidade de relógio. Os padrões do produto não mudaram; o G9 verifica separadamente as fronteiras de limite de taxa.
- Não foram usados relays públicos, mainnet, fundos reais ou participantes reais. Credenciais RPC, destinos de pagamento e referências de transações foram omitidos do resumo publicado. O G7 não foi repetido.

## Reprodução

```sh
bash property/tests/offline/run-isolated.sh node property/tests/offline/campaign-g8-fixed-count.mjs property/docs/evidence/product-completion/G8/fixed-run-02/campaign-fixed-count.json
bash property/tests/offline/run-isolated.sh node property/tests/offline/g08-ledger-smoke.mjs --scope g8-only \
  --bitcoind "$BITCOIND" --bitcoind-sha256 "$BITCOIND_SHA256" \
  --bitcoin-cli "$BITCOIN_CLI" --bitcoin-cli-sha256 "$BITCOIN_CLI_SHA256" \
  --monerod "$MONEROD" --monerod-sha256 "$MONEROD_SHA256" \
  --monero-wallet-rpc "$MONERO_WALLET_RPC" --monero-wallet-rpc-sha256 "$MONERO_WALLET_RPC_SHA256" \
  --nano-node "$NANO_NODE" --nano-node-sha256 "$NANO_NODE_SHA256" --output "$PRIVATE_OUTPUT"
(cd property/docs/evidence/product-completion/G8/fixed-run-02 && sha256sum -c SHA256SUMS)
```

O operador é uma API JSON-RPC local incorporável via stdio; o launcher Geode simples não a inicia. Um host fornece o assinador local, adapters de ledger e publicador de eventos. Este resultado automatizado não é auditoria humana de segurança nem garantia de escrow sem confiança. Outros sistemas operacionais e revisão humana permanecem fora desta execução.
