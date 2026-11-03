# Reteste paginado do harness de relay

Este reteste valida a reconciliação final acima do limite de 50 IDs por consulta. Não é um ensaio de 24 horas e não aprova G11-03 nem G12.

- Commit-base: `505c000c0e36d0149d76acc1d9948dd3202c4030`; a fonte executada está identificada pelo SHA-256 em `summary.json`.
- Comando: `bash property/tests/offline/run-isolated.sh node property/tests/relay-soak.mjs 80 1 17449`.
- Janela monotônica: 80,113 s; duas quedas planejadas (SIGTERM/SIGKILL), ambas observadas e recuperadas.
- Foram publicados 68 eventos; a reconciliação final consultou dois lotes (50 + 18) e confirmou cada evento exatamente uma vez (68/68).
- A primeira falha de ambiente por `Disk quota exceeded` foi resolvida fixando `java.io.tmpdir` no scratch isolado.

`events.jsonl` contém o log sanitizado; `SHA256SUMS` cobre todos os arquivos.
