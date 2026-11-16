# Resultado do gate G10 — release, pacote Ubuntu e onboarding

**Resultado: PENDING publicação externa.** As verificações offline abaixo passaram no candidato `111926e34fd9e654cf4d0fe550c8ba5c267542ba`. A release pública versionada, o CI da tag exata e a conferência dos digests após upload ainda faltam.

## Verificações offline aprovadas

- O bundle Ubuntu Linux x86_64 foi compilado duas vezes offline e os arquivos ficaram idênticos. O arquivo tem 68.543.468 bytes e SHA-256 `2384fd4ec8e1c00dc05d2539ecf745a8cddc5d0ccd1384b0231bdef70c94e4fb`. A SBOM SPDX lateral e a incorporada conferem; manifesto assinado e checksums passaram na verificação do pacote.
- O smoke do pacote instalou a PWA, o CLI relay Geode e as ferramentas MCP do Property sem rede; rejeitou assinaturas e metadados ausentes/adulterados e preservou dados locais na desinstalação.
- Passaram dez ciclos de upgrade/downgrade/rollback em perfis limpos; todos os dez recusaram pacotes corrompidos antes da instalação e preservaram dados do agente e do relay.
- O bundle exato passou 25 jornadas no navegador com egress externo bloqueado: todos os 127 arquivos PWA conferem com o manifesto assinado, 0 hosts externos foram acessados, 35 tentativas de fundo foram recusadas pelo proxy local, 58 scripts declarados estaticamente por navegação, 1.450 requisições locais de script no total, 0 executáveis dinâmicos/não declarados e 0 erros de página. Veja [`browser-egress-report.json`](fixed-run-01/browser-egress-report.json).
- G10-05 passou oito casos de viewport/zoom; G10-06 passou 50 mensagens diretas e 100 notas públicas em quatro relays locais e três pontes; G10-07 passou verificações de grupo criptografado com três membros sintéticos; G10-08 passou 24 ciclos fixos de instalação. Relatórios e capturas estão em [`fixed-run-01/`](fixed-run-01/).
- O kit bilíngue de divulgação para X, Reddit e fóruns passou na validação mecânica dos dez textos. Todos cabem nos limites de caracteres definidos pelo projeto e cada chamada leva ao repositório ou ao guia de contribuição: [`launch-kit-validation.json`](fixed-run-01/launch-kit-validation.json).
- A checagem da documentação ativa em inglês e Português (Brasil) passou: 63 arquivos e 475 links internos verificados, sem links quebrados: [`documentation-link-validation.json`](fixed-run-01/documentation-link-validation.json). Os comandos offline de instalação/atualização e os metadados de release também foram exercitados na verificação de pacote e rollback acima.
- A PWA pública está em [coercaodobem.github.io/property](https://coercaodobem.github.io/property/); a árvore do Pages implantada corresponde à PWA do candidato.
- O CI da branch no [run 43922994219](https://github.com/coercaodobem/property/actions/runs/43922994219) passou nos jobs smoke e relay Ubuntu. A matriz de outros sistemas foi ignorada conforme este escopo.

## Itens G10 restantes

1. Criar a release pública versionada e enviar o arquivo, manifesto assinado, checksums, SBOM e chave pública de assinatura preparados.
2. Executar e passar o CI na tag exata do release. O gatilho de tag ainda não rodou; o CI aprovado na branch não o substitui.
3. Baixar os artefatos publicados e comparar seus digests públicos com o manifesto assinado.

O conector GitHub disponível nesta tarefa consulta releases, mas não consegue criá-las. A página de release redireciona para o login do GitHub, então nenhuma tag ou artefato público foi criado. É necessário autenticar a sessão do navegador para concluir essas etapas. A validação de Windows, macOS, Android e iOS continua `PENDING` e não foi executada.

## Candidato e evidências

- [`build-verification.json`](fixed-run-01/build-verification.json)
- [`package-offline-report.json`](fixed-run-01/package-offline-report.json)
- [`rollback-cycles.json`](fixed-run-01/rollback-cycles.json)
- [Estado do CI e publicação GitHub](fixed-run-01/github-ci-status.json)
- [`publication-status.json`](fixed-run-01/publication-status.json)
- [Kit em inglês](../../../launch-kit.md) · [Português (Brasil)](../../../launch-kit.pt-BR.md)

Este gate não está concluído enquanto o CI da tag, o upload da release ou a verificação pública dos digests permanecer pendente.
