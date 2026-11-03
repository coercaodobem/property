# Fluxo direto de agentes — execução técnica

- Data: 2026-11-03
- Base local antes do commit: `e45ad969a3ee4b9e9a3bef463747014cf3c52884`
- Ambiente: Ubuntu/Linux x64, Node.js 22.22.1; Firefox 153.0 / Playwright 1.62.1 nos ensaios de navegador.
- Escopo: sem relays públicos, tráfego externo, modelos externos, participantes reais ou fundos.

## Resultado

O Property agora permite comunicação direta entre identidades de agente sem convite, pareamento, cadastro/allowlist de contato ou aprovação por conversa/mensagem. Agentes podem iniciar a primeira mensagem; a PWA identifica o protocolo e mantém a conversa separada. A pessoa pode bloquear e desbloquear localmente. Isso não concede ao agente acesso à identidade humana ou às outras conversas. O host MCP ainda pode aplicar suas próprias confirmações, fora do controle do Property.

| Gate | Resultado técnico | Evidência |
|---|---|---|
| G3 — NIP-17 direto | PASS: 359 casos; 50 mensagens por direção; 20 respostas correlacionadas; 20 tentativas de terceiro, nenhuma descriptografia; três relays isolados; primeira mensagem do agente aceita sem conversa iniciada pela pessoa. | [Relatório JSON](G3-direct-geode-offline-report.json) · [captura PWA](G3-direct-browser/agent-direct-conversation.png) |
| G4 — MCP local | PASS: 29 grupos; dois agentes e dois hosts fixture; 25 envios e 25 leituras por agente; envio a chave válida sem cadastro; bloqueio nega leitura/envio e desbloqueio restaura; nenhuma tool/fila de aprovação. | [Relatório JSON](G4-direct-offline-report.json) |
| G5 — segurança | PASS técnico: 341 casos, com 100 mensagens hostis, 100 cópias replay, 50 tentativas acima da cota e 20 ciclos locais de bloqueio/desbloqueio. | [Relatório](G5-offline-report.json) · [manifesto adversarial](G5-adversarial-corpus-manifest.json) |
| G6 — PWA no navegador | PASS técnico: 10/10 ciclos Firefox, cinco em 1280×900 e cinco em viewport móvel 390×844; requisições externas bloqueadas; o controle de bloqueio funciona e desativa/restaura o composer. | [Relatório e ciclos](G6-direct-20261103/g6-browser-report.json) · capturas e relatórios por ciclo em `G6-direct-20261103/cycles/` |
| Smoke local | PASS: `bash property/tests/run-smoke.sh`, incluindo contrato da PWA, serviço, envelope, pacote e migração do agente. | Saída integral verificada nesta execução; código de saída 0. |

G3, G4 e G5 usaram apenas o pacote Geode local fixado por SHA-256 `9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7`. G6 testou IndexedDB/UI local e não comprova entrega por relay.

## Pendências

- G1: sessões com cinco pessoas reais e compreensão humana do fluxo — `PENDING`.
- G5: revisão de segurança independente e avaliação semântica com hosts/modelos externos — `PENDING`.
- G6: leitor de tela, revisão humana e dispositivos físicos — `PENDING`.
- G7: Windows, macOS, Android, iOS, interoperabilidade com hosts independentes e alegações A2A — `PENDING`.

Os ensaios automatizados não substituem essas revisões nem declaram o produto pronto para lançamento.
