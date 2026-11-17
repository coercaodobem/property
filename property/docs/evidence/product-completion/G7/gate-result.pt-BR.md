# Gate G7 automatizado offline — estado da troca e verificação de pagamento

**Resultado:** `PASS_AUTOMATED_OFFLINE` no Ubuntu Linux x86_64. Commit candidato: `907577fa378b0f09c25ef13fd4f02eed975eab6d`; SHA-256 do inventário de runtime: `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`.

Os ensaios de contagem fixa para estado da troca, conversa, configuração criptografada e ledgers privados passaram. BTC usou regtest sem P2P; Monero usou fakechain offline; Nano usou dev com zero peers. O modo G7-only não executou casos de campanha G8. Não houve mainnet, relay público, endpoint externo, participante real ou fundos reais.

| Aceite | Resultado | Evidência |
| --- | --- | --- |
| Estado da troca | 50 fixtures por moeda (150); 30 casos de vínculo não verificado de carteira/identidade; 60 adulterações rejeitadas; nenhuma fixture inválida liquidada. | [`trade-state.json`](fixed-run-02/trade-state.json) |
| Conversa da troca | 10 jornadas de oferta/aceite/solicitação/verificação local por moeda; nenhuma liquidação por alegação de par; disputa, cancelamento e sincronização repetida cobertos. | [`trade-conversation.json`](fixed-run-02/trade-conversation.json) |
| Configuração e journal | Adaptadores locais BTC/XMR/XNO aceitos; redes/endpoints inseguros, senha/identidade errada e tag de autenticação adulterada rejeitados; journal em `0600`. | [`trade-config-store.json`](fixed-run-02/trade-config-store.json) |
| Integração com ledgers privados | Por moeda: 10 invoices, 10 recebimentos válidos, 10 respostas perdidas do observador, 10 reinícios e 10 reconciliações idempotentes de duplicatas; sem crédito/gasto duplicado. Reorg BTC reabriu o estado antes da reconfirmação. Verificações de desbloqueio XMR e de conta/origem/raw/hash de bloco Nano passaram. | [`private-ledger-integration.json`](fixed-run-02/private-ledger-integration.json), [`private-node-binary-hashes.json`](fixed-run-02/private-node-binary-hashes.json) |
| Isolamento da ordem | Escopo `G7_PRIVATE_LEDGER_ONLY`; os casos de campanha G8 estão explicitamente não executados. | [`private-ledger-run.json`](fixed-run-02/private-ledger-run.json) |

Hashes de fonte/binários e digests dos resultados estão em [`fixed-run-02`](fixed-run-02/). Verifique com `sha256sum -c SHA256SUMS` nesse diretório.

A evidência cobre somente as fixtures locais descritas. A liquidação mainnet continua desabilitada; identidade Nostr não comprova titularidade de carteira, e isto não oferece escrow sem confiança nem garantia de entrega. Revisão humana e outros sistemas operacionais ficaram fora do escopo.
