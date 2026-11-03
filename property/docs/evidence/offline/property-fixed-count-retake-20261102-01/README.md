# Reteste por contagens fixas — 2026-11-02

Este diretório preserva a validação dirigida dos novos critérios do plano central. Os testes foram executados em Ubuntu, isolados e somente contra relays/ledgers locais. A identidade efetiva desta validação foi Codex GPT-6; ela não substitui o perfil integral cuja execução está prevista para Luna Max.

## Resultados

- Suíte smoke local: PASS.
- G05: 7/7 casos PASS; idade, assinatura e cota avaliadas com timestamps lógicos fixos e contagens.
- G06: 5/5 PASS; expiração em `NOW-1`, evento futuro em `NOW+301` e edições separadas por dois passos lógicos de 1.000 ms.
- G07: 7/7 PASS; oferta expirada por relógio lógico, pagamento observado em `expiresAt+1` ficou `refund_due` sem publicar campanha; exposição local validada no limite lógico de 86.401 segundos.
- G08: 7/7 PASS com Bitcoin regtest, Monero fakechain e Nano dev local.
- G09-04: PASS; 60 eventos encaminhados e o 61º contido.
- G10-06: PASS; 50 DMs, 100 notas públicas, quatro relays, três pontes e três checkpoints de recursos.
- G11-03: PASS no harness dirigido; 300 probes, três reinícios, nove eventos de partição reconciliados, zero perda, cinco amostras de deduplicação visual, 16 amostras de recursos e bloqueio por inatividade após 31 passos lógicos.

## Histórico preservado

- `history/g11-interrupted-duration-run-blocked.json`: execução antiga por duração encerrada após a mudança do critério; 115 probes parciais e status BLOCKED. Não aprova o novo G11.
- `history/g11-initial-sender-scope-failure.json`: falha inicial do novo harness antes de publicar probes; a variável de identidade foi corrigida antes do reteste PASS.
- `history/g06-initial-boundary-fixture-failure.json`: a primeira fixture futura usava `NOW+61`, enquanto o reducer de ofertas aceita até `NOW+300`. A fixture foi corrigida para `NOW+301` e os cinco casos passaram.

Os relatórios dos retestes corrigidos ficam nas pastas por gate. `g11/g11-repetition-probes.jsonl` contém uma linha por probe para reconciliar o total de 300 IDs.

Os comandos usam `bash property/tests/offline/run-isolated.sh` e os scripts dos gates listados acima. O perfil fixado de browser foi Chromium 153.0.8010.12, Playwright 1.62.1; os hashes do binário e do pacote estão em `summary.json`. Os adaptadores financeiros registram hashes dos cinco binários em `g08/ledger-g08-report.json`.

Esta evidência é dirigida ao método de contagem fixa e às regressões tocadas. Ela não certifica o full run de Ubuntu, o executor Luna Max nem Windows/macOS/Android/iOS.
