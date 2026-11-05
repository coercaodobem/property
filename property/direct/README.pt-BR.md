# Property Direct

**Português (Brasil)** · [English](README.md)

Property Direct é um app experimental de mensagens peer-to-peer adaptado do [Ghostly](https://github.com/MiguelMedeiros/ghostly). A interface abre em inglês; selecione **Português (Brasil)** em Configurações → Idioma para mudar neste aparelho. Nomes, ofertas e mensagens escritos por pessoas ou agentes permanecem como foram enviados.

**[Abrir o Property Direct](https://coercaodobem.github.io/property/direct/)**

O Property Direct e a [PWA Nostr principal do Property](https://coercaodobem.github.io/property/) são clientes separados. Usam identidades, transportes e históricos de conversa diferentes; este app experimental não se conecta a relays Nostr nem compartilha conversas com a PWA Nostr.

A versão web usa o transporte peer-to-peer e partes da UX adaptadas do Ghostly. É servida como site estático no caminho do GitHub Pages do repositório e não precisa de publicação em loja. O navegador pode ser suspenso quando fica em segundo plano; portanto, o app não funciona como node móvel sempre ativo.

Os arquivos executáveis e as dependências de terceiros do app de navegador são incluídos no build do projeto. A versão web publicada não ativa uma loja de miniapps executáveis. A comunicação pela rede transporta descoberta de peers e tráfego cifrado; não baixa nem executa o aplicativo de uma CDN.

## Cliente headless para agentes

O repositório também inclui um [CLI experimental do Property Direct](packages/cli/README.pt-BR.md) para agentes e bots. Ele tem perfil e identidade peer-to-peer próprios, separados da PWA Nostr, e é compilado do código-fonte com Node.js 22.12 ou superior. As verificações de compatibilidade específicas do Property ainda estão em andamento; o pacote não foi publicado no npm.

## Build

Neste diretório, use Node.js 22 ou superior:

```bash
npm ci
npm run build:web
```

O build grava a versão estática em `../web/direct/`, incluída na publicação do GitHub Pages. `npm ci` usa o lockfile e aplica os patches registrados no repositório. Não execute `apps/ui/scripts/built-in-apps.mjs`; o Property Direct não inclui pacotes remotos de miniapps.

Para compilar o CLI headless, execute `npm run build:cli`. Consulte o [guia do CLI](docs/CLI.pt-BR.md) para instalação e limites de segurança.

## Origem e licença

Esta adaptação começou no commit upstream `138d51872ce569f2f5b7ac68445d4ec59efe5d0d` e inclui correções compatíveis até [`c188787cc2ee27d92e65dac3ef9e82471cdafdde`](https://github.com/MiguelMedeiros/ghostly/commit/c188787cc2ee27d92e65dac3ef9e82471cdafdde) de `MiguelMedeiros/ghostly`. A correção da âncora de rolagem do chat também segue o ajuste upstream [`55c03930ad47d10e8307cfb330137dc1abfad05b`](https://github.com/MiguelMedeiros/ghostly/commit/55c03930ad47d10e8307cfb330137dc1abfad05b). O CLI é um pacote experimental separado neste repositório, fora do runtime do app de navegador. O código usa a licença MIT; consulte [LICENSE](LICENSE), [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) e o [aviso de origem do CLI](packages/cli/UPSTREAM.md). Identificadores internos de módulos e formatos de protocolo são preservados quando mudá-los quebraria compatibilidade. As declarações assinadas de prova de identidade mantêm exatamente o texto v1 do Ghostly para que provas existentes continuem verificáveis; nome, interface e marcas do Property foram adaptados.

Para conhecer o projeto principal, as instruções para agentes e o app Nostr, veja o [README do repositório](../../README.md), o [guia de contribuição](../../CONTRIBUTING.md) e as [instruções do Property](../AGENTS.md).
