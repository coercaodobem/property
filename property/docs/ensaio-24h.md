# Registro arquivado: tentativa multi-relay de 24 horas

**Estado: fora do plano de execução; não é um gate e não pode ser contado como aprovação.** O [Plano de Testes Central](plano-de-testes-central.md) é a fonte vigente: os critérios usam contagens e variáveis fixas, sem duração mínima ou janela de permanência.

O modo de execução longa de `property/tests/offline/g11-multirelay-24h.mjs` foi desabilitado. O script ainda permite somente um preflight diagnóstico que termina em `NOT_RUN`; preflight não aprova G11.

Em 2026-11-04, uma tentativa no candidato `1b0592d5181d14bd3d1c4670dbb1605a69eab8a9` foi interrompida após 7 probes aprovadas para cumprir o escopo de contagens fixas. O relatório local registra `CANCELLED_BY_SCOPE`, `gate_eligible: false` e `probe_count: 7`. Essa tentativa é incompleta e não substitui nem altera os casos G11-03 e G11-06 do plano central.

Os casos G12 para sistemas fora do Ubuntu permanecem `PENDING` no perfil intermediário, conforme o plano central. Eles não são aprovados por esta tentativa arquivada.


Em 2026-11-04, a tentativa `property-goal-24h-20261104-02` no candidato `bd18258581722a3f1199baf4ca5dcabca41b2477` foi interrompida por escopo após uma probe. O relatório local registra `CANCELLED_BY_SCOPE`, `gate_eligible: false` e não conta como caso do plano.
