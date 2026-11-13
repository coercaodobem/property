# Plano vigente — mensagens entre agentes com UX humana

**Português (Brasil)** · [English](plano-agentes-human-first.md)


**Atualizado:** 2026-11-13.
**Branch-alvo:** `modelo-mvp`.
**Escopo:** comunicação direta entre agentes via Nostr/MCP, com a PWA humana simples, legível e segura.

Este plano descreve o fluxo vigente: agente conversa com qualquer identidade pública Nostr válida sem convite, pareamento, autorização de contato ou aprovação por mensagem. Evidências antigas de convite e concessão de escopo pertencem ao desenho anterior e não valem para os critérios abaixo. Resultados e pendências de cada execução ficam nos relatórios datados em [`evidence/agent-messaging/`](evidence/agent-messaging/).

## 1. Objetivo e experiência

O Property deve permitir que agentes locais conversem entre si por mensagens privadas NIP-17 e que uma pessoa converse diretamente com um agente usando a PWA. A pessoa não precisa instalar uma loja, aprender MCP ou conceder acesso amplo à conta para abrir uma conversa.

### Fluxo humano

1. A pessoa escolhe “Nova conversa” e informa `npub`, `nprofile`, chave pública hex ou link de contato Property; também pode escanear ou receber um QR/link em Perfil → Compartilhar contato. Abrir um contato compartilhado apenas preenche o destinatário. A pessoa abre explicitamente a conversa antes de qualquer mensagem ser enviada.
2. Se for conversa com agente, marca “Usar o protocolo de mensagens entre agentes”. A seleção vale somente para aquela conversa e apenas define o envelope usado.
3. O Property cria a conversa sem convite, aprovação ou permissão adicional. Agentes também podem iniciar a conversa com uma mensagem válida; a PWA a identifica e a lista separadamente.
4. A pessoa pode bloquear o agente localmente. Isso impede novos envios e recebimentos naquele aparelho e mantém o histórico. Desbloquear restaura o uso direto.

A escolha do protocolo não entrega ao agente a chave humana, as outras conversas, ferramentas, arquivos, configurações ou fundos. Texto recebido nunca é executado. O Property não exige confirmação por conversa ou por mensagem; aplicativos host MCP podem aplicar suas próprias políticas fora do controle do Property.

### Fluxo agente

O host MCP usa uma identidade Nostr independente, configura seus inbox relays e chama onze tools locais. Cinco cobrem estado, conversas, mensagens e atividade. Seis tools opcionais oferecem pagamentos XNO diretos e limitados depois que uma pessoa configura e arma uma carteira dedicada uma vez; as tools não pedem aprovação do Property por pagamento. O daemon local usa socket Unix; MCP usa stdio. Pagamentos diretos são irreversíveis e não são escrow.

## 2. Arquitetura e limites

- **Transporte:** NIP-17 com NIP-44 v2 e NIP-59, usando eventos kind 14 e gift wraps kind 1059.
- **Descoberta de inbox:** lista assinada kind 10050; até três relays por identidade. Se não houver lista do destino, o envio usa os relays inbox locais como rota disponível e informa apenas o ACK observado.
- **Envelope:** `property-agent-message/v1` com campos estritos para versão, conversa, mensagem, correlação e corpo de texto. Corpo até 8 KiB; envelope até 16 KiB.
- **Cota:** até 30 envios por agente por janela lógica fixa de 60 segundos. Ensaios avançam relógio lógico e contagem; não esperam a passagem de tempo real.
- **Bloqueio:** local ao aparelho/daemon. Não é aprovação nem cadastro obrigatório; bloqueia leitura/envio futuros e pode ser revertido. Não remove cópias anteriores de relays ou hosts.
- **MCP:** onze tools fixas: `property_status`, `property_list_conversations`, `property_read_messages`, `property_send_message`, `property_set_activity`, `property_xno_policy`, `property_xno_create_offer`, `property_xno_pay_offer`, `property_xno_trade_status`, `property_xno_verify_receipt` e `property_xno_dispute`. Atividade aceita somente `thinking` ou `stop`, sem estado textual livre. Nenhuma tool de aprovação, expansão de permissão, shell, filesystem, browser ou assinatura Nostr arbitrária. O adaptador fixo Nano pode fazer transferências diretas somente após configuração e ativação local únicas.
- **Privacidade:** chave humana nunca vai à bridge. Relays podem observar metadados do protocolo. O texto que um host de IA leu pode ser mantido pelo próprio host.
- **Plataformas:** neste plano, resultados Linux/Ubuntu não provam Windows, macOS, Android ou iOS. Sistemas não executados ficam `PENDING`.

## 3. Regras dos gates

Gates devem ser executados em ordem, com evidência completa, contagens fixas e casos negativos. Um gate dependente não começa enquanto seu predecessor não tiver passado, exceto pela autorização expressa do responsável em 2026-11-03 para continuar a execução técnica enquanto pendências de avaliação humana ficam `PENDING`. Essa exceção não inventa participantes, não muda pendências para `PASS` e não certifica lançamento.

- Critérios de sucesso são quantidades e variáveis definidas antes do teste; não usar soak, duração de sessão ou limite de latência como prova de aprovação.
- Watchdogs apenas encerram casos travados; nunca contam como sucesso.
- Ensaios de relay usam processos/identidades sintéticos, Geode local e loopback. Sem modelos externos, relays públicos, mensagens públicas ou dados pessoais.
- Não exportar chaves ou senhas. Não usar fundos reais. Evidência guarda hashes, contagens e estados necessários, sem segredo ou corpo privado real.
- Falha de código deve ser corrigida e o caso completo repetido; não marcar gate com execução parcial.
- Revisão humana e testes em pessoas só contam quando realizados de verdade. Sistemas sem máquina/dispositivo disponível permanecem `PENDING`.

## 4. Gates e critérios de aceite

### G0 — Decisão e ameaças

**Aceite:** ADR define identidade própria do agente, comunicação direta sem permissão por contato, transporte, cota, bloqueio local, fronteiras de dados e limites honestos. Hashes das especificações ficam versionados.
**Evidência:** [ADR vigente](agent-messaging-g0.pt-BR.md) e [snapshots fixados](protocol-snapshots/README.md).

### G1 — UX humana antes de piloto

**Participantes:** cinco pessoas, ao menos três sem experiência de desenvolvimento; não usar agentes sintéticos como substitutos. Cada pessoa realiza as mesmas tarefas: abrir conversa humana, reconhecer conversa de agente e seu `npub`, responder a uma primeira mensagem de agente, bloquear e desbloquear, localizar o limite de privacidade e continuar usando conversas humanas. Para o recurso opcional XNO, revisar também a configuração única `ARMAR` e explicar o teto, a transferência irreversível, a ausência de escrow e a diferença entre pagamento no ledger e entrega do produto. Não usar fundos reais.

**Aceite:** pelo menos quatro de cinco concluem o fluxo direto e o bloqueio sem ajuda; ninguém interpreta a seleção do protocolo como acesso à conta; alertas críticos de identidade/privacidade são compreendidos. Quem vir a configuração XNO deve entender que `ARMAR` permite pagamentos automáticos dentro dos limites locais e que não há entrega ou reembolso garantidos. Registrar falhas e corrigir/repetir as tarefas afetadas. Leitor de tela real e revisão independente são registrados separadamente.

**Estado:** sessões com pessoas reais permanecem `PENDING` até acontecerem. Não simular respostas nem declarar UX aprovada com base em automação.

### G2 — Identidade, inbox e bloqueio

**Casos:** identidade do agente diferente da humana; cofre local e permissões de arquivo; migração dos esquemas anteriores para configuração sem allowlist; 10 ciclos de bloqueio/desbloqueio com o mesmo par de chaves; 10 tentativas de leitura/envio durante bloqueio; validação de chave inválida, chave própria e relay inválido.

**Aceite:** nenhuma etapa de convite/pareamento; uma chave pública válida pode ser endereçada sem contato cadastrado; o bloqueio é local e reversível; migração preserva bloqueios, relays e cota aplicáveis sem restaurar permissões antigas. Segredos não aparecem em saída ou relatório.

### G3 — Mensagem direta NIP-17

**Ensaio offline:** dois processos agentes, três relays Geode isolados e uma PWA no Firefox/Ubuntu. Usar duas identidades sintéticas e um seed fixo.

**Contagens:** 50 mensagens por direção; 20 respostas correlacionadas; três reinícios por agente; nove eventos de partição/reconexão; dez casos de duplicata, adulteração, reordenação e versão desconhecida; 20 tentativas de descriptografia por terceiro.

**Caminho humano:** agente envia a primeira mensagem sem conversa prévia nem pedido humano; PWA cria e rotula a conversa; pessoa responde; agente lê a resposta e envia resposta correlacionada. Conversa humana já existente permanece intacta.

**Aceite:** destinatários leem, terceiros não; relay armazena somente gift wraps cifrados; duplicatas não reaparecem; nenhum evento sem envelope válido é tratado como comando. Relatório mais recente deve registrar exatamente os casos executados.

### G4 — MCP local

**Ensaio offline:** dois processos agentes, dois clientes MCP fixture, um Geode loopback. Inventário fechado com onze tools; as cinco de estado/mensagens/atividade e as seis opcionais XNO devem ser inventariadas separadamente.

**Contagens:** por agente, 25 leituras e 25 envios; 12 eventos thinking/stop (cinco pares de início/fim mais um estado thinking encerrado pelo lock do daemon); 10 leituras diretas sem cadastro; ao menos um envio a uma identidade válida ainda não cadastrada; duas chamadas simultâneas; 10 chamadas de tools inexistentes; 10 ciclos de reinício stdio; 10 erros de relay indisponível; bloquear/desbloquear e verificar leitura/envio.

**Aceite:** identidade pública independente, sem segredos; inbox consulta somente mensagens recebidas por aquela identidade; envio não requer aprovação Property; sinais de atividade contêm somente o estado fixo, são criptografados e efêmeros, limitados a 30 estados/renovações `thinking` por agente por janela lógica fixa de 60 segundos, param após mensagem/bloqueio do daemon quando possível e não ficam retidos no relay; nenhuma fila/tool de aprovação ou allowlist; sem listener TCP. ACK só é relatado como aceitação do relay. Hosts comerciais não são simulados.

### G5 — Segurança adversarial

**Contagens:** 100 textos hostis em categorias fixadas (prompt injection, links, redirecionamento, perfil personificado, JSON profundo/duplicado, excesso de payload, comandos embutidos e pedido de segredo); 100 cópias replay; 50 tentativas acima da cota; 20 ciclos locais de bloqueio/desbloqueio; 30 envios válidos antes do limite.

**Aceite:** nenhum texto recebido inicia ferramenta, shell, rede, alteração de política ou leitura de segredo; parsing e assinatura inválidos falham fechados; limite de bytes e quota são aplicados; bloqueio afeta somente o par local. Revisão de segurança independente continua exigida e não pode ser substituída por este ensaio.

### G6 — UX automatizada em navegador

**Matriz Ubuntu:** Firefox fixado, cinco ciclos `1280×900` e cinco ciclos com viewport móvel `390×844`. Cada ciclo começa com perfil descartável. Bloquear todas as requisições externas.

**Verificar:** criação de conversa por `npub`, seleção do protocolo sem concessão de acesso, ausência de telas/ferramentas de aprovação, rótulos e nome acessível, operação por teclado, preservação de conversa humana, bloqueio/desbloqueio, composer desabilitado enquanto bloqueado e restauração depois do desbloqueio.

**Aceite:** dez ciclos completos, sem erros de página nem requisições externas. Isso é validação automatizada de tela, não validação com pessoa, leitor de tela ou dispositivo físico.

### G7 — Interoperabilidade e outras plataformas

Validar integrações com ao menos duas implementações independentes de agente/cliente antes de alegar interoperabilidade. Executar matriz nativa Windows, macOS, Android e iOS somente quando esses ambientes estiverem disponíveis; registrar navegador, versão, aparelho, instalação PWA, relays e casos repetidos.

**Estado:** resultados ausentes permanecem `PENDING`; não impedem que os gates Ubuntu aplicáveis avancem, mas impedem qualquer afirmação de suporte multiplataforma ou interoperabilidade não medida.

### G8 — Máquina de estados de ofertas e trocas XNO entre agentes

**Ensaio offline:** identidades Nostr sintéticas fixas, transporte NIP-17 em memória, wallet Nano sintética, seed e relógio lógico fixos. Sem fundos reais, rede Nano ao vivo ou relay público.

**Contagens:** executar os 28 casos de `node property/tests/agent-xno-trades-smoke.mjs`, incluindo ofertas/recibos malformados, forjados e expirados, limites de valor, orçamento esgotado/diário adulterado, resposta de envio perdida e repetição idempotente, gate de confirmação, resposta de recebimento perdida e repetição, recibo duplicado, disputa sem congelar fundos, diário cifrado em repouso e verificação fechada contra adulteração.

**Aceite:** todos os casos declarados passam; no máximo um envio e um recebimento sintéticos são registrados; pagamento não confirmado nunca é recebido; o relatório não contém segredo; escrow permanece falso. Isso valida apenas o fluxo modelado, não a rede Nano ou entrega justa.

### G9 — Adaptador RPC da carteira Nano

**Ensaio offline:** servidor RPC sintético autenticado vinculado somente a `127.0.0.1`; fixtures fixos de rede dev/conta. Sem rede externa, carteira real, seed ou fundos.

**Contagens:** executar os 14 casos de `node property/tests/agent-nano-wallet-smoke.mjs`: rede/conta/carteira, teto do valor raw, idempotência por mesmo ID, destino/valor errado, confirmação pendente, validação exata de recebimento, resposta perdida recuperada pelo histórico da conta sem segunda chamada `receive`, rede errada, recusa de carteira multi-conta, recusa de RPC remoto/localhost e gateway sem autenticação.

**Aceite:** os 14 casos passam; fixture registra no máximo um envio e uma ação sintética `receive`; a recuperação encontra o bloco exato de recebimento confirmado; nenhum tráfego externo ou fundo real. Este gate não aprova RPC da carteira Nano embutida para produção.

## 5. Entregáveis e registros

Cada execução concluída deve adicionar um relatório datado com commit de origem, comando, seed, versões/hashes do runtime, variáveis e contagens, PASS/FAIL por caso, tráfego externo observado, limites e pendências. Imagens de tela devem usar apenas identidades descartáveis. Relatórios antigos do fluxo com convite ficam preservados como história, claramente separados da evidência direta atual.

- Implementação MCP e instalação: [`../agent/README.md`](../agent/README.md).
- Testes determinísticos e harnesses: [`../tests/`](../tests/).
- Relatórios correntes G3/G4/G5/G6/G8/G9: [`evidence/agent-messaging/`](evidence/agent-messaging/).
- Testes com Windows/macOS/Android/iOS, pessoas reais, leitor de tela, hosts MCP comerciais, integração de carteira para produção e revisão independente: manter `PENDING` até executar.
