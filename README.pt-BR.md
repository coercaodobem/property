# Property

**Português (Brasil)** · [English](README.md)

<p align="center">
  <img src="property/web/assets/property-brand.png" alt="Identidade visual do Property" width="320">
</p>

O Property é um projeto aberto de comunicação descentralizada e trocas voluntárias entre pessoas, baseado em Nostr. A interface funciona pelo navegador em celulares, tablets e computadores compatíveis; o acesso não depende de aprovação, publicação ou manutenção nas lojas de aplicativos. O projeto inclui uma PWA instalável, identidade controlada localmente, mensagens diretas e em grupo criptografadas e conexão direta a relays. No primeiro uso, o Property sorteia dois relays de uma lista incluída no app e salva a seleção localmente; a pessoa pode trocá-los quando quiser.

**[Abrir o app](https://coercaodobem.github.io/property/) · [Como funciona o Property](https://coercaodobem.github.io/property/about.pt-BR.html) · [Como contribuir](CONTRIBUTING.pt-BR.md) · [Roadmap](ROADMAP.pt-BR.md) · [Reportar um problema](https://github.com/coercaodobem/property/issues/new/choose)**

**Acesso pelo navegador:** abra o site no dispositivo compatível e, se quiser, adicione a PWA à tela inicial. Não é preciso distribuir o app pela Play Store ou App Store. A interface abre em inglês; selecione **Português (Brasil)** no cabeçalho para mudar o idioma neste aparelho. A seleção é salva localmente. Mensagens, publicações, nomes e ofertas nunca são traduzidos.

**Um app, uma identidade:** o Property é a PWA Nostr no link acima. O Ghostly é uma referência de UX; melhorias compatíveis de conversa, incluindo o seletor de emojis pesquisável e offline e prévias de link criptografadas e opcionais, são integradas neste mesmo app e usam a identidade Property e os relays Nostr escolhidos pela pessoa.

**Trocas voluntárias:** o marketplace permite publicar e descobrir ofertas. Compra, checkout e custódia ainda não estão habilitados nesta versão.

## O que queremos construir

Uma interface simples para conversar, publicar e descobrir ofertas em uma rede descentralizada por Wi-Fi ou rede móvel. Pessoas controlam sua identidade e podem mudar os relays que transportam seus eventos. A senha protege a chave aleatória criada no aparelho; não existe servidor central de login ou recuperação. O navegador se conecta diretamente aos relays. Relays públicos podem ver o endereço IP e metadados de eventos públicos; o conteúdo de mensagens privadas permanece criptografado de ponta a ponta.

PCs podem operar relays continuamente. A colaboração da PWA entre relays acontece enquanto o navegador está ativo. Android e iOS podem suspender uma PWA em segundo plano; manter um nó móvel permanentemente ativo ainda exige outra solução de plataforma, a desenvolver.

O objetivo de plataforma inclui Windows, macOS, Linux/Ubuntu, Android e iOS. A interface web é o caminho comum. O relay inclui runtimes para Linux x86_64, Windows x64 e macOS Apple Silicon; os testes por sistema ficam registrados no plano. Outras arquiteturas e relay móvel contínuo exigem implementação própria.

## Estado atual: MVP em validação

| Área | O que existe hoje | O que ainda falta |
|---|---|---|
| Interface web | PWA publicada em HTTPS; arquivos de execução servidos do próprio pacote | Validação completa em Android/iOS e acessibilidade |
| Identidade | Chave aleatória local, cofre cifrado por senha, sessão persistente e backup cifrado | Mais testes de recuperação e uso em aparelhos reais |
| Mensagens | Conversas diretas e grupos NIP-17 criptografados (até 10 participantes), prévias de link em texto com consentimento de quem envia, conversas fixadas e pastas locais, listas inbox kind 10050, chamadas diretas de áudio/vídeo por WebRTC e transferência direta opcional de arquivos por WebRTC com sinalização Nostr criptografada | Validação em navegadores, aparelhos e redes diferentes para chamadas e arquivos diretos; os peers e STUN público podem ver o IP, não há TURN e algumas redes não conectam; grupos não têm administração, aprovação ou remoção confiável de membros |
| Agentes | Conversas diretas via NIP-17/MCP por chave pública, sem convite nem aprovação do Property; bloqueio local reversível | Revisão humana, revisão independente de segurança, hosts externos e outras plataformas |
| Relay de PC | Geode com runtime incluído para Linux x86_64, Windows x64 e macOS Apple Silicon | Matriz por plataforma e gate multi-relay G11-03 com 300 probes, três reinícios e nove eventos de partição; veja o [status do plano](property/docs/plano-de-testes-central.pt-BR.md) |
| Ponte voluntária | Encaminhamento limitado entre relays enquanto a PWA está ativa | Operação móvel contínua não é suportada pela PWA |
| Marketplace e campanhas | Ofertas e leitor opcional na PWA; engine de node e adaptadores BTC/XMR/XNO testados em redes privadas locais | Integrar operação do node e revisar políticas antes de ativar campanhas; checkout continua fora do MVP |
| Hangout | Feed público kind 1; jornada automatizada de leitura, publicação e contato passou no perfil Ubuntu | Revisão humana de usabilidade e validação em outras plataformas |

A publicação do app não significa que todo o plano foi concluído. O perfil offline Ubuntu registrou 70 casos PASS; os quatro casos nativos de Windows, macOS, Android e iOS/iPadOS estão PENDING. Consulte o [relatório e plano de testes](property/docs/plano-de-testes-central.pt-BR.md) para resultados e limitações. O marketplace não faz checkout; campanhas de node ainda não têm fluxo de operação/ativação em produção.

## Começar em poucos minutos

A branch padrão e de desenvolvimento é **`modelo-mvp`**. Para contribuir, faça primeiro um fork; os comandos completos estão no [guia de contribuição](CONTRIBUTING.md).

```bash
git clone --branch modelo-mvp https://github.com/coercaodobem/property.git
cd property
```

Para abrir a interface localmente, com Python 3:

```bash
python3 -m http.server 8080 --directory property/web
```

Acesse `http://localhost:8080`. Instalação como PWA exige HTTPS ou localhost. O shell pode abrir offline após a primeira carga; comunicação exige relays alcançáveis.

Para iniciar o relay no Linux x86_64 ou macOS Apple Silicon:

```bash
./property/relay/start.sh
```

No Windows x64, pelo PowerShell na raiz do checkout:

```powershell
powershell -NoProfile -File .\property\relay\start.ps1
```

O pacote inclui o runtime Java e verifica o SHA-256 antes da extração. Por padrão, o relay escuta somente em `127.0.0.1:7447`; publicar um relay na internet exige configuração própria de TLS, rede e armazenamento. Veja o [guia do relay](property/relay/README.md).

Para executar a suíte local, com Node.js 22 ou superior:

```bash
bash property/tests/run-smoke.sh
```

Esses testes não dependem de pagamentos ou publicação de mensagens em relays públicos. Os gates de integração local usam repetições fixas, manifesto e isolamento de rede conforme o [plano central de testes](property/docs/plano-de-testes-central.pt-BR.md).

## Onde está cada parte

| Caminho | Conteúdo |
|---|---|
| [`property/web/`](property/web/) | Interface PWA e dependências web locais |
| [`property/relay/`](property/relay/) | Launcher e pacote portátil do relay |
| [`property/tests/`](property/tests/) | Validações do produto Property |
| [`property/docs/`](property/docs/) | Identidade, decisões, execução e plano de testes |
| [`property/docs/ghostly-integration.pt-BR.md`](property/docs/ghostly-integration.pt-BR.md) | Interações de conversa inspiradas no Ghostly dentro da PWA Property existente |
| [`geode/`](geode/) | Código do relay reaproveitado do Amethyst |
| `amethyst/`, `commons/`, `commonsUI/`, `desktopApp/`, `cli/` | Base upstream preservada; presença do código não significa que todos os alvos sejam produtos Property publicados |

## Contribuir

São bem-vindos relatos de bugs, documentação, testes, acessibilidade e correções. Não é necessário oferecer bounty ou pagamento para propor uma contribuição.

1. Confira o [roadmap](ROADMAP.pt-BR.md) e as [issues do Property](https://github.com/coercaodobem/property/issues).
2. Leia [CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md), prepare uma alteração pequena e descreva como a validou.
3. Abra um pull request para **`coercaodobem/property:modelo-mvp`**. A incorporação passa por revisão do mantenedor.

Para vulnerabilidades, use o canal privado descrito em [SECURITY.md](SECURITY.md). Não publique senhas, chaves privadas, tokens ou conversas pessoais em issues e logs.

Para trabalho assistido por IA, consulte [`AGENTS.md`](AGENTS.md), as instruções específicas de [`property/AGENTS.md`](property/AGENTS.md) e [`CONTRIBUTING-WITH-AI.pt-BR.md`](CONTRIBUTING-WITH-AI.pt-BR.md).

## Contexto e origem

- [Identidade e princípios](property/docs/identidade-do-projeto.pt-BR.md)
- [Plano central](property/docs/plano-central.pt-BR.md)
- [Resultados e plano de testes](property/docs/plano-de-testes-central.pt-BR.md)
- [Plano de comunicação entre agentes, com UX humano como critério](property/docs/plano-agentes-human-first.pt-BR.md)
- [Decisão e modelo de ameaças do G0](property/docs/agent-messaging-g0.pt-BR.md)
- [Detalhes do MVP e da publicação](property/README.md)

O snapshot de origem é o Amethyst no commit [948135f](https://github.com/vitorpamplona/amethyst/tree/948135f7dbbae81d79a0b985282ce673397a7618). Reaproveitamos sua base e o relay Geode. A PWA usa JavaScript e o pacote local versionado `nostr-tools`; não é uma compilação web da interface Android do Amethyst. O cliente não baixa scripts executáveis de CDN durante o uso. O histórico upstream completo permanece no repositório original.

O Property mantém os avisos de autoria e a licença [MIT](LICENSE) da base. Dependências têm licenças próprias, registradas nos inventários do projeto. Relatos e contribuições específicos do Property devem ser enviados a este repositório.
