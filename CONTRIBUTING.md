# Contribuir com o Property

[English](CONTRIBUTING.en.md) · **Português (Brasil)**

Obrigado pelo interesse. O projeto é mantido em [coercaodobem/property](https://github.com/coercaodobem/property), e a branch padrão e de desenvolvimento é **`modelo-mvp`**. Bugs, ideias e pull requests do Property devem ser enviados aqui.

O MVP segue em validação. Leia o [README em português](README.md) ou a [versão em inglês](README.en.md), o [roadmap](ROADMAP.md) e o [plano de testes](property/docs/plano-de-testes-central.md) para distinguir funcionalidades disponíveis de propostas. Se alterar fatos, comandos ou o estado do projeto nos READMEs, mantenha as duas versões sincronizadas.

## Formas de ajudar

- Relatar um problema com passos de reprodução e dados de ambiente.
- Melhorar documentação, tradução da interface, acessibilidade e navegação móvel.
- Executar testes e registrar resultados, inclusive limitações encontradas.
- Propor correções ou funcionalidades pequenas e alinhadas ao roadmap.

Não exigimos bounty, doação ou pagamento para receber propostas. Os labels `good first issue` e `help wanted`, quando usados em issues, indicam tarefas para colaboração; a ausência de um label não impede uma proposta. Converse em uma issue antes de iniciar mudanças extensas.

## Preparar um fork

Faça um fork no GitHub. Substitua `SEU_USUARIO` pelo seu login:

```bash
git clone --branch modelo-mvp https://github.com/SEU_USUARIO/property.git
cd property
git remote add upstream https://github.com/coercaodobem/property.git
git switch -c minha-contribuicao
```

`origin` aponta para seu fork, e `upstream` aponta para o Property. Use uma branch própria para cada contribuição. Preserve alterações locais ao atualizar sua cópia.

## Executar e validar

A PWA está em `property/web/` e não exige compilar Android. Com Python 3:

```bash
python3 -m http.server 8080 --directory property/web
```

Abra `http://localhost:8080`. Com Node.js 22 ou superior, execute a suíte local:

```bash
bash property/tests/run-smoke.sh
```

Ela valida unidades Nano/raw, marketplace, campanhas, protocolo, cofre, ponte, contrato da PWA e pacote do relay, usando código e fixtures locais. A CI **Validar Property** executa esse mesmo comando em pushes e pull requests para `modelo-mvp`. PRs de forks podem depender da aprovação de execução do mantenedor no GitHub.

Os harnesses de navegador aceitam `PROPERTY_PLAYWRIGHT_MODULE` e `PROPERTY_BROWSER_EXECUTABLE` para localizar as instalações locais quando um manifesto de evidências sanitizado ocultar caminhos da máquina. Esses overrides mudam apenas os caminhos: versão, hash do pacote Playwright e hash do navegador continuam obrigatoriamente validados. Execute o harness dentro do isolamento offline do plano.

Para testar o relay no Ubuntu Linux x86_64:

```bash
./property/relay/start.sh
```

Para integração entre dois relays isolados:

```bash
bash property/tests/run-bridge-integration.sh 17450 17451
```

O ensaio contínuo de um relay é separado e fica limitado a cinco horas reais (18.000 segundos). Execute-o quando a contribuição exigir essa validação, preservando o log e o resultado final. Ele é um diagnóstico de um relay e não substitui o gate multi-relay G11-03:

```bash
node property/tests/relay-soak.mjs 18000 60 17447
```

Para documentação, confira links e comandos alterados. Para UI, exercite o fluxo no navegador e informe tamanho de tela, navegador, resultado e capturas quando úteis. Use dados de teste e identidades descartáveis. Testes unitários não substituem a inspeção visual de uma tela alterada.

Ao modificar módulos Kotlin herdados, siga também [AGENTS.md](AGENTS.md), as instruções mais próximas do arquivo e [BUILDING.md](BUILDING.md). Formate Kotlin com `./gradlew spotlessApply` e execute os testes pertinentes ao módulo. Uma contribuição somente web ou documental não exige compilar todos os alvos Android/desktop.

## Enviar um pull request

1. Faça commits focados, com mensagens como `fix:`, `feat:` ou `docs:`.
2. Envie sua branch ao seu fork: `git push -u origin minha-contribuicao`.
3. Abra o PR com base em **`coercaodobem/property:modelo-mvp`**.
4. Explique o problema, o comportamento resultante e como validou. Declare o que não conseguiu testar.
5. Aguarde revisão. Uma proposta pode precisar de ajustes antes de ser incorporada.

Não desative hooks nem use `--no-verify`. Mudanças em criptografia, armazenamento de chaves, interpretação de NIPs, pagamentos ou distribuição devem ser discutidas com o mantenedor antes de uma implementação extensa. Nunca exponha segredos, dados de usuários ou conversas reais para demonstrar um bug.

## Uso de IA

Assistência de IA é aceita, com responsabilidade humana pela alteração. Leia [CONTRIBUTING-WITH-AI.md](CONTRIBUTING-WITH-AI.md); não declare testes ou revisão que não aconteceram.

## Segurança e licença

Relate vulnerabilidades pelo [canal privado do Property](SECURITY.md). Não abra uma issue pública com detalhes exploráveis.

Ao contribuir, você licencia sua contribuição sob [MIT](LICENSE). Preserve os avisos e as licenças de qualquer código de terceiros. Dependências novas precisam ter origem e licença verificadas.

A documentação técnica original do Amethyst continua disponível no [commit de origem](https://github.com/vitorpamplona/amethyst/blob/948135f7dbbae81d79a0b985282ce673397a7618/CONTRIBUTING.md). Ela é uma referência para os módulos reaproveitados; o fluxo de contribuição do Property é o descrito acima.

### Atualização da PWA

Ao alterar o shell web, atualizar conjuntamente a versão dos URLs locais em HTML/manifesto, a lista `SHELL`, o nome do cache e a URL de registro do service worker. A instalação usa `cache: reload` para evitar mistura de arquivos antigos e novos; nunca apagar IndexedDB para atualizar a marca. `sw-update-smoke.mjs` verifica cobertura offline, política de atualização e preservação de caches alheios.
