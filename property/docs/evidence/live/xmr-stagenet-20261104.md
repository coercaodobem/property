# Ensaio suplementar de pagamento Monero na stagenet

- **Data:** 2026-11-04
- **Rede:** Monero stagenet (`sXMR`, sem valor monetário)
- **Escopo:** crédito de faucet em carteira descartável, pagamento entre duas carteiras de teste e leitura do pagamento pelo adapter Monero do Property. Este ensaio suplementar não altera nem substitui os gates offline do Plano de Testes Central.

## Resultado

**PASS:** o nó confirmou o recebimento de `1` piconero pelo endereço de campanha do Property. `createMoneroWalletLedger().lookupPayment()` retornou o hash esperado, valor exato, `10` confirmações e `proof: true`.

| Etapa | Valor | Hash | Estado observado |
| --- | ---: | --- | --- |
| Faucet CypherFaucet (`xmr-stagenet`) | `0.01 sXMR` (`10000000000` piconeros) | `f2089bf5913f7a6513513b9f45593b657574e11e70514e4fa278efd252995695` | `10` confirmações e fundos desbloqueados |
| Pagamento A → endereço do Property | `1` piconero | `eaad75a599c4ceab818a3b8b2ae3280e421b04ab0ef2ee8ae9b4563fd46aa798` | `10` confirmações, `proof: true` |

A taxa da transferência foi `30500000` piconeros (`0.0000305 XMR`). A transação pode ser consultada no [explorador Monero stagenet da Nodely](https://explore.sxmr.nodely.dev/lite/tx/eaad75a599c4ceab818a3b8b2ae3280e421b04ab0ef2ee8ae9b4563fd46aa798). A API do explorador e o nó RPC também retornaram a transação incluída no bloco `2243678`, com `10` confirmações.

## Validação pelo Property

O ensaio usou o adapter real `createMoneroWalletLedger().lookupPayment()` de `property/relay/ledger-rpc.mjs`, configurado para exigir `stagenet` e dez confirmações. O nó público `xmr.nodely.dev:38089` respondeu como stagenet sincronizada. Os dois serviços wallet RPC ficaram vinculados ao loopback e autenticados localmente.

O binário Monero CLI `0.18.5.4` veio da distribuição oficial. A assinatura GPG do manifesto de hashes foi verificada antes de conferir o SHA-256 do arquivo compactado.

## Limites e privacidade

- Este é um ensaio de rede pública **stagenet**, não um pagamento em XMR mainnet. As moedas de teste não têm valor. A documentação Monero recomenda stagenet para testes ao vivo e distingue-a da rede principal.
- O teste verifica recebimento e leitura pelo adapter; não verifica reembolso, checkout no PWA, operação contínua de um relay nem comportamento com fundos reais.
- O nó remoto recebeu consultas RPC da carteira. Endereços, seeds, senhas e a chave de transação do faucet não foram incluídos nesta evidência.
- A implementação permanece sujeita aos gates offline do plano; este resultado não os substitui.

## Fontes técnicas

- [Redes Monero: mainnet, stagenet e testnet](https://docs.getmonero.org/infrastructure/networks/)
- [Referência oficial do Monero Wallet RPC](https://docs.getmonero.org/interacting/monero-wallet-rpc-reference/)
- [API de desenvolvimento do CypherFaucet](https://cypherfaucet.com/api)
- [Documentação do explorador Monero da Nodely](https://nodely.io/docs/monero/explorer/)
