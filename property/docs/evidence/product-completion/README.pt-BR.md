# Evidências de conclusão do produto

O perfil ativo é Ubuntu Linux x86_64, com testes automatizados offline e contagens fixas. O diretório preserva o identificador de fonte e as limitações de cada execução. **O plano de implementação não está concluído até a release pública G10, o CI na tag exata e a verificação dos digests públicos dos artefatos passarem.** [English](README.md)

| Gate | Registro atual | Candidato / observação |
|---|---|---|
| G0 | `PASS` no [relatório de execução](G0/execution-report.json) | Snapshot inicial limpo; o SHA está registrado no relatório. |
| G1 | `PASS` na [execução fixa 02](G1/fixed-run-02/execution-report.json) | SHA `2e19327fc724d7ea300a7876bbbb6d26bbd4647a`. |
| G2 | `PASS` na [execução fixa 02](G2/fixed-run-02/offline-package-report.json) | SHA `5a4bc8b42a80be9d4b4d1ef62398822b4353a17f`. |
| G3 | `PASS` na [execução fixa 01](G3/fixed-run-01/manifest.json) | SHA `bbaf64735c4e233bdcf3759dcebb229e6e4d224f`. |
| G4 | `PASS` no [resultado do gate](G4/gate-result.pt-BR.md) | A execução específica registra o SHA `4ec3ae5100e2aa39832a3312a5fca1a145080f1d`. |
| G5 | `PASS_AUTOMATED_OFFLINE` no [resultado do gate](G5/gate-result.md) | As evidências específicas estão preservadas nesta pasta. |
| G6 | `PASS_AUTOMATED_OFFLINE` no [resultado do gate](G6/gate-result.md) | As evidências específicas estão preservadas nesta pasta. |
| G7 | `PASS` no [resultado do gate](G7/gate-result.md) | Ledgers privados de teste; sem fundos mainnet. |
| G8 | `PASS` no [resultado do gate](G8/gate-result.md) | Ledgers privados de teste; sem relay público de campanha. |
| G9 | `PASS` no [resultado atual do gate](G9/gate-result.pt-BR.md) | SHA `111926e34fd9e654cf4d0fe550c8ba5c267542ba`; limites dos scanners estão explícitos. |
| G10 | `PENDING` no [resultado atual do gate](G10/gate-result.pt-BR.md) | Pacote e testes de navegador offline passaram; faltam release pública, CI da tag e verificação dos digests enviados. |

G0–G8 são aprovações históricas com seus identificadores originais de candidato; não foram repetidas durante o trabalho atual de G9/G10. A suíte smoke integrada e o CI da branch passaram no candidato G9/G10, mas isso não altera os registros anteriores para dizer que foram executados no mesmo commit. Não foram realizados testes em Windows, macOS, Android ou iOS nesta execução.

## Candidato atual de release

- Commit-fonte: `111926e34fd9e654cf4d0fe550c8ba5c267542ba`.
- Bundle Ubuntu: 68.543.468 bytes; SHA-256 `2384fd4ec8e1c00dc05d2539ecf745a8cddc5d0ccd1384b0231bdef70c94e4fb`.
- SHA-256 do manifesto assinado: `247a22cbd4cde66329194f2bd471bb7c623be877c3ce45975a96c637cac777b5`.
- PWA: [https://coercaodobem.github.io/property/](https://coercaodobem.github.io/property/).
- Release versionada: não publicada. O navegador está desconectado e o conector GitHub não oferece escrita de releases.

As evidências do candidato atual estão em [`G9/fixed-run-03/`](G9/fixed-run-03/) e [`G10/fixed-run-01/`](G10/fixed-run-01/). O plano completo permanece pendente até que os passos públicos do G10 sejam verificados.
