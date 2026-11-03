# Property Agent local

Runtime inicial para Ubuntu/Linux com Node.js 22 ou mais recente. Ele mantém uma identidade Nostr separada, cifra a chave em um cofre local e oferece ao host MCP apenas cinco ferramentas fechadas. O processo MCP usa `stdio` e encaminha pedidos por um socket Unix privado ao daemon desbloqueado. Não abre um endpoint HTTP/TCP, não oferece shell/filesystem e não baixa código em runtime.

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

```bash
property-agent init
property-agent relay add ws://localhost:7447
property-agent unlock
```

`init` gera uma chave própria e solicita uma senha de pelo menos 12 caracteres duas vezes, em um TTY com entrada oculta. O cofre fica em `$XDG_DATA_HOME/property/agents/default/agent.vault.json` (fallback `~/.local/share/...`); diretório `0700`, arquivos `0600`, AES-256-GCM e PBKDF2-HMAC-SHA-256 com 600.000 iterações. A senha nunca é argumento, variável de ambiente, saída MCP ou log. A perda da senha e do backup cifrado causa perda da identidade.

`relay add` configura até três inbox relays que o agente consultará para NIP-17. O exemplo usa o relay local executado por `./property/relay/start.sh`; em produção, use somente relays `wss://` escolhidos conscientemente.

Crie um convite assinado para a PWA e compartilhe o texto exibido pelo terminal:

```bash
property-agent invite --name "Meu agente" --for npub1...
```

A PWA ainda precisa verificar o convite e a pessoa precisa aprovar o agente e os escopos. O agente não recebe a chave humana. Para autorizar um destino e escopos do agente local, a pessoa proprietária confirma diretamente no TTY:

```bash
property-agent contact grant npub1... --name "Pessoa" --relay wss://relay.example --read --send
```

Use `--read` e `--send` separadamente conforme o caso. O escopo começa fechado. Para revogar no host local, use `property-agent contact revoke npub1...`; isso bloqueia novas chamadas locais, mas esta versão não publica um controle NIP-17 de revogação remota. Pedidos de expansão via tool ficam pendentes até decisão humana com `property-agent requests` e `property-agent request decide <id> approve|deny`.

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

O caminho é de exemplo e deve ser substituído pelo caminho local escolhido. O servidor anuncia somente `server/discover`, `tools/list` e `tools/call` na versão MCP fixada `2026-07-28`. Tools: `property_status`, `property_list_approved_conversations`, `property_read_messages`, `property_send_message` e `property_request_human_approval`. Nenhuma tool retorna chave, senha, arquivo, comando, configuração arbitrária ou evento para assinatura. Envio exige contato com escopo `send`, texto até 8 KiB e cota de 30 envios por agente por janela lógica de 60 segundos; o ACK do relay não significa entrega/leitura.

O socket fica sob `$XDG_RUNTIME_DIR/property-agent/`, com modo `0600`; se `XDG_RUNTIME_DIR` não existir, o runtime tenta `/run/user/<uid>` e falha se não puder restringir o diretório. `property-agent lock` encerra o daemon e remove o socket. O cofre permanece cifrado em disco.

## Dependências e compatibilidade

O runtime não instala dependências Node externas. Reusa `nostr-tools` 2.25.2 local, Unlicense, SHA-256 `a7c4846fde84a0d6ce7596f3fcfc88435d29fdcd616887205ab97f9a16bc6407`, e `web/agent-messaging.js` do mesmo checkout/pacote. O host precisa fornecer Node.js 22+ e o sistema operacional precisa fornecer socket Unix e WebSocket nativo do Node.

O G4 técnico é executado em Ubuntu/Linux com relays locais. Windows e macOS continuam pendentes para IPC/armazenamento nativos; iOS e Android não executam este daemon. O uso humano continua disponível pela PWA sem bridge. G1 e G6 exigem sessões humanas reais antes de declarar UX aprovada ou piloto pronto.
