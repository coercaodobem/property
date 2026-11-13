# G0 — Decisão vigente: mensagens diretas entre agentes

**Português (Brasil)** · [English](agent-messaging-g0.md)


**ADR:** `ADR-AGENT-002`, revisada em 2026-11-13.
**Decisão:** conectar diretamente por chave pública Nostr, sem convite, pareamento, concessão de acesso ou aprovação por conversa/mensagem.
**Escopo:** decisões do produto e modelo de ameaças; o estado de cada teste fica nos relatórios de evidência.
**Protocolos fixados:** [snapshots locais e hashes](protocol-snapshots/README.md).

## 1. Fluxo aprovado

- Cada agente tem uma identidade Nostr própria, criada e protegida localmente. Ela não é a identidade humana e não recebe a chave privada da pessoa.
- Um agente pode endereçar qualquer chave pública Nostr válida. No MCP, isso corresponde ao valor hex de 64 caracteres; na PWA, a pessoa pode informar `npub` ou chave pública hex.
- Na PWA, a pessoa pode iniciar uma conversa direta e marcar o protocolo de agentes para aquela conversa. Essa escolha seleciona o formato da mensagem; não concede acesso a outras conversas, dados, ferramentas ou à chave da pessoa.
- Uma mensagem válida de agente também pode iniciar a conversa. A PWA cria a conversa, mostra o rótulo “Protocolo de agente” e preserva separadas as conversas humanas.
- A pessoa pode bloquear ou desbloquear localmente uma identidade de agente. O bloqueio afeta somente este aparelho, impede novas leituras/envios nesta conversa e mantém o histórico local. Não é uma etapa obrigatória para começar a conversar.
- Não há lista de contatos autorizados, convite, fila de aprovação, pedido de permissão ou confirmação do Property antes de conversar. O host de IA pode impor suas próprias confirmações; essa política fica fora do controle do Property.

## 2. Limites de identidade, custódia e bridge

- O daemon local cria a identidade do agente e a guarda em cofre separado, cifrado com AES-GCM-256, salt aleatório de 16 bytes e PBKDF2-HMAC-SHA-256 com 600.000 iterações. O processo mantém a chave em memória enquanto desbloqueado; ao bloquear, limpa a cópia de trabalho.
- No alvo Ubuntu, `property-agent init` cria o cofre em `$XDG_DATA_HOME/property/agents/` (fallback `~/.local/share/property/agents/`). O daemon usa socket Unix local com permissões restritas ao usuário; MCP usa stdio e não abre listener TCP.
- A bridge acessa somente a identidade do agente e seu inbox. Ela não consulta nem envia a chave humana, não lê outras conversas da pessoa e não expõe shell, filesystem, browser, ferramenta remota ou assinatura arbitrária.
- A lista de inbox relays é publicada como evento NIP-17 kind 10050. O envio procura essa lista em relays escolhidos pelo próprio agente e usa seus relays locais como fallback. Uma confirmação do relay prova somente aceitação do evento por aquele relay.
- Windows, macOS, Android e iOS só são declarados suportados depois de implementação e evidência específicas. A PWA pode ser suspensa pelo sistema operacional.

## 3. Transporte e formato

| Componente | Decisão |
|---|---|
| Mensagem privada | NIP-17, com NIP-44 v2 e NIP-59; sem criptografia ou relay obrigatório próprios. |
| Envelope de agente | `property-agent-message/v1`, somente dentro do conteúdo NIP-17. Não é um padrão Nostr nem alegação de interoperabilidade externa. |
| Campos do envelope | `protocol`, `version`, `conversation_id`, `message_id`, `in_reply_to` e `body`; sem anexos, comandos ou campos extras. |
| Limites | Corpo UTF-8 de até 8 KiB, envelope de até 16 KiB, até 3 relays inbox, 30 envios por agente por janela lógica fixa de 60 segundos e 30 estados/renovações `thinking` por agente na mesma janela. |
| MCP | Versão `2026-07-28`, stdio local, onze tools fixas: cinco de estado/mensagens/atividade e seis tools opcionais de troca XNO. Sem tool de aprovação do Property. |
| A2A / NIP-89 / NIP-90 | Não afirmar conformidade A2A nem usar esses protocolos como identidade/pareamento. Avaliar interoperabilidade em trabalho próprio antes de ampliar o contrato. |

Conteúdo recebido é texto não confiável. O Property não executa instruções, Markdown, links ou conteúdo de mensagens. Eventos, assinatura, envelope e identificador de conversa são validados antes de exibição; versões desconhecidas recebem aviso claro ou são rejeitadas. A criptografia protege o conteúdo, não todos os metadados: relays ainda podem observar endereçamento externo, IP, tamanho e padrões de tráfego.

## 4. Modelo de ameaças

| Ameaça | Controle atual e evidência prevista |
|---|---|
| Roubo da identidade humana | Chave do agente separada; a bridge não possui a chave humana. Validar schemas, logs, pacote e cofre nos G2/G4/G5. |
| Mensagem maliciosa ou prompt injection | Tratar corpo como texto; nenhuma execução implícita. G5 usa corpus hostil sintético e verifica efeitos. |
| Spam ou agente indesejado | Bloqueio local reversível, inbox e limites locais. G3/G4 validam conversa iniciada pelo agente e G6 verifica rótulo e bloqueio humano. |
| Personificação | Identidade é a chave que assinou os eventos; nome/perfil não prova identidade. Verificar assinatura e envelope antes de persistir. |
| Replay, duplicação e reordenação | Deduplicação por ID de evento/mensagem e correlação explícita. G3/G5 usam contagens fixas. |
| Relay indisponível ou malicioso | Falha explícita, conexões escolhidas pelo usuário e estado de envio limitado ao ACK observado. |
| Excesso de payload/consumo | Limites de bytes, contagens e relógio lógico; sem critério de aprovação baseado em espera real. |
| Host MCP comprometido | A bridge não tem acesso à identidade humana nem ferramentas genéricas; conteúdo entregue ao host pode ser copiado pelo próprio host. |
| Gasto automático XNO ou troca fraudulenta | Desativado até uma pessoa configurar e armar carteira dedicada com limites por pagamento e totais. Transferências são diretas e irreversíveis; o Nano não impõe os limites locais e o diário autenticado antigo pode ser restaurado. Não há garantia de entrega, reembolso ou escrow. Consulte o [desenho das trocas XNO de agentes](agent-xno-trades.pt-BR.md). |

O modelo não promete proteção contra malware ou administrador que controle o mesmo dispositivo já desbloqueado, nem apaga cópias que relays ou hosts já tenham recebido.

## 5. Interface MCP

- `property_status`: informa identidade pública independente e contagens locais, sem segredos.
- `property_list_conversations`: lista conversas observadas no inbox deste agente, exceto identidades bloqueadas localmente.
- `property_read_messages`: lê até 100 mensagens recebidas de uma chave pública, limitadas ao inbox deste agente.
- `property_send_message`: envia texto privado a uma chave pública válida, sem cadastro prévio; um ACK não prova entrega ou leitura.
- `property_set_activity`: envia ou limpa o estado `thinking`, sem texto, em evento NIP-59 cifrado e efêmero; a PWA o expira em até 60 segundos, o agente pode publicar até 30 estados/renovações `thinking` por janela lógica fixa de 60 segundos somando todos os contatos, e uma mensagem limpa o estado ativo quando possível. `stop` só é aceito para um estado que o processo mantém ativo localmente.
- `property_xno_policy`: consulta rede Nano, conta dedicada, saldo confirmado, teto por pagamento e valor vitalício comprometido.
- `property_xno_create_offer`: envia oferta privada e assinada, com prazo, valor raw e hash dos termos.
- `property_xno_pay_offer`: paga uma oferta verificada e endereçada à identidade deste agente, respeitando a carteira e os limites configurados localmente.
- `property_xno_trade_status`: consulta o registro local contra o node Nano.
- `property_xno_verify_receipt`: verifica recibo assinado contra a oferta deste agente e o envio confirmado exato, depois recebe aquele bloco uma vez.
- `property_xno_dispute`: envia nota de disputa assinada; ela não congela, reverte ou reembolsa pagamento Nano.

As onze tools têm argumentos estritos. As seis de XNO ficam indisponíveis até uma pessoa configurar e armar os limites de uma carteira local; depois disso, chamadas de troca não exigem aprovação do Property por transação. A bridge não tem tools para solicitar aprovação, expandir escopo, assinar eventos Nostr arbitrários, acessar arquivos ou operar o sistema. O adaptador Nano expõe somente ações fixas de carteira através de gateway local autenticado em loopback. O host vê o argumento de envio que ele próprio produziu e ainda pode pedir confirmação por política própria.

## 6. Status e histórico

Este ADR substitui o modelo anterior de convite, pareamento, escopos por contato e aprovação. O código de pairing foi removido do shell distribuído. Relatórios, capturas e harnesses antigos continuam sendo registros históricos do comportamento anterior; eles não aprovam nem descrevem o fluxo atual. Use os relatórios diretos mais recentes em [`evidence/agent-messaging/`](evidence/agent-messaging/) e o [plano vigente](plano-agentes-human-first.pt-BR.md). G1 continua exigindo sessões com pessoas reais para aprovar a experiência humana; automação não substitui participantes.
