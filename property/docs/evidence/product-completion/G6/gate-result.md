# Resultado automatizado do gate G6

**Resultado:** `PASS_AUTOMATED_OFFLINE`
**Ambiente:** Ubuntu Linux x86_64, Node.js 22.22.1, Chromium 153.0.8010.12 / Playwright 1.64.1
**Dados:** identidades e ofertas sintéticas; cinco relays Geode locais com diretórios temporários; nenhum relay público, carteira, pagamento, participante real ou serviço externo liberado.

## Evidências de aceite

| Requisito | Resultado fixo | Evidência |
| --- | --- | --- |
| Oferta Property compatível com NIP-15 draft | Schema `property-marketplace-offer/v1`, autor ligado à assinatura, unidades atômicas textuais, moeda/meio de pagamento coerentes, vencimento e dicas de relay validados; compatibilidade legada explícita; números NIP-15 são apenas projeção de exibição | [Decisão do adaptador](../../../nip15-property-adapter.pt-BR.md), [relatório do navegador](final/browser-g06-report.json), [smoke do marketplace](../../../../tests/marketplace-smoke.mjs) |
| Criação, edição, retirada, vencimento e convergência | BTC/XMR/XNO: 20 ofertas de cada moeda, 10 edições, 10 retiradas e 10 ofertas vencíveis por moeda; cinco relays concordaram; tombstones NIP-09 assinados preservados; uma oferta de autor alheio permaneceu | [Contagens fixas](final/marketplace-g6-fixed-count.json), cenários G06-03/G06-06 no [relatório do navegador](final/browser-g06-report.json) |
| Valores de fronteira | 100 vetores por moeda: 50 round-trips válidos e 50 valores atômicos inseguros rejeitados; nenhum arredondamento comanda valor; limite e overflow conferidos | [Contagens fixas](final/marketplace-g6-fixed-count.json), [smoke do marketplace](../../../../tests/marketplace-smoke.mjs) |
| Hangout e descoberta | 50 jornadas PWA, 25 em inglês e 25 em pt-BR; autoria verificada, cinco relays deduplicados, mudança de relay, resultados vazios e conteúdo malformado; 50 navegações para conversa sem publicar mensagem | Cenários G06-01/G06-07 em [browser-g06-report.json](final/browser-g06-report.json) |
| Fluxos da vitrine nos dois idiomas | 50 jornadas PWA, 25 em inglês e 25 em pt-BR, abrangendo BTC/XMR/XNO: publicar, descobrir pela outra identidade, rotular público/privado, abrir conversa e retirar com NIP-09; nenhuma mensagem ou pagamento alegado | Cenário G06-08 e `marketplace.journeys` em [browser-g06-report.json](final/browser-g06-report.json) |
| Conflitos e atualizações fora de ordem | 20 conflitos do mesmo autor com timestamp igual e 20 atualizações fora de ordem; resultado determinístico: evento mais novo, empate pelo ID lexicograficamente menor | [Contagens fixas](final/marketplace-g6-fixed-count.json) |
| Regressão da suíte do repositório e pacote de agente | `bash property/tests/run-smoke.sh` terminou com `PASS: suíte smoke local concluída.`; contratos MCP, schemas, agentes, pacote instalável e cópia vendorizada do marketplace incluídos | [Log completo](final/repository-smoke.txt); `agent-package-smoke.mjs` e `agent-package-smoke.sh` no mesmo log |

## Isolamento de rede

Os navegadores rodaram em namespace de rede não compartilhado. O relatório observou zero requisições HTTP externas e conexões WebSocket somente a `127.0.0.1` nas cinco portas dos relays locais. As 43 tentativas de fundo registradas pelo Chromium foram bloqueadas pelo proxy local de negação (HTTP 502); nenhuma foi liberada. A suíte geral de serviços também rodou pelo executor offline isolado.

## Integridade dos artefatos

| Artefato | SHA-256 |
| --- | --- |
| [Relatório de navegador G6](final/browser-g06-report.json) | `35ca162cbd48ea5ae36ab4cc987ead21352e5da6b032fb5ff1b455c7e57985d0` |
| [Contagens fixas G6](final/marketplace-g6-fixed-count.json) | `2866178c1fee40d1a2fdd396b090f11423e4b9240ebf5e5b605c3cee7be56515` |
| [Suíte geral](final/repository-smoke.txt) | `66123ff909026206da3f1c2696e423f967d91c2bce55ce4d51b5f4525c19d61d` |

## Limites e escopo pendente

Este resultado cobre somente os casos automatizados locais acima. A interface declara que a forma de pagamento é informada pelo vendedor, não verificada, e que o Property não processa pagamentos nem oferece custódia. Redes públicas, liquidações BTC/XMR/XNO, dispositivos físicos, outros sistemas operacionais e revisão humana não foram usados para este gate; estes itens permanecem fora do escopo ou `PENDING`, conforme o plano. Isso não é evidência de segurança de produção, identidade legal, entrega de produto ou garantia de pagamento.
