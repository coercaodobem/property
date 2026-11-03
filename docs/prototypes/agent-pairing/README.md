# Protótipo de pareamento de agente

Este protótipo estático apresenta, em português, um fluxo de convite, inspeção de identidade, escolha de permissões, cancelamento, aprovação e revogação local. Ele usa somente HTML, CSS e JavaScript inline; não carrega scripts, fontes, imagens ou código executável de terceiros.

## Abrir localmente

Na raiz do repositório:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory property/docs/prototypes/agent-pairing
```

Abra `http://127.0.0.1:8765/` no navegador. Alternativamente, abra `index.html` diretamente. O servidor deve escutar apenas no loopback durante a pesquisa local.

Verifique os fluxos determinísticos do protótipo com `node property/tests/agent-pairing-prototype-smoke.mjs` a partir da raiz. O teste usa um DOM simulado e não substitui browser, pesquisa humana ou acessibilidade em dispositivo.

## Limites desta demonstração

- O convite, a identidade, a pessoa e as mensagens são fixtures fictícios.
- O identificador exibido não é uma chave pública Nostr válida; nenhuma assinatura é verificada.
- Nenhuma chave, permissão ou mensagem é persistida; nada é enviado a um relay ou host de IA.
- O estado de revogação é apenas local e volátil. Não representa entrega nem confirmação de rede.
- A tela preserva a conversa humana sem exigir pareamento de agente.

## Revisão humana exigida

Inspeção de código ou automação não substitui as cinco sessões humanas definidas no [plano](../../plano-agentes-human-first.md). O gate G1 permanece `PENDING` até cinco participantes reais completarem as tarefas fixas, pelo menos três deles sem experiência de desenvolvimento, e quaisquer falhas críticas serem corrigidas e repetidas. Use o roteiro e a planilha vazia no [relatório G1](../../evidence/agent-messaging/G1-20261103.md); não registre nomes, chaves, conversas pessoais ou outros identificadores.
