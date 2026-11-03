# Guia de linguagem da comunicação entre agentes

Este guia orienta os rótulos do produto e ainda precisa ser validado com pessoas no gate G1. A pessoa deve entender o que está acontecendo sem conhecer Nostr, MCP, chaves ou relays.

## Termos visíveis

| Conceito | Texto recomendado | Regra de UX |
|---|---|---|
| Agente de IA conectado | **Agente** | Exibir o rótulo junto ao nome em conversas, mensagens, convites e resultados de busca. Nunca misturar visualmente com um contato humano. |
| Identidade Nostr do agente | **Chave pública do agente** | Mostrar o identificador completo e permitir conferir o fingerprint. Explicar que o nome declarado pode não ser autêntico. |
| Acesso a dados | **Permissões** | Cada escopo aparece em uma escolha separada, desligada por padrão, com exemplo concreto do que será lido ou enviado. |
| Acesso revogado no dispositivo | **Acesso local revogado** | Indica bloqueio local imediato; não significa que o agente remoto recebeu o aviso. |
| Aviso publicado | **Aviso de revogação enviado** | Usar apenas após evidência local de publicação ao relay; não dizer que o outro lado recebeu. |
| Confirmação do agente | **Revogação confirmada pelo agente** | Usar somente após resposta verificável do agente correspondente. |
| Estado desconhecido | **Ainda não confirmado** | Não converter silêncio, desconexão ou falta de resposta em sucesso. |

## Texto e comportamento

- Preferir frases curtas, concretas e sem siglas. Explicar siglas apenas em ajuda opcional.
- Nunca pedir a chave privada, senha ou frase de recuperação durante o pareamento de um agente.
- Não usar botões vagos como “Conectar” quando a ação concede acesso. Nomear o efeito: “Adicionar agente com estas permissões”.
- Cancelar deve deixar claro que nenhuma nova permissão foi concedida e manter as conversas humanas disponíveis.
- A aprovação pode conceder zero escopos; a interface deve dizer que o agente foi adicionado sem acesso a leitura ou envio.
- Avisar antes da aprovação que o host do agente pode reter cópias de conteúdo já lido.
- Explicar que revogar bloqueia novas ações locais e não apaga cópias existentes em agentes, relays ou dispositivos.
- Não chamar mensagem de enviada, entregue, lida ou respondida sem a evidência correspondente.
- Em erros, indicar a ação segura possível: revisar a chave, cancelar ou tentar novamente; não culpar a pessoa.

## Critério de validação

No G1, observar se cinco pessoas reais, sem explicação prévia do pesquisador, distinguem agente e pessoa, entendem cada escopo e sabem o que cancelamento e revogação realmente fazem. Uma revisão editorial ou automatizada não substitui essa observação.
