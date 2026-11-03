# Reteste isolado dos casos profundos G02-04–G02-06

- **Data:** 2026-11-03
- **Escopo:** atualização completa/interrompida/mista, recuperação de identidade e CSP/TLS/WSS no Chromium local.
- **Resultado deste reteste focado:** 3/3 casos PASS; relatório em `browser-deep-g02/browser-deep-g02-report.json`.
- **Execução:** o comando foi iniciado por `property/tests/offline/run-isolated.sh`; o wrapper remove variáveis de proxy e só retorna sucesso depois de confirmar um namespace de rede distinto com loopback.
- **Código avaliado:** base `6f96ad1bd41bd10777a7fd1f362205558e750c83`; blob SHA-1 do harness alterado `5b210a3d47922549292a989f14b623503993f206`.
- **Ambiente:** Chromium `153.0.8010.12`, Playwright `1.62.1`; hashes dos executáveis e resultados detalhados estão no relatório JSON.

O harness agora lê a versão de cache `property-shell-vN` do service worker e gera versões sucessivas para as atualizações bem-sucedida, interrompida e mista. No ensaio, `v19` foi substituída com sucesso por `v20`; as duas atualizações inválidas foram rejeitadas, mantendo identidade e cache não relacionado.

`external_requests` registra a tentativa deliberada `remote-script.invalid/evil.js` usada no caso CSP. O relatório também registra que a política CSP bloqueou a execução, sem erros de página nem tentativas de proxy negadas. Isso é evidência dos três casos do harness, não aprovação do gate G02 inteiro nem do perfil completo. O perfil integral precisa reiniciar em G00 no candidato publicado.

O SHA-256 do relatório é `106767bdce5c7c6b9e412de961c595237d72f61e967895297d691991e40fa3ca`.
