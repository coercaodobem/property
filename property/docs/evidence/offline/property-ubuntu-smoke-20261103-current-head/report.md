# Reteste smoke do HEAD publicado

- Run: `property-ubuntu-smoke-20261103-current-head`
- Commit observado: `3b2d4092ef4693a4a65e4c7e22aae6bb63669891`
- Comando: `bash property/tests/run-smoke.sh`
- Resultado: `PASS` (exit code `0`), 22 executores.
- Evidencia integral: `smoke.log`; manifesto: `summary.json`; hashes: `SHA256SUMS`.

O reteste cobre a regressao local com listeners loopback. Ele nao afirma isolamento de egress; o isolamento e o perfil full estao registrados separadamente em `../property-ubuntu-full-20261103-09/`. O G5 tecnico registra 365 casos e continua pendente de revisao independente. Nao houve participantes humanos simulados.

A primeira tentativa no sandbox terminou com `EPERM` ao abrir loopback, antes de concluir os casos. A execucao repetida com permissao para listeners locais passou; a falha de permissao inicial nao e contada como resultado do smoke.
