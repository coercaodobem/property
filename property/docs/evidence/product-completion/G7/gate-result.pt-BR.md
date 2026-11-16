# Resultado do gate G7 — estado de troca e verificação de pagamento

**Resultado: PASS — técnico/offline em Ubuntu Linux x86_64.** Este resultado se aplica ao candidato representado pelas evidências em [`fixed-run-01/`](fixed-run-01/).

## Evidências com contagem fixa

- [`trade-state.json`](fixed-run-01/trade-state.json): 50 fixtures de estado por BTC, XMR e XNO (150 no total); 30 fixtures de vínculo de identidade; 60 adulterações rejeitadas; nenhuma fixture inválida chegou a `settled`; rollback de reorg BTC aprovado; mainnet desativada e nenhum endpoint externo.
- [`private-ledger-integration.json`](fixed-run-01/private-ledger-integration.json): 10 invoices, recebimentos válidos, respostas perdidas do observador, reinícios e reconciliações duplicadas por moeda, usando Bitcoin regtest privado, Monero fakechain e Nano dev. Valores atômicos exatos e journals locais assinados foram verificados. Uma confirmação BTC foi invalidada e a troca voltou para `payment-observed` antes da reconfirmação. Confirmação/desbloqueio XMR e conferência de conta/origem/raw/hash do bloco Nano passaram.
- [`private-node-binary-hashes.json`](fixed-run-01/private-node-binary-hashes.json): fingerprints SHA-256 dos binários locais fixados usados pelo runner de redes privadas.
- [`trade-conversation.json`](fixed-run-01/trade-conversation.json): 10 jornadas por moeda de oferta/aceite/solicitação de pagamento/reconciliação do vendedor/verificação local do destinatário; nenhuma liquidação do comprador com base na declaração do vendedor; sincronizações repetidas seguras; disputa e cancelamento cobertos.
- [`trade-config-store.json`](fixed-run-01/trade-config-store.json): os três adapters locais de teste aceitos; quatro configurações inseguras rejeitadas; configuração/journal cifrados, rejeição de senha/identidade incorreta, assinaturas e modo `0600` verificados.
- Os gates dependentes G4/G5 foram reexecutados neste candidato. G4 passou 34 casos offline com 48 ferramentas MCP e sem tráfego externo. As evidências de pacote e contratos G5 estão em [`../G5/`](../G5/).
- `bash property/tests/run-smoke.sh` terminou com `PASS: suíte smoke local concluída`; `git diff --check` passou.
- O [relatório de navegador G6 existente](../G6/final/browser-g06-report.json), caso `G06-05`, registra que o marketplace informa que não processa pagamentos nem oferece custódia e que o meio declarado pelo vendedor não comprova titularidade da carteira.

## Comandos

```sh
node property/tests/agent-trade-state-smoke.mjs property/docs/evidence/product-completion/G7/fixed-run-01/trade-state.json
node property/tests/agent-trade-conversation-smoke.mjs
node property/tests/agent-trade-config-store-smoke.mjs
node property/tests/offline/agent-bridge-g4.mjs
node property/tests/offline/g08-ledger-smoke.mjs --bitcoind "$BITCOIND" --bitcoind-sha256 "$BITCOIND_SHA256" --bitcoin-cli "$BITCOIN_CLI" --bitcoin-cli-sha256 "$BITCOIN_CLI_SHA256" --monerod "$MONEROD" --monerod-sha256 "$MONEROD_SHA256" --monero-wallet-rpc "$MONERO_WALLET_RPC" --monero-wallet-rpc-sha256 "$MONERO_WALLET_RPC_SHA256" --nano-node "$NANO_NODE" --nano-node-sha256 "$NANO_NODE_SHA256" --output "$PRIVATE_OUTPUT"
```

O runner de nós privados foi executado com binários locais fixados e gerou o relatório G7 sanitizado acima. Logs brutos dos nós e credenciais RPC não foram copiados para as evidências do repositório. A suíte de smoke com contagem fixa e as verificações de pacote G4/G5 fazem parte da execução local; o registro final da execução informa o SHA exato do candidato.

## Limite de segurança

O fluxo é pagamento direto, não escrow. Mainnet está desativada. A notificação de liquidação assinada pelo vendedor continua sem verificação no destinatário até que ele consulte seu próprio nó local. Assinaturas Nostr não provam titularidade de carteira/conta; a interface apresenta o meio de pagamento como declaração do vendedor. Não se promete entrega, reembolso forçado, arbitragem ou custódia.

Este gate não declara validação em outros sistemas operacionais, revisão humana ou auditoria de segurança de produção.

Os hashes dos arquivos de evidência estão em [`fixed-run-01/SHA256SUMS`](fixed-run-01/SHA256SUMS).
