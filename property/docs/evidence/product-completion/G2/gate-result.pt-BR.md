# Resultado do gate G2 — build autocontido e proveniência de release

**Resultado: PASS — automatizado/offline em Ubuntu Linux x86_64.** Candidato de fonte congelado: [`4e1b231ccd190af569dd2890022dd4e8d053fcc8`](https://github.com/coercaodobem/property/commit/4e1b231ccd190af569dd2890022dd4e8d053fcc8).

Os nove critérios de aceitação do G2 passaram. Dois worktrees limpos produziram builds byte a byte idênticos. O gate do navegador concluiu 25 jornadas locais da PWA, registrou zero solicitações a hosts externos, zero carregamentos dinâmicos de executáveis, zero erros de página e bloqueou tentativas de saída em segundo plano. Fixtures sem arquivo do bundle e com checksum alterado foram rejeitadas antes da instalação; também passaram os checks de pacote/instalação/atualização/CLI/desinstalação offline, cobertura de SBOM/licenças, política de metadados fail-closed e varredura de segredos/arquivos gerados.

Este gate usou a nova âncora de confiança Ed25519 autorizada. O digest do arquivo Ubuntu é `2d51240a76ed902101b3284454f76c0a6a8aad6070916f29f446005283923c70`; o digest do manifesto de release assinado é `f5626dc23063a97011b2c5f4d25e6c0d63578644bb4a9843b174bd0139762b01`. A impressão digital da chave pública ainda exige verificação manual contra o commit de fonte confiável indicado no guia de instalação. O registro comprova build determinístico, mas não publica a release por si só.

As evidências legíveis por máquina estão em [`fixed-run-03/`](fixed-run-03/). Não foram usados relay público, mainnet, fundos ou outro sistema operacional.
