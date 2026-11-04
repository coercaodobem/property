# Ensaio adicional de 24 horas — Property

Este ensaio foi solicitado como critério adicional do goal ativo. Ele fica separado dos gates G00–G12 do [Plano de Testes Central](plano-de-testes-central.md), cujo G11 usa contagens fixas e não usa duração como critério.

## Configuração imutável

O runner `property/tests/offline/g11-multirelay-24h.mjs` fixa os parâmetros em código. Não aceite duração ou intervalo personalizados.

- 24 horas reais, medidas por relógio civil, monotônico e `/proc/uptime`.
- 1.441 probes, uma no início e uma por minuto até completar 86.400 segundos.
- Três relays Geode reais em sequência e duas pontes PWA reais, cada uma ligada a dois relays adjacentes.
- Reinícios do relay intermediário em 8h e 16h, com três eventos sintéticos durante cada partição; os seis eventos devem aparecer uma vez em todos os relays após a recuperação.
- Amostras de deduplicação na interface em 26 checkpoints, incluindo início, cada hora e fim.
- Amostras de RSS dos relays e espaço temporário a cada 60 probes e depois dos reinícios.
- Reconciliação final em lotes de até 50 IDs por relay; nenhuma perda ou duplicata.
- Namespace Linux isolado somente com loopback; clientes bloqueiam tráfego externo e usam apenas endereços `127.0.0.1`.

O ensaio usa somente eventos, identidades e dados sintéticos. Não usa mainnet, fundos reais, relays públicos nem mensagens de pessoas. Uma interrupção, probe ausente, erro, perda ou falha de cleanup deixa o resultado FAIL/BLOCKED; o preflight nunca aprova o ensaio.

## Execução

O manifesto precisa corresponder exatamente ao HEAD candidato. A preparação das ferramentas ocorre antes; o comando abaixo bloqueia egress antes de iniciar relays e browser:

```bash
bash property/tests/offline/run-isolated.sh node property/tests/offline/g11-multirelay-24h.mjs \
  property/docs/evidence/offline/<RUN>/manifest.json \
  property/docs/evidence/offline/<RUN>/goal-24h
```

O modo `--preflight-only` inicia a topologia, publica um marcador sintético e fecha os processos. Seu relatório deve dizer `NOT_RUN` e nunca serve como evidência do ensaio completo.

## G12 nativo

O workflow `.github/workflows/property-offline-platforms.yml` aceita a execução manual com `run_deferred_platforms=true`. Para execução solicitada por este goal através de um push autorizado, o commit da branch `modelo-mvp` contém `[run-g12-now]`; esse caminho dispara Windows, macOS, Android e iOS/iPadOS nos respectivos runners. Os relatórios nativos precisam apontar para o mesmo SHA candidato, ser descarregados e validados pelo orquestrador antes de qualquer aprovação de G12.

## Preflight do runner

O primeiro preflight diagnóstico, no commit-base `c493e24f1b59a633f66b3a2643cdf70954b0521d`, falhou antes de iniciar qualquer relay porque tentou ler `/proc/self/ns/net` como arquivo. O runner foi corrigido para usar `readlink`; o preflight final iniciou três Geode e duas pontes, reconciliou um evento sintético, limpou os processos e registrou `NOT_RUN`.

Uma tentativa posterior no candidato `1b0592d5181d14bd3d1c4670dbb1605a69eab8a9` foi encerrada após 7 probes de 1.441 e registrada como `CANCELLED_BY_SCOPE`, `gate_eligible: false`. Ela é evidência incompleta e não aprova nem reprova o requisito. O objetivo atual exige uma nova execução completa de 24 horas reais no candidato final; não retome a tentativa parcial.
