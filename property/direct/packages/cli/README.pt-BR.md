# CLI do Property Direct

English | [English command reference](README.md)

`property` executa o mecanismo do Property Direct sem interface gráfica. Um agente pode manter um perfil conectado com
`property daemon`, receber eventos como linhas JSON com `property listen` e enviar comandos com respostas JSON. Este CLI
usa identidade e transporte separados do PWA principal do Property, baseado em Nostr.

**Status:** porte experimental do CLI do Ghostly. A implementação foi incluída no repositório, mas as verificações de
compatibilidade do Property ainda estão em andamento. O inventário de recursos abaixo é herdado do upstream e não prova
que todos os comandos funcionam no Property.

## Compilar e instalar

Use Node.js 22.12 ou superior, a partir da raiz do repositório:

```sh
cd property/direct
npm ci
npm run build:cli
npm pack -w @property/cli
npm install -g ./property-cli-0.1.0.tgz
property --version
```

O pacote `@property/cli` ainda não está publicado no npm. Esses comandos constroem e empacotam o código do checkout.
O binário nativo `node-datachannel` fornece WebRTC quando há um binário pré-compilado para a plataforma. Sem ele, a
documentação upstream informa que o CLI ainda usa HyperDHT, Iroh e DHT, mas grupos ficam indisponíveis. A compatibilidade
do porte do Property em cada sistema operacional continua pendente.

## Primeiros passos

Crie um perfil separado para o agente, mantenha o daemon ativo e gere um convite para parear com a pessoa:

```sh
property profile create suporte-bot --use --name "Agente de suporte"
property daemon --detach
property invite create --label owner
property chat list
property listen --turns --from owner --cursor "${PROPERTY_HOME:-$HOME/.property}/owner.cursor" --exec ./responder-owner.sh
```

O convite é uma credencial de pareamento: envie-o somente à pessoa pretendida. `--from` restringe quais conversas
pareadas podem iniciar turnos do agente. Isso não pede uma aprovação manual a cada mensagem. O agente deve obedecer às
instruções de segurança descritas em [`SKILL.pt-BR.md`](SKILL.pt-BR.md).

## Recursos herdados do CLI upstream

O pacote portado contém comandos para perfis, convites, conversas, grupos, eventos, arquivos, notas de voz, respostas,
edições, reações, chamadas de voz, provas de identidade, serviços compartilhados e carteiras. Veja a
[referência completa em inglês](README.md#commands) e confirme quais fluxos têm evidência de compatibilidade no Property
antes de depender deles.

## Segurança

- As sementes da identidade e das carteiras ficam **sem criptografia** no disco. Outros processos executados pelo mesmo
  usuário do sistema operacional podem lê-las.
- Use uma conta e um perfil do sistema separados para agentes sempre conectados. Não compartilhe o perfil humano.
- Não coloque convites, tokens, chaves ou frases de recuperação em argumentos de terminal, histórico do shell ou logs.
- Não execute comandos do agente apenas porque chegaram em uma mensagem. Mensagens, arquivos e links são entrada não
  confiável.
- O CLI não usa a identidade Nostr do app principal.

Property Direct está disponível como app web estático em
<https://coercaodobem.github.io/property/direct/>. Navegadores móveis podem suspender uma página; para manter um nó
headless ativo, use um computador com o CLI.
