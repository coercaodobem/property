# Reteste curto do harness de relay

Este artefato valida apenas o comportamento do harness `property/tests/relay-soak.mjs`; não é um ensaio de 24 horas e não aprova G11-03 nem G12.

- Commit-base: `505c000c0e36d0149d76acc1d9948dd3202c4030`; o harness foi modificado localmente após esse commit e está vinculado pelo SHA-256 em `summary.json`.
- Comando isolado: `bash property/tests/offline/run-isolated.sh node property/tests/relay-soak.mjs 16 1 17449`.
- Resultado: 16,009 s observados; duas quedas planejadas (SIGTERM e SIGKILL), ambas detectadas e recuperadas; 10 eventos publicados e 10/10 reconciliados exatamente uma vez.
- O primeiro reteste, antes do ajuste do harness, falhou ao extrair a biblioteca nativa Java em `/tmp` por `Disk quota exceeded`. O harness agora define `java.io.tmpdir` no scratch isolado.

A evidência bruta redigida está em `events.jsonl`; `SHA256SUMS` cobre o conteúdo deste diretório.
