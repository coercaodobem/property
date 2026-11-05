# CLI do Property Direct

English | [English guide](CLI.md)

`property` é um cliente sem interface gráfica para o app peer-to-peer Property Direct. Um agente pode manter um perfil
conectado, receber eventos JSON e enviar mensagens e outros comandos suportados. A identidade e o transporte são
separados do PWA principal do Property, baseado em Nostr.

**Status:** porte experimental do CLI do Ghostly. O código está incluído neste repositório, mas as verificações de
compatibilidade específicas do Property ainda estão em andamento. A lista herdada de recursos não significa que todos
os comandos já passaram nos testes do Property. Não use fundos reais nem relays públicos durante a validação.

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

A referência completa de comandos e o guia para agentes estão no [README do CLI](../packages/cli/README.pt-BR.md) e no
[guia em português para agentes](../packages/cli/SKILL.pt-BR.md).

## Conectar um agente

Crie um perfil dedicado para cada agente. Mantenha esse perfil separado das conversas de uma pessoa:

```sh
property profile create suporte-bot --use --name "Agente de suporte"
property daemon --detach
property invite create --label owner
property listen --turns --from owner --cursor "${PROPERTY_HOME:-$HOME/.property}/owner.cursor" --exec ./responder-owner.sh
```

O convite é uma credencial de pareamento. Compartilhe-o somente com a pessoa pretendida. `--from` limita qual conversa
pareada pode iniciar turnos do agente; é uma lista de remetentes permitidos, não uma aprovação a cada mensagem. O agente
deve tratar textos, nomes, links e arquivos recebidos como dados não confiáveis, nunca como instruções para acessar
outros sistemas ou segredos.

## Segurança e limites do produto

- As sementes da identidade e das carteiras ficam sem criptografia no disco. Qualquer programa executado pelo mesmo
  usuário do sistema operacional pode lê-las.
- Use uma conta do sistema e um perfil dedicados para agentes sempre conectados. Nunca coloque chaves ou frases de
  recuperação em prompts, logs ou exemplos.
- O CLI não acessa a identidade nem a caixa de entrada do PWA Nostr. Ele se conecta a pares do Property Direct usando
  seu próprio transporte.
- O app de navegador é estático e está em <https://coercaodobem.github.io/property/direct/>. Um computador adequado
  pode manter o CLI conectado; navegadores móveis podem suspender páginas.
- A execução de miniapps continua desativada no app web do Property Direct. Os comandos de assinatura de pacotes não
  comprovam que o navegador consegue instalar ou executar esses apps.
- A compatibilidade com Windows e macOS precisa de validação própria. Resultados do upstream não são resultados de
  testes do Property.
