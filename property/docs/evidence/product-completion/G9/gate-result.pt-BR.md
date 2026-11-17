# Resultado do gate G9 — segurança automatizada e resistência a abuso

**Resultado: PASS — automatizado/offline no Ubuntu Linux x86_64, com limites de cobertura registrados.** Candidato: `111926e34fd9e654cf4d0fe550c8ba5c267542ba`. Não foram usados relays públicos, fundos de teste na mainnet ou segredos.

## Aceite por contagens fixas

- Passaram 200 entradas de eventos hostis, 50 casos de moderação local entre cinco identidades sintéticas e cinco fixtures de relay, 20 limites configurados de taxa/armazenamento em suas fronteiras e 100 casos de descoberta assinada de relays. A suíte smoke integrada passou nos 85 arquivos de teste; o CI do candidato passou os jobs smoke e relay Ubuntu.
- O bundle Ubuntu exato e sua SBOM SPDX 2.3 foram verificados. O arquivo tem 68.543.468 bytes, SHA-256 `2384fd4ec8e1c00dc05d2539ecf745a8cddc5d0ccd1384b0231bdef70c94e4fb`; o SHA-256 do manifesto é `247a22cbd4cde66329194f2bd471bb7c623be877c3ce45975a96c637cac777b5`. A impressão digital SHA-256 da chave pública é `60025655e12c534e41003d8d87c3080c33b3e72f86bb19dbcda14182684f670c`; nenhum material privado de assinatura foi incluído.
- O OSV-Scanner verificou 48 pacotes Maven e 6 npm usando bases offline; não encontrou vulnerabilidades conhecidas. Doze componentes da SBOM não foram reconhecidos pelos scanners de ecossistema. O Trivy detectou 40 pacotes Java e não reportou vulnerabilidades conhecidas. O `npm audit` cobriu 1.170 dependências, mas a atualidade do cache local é desconhecida.
- O Semgrep OSS executou 43 regras locais em 290 arquivos rastreados, interpretou 100% da entrada e não teve erros de scan. As 19 correspondências foram triadas: 18 usos de WebSocket em loopback/documentação e um falso positivo em texto do CLI. Não há achado sem triagem.
- O scan limitado de segredos examinou 263 arquivos textuais com quatro padrões e não encontrou correspondências; 303 arquivos binários ou com UTF-8 inválido foram ignorados.

## Limites e riscos residuais

O JRE Temurin incluído é 21.0.13+9, mas estes scans não oferecem cobertura direta de CVEs dos binários do JRE. Os testes Gradle offline do Geode seguem `PENDING_SUPPLEMENTAL` porque duas dependências não estão no cache local; essa suíte não é um critério explícito de aceite G9 por contagens fixas, portanto não alegamos aprovação. O WebSocket plaintext do Geode escuta em loopback por padrão; o operador deve usar um proxy reverso com TLS para acesso público. Expor manualmente a porta plaintext continua sendo um risco de configuração. Testes automatizados não equivalem a auditoria humana de segurança.

Cobertura e triagem completas: [`security-coverage.json`](fixed-run-03/security-coverage.json), [`security-triage.json`](fixed-run-03/security-triage.json), [relatório OSV](fixed-run-03/osv-candidate-all.json), [relatório Trivy](fixed-run-03/trivy-geode-rootfs.json), [relatório Semgrep](fixed-run-03/semgrep-candidate.json), [relatório de padrões de segredo](fixed-run-03/secret-pattern-scan-candidate.json) e [SBOM](fixed-run-03/SBOM.spdx.json). O CI foi o [run 43922994219](https://github.com/coercaodobem/property/actions/runs/43922994219).

Este resultado registra as verificações G9 no candidato `111926e34fd9e654cf4d0fe550c8ba5c267542ba`. Os relatórios G0–G8 preservam seus identificadores originais; gates já aprovados não foram repetidos.

## Reconciliação com a branch atual

O head público atual é [`58d49f85a464a3846f130b435714f124107bb2ba`](https://github.com/coercaodobem/property/commit/58d49f85a464a3846f130b435714f124107bb2ba). As raízes de runtime distribuídas `property/web`, `property/agent` e `property/relay` permanecem idênticas entre esse head e todos os candidatos registrados nos gates G0–G10. A varredura limitada de segredos no head exato verificou 263 arquivos de texto contra quatro padrões de credenciais/chaves e encontrou zero correspondências; 303 arquivos binários ou UTF-8 inválidos foram ignorados. A comparação e o resultado legível por máquina estão em [`fixed-run-04/`](fixed-run-04/).

Os resultados de dependências e análise estática do G9 continuam cobrindo o mesmo runtime distribuído. A rotação autorizada da chave de assinatura está coberta separadamente pelo G2: a impressão digital da chave confiável atual é `000dd5016afb1f8eced1ba3de80d93a187f6079ae71398063229626a33bcbe36`, igual à registrada na evidência dos dois builds do G2. A release pública v0.1.0 continua verificável com sua impressão digital histórica `60025655e12c534e41003d8d87c3080c33b3e72f86bb19dbcda14182684f670c`; não afirmamos assinatura cruzada nem nova assinatura.
