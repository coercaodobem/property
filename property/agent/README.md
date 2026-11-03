# Property Agent local

Runtime inicial para Ubuntu/Linux com Node.js 22 ou mais recente. Ele mantém uma identidade Nostr separada, cifra a chave em um cofre local e oferece ao host MCP apenas quatro ferramentas fechadas. O processo MCP usa `stdio` e encaminha pedidos por um socket Unix privado ao daemon desbloqueado. Não abre um endpoint HTTP/TCP, não oferece shell/filesystem e não baixa código em runtime.

## Instalação e remoção

Na raiz do checkout Property:

```bash
bash property/agent/install.sh "$HOME/.local"
```

O instalador copia o runtime e as dependências já versionadas para `~/.local/share/property/agent/` e cria `~/.local/bin/property-agent`. Não altera `PATH`, não usa `sudo`, `npm`, registry ou CDN. Adicione `~/.local/bin` ao `PATH` por uma ação humana, se necessário.

Atualize repetindo o comando de instalação. Para remover executáveis sem excluir o cofre e a configuração:

```bash
bash property/agent/uninstall.sh "$HOME/.local"
```

Instalação, atualização e remoção podem ser exercitadas em um prefixo temporário; os scripts recusam caminhos relativos.

## Primeiro uso

Crie a identidade e inicie o daemon desbloqueado. Mantenha esse processo em um terminal local; os comandos de configuração abaixo são executados em outro terminal e passam pelo mesmo daemon.

```bash
property-agent init
property-agent unlock
```

`init` gera uma chave própria e solicita uma senha de pelo menos 12 caracteres duas vezes, em um TTY com entrada oculta. O cofre fica em `$XDG_DATA_HOME/property/agents/default/agent.vault.json` (fallback `~/.local/share/...`); diretório `0700`, arquivos `0600`, AES-256-GCM e PBKDF2-HMAC-SHA-256 com 600.000 iterações. A senha nunca é argumento, variável de ambiente, saída MCP ou log. A perda da senha e do backup cifrado causa perda da identidade.

`relay add` configura até três inbox relays que o agente consultará para NIP-17. O exemplo usa o relay local executado por `./property/relay/start.sh`; em produção, use somente relays `wss://` escolhidos conscientemente. Execute esse comando em outro terminal enquanto o daemon está desbloqueado. Depois de adicionar ou alterar relays, execute property-agent lock e desbloqueie novamente para aplicar a nova lista.

Crie um convite assinado para a PWA e compartilhe o texto exibido pelo terminal:

```bash
property-agent invite --name "Meu agente" --for npub1...
```

A PWA verifica o convite e, no pareamento inicial, a pessoa escolhe os escopos da identidade humana. O agente não recebe a chave humana. Para incluir um contato na política inicial do agente local, configure os destinos e escopos uma vez pelo TTY:

```bash
property-agent contact configure npub1... --name "Pessoa" --relay wss://relay.example --read --send
```

Use `--read` e `--send` para definir a política desse contato no setup. O agente não recebe permissões fora desses escopos. Depois de salvar a configuração, o agente usa as ferramentas automaticamente dentro da política, sem aprovação por mensagem ou sessão. Uma tentativa fora do escopo é recusada imediatamente; não há pedido, fila ou ampliação automática. Para alterar a política ou revogar localmente, use `property-agent contact configure` com os novos escopos ou `property-agent contact revoke npub1...`. A revogação bloqueia novas chamadas locais, mas esta versão não publica um controle NIP-17 de revogação remota.

Perfis antigos são migrados ao desbloquear: contatos, relays e cota são preservados; pedidos pendentes da antiga fila de aprovação são descartados.

Essa configuração inicial é o limite de autoridade do agente. A bridge não abre HTTP/TCP local e não oferece à IA uma ferramenta para alterar contatos, relays ou escopos.

## Host MCP

Mantenha `property-agent unlock` ativo em uma sessão local do usuário. Configure o host para executar:

```json
{
  "mcpServers": {
    "property": {
      "command": "/home/USUARIO/.local/bin/property-agent",
      "args": ["mcp"]
    }
  }
}
```

O caminho é de exemplo e deve ser substituído pelo caminho local escolhido. O servidor anuncia somente `server/discover`, `tools/list` e `tools/call` na versão MCP fixada `2026-07-28`. Tools: `property_status`, `property_list_conversations`, `property_read_messages` e `property_send_message`. Nenhuma tool retorna chave, senha, arquivo, comando, configuração arbitrária ou evento para assinatura. Envio exige contato com escopo `send`, texto até 8 KiB e cota de 30 envios por agente por janela lógica de 60 segundos; o ACK do relay não significa entrega/leitura. Chamadas dentro dos escopos configurados funcionam sem pedido de aprovação ao Property; chamadas fora deles são recusadas imediatamente e sem fila. O envio MCP é marcado como aditivo e não idempotente. O host MCP pode impor confirmações próprias; isso depende da política do host e não é controlado pela bridge.

O socket fica sob `$XDG_RUNTIME_DIR/property-agent/`, com modo `0600`; se `XDG_RUNTIME_DIR` não existir, o runtime tenta `/run/user/<uid>` e falha se não puder restringir o diretório. `property-agent lock` encerra o daemon e remove o socket. O cofre permanece cifrado em disco.

O bloco acima é uma configuração MCP genérica para hosts que aceitam servidores locais por stdio. O G4 usou clientes MCP de referência; Codex, ChatGPT, Claude e outros hosts comerciais ainda não foram testados. Ajuste o formato ao host escolhido e não presuma compatibilidade até uma conexão real ser verificada. O host pode exigir confirmação por chamada segundo sua configuração própria. O Property não anuncia conformidade A2A.

## Dependências e compatibilidade

O runtime não instala dependências Node externas. Reusa `nostr-tools` 2.25.2 local, Unlicense, SHA-256 `a7c4846fde84a0d6ce7596f3fcfc88435d29fdcd616887205ab97f9a16bc6407`, e `web/agent-messaging.js` do mesmo checkout/pacote. O host precisa fornecer Node.js 22+ e o sistema operacional precisa fornecer socket Unix e WebSocket nativo do Node.

A evidência G4 cobre o contrato atual de quatro tools em ensaio técnico offline no Ubuntu/Linux x64. Windows e macOS continuam pendentes para IPC/armazenamento nativos; iOS e Android não executam este daemon. O uso humano continua disponível pela PWA sem bridge. G1 e G6 exigem sessões humanas reais antes de declarar UX validada ou piloto pronto. Hosts MCP comerciais ainda não foram testados.
