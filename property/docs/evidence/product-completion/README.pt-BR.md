# Evidências de conclusão do produto

## Estado de encerramento

Os relatórios G0–G9 já aprovados continuam registrados nas pastas de cada gate; este encerramento do G10 não repetiu esses gates. O G10 passou para a release Ubuntu Linux x86_64 no commit de fonte `111926e34fd9e654cf4d0fe550c8ba5c267542ba`. A release pública, o CI da tag exata e a conferência dos digests dos sete arquivos públicos foram concluídos. Cada relatório preserva o SHA de seu candidato e as evidências correspondentes.

| Gate | Estado registrado | Evidência |
|---|---|---|
| G0–G9 | `PASS` nos relatórios existentes | Consulte as pastas de cada gate; os testes anteriores não foram repetidos para encerrar o G10. |
| G10 | `PASS` | [resultado G10](G10/gate-result.pt-BR.md), [relatório de digests públicos](G10/fixed-run-01/public-digest-report.json), [release v0.1.0](https://github.com/coercaodobem/property/releases/tag/property-v0.1.0), [CI da tag exata](https://github.com/coercaodobem/property/actions/runs/43949909425) |

A validação em Windows, macOS, Android e iOS/iPadOS continua pendente e não fez parte desta execução restrita ao Ubuntu. Não foram usados relays públicos nem fundos de mainnet. [English](README.md)
