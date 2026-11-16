# Resultado do gate G1 — contratos de protocolo e limites de ameaça

**Resultado: PASS — automatizado/offline em Ubuntu Linux x86_64.** Candidato de fonte congelado: [`a2ac830e2c06715bb0f50e377b8dd12b4f889ca4`](https://github.com/coercaodobem/property/commit/a2ac830e2c06715bb0f50e377b8dd12b4f889ca4). O SHA-256 da árvore de runtime é `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`, igual ao G0.

Os sete critérios passaram: 800 vetores válidos/inválidos e 800 entradas malformadas em oito famílias de eventos; 50 cópias duplicadas e 50 fora de ordem por família; validações de unidade e ambiguidade BTC/XMR/XNO; 50 repetições de comandos de pagamento/recibo XNO; 50 repetições de ofertas, pagamentos e devoluções de campanha; e as 87 seções de `bash property/tests/run-smoke.sh`.

O gate usou `property/tests/offline/run-isolated.sh`; os namespaces de usuário/rede foram alterados, o loopback ficou disponível às fixtures locais e as variáveis de proxy foram removidas. Não foram usados relay público, mainnet, fundos ou outro sistema operacional. As evidências de isolamento, relatórios de contagem fixa, hashes das fontes e checksums estão em [`fixed-run-03/`](fixed-run-03/).

O contrato registra o que assinaturas, envelopes criptografados, aceitação de relay e observações de carteira provam. Não afirma escrow Nano sem confiança nem entrega garantida.
