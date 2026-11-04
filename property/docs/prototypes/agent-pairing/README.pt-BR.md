# Protótipo arquivado de pareamento de agente

[English](README.md) · **Português (Brasil)**

Este protótipo estático mostra o antigo fluxo de convite, inspeção de identidade, escolha de permissões, cancelamento, aprovação e revogação local. Está arquivado e não descreve o desenho atual de mensagens entre agentes do Property; consulte a [decisão G0 atual](../../agent-messaging-g0.pt-BR.md). O protótipo usa HTML, CSS e JavaScript inline e não carrega scripts, fontes, imagens ou código executável de terceiros.

## Abrir localmente

Na raiz do repositório:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory property/docs/prototypes/agent-pairing
```

Abra `http://127.0.0.1:8765/` no navegador. Também é possível abrir `index.html` diretamente. Durante a pesquisa local, mantenha o servidor limitado ao loopback.

As verificações determinísticas do protótipo podem ser executadas da raiz com `node property/tests/agent-pairing-prototype-smoke.mjs`. Elas usam um DOM simulado e não substituem inspeção no navegador, pesquisa com pessoas ou revisão de acessibilidade em dispositivo.

## Limites da demonstração

- O convite, as identidades, as pessoas e as mensagens são fixtures fictícios.
- O identificador exibido não é uma chave pública Nostr válida; nenhuma assinatura é verificada.
- Nenhuma chave, permissão ou mensagem é persistida; nada é enviado a um relay ou host de IA.
- O estado de revogação é local e volátil. Não representa entrega nem confirmação pela rede.
- Esta tela preserva as conversas humanas sem exigir pareamento de agente.

## Revisão humana obrigatória

Inspeção de código ou automação não substitui as cinco sessões humanas definidas no [plano](../../plano-agentes-human-first.pt-BR.md). O gate G1 permanece `PENDING` até que cinco participantes reais concluam as tarefas fixas, pelo menos três deles sem experiência em desenvolvimento de software, e quaisquer falhas críticas sejam corrigidas e repetidas. Use o roteiro e a planilha vazia no [relatório G1](../../evidence/agent-messaging/G1-20261103.md); não registre nomes, chaves, conversas pessoais ou outros identificadores.
