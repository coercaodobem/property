# Resultado automatizado do gate G6

**Resultado:** `PASS_AUTOMATED_OFFLINE`
**Ambiente:** Ubuntu Linux x86_64; teste de navegador em container Debian 13 com Docker `--network none`, Node.js 22.23.1, Chromium 153.0.8010.12 / Playwright 1.62.1
**Dados:** identidades e ofertas sintéticas; cinco relays Geode locais com diretórios temporários; nenhum relay público, carteira, pagamento, participante real ou serviço externo liberado.

## Evidências de aceite

| Requisito | Resultado fixo | Evidência |
| --- | --- | --- |
| Oferta Property compatível com NIP-15 draft | Schema `property-marketplace-offer/v1`, autor ligado à assinatura, unidades atômicas textuais, moeda/meio de pagamento coerentes, vencimento e dicas de relay validados; compatibilidade legada explícita; números NIP-15 são apenas projeção de exibição | [Decisão do adaptador](../../../nip15-property-adapter.pt-BR.md), [relatório do navegador](fixed-run-02/browser-g06-report.json), [smoke do marketplace](../../../../tests/marketplace-smoke.mjs) |
| Criação, edição, retirada, vencimento e convergência | BTC/XMR/XNO: 20 ofertas de cada moeda, 10 edições, 10 retiradas e 10 ofertas vencíveis por moeda; cinco relays concordaram; tombstones NIP-09 assinados preservados; uma oferta de autor alheio permaneceu | [Contagens fixas](fixed-run-02/marketplace-g6-fixed-count.json), cenários G06-03/G06-06 no [relatório do navegador](fixed-run-02/browser-g06-report.json) |
| Valores de fronteira | 100 vetores por moeda: 50 round-trips válidos e 50 valores atômicos inseguros rejeitados; nenhum arredondamento comanda valor; limite e overflow conferidos | [Contagens fixas](fixed-run-02/marketplace-g6-fixed-count.json), [smoke do marketplace](../../../../tests/marketplace-smoke.mjs) |
| Hangout e descoberta | 50 jornadas PWA, 25 em inglês e 25 em pt-BR; autoria verificada, cinco relays deduplicados, mudança de relay, resultados vazios e conteúdo malformado; 50 navegações para conversa sem publicar mensagem | Cenários G06-01/G06-07 em [browser-g06-report.json](fixed-run-02/browser-g06-report.json) |
| Fluxos da vitrine nos dois idiomas | 50 jornadas PWA, 25 em inglês e 25 em pt-BR, abrangendo BTC/XMR/XNO: publicar, descobrir pela outra identidade, rotular público/privado, abrir conversa e retirar com NIP-09; nenhuma mensagem ou pagamento alegado | Cenário G06-08 e `marketplace.journeys` em [browser-g06-report.json](fixed-run-02/browser-g06-report.json) |
| Busca e comparação privada no marketplace | 50 jornadas de filtro local, 25 em inglês e 25 em pt-BR; busca sem acento, tipo, moeda, vazio e ordenação por preço atômico habilitada somente para uma moeda. Zero novos quadros REQ aos relays durante a filtragem | Cenário G06-09 e `marketplace.local_filter_journeys` em [browser-g06-report.json](fixed-run-02/browser-g06-report.json); 8 assertions determinísticas em [contagens fixas](fixed-run-02/marketplace-g6-fixed-count.json) |
| Conflitos e atualizações fora de ordem | 20 conflitos do mesmo autor com timestamp igual e 20 atualizações fora de ordem; resultado determinístico: evento mais novo, empate pelo ID lexicograficamente menor | [Contagens fixas](fixed-run-02/marketplace-g6-fixed-count.json) |
| Regressão da suíte do repositório e pacote de agente | `bash property/tests/run-smoke.sh` terminou com `PASS: suíte smoke local concluída.`; contratos MCP, schemas, agentes, pacote instalável e cópia vendorizada do marketplace incluídos | [Log completo](final/repository-smoke.txt); `agent-package-smoke.mjs` e `agent-package-smoke.sh` no mesmo log |

## Isolamento de rede

O navegador rodou num container Docker em modo de rede `none` (driver `null`, sem IPAM e sem rotas externas), com checkout, Playwright e Chromium montados para leitura. O relatório registrou zero requisições HTTP externas e conexões WebSocket somente a `127.0.0.1` nas cinco portas dos relays locais. O manifesto do ensaio registra imagem, versões e hashes dos binários. A suíte geral de serviços também rodou pelo executor offline isolado.

## Integridade dos artefatos

| Artefato | SHA-256 |
| --- | --- |
| [Relatório atualizado do navegador G6](fixed-run-02/browser-g06-report.json) | `e140c24d6da153f8e13c98565eadbaf60c5dfe949a4873a37c1ad71a16e4e5be` |
| [Contagens fixas atualizadas G6](fixed-run-02/marketplace-g6-fixed-count.json) | `488dc9549bdd7ee1c87e84406429648359d7ba9e7590af2bd6e7ee79671cc9d8` |
| [Manifesto de execução e proveniência](fixed-run-02/manifest.json) | `a91601df719039a8fd5596f2a860584ae5bcf915d2d442e616cf22da95ef606f` |
| [Checksums dos artefatos do ensaio](fixed-run-02/SHA256SUMS) | arquivo `SHA256SUMS` verifica relatório, contagens e manifesto |
| [Suíte geral](final/repository-smoke.txt) | `66123ff909026206da3f1c2696e423f967d91c2bce55ce4d51b5f4525c19d61d` |

## Limites e escopo pendente

Este resultado cobre somente os casos automatizados locais acima. A interface declara que a forma de pagamento é informada pelo vendedor, não verificada, e que o Property não processa pagamentos nem oferece custódia. Redes públicas, liquidações BTC/XMR/XNO, dispositivos físicos, outros sistemas operacionais e revisão humana não foram usados para este gate; estes itens permanecem fora do escopo ou `PENDING`, conforme o plano. Isso não é evidência de segurança de produção, identidade legal, entrega de produto ou garantia de pagamento.
