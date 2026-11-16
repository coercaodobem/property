# Evidência do gate G9 — Ubuntu Linux x86_64

**Resultado:** `BLOCKED` — as verificações concluídas abaixo passaram, mas G9 está incompleto. G10 permanece `NOT RUN`, conforme a ordem dos gates.

**Candidato:** `67507a33dc7c1ede266d204a3d85aeb0749064af` em `modelo-mvp`. Todos os relays de teste usaram loopback; não foram usados relays públicos, fundos de mainnet ou segredos.

## Verificações concluídas

| Verificação | Resultado e evidência |
|---|---|
| Build da fonte Geode e imagem Linux | `PASS`: Geode 1.20.0 foi compilado e empacotado offline com Temurin JDK 21.0.13+9 e Gradle 9.8.2. Arquivo: 67.366.437 bytes, SHA-256 `b149a14cc4d87c56086f32c96542d6ae8120690f0004aa91f73044d4a03a445a`, 129 segmentos. Não alegamos reprodutibilidade bit a bit. [`offline-geode-rebuild-report.json`](offline-geode-rebuild-report.json) |
| Retenção local automática | `PASS`: o binário reconstruído removeu na inicialização o evento sintético antigo e manteve o recente (2 registros antes, 1 depois). [`retention-binary-report.json`](fixed-run-02/retention-binary-report.json) |
| Crash e recuperação de campanha | `PASS`: 2 casos fixos de encerramento abrupto; o relay recuperado continha exatamente 1 cópia da campanha. [`relatório de crash`](fixed-run-02/campaign-crash/g09-campaign-crash-report.json) |
| Silenciar/bloquear/relatar localmente | `PASS`: 50 casos, 5 identidades sintéticas e 5 fixtures de relay; os históricos dos relays permaneceram inalterados. [`local-moderation-report.txt`](fixed-run-02/local-moderation-report.txt) |
| Limites de taxa e armazenamento | `PASS`: 20 limites configurados em 5 rajadas EVENT, 5 rajadas REQ e 10 limites de arquivo; 60 verificações abaixo/no/acima do limite e 6 valores inválidos de arquivo rejeitados. [`relatório de taxa`](fixed-run-02/rate-boundary/g09-rate-boundary-report.json), [`limites de arquivo`](fixed-run-02/resource-limits-report.json) |
| Eventos hostis | `PASS`: 200 entradas (40 de cada tipo: malformadas, grandes, duplicadas/repetidas, antigas e com assinatura inválida); entradas rejeitadas não causaram mutação de estado. [`g09-hostile-report.json`](fixed-run-02/hostile-events/g09-hostile-report.json) |
| Descoberta de relay assinada | `PASS`: 100 casos de validação/descoberta, incluindo expiração, revogação, chave errada e URL insegura. [`relay-defaults-report.txt`](fixed-run-02/relay-defaults-report.txt) |
| Falha de armazenamento e integridade do pacote | `PASS`: casos de lock/config/limite de disco falharam de forma segura; manifesto adulterado e segmento ausente foram recusados antes da execução. [`armazenamento`](fixed-run-02/storage/g09-storage-report.json), [`pacote`](fixed-run-02/package-hardening/g09-package-report.json) |
| Suíte local integrada | `PASS`: 85 arquivos de teste concluíram e emitiram o marcador final de sucesso. [`full-suite-summary.json`](full-suite-summary.json) |
| Auditoria npm offline | Nenhuma vulnerabilidade conhecida no cache local do npm para o lockfile JavaScript (1.170 dependências reportadas). O cache pode estar desatualizado e não cobre JAR/JRE do relay. [`npm-audit-report.json`](fixed-run-02/npm-audit-report.json) |
| Busca limitada por padrões de segredo | `PASS`: 263 arquivos textuais analisados, sem correspondências para quatro padrões em `property/web`, `property/agent` e `property/relay`. Não é um scan completo de segredos. [`secret-pattern-scan-report.json`](fixed-run-02/secret-pattern-scan-report.json) |
| SBOM SPDX do candidato | `PASS`: SPDX 2.3 cobre os 414 arquivos do pacote com 414 registros; os 413 registros sem autorreferência têm SHA-256 verificado e todos os 414 têm metadados de licença/proveniência. A assinatura do bundle temporário foi verificada com chave descartável local; ele não foi publicado. [`sbom-coverage-report.json`](fixed-run-02/sbom-coverage-report.json), [`SBOM.spdx.json`](fixed-run-02/SBOM.spdx.json) |
| Fixtures da política de licença/proveniência | `PASS`: 7 verificações aceitam metadados conhecidos e rejeitam licença desconhecida, fonte ausente ou componente sem metadados. [`license-metadata-policy-report.json`](fixed-run-02/license-metadata-policy-report.json) |

## Itens que impedem aprovação

- **Testes JVM do Geode (`BLOCKED`):** `:geode:test --offline` não encontra no cache `junit:junit:4.13.2` e `kotlinx-serialization-core:1.11.0`. `RelayRetentionTest` foi adicionada, mas a suíte Gradle não executou; não alegamos aprovação. [`jvm-test-report.json`](jvm-test-report.json)
- **Scans de segurança automatizados (`BLOCKED`):** não há scanner estático de segurança instalado nem scanner/base offline de vulnerabilidades para os JARs Geode e o JRE incluído. `gitleaks`, `osv-scanner`, `trivy`, `syft`, `grype`, `semgrep` e OWASP Dependency-Check não estão disponíveis. Compilação, verificações de sintaxe e regressões funcionais passaram, mas não alegamos cobertura de vulnerabilidades do JAR/JRE. A auditoria npm offline cobre apenas o lockfile JS e seu cache local de advisories. [`security-coverage.json`](security-coverage.json)
- **Release publicado e onboarding G10 (`PENDING`):** foi criado apenas um bundle local temporário para verificar o SBOM do G9. Não houve release público, testes de instalação/atualização/downgrade nem publicação no Pages; G10 não começou.

Windows, macOS, Android, iOS e iPadOS permanecem `PENDING`; nenhum build ou teste nesses sistemas foi iniciado. Revisão humana não foi usada como critério de aprovação.

A publicação no Pages fica reservada ao G10. O marcador `[property-release]` não foi usado.
