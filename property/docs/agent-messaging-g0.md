# G0 — Decisão arquitetural e modelo de ameaças

**Estado:** PASS para as decisões de arquitetura e para o início do protótipo G1.  
**Data da revisão:** 2026-11-03.  
**Escopo:** fixar o MVP antes de implementar identidade ou bridge. Nenhuma comunicação entre agentes está declarada como implementada por este documento.  
**Fontes reproduzidas e hashes:** [snapshots fixados](protocol-snapshots/README.md).

## 1. Decisão arquitetural ADR-AGENT-001

### Escopo do primeiro MVP

1. Conversa direta de texto entre duas identidades de agente independentes.
2. Pessoa e agente podem conversar quando a pessoa adiciona e autoriza explicitamente aquele agente.
3. A PWA humana continua utilizável sem agente; telas, mensagens e relays humanos não dependem da bridge.
4. Fora do primeiro MVP: execução de ferramentas remotas, shell, filesystem, browser automation, cadeia autônoma de tarefas, anexos, salas públicas de agentes, pagamentos, reputação, diretório global de agentes e delegação de chave humana.

### Identidade, pareamento e custódia

- Cada agente recebe uma chave Nostr aleatória própria, diferente da identidade humana e de qualquer outro agente. A identidade humana nunca é exportada para a bridge, host de IA ou contexto do modelo.
- O host local do agente cria a identidade e a guarda em cofre separado, cifrado com AES-GCM-256, salt aleatório de 16 bytes e PBKDF2-HMAC-SHA-256 com 600.000 iterações, reaproveitando o desenho e a implementação de cofre já presentes em `property/web/vault.js`. No primeiro alvo Ubuntu, `property-agent init` cria o cofre em `$XDG_DATA_HOME/property/agents/` (fallback `~/.local/share/property/agents/`), com diretório/arquivo restritos ao usuário; `property-agent unlock` lê a senha de um TTY controlado pelo usuário, sem argumento, ambiente, log ou stdout. O processo local mantém a chave em memória enquanto desbloqueado. O MCP stdio não recebe chave nem senha: encaminha tools por socket Unix local em `$XDG_RUNTIME_DIR`, com permissões somente para o usuário; socket ausente, cofre bloqueado ou escopo ausente falham fechados. Nenhum listener TCP é aberto. Adaptadores IPC/armazenamento de Windows e macOS permanecem PENDING até implementação e teste nativos em G7.
- Backup da chave do agente é uma ação explícita e exporta somente o formato de backup cifrado existente; perda da senha e do backup causa perda da identidade. Não há recuperação central.
- Pareamento começa por convite/QR/link gerado localmente. A PWA valida a assinatura do convite e mostra a chave pública completa/fingerprint e o rótulo “Agente” antes da pessoa aceitar. Nome e Agent Card são declarações do agente, não prova de identidade.
- A aprovação é por agente e conversa/contato, com permissões legíveis de leitura e envio de texto. Padrão: nenhuma permissão. Recusar, cancelar, bloquear e revogar são ações distintas e visíveis. Um pedido de nova permissão apenas cria solicitação pendente; nunca amplia o escopo automaticamente.
- A revogação bloqueia localmente novas leituras/envios na PWA assim que a pessoa a confirma e publica um controle NIP-17 assinado e cifrado para o agente. Uma bridge desconectada só aplica a revogação depois de receber esse controle; cópias já lidas por agente/relay não podem ser apagadas remotamente. A interface deve mostrar “revogação enviada/pendente” até haver confirmação do agente, sem prometer revogação instantânea fora do aparelho.

### Transporte privado e envelope

- Reutilizar o transporte implementado do Property: NIP-17, usando NIP-44 v2 e NIP-59. Não criar criptografia, NIP, kind, relay obrigatório ou backend próprios.
- O cliente consulta a lista kind 10050 e só publica para os relays de recebimento anunciados; o fallback não envia a mensagem para um relay arbitrário.
- Mensagens de agente usam kind 14 sob NIP-17 e um envelope JSON de aplicação versionado. O envelope v1 aceita somente os campos `protocol`, `version`, `conversation_id`, `message_id`, `in_reply_to` e `body`; IDs são 32 caracteres hexadecimais minúsculos. `body` é texto UTF-8 de até 8.192 bytes; o envelope serializado não pode exceder 16 KiB. Não há campos adicionais, profundidade JSON variável, anexos ou comandos.
- Conversas com agente só interpretam o envelope conhecido. Versão desconhecida, JSON inválido ou conteúdo sem envelope válido aparece como texto não confiável ou é rejeitado com mensagem clara. Nenhum link é aberto, imagem baixada, Markdown executado ou instrução convertida em chamada de ferramenta pelo parser.
- A deduplicação usa `message_id` e o ID do evento. Retentativas são idempotentes. A UI mostra estados comprováveis (por exemplo, “aguardando relay”, “aceita por 1 de 2 relays”, “resposta recebida”); não há estado “lida/entregue” sem recibo verificável.
- NIP-17 é draft. O corpo cifrado não equivale a anonimato: relays podem observar o evento externo, tags de roteamento do destinatário, IP, tamanho, conexões e padrões/horários de tráfego. O Property mostrará esses limites e não prometerá que “ninguém vê metadados”.

### Protocolos de agente e integração local

| Candidato | Decisão G0 |
|---|---|
| NIP-17 + NIP-44 v2 + NIP-59 | Adotar como transporte privado do primeiro MVP, reusando o cliente local existente. |
| Envelope `property-agent-message/v1` | Adotar somente como formato de aplicação dentro do texto NIP-17; não é um padrão Nostr nem promessa de interoperabilidade externa. |
| MCP | Adotar **2026-07-28**, transporte local stdio; implementar apenas `server/discover`, `tools/list` e `tools/call` com o conjunto fechado de tools abaixo. Nenhum HTTP, TCP público, endpoint remoto, prompts ou resources no MVP. |
| A2A 0.3.0 | Não implementar binding ou Agent Card interoperável no MVP; avaliar depois com dois agentes externos e a suíte correspondente. |
| NIP-89 | Não usar como prova de identidade ou pareamento. |
| NIP-90 | Não usar para conversa 1:1; a revisão consultada o marca como draft e não recomendado. |

Tools MCP permitidas: `property_status`, `property_list_approved_conversations`, `property_read_messages`, `property_send_message` e `property_request_human_approval`. A listagem e leitura se limitam à allowlist. Envio só admite texto ao contato aprovado e respeita tamanho/cota. Pedido de aprovação apenas cria uma solicitação; precisa de decisão humana na PWA. Não existem tools genéricas ou de assinatura arbitrária.

O subprocesso MCP lê JSON-RPC por stdin, escreve somente mensagens MCP por stdout e deixa diagnósticos em stderr. A ligação ao relay usa o código Nostr local e conexões iniciadas pelo processo do usuário. O executável/runtime e suas dependências serão versionados e conferidos no repositório; não haverá instalação nem carregamento de código em runtime via CDN. Para Ubuntu, o usuário desbloqueia explicitamente o daemon local antes de iniciar o host de IA; desligar o daemon bloqueia novas chamadas. Este passo deve aparecer no fluxo e ser avaliado no G1, sem instruções técnicas escondidas.

## 2. Fronteiras de dados e chaves

```text
Pessoa ── consente/revoga na PWA ── identidade humana (cofre existente)
  │                                      │
  │ mensagem NIP-17 cifrada              │ assina controles de permissão
  ▼                                      ▼
Relays escolhidos ◀──────────► agente local (chave própria, cofre próprio)
                                      ▲
                                      │ tools MCP fechadas por stdio
                                      ▼
                                  host de IA
```

O host de IA pode ler o conteúdo autorizado e conservar uma cópia em seu próprio histórico. O bridge não recebe a chave humana. Relays transportam envelopes cifrados e ainda observam metadados listados acima. GitHub Pages só serve a PWA estática.

## 3. Modelo de ameaças e mitigação verificável

| Ameaça/ativo | Mitigação decidida | Verificação prevista |
|---|---|---|
| Roubo ou exposição da chave humana | Chave nunca sai do cofre PWA; chave de agente separada; nenhum output/tool/log contém segredo. | G2: identidade distinta em cada fixture; G4: 25 chamadas de leitura/envio; G5: 50 violações de escopo e varredura de saídas/logs. |
| Agente ou convite personificado | Convite assinado pela chave do agente, QR/fingerprint visível, confirmação humana, allowlist e convite de uso único. | G2: 10 convites válidos, 10 inválidos/adulterados, 10 recusas, 10 revogações e 10 replays. |
| Mensagem hostil / prompt injection | Texto é dado não confiável; sem execução de tool, shell, link, arquivo ou instrução implícita; confirmação separada de ações. | G5: 100 fixtures adversariais e 50 violações de escopo, sem chamada não aprovada. |
| Replay, duplicação ou reordenação | IDs de mensagem/evento, idempotência e correlação explícita; estado não afirma entrega sem evidência. | G3: 10 casos adversariais; G5: 100 duplicatas/replays; G2: 10 replays de convite. |
| Relay malicioso, adulteração e retenção | Validar assinatura/autor antes do parser; conferir NIP-17; falhar fechado para identidade/versão inválida; explicar que exclusão remota não é garantida. | G3: 10 mensagens adulteradas/reordenadas e inspeção de relay; G5: corpus adversarial. |
| Excesso de payload ou consumo abusivo | Corpo até 8 KiB, envelope até 16 KiB, limite por chamada; 30 envios por agente por janela lógica de 60 s. O limite não será validado por espera real. | G3: 10 eventos fora de esquema; G5: 50 mensagens acima da cota usando relógio lógico fixo. |
| Vazamento de metadados | Exibir endereço do relay, tags/rotas, IP, volume/horários observáveis e limites de retenção; não dizer “anonimato”. | G3: comparar envelope no relay, corpo e UI; revisão do texto em G1/G6. |
| Bridge MCP abusada ou substituída | stdio sem listener de rede; conjunto fechado de tools; schemas estritos; logs em stderr; caminho de instalação/hash fixado. | G4: 10 tools fora de escopo, 10 inexistentes, 10 erros e 10 reinícios; G5: revisão independente do bridge. |
| Revogação atrasada em host desconectado | Bloqueio imediato no aparelho que revoga, controle assinado/cifrado, estado pendente explícito; não prometer apagar cópias nem ação em host offline. | G2/G5: 20 rotações/revogações em relógio lógico; G6: pessoa identifica o estado e os limites. |
| Regressão nas conversas humanas | Agente é opt-in e claramente rotulado; não altera identidade humana, lista de contatos nem fluxo NIP-17 humano. | G1/G6: mesmas tarefas humanas e critérios com participantes; G3: fluxo humano continua utilizável no cenário offline. |

O modelo não promete proteção contra malware ou administrador comprometendo o mesmo dispositivo/host já desbloqueado; esse risco é explicado e permanece fora do limite criptográfico do aplicativo.

## 4. Inventário de dependências relevante

- A PWA existente é JavaScript estático; Node.js 22+ é requisito documentado das suítes e será o runtime inicial da bridge local.
- A implementação de Nostr já está empacotada em `property/web/vendor/nostr-tools-2.25.2.bundle.js`, licenciada sob Unlicense e com SHA-256 `a7c4846fde84a0d6ce7596f3fcfc88435d29fdcd616887205ab97f9a16bc6407`. O código atual fornece `nip17.wrapManyEvents`, validação de evento e WebSocket local.
- O cofre já usa PBKDF2-HMAC-SHA-256 (600.000 iterações), salt de 16 bytes e AES-GCM-256; a bridge deve reutilizar esse desenho e manter cofre separado.
- MCP será uma implementação local mínima do subconjunto fixado, sem SDK de runtime/CDN. A conformidade será provada contra dois hosts e fixtures offline no G4; não declarar conformidade antes disso.
- Relay/teste usa Geode empacotado e fixtures existentes; nenhuma mainnet, pagamento ou relay público entra nos ensaios.
- As únicas cópias de especificação novas são os snapshots locais listados acima; nenhum processo de execução consulta URLs externas.

## 5. Resultado dos critérios G0

- Protocolo escolhido ou rejeitado com motivo: **PASS**, tabela acima.
- Chave humana não é requerida pelo agente e não é delegada: **PASS**, diagrama e limites acima.
- Criptografia customizada não introduzida: **PASS**, NIP-17/NIP-44/NIP-59 existentes e cofre local existente.
- Estados de consentimento, escopo, bloqueio e revogação definidos: **PASS**.
- Riscos críticos têm mitigação e casos contáveis mapeados aos gates posteriores: **PASS**.
- Dependências de runtime/versões e distribuição fechadas; não há execução de código remoto: **PASS**.
- G0 não aprova usabilidade humana nem habilita G2; G1 ainda exige protótipo e avaliação com pessoas reais.
