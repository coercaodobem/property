# Plano de comunicação entre agentes no Property

**Estado do produto:** comunicação direta entre agentes implementada em ensaio offline no G3; bridge local MCP, revisão independente, sessões humanas e compatibilidade multiplataforma continuam pendentes.
**Atualizado:** 2026-11-03.
**Escopo:** agentes conversando por meio do Property, com a interface e o controle humano como requisitos obrigatórios.

**Estado dos gates nesta execução:** G0 **PASS** ([decisão e ameaças](agent-messaging-g0.md), [snapshots e hashes](protocol-snapshots/README.md)); G1 permanece **PENDING** até concluir cinco sessões com pessoas reais e corrigir/repetir qualquer falha crítica. G2 **PASS técnico** e G3 **PASS técnico offline** têm evidências abaixo. A inspeção visual responsiva no Firefox foi executada e registrada, mas não substitui as sessões humanas. Por instrução expressa do responsável em 2026-11-03, G2–G7 podem avançar tecnicamente como se a pré-condição G1 estivesse aprovada, sem alterar o estado/evidência de G1 e sem dispensar o gate humano: G4–G7 ainda estão pendentes; nenhuma conclusão de piloto/pronto é válida enquanto G1 e G6 não passarem com pessoas reais. Consulte o [registro G1](evidence/agent-messaging/G1-20261103.md), o [registro da autorização de continuidade](evidence/agent-messaging/continuation-authorization-20261103.md), o [registro G2](evidence/agent-messaging/G2-20261103.md) e o [registro G3](evidence/agent-messaging/G3-20261103.md).

## 1. Objetivo

Permitir que uma pessoa conecte agentes de IA com facilidade e autorize conversas entre eles usando o Property e a rede Nostr. Cada agente deve ter uma identidade identificável, trocar mensagens privadas por relays escolhidos e operar somente dentro das permissões que a pessoa concedeu.

O Property continuará útil para pessoas que nunca conectem um agente. Um agente não pode tomar o lugar da pessoa, receber sua chave privada, aparecer como se fosse ela ou exigir que a pessoa aprenda MCP, NIPs ou configuração de relays para usar as funções humanas.

## 2. Estado atual e limite deste plano

O MVP tem interface web, identidade local, mensagens privadas NIP-17 e conexão direta a relays. O repositório já contém instruções para agentes de programação contribuírem com o código, como `AGENTS.md` e `CONTRIBUTING-WITH-AI.md`. Isso não significa que o produto já ofereça pareamento, API de agente, servidor MCP ou conversa entre agentes.

Este documento planeja trabalho futuro. Código, interfaces, esquemas, testes ou suporte de plataforma só passam a existir depois de implementados e aprovados nos gates correspondentes. Não há autorização implícita para movimentar fundos, publicar conteúdo em relays públicos ou enviar mensagens reais durante os testes.

## 3. Princípios de produto

1. **A experiência humana é um gate de produto.** Mensagens, contatos e fluxos humanos existentes continuam visíveis, compreensíveis e utilizáveis sem configuração de agente. Uma regressão crítica de UX bloqueia o gate, ainda que os testes de protocolo passem.
2. **Agentes são opcionais e reconhecíveis.** Convites, contas e conversas com agentes têm opt-in. A interface identifica claramente “agente”, a identidade Nostr correspondente e o que é verificado ou apenas declarado pelo próprio agente.
3. **A pessoa controla a autorização.** Mostrar quem pede acesso, quais conversas e ações serão permitidas, em quais relays, por quanto tempo ou até que condição. A autorização pode ser recusada, limitada e revogada na interface.
4. **Identidade de agente separada.** O MVP usa uma chave Nostr própria do agente, diferente da chave humana. A UI não permite que o agente se passe pela pessoa. Delegação para agir como pessoa fica fora do MVP e exige um desenho criptográfico separado.
5. **Mensagens recebidas são dados não confiáveis.** Nenhum texto, arquivo, link, perfil ou pedido recebido executa código, chama ferramentas, muda permissões ou inicia pagamentos por si só.
6. **Sem backend obrigatório.** O cliente mantém o modelo do Property: conexões diretas a relays escolhidos, sem servidor central de mensagens ou diretório indispensável. A indisponibilidade de um agente ou relay é mostrada sem criar fallback silencioso.
7. **Sem criptografia própria.** Reutilizar protocolos existentes após revisão da especificação e da implementação. Não alterar a criptografia de NIP-17 para acomodar metadados de tarefas.
8. **Pacote reproduzível e autocontido.** Código, especificações adotadas, versões, dependências e licenças necessárias ao runtime ficam fixados e auditáveis no repositório ou no pacote do Property. Nada baixa código executável de CDN, registry ou serviço upstream durante a execução.
9. **Disponibilidade honesta.** Relays armazenam e entregam eventos conforme suas políticas. A PWA pode ser suspensa no celular; não se promete execução móvel contínua nem resposta imediata de um agente offline.
10. **Acessível por padrão.** Fluxos de convite, consentimento, bloqueio e revogação precisam funcionar em tela pequena, com teclado, leitor de tela, foco visível, linguagem simples e contraste adequado.

## 4. Experiência humana que não pode regredir

As seguintes jornadas permanecem completas e sem etapas adicionais obrigatórias:

- abrir/criar ou desbloquear uma identidade humana e chegar à tela principal;
- encontrar ou adicionar um contato humano e iniciar uma conversa;
- ler, responder, apagar ou bloquear uma conversa conforme as capacidades existentes;
- usar Hangout e Marketplace sem ativar nem entender agentes;
- usar o Property em navegador móvel sem instalar ferramentas locais de agente.

### 4.1 Convite e pareamento propostos

1. Na ação existente de nova conversa, oferecer **Pessoa** e **Agente** como opções claras; manter Pessoa como caminho inicial e não esconder a nova conversa humana.
2. O agente compartilha um link ou QR de convite com sua `npub` e informações assinadas. Abrir o convite mostra um resumo em português, com identidade, origem do convite, capabilities declaradas e relays que seriam usados.
3. A UI distingue fatos verificados (por exemplo, assinatura válida da identidade) de alegações do perfil (nome, proprietário ou capacidades). Não inferir que um agente é confiável por usar o nome Property.
4. Antes do primeiro envio, a pessoa confirma o agente, escolhe os limites e vê uma prévia do que o agente poderá ler ou enviar. Cancelar e voltar à conversa humana são ações visíveis.
5. A conversa mostra um rótulo permanente de agente, estado de conexão explicado em linguagem comum e uma ação fácil para pausar, bloquear ou revogar o acesso. O primeiro envio precisa partir da pessoa; envelopes recebidos sem referência a um pedido local enviado são ignorados.
6. Sem bridge ou host de agente instalado, o humano ainda pode adicionar, identificar e conversar com contatos normalmente; a UI explica o requisito do agente sem erro técnico bruto.

### 4.2 Regras de apresentação

- Nunca misturar mensagens de agente e pessoa sem identificar o autor de cada mensagem.
- Mostrar “enviado ao relay”, “aguardando agente” ou “resposta recebida” apenas quando houver evidência correspondente. Um ACK de relay não prova entrega ou leitura pelo destinatário.
- Mostrar se a conversa é cifrada e qual identidade a envia; não usar cadeado ou selo de confiança sem definir seu significado verificável.
- Alertas de segurança devem explicar a decisão e oferecer uma ação direta; não mostrar JSON, stack traces, `npub` truncado sem opção de conferir, ou configuração de MCP como requisito para o uso humano.
- A pessoa pode silenciar ou bloquear agentes sem abandonar, excluir ou reconfigurar sua identidade humana.

## 5. Modelo funcional e limites do MVP

### 5.1 Identidades e autorização

- **Pessoa:** identidade humana atual do Property.
- **Agente:** identidade Nostr independente, com chave mantida por seu processo/host local.
- **Pareamento local:** registro de que a pessoa aprovou aquele `npub` e uma origem/host de agente neste aparelho. Não é prova universal de quem controla a chave.
- **Permissão:** lista explícita e revogável. O mínimo proposto para o MVP é leitura e envio em conversas individualmente aprovadas, sem acesso a outras conversas, Hangout, Marketplace, arquivos locais, shell, fundos ou configurações.
- **Limites:** allowlist de contatos/conversas, relays permitidos, tamanho e contagem de mensagens, tipo de conteúdo e validade definidos por política local. Limites são aplicados no bridge, não apenas declarados ao modelo.
- **Revogação:** bloqueia novos acessos locais imediatamente e remove a credencial do bridge. Não promete apagar cópias já lidas por um agente nem eventos já armazenados por relays.

### 5.2 Conversa e tarefas

- Começar com troca direta de mensagens de texto entre duas identidades de agente, e entre pessoa e agente, por opt-in.
- Cada mensagem de agente usa um envelope de aplicação versionado com, no mínimo, tipo, versão, identificador de conversa, identificador/idempotency key, relação pedido/resposta quando aplicável e corpo legível para uma pessoa.
- O parser rejeita conteúdo malformado, versão desconhecida, campos excessivos, corpo acima do limite e referência externa implícita. Mostrar fallback legível sem tentar executar o envelope.
- A primeira entrega não inclui chamadas de ferramentas remotas, execução de código, cadeia autônoma de tarefas, arquivos grandes, sala pública de agentes, pagamentos, reputação automática ou delegação da chave humana.

### 5.3 Protocolos e escolhas técnicas

O Gate G0 deve revisar e fixar as versões usadas. A decisão deve preservar fronteiras distintas:

**Arquitetura-base recomendada para o primeiro MVP:** manter NIP-17 como transporte de mensagem; dar a cada agente uma identidade Nostr própria; começar com conversas diretas curtas e um envelope de aplicação pequeno, versionado e legível; oferecer MCP local como adaptador opcional para hosts compatíveis. Avaliar o mapeamento com A2A antes de implementá-lo ou anunciar interoperabilidade. Isso mantém o primeiro fluxo simples e permite trocar o adaptador sem migrar o transporte nem alterar a UX humana. G0 só muda essa recomendação com evidência de interoperabilidade, segurança ou usabilidade.

| Necessidade | Direção inicial | Verificação obrigatória |
|---|---|---|
| Mensagem cifrada | Reavaliar a implementação existente de NIP-17 como transporte de mensagem direta | Conformidade, destinatário correto, metadados visíveis a relays, armazenamento e compatibilidade com clientes independentes |
| Semântica agente/tarefa | Comparar um envelope mínimo versionado com o modelo A2A; definir se haverá mapeamento | Prova entre duas implementações e documentação do que não é interoperável |
| Integração com host local de IA | Avaliar MCP local via `stdio` como adaptador de ferramentas | Versão fixada, identidade do host, consentimento, escopos, ciclo de vida do subprocesso e segurança do host |
| Descoberta | Começar com convite/link/QR explícito; avaliar NIP-89 para descoberta de aplicação, se útil | Não criar diretório central ou busca global obrigatória; testar falsificação e spam |
| Pedido de processamento amplo | Não adotar NIP-90 para chat 1:1 sem justificativa | Revisar escopo, estado e advertências vigentes da especificação antes de qualquer uso |

NIP-17 define o transporte de mensagens privadas do MVP e usa tags de roteamento; privacidade do corpo não deve ser descrita como ausência total de metadados. A documentação do produto deve indicar o que o relay e os participantes ainda conseguem observar. Não escolher kind Nostr novo, protocolo de descoberta próprio ou extensão de criptografia antes de uma decisão registrada (ADR) e revisão independente.

Na consulta de 2026-11-03, a especificação NIP-90 marcava o padrão como `draft` e `unrecommended`, e descrevia pedidos de computação sob demanda. Por isso, o plano não o escolhe para chat 1:1; esse estado deve ser verificado de novo no G0.

MCP e A2A cumprem papéis diferentes: avaliar MCP como interface local entre um host de IA e ferramentas do Property; avaliar A2A como modelo de cartão, capacidades e tarefas entre agentes. Não declarar que uma ponte customizada sobre Nostr é A2A interoperável sem passar pela suíte de interoperabilidade correspondente.

### 5.4 Bridge local para agentes

O caminho proposto para o primeiro protótipo é um processo local iniciado pelo host de IA, sem porta HTTP pública. A escolha final de linguagem e runtime fica para G0, considerando instalação simples nos sistemas visados, compatibilidade com o pacote autocontido e reaproveitamento do código Nostr local.

Contrato mínimo de tools, se MCP for aprovado:

- `property_status`: retorna estado e identidade de agente aprovada, sem segredos;
- `property_list_approved_conversations`: lista apenas conversas na allowlist;
- `property_read_messages`: lê uma conversa explicitamente permitida;
- `property_send_message`: envia texto para um contato autorizado, respeitando a política local;
- `property_request_human_approval`: solicita consentimento quando uma ação ou destino estiver fora do escopo.

O bridge não expõe ferramentas genéricas de shell, filesystem, chave, assinatura arbitrária ou publicação arbitrária de eventos. Chaves e segredos nunca entram no contexto do modelo, em argumentos de tool, logs, relatórios ou telemetria. Saída de diagnóstico vai para stderr; stdout fica reservado ao transporte MCP.

Se um host local não suportar MCP, o plano prevê uma SDK/CLI de mesmo contrato para uso direto do agente. A SDK não cria uma identidade invisível: a pessoa precisa identificar e aprovar a identidade do agente. Não criar um servidor remoto Property como atalho para agentes em nuvem.

## 6. Fases de implementação e gates

Os gates são sequenciais quando houver dependência. Um gate só passa com todos os critérios e evidências; `PENDING`, `BLOCKED`, falha crítica de UX ou teste parcial impede avanço normal do gate dependente. Exceção de execução registrada em 2026-11-03 por instrução expressa do responsável: enquanto G1 continua `PENDING`, a equipe pode executar G2–G7 tecnicamente como se G1 estivesse aprovada. Essa autorização não preenche dados de participantes, não muda G1 para PASS, não elimina a validação humana obrigatória e não autoriza declarar o piloto pronto. Todo gate continua limitado a evidências realmente produzidas; estados individuais continuam registrados como PASS, PENDING ou BLOCKED, sem promoção automática por esta exceção.

### Fase 0 — Descoberta, arquitetura e ameaça (G0)

**Entregáveis:** casos de uso prioritários, ADR de protocolos, diagrama de dados/chaves, threat model, glossário de estado de entrega e inventário das dependências/licenças.

**Trabalho:**

- Separar conversa humana-agente, conversa agente-agente e pedido estruturado de tarefa; escolher qual caso cabe no primeiro MVP.
- Inspecionar código Property existente e revisar as especificações oficiais NIP-17, NIP-89, NIP-90, A2A e MCP.
- Distinguir formato de aplicação, criptografia, transporte por relay e interface local de tools.
- Definir a identidade separada do agente, quem gera/guarda a chave, ciclo de recuperação, pareamento e revogação.
- Registrar riscos de prompt injection, personificação, replay, spam, vazamento por metadados, relays maliciosos, host MCP comprometido e mensagens retidas.
- Fixar snapshots ou cópias das especificações adotadas no repositório, com URL, versão/commit, data, licença e SHA-256. As fontes externas são referência de desenvolvimento, não dependência consultada pelo app em runtime.

**Gate G0 passa quando:** ADR seleciona (ou rejeita com motivo) cada protocolo candidato; modelo não exige chave humana no agente; nenhuma decisão de criptografia customizada fica aberta; fluxo de consentimento e limites tem estados definidos; riscos críticos têm mitigação testável; inventário do runtime não depende de instalação/download dinâmico.

### Fase 1 — Pesquisa de UX e protótipo navegável (G1)

**Entregáveis:** fluxos desktop/móvel, conteúdo de todos os estados, protótipo, guia de linguagem e relatório de sessões humanas.

**Tarefas fixas de pesquisa:** cinco participantes, pelo menos três sem experiência de desenvolvimento, cada um executa as mesmas tarefas: abrir conversa humana, reconhecer um contato agente, abrir convite, decidir permissões, cancelar, aprovar e depois revogar. O estudo é formativo, não prova estatística de usabilidade.

**Critérios G1:**

- todos distinguem agente de pessoa antes de responder;
- nenhum participante compartilha senha/chave privada nem autoriza uma permissão que não entendeu;
- nenhum erro crítico de destinatário, identidade ou escopo;
- ao menos quatro dos cinco concluem pareamento e revogação sem ajuda do pesquisador;
- tarefas humanas existentes não ganham etapas obrigatórias nem dependem de configuração técnica;
- achados críticos corrigidos e repetidos com o mesmo conjunto de tarefas; restantes registrados com plano e severidade.

Qualquer falha em permissão, identidade, destinatário ou uso básico humano reprova G1 até correção e repetição. Incluir pessoas com uso de leitor de tela/teclado em rodada de acessibilidade planejada; não substituir esta verificação por inspeção automatizada.

### Fase 2 — Identidade do agente e pareamento seguro (G2)

**Entregáveis:** fluxo de identidade separada, convite verificável, armazenamento local, allowlist, bloqueio e revogação.

**Cenários:** dois agentes sintéticos e duas identidades humanas sintéticas; validar relays pela allowlist sem abrir conexão de rede nesta fase. Repetir 10 convites válidos, 10 inválidos/adulterados, 10 recusas, 10 revogações e 10 tentativas de replay com semente e relógio lógico predeterminados. A conexão e o transporte pelos relays locais começam no G3; o fluxo G2 deve permanecer sem tráfego externo.

**Critérios G2:**

- cada agente tem chave diferente da pessoa e de outros agentes;
- link/QR é verificável, associado ao agente esperado, limitado a um uso e sujeito a validade testada com relógio lógico;
- aprovação cobre apenas as permissões exibidas e selecionadas;
- recusar, cancelar, bloquear e revogar têm resultado claro e não afetam as conversas humanas;
- chave inválida, perfil adulterado, convite repetido/expirado e relay não autorizado falham fechado;
- nenhuma chave, convite secreto ou conversa privada aparece em logs/evidência.

**Registro de execução:** implementação local de convite assinado, validação de alvo/relays/validade, consentimento por conversa, allowlist, recusa, bloqueio e revogação fica em `web/agent-pairing.js` e na tela opcional de perfil. O convite não abre conexão ou envia mensagem; o aviso de revogação permanece `não enviado` até o transporte ser implementado no G3. A evidência G2 separa testes técnicos determinísticos e browser da validação humana pendente em G1. Consulte [`G2-20261103.md`](evidence/agent-messaging/G2-20261103.md) e o relatório de browser em `evidence/agent-messaging/G2-browser/`.

### Fase 3 — Transporte de mensagem agente-agente (G3)

**Entregáveis:** integração com NIP-17 existente, envelope de aplicação versionado se G0 aprovar, estados de mensagem e fixture de interoperabilidade.

**Topologia offline:** PWA humana, dois processos agentes independentes e três relays Geode em rede local isolada. O caso não usa modelo pago, mainnet, relay público ou backend central.

**Cenários fixos:** 50 mensagens em cada direção; 20 respostas correlacionadas; três ciclos de reinício por agente; nove eventos de partição/reconexão; 10 mensagens duplicadas/adulteradas/reordenadas; 10 casos de versão/esquema desconhecido. Usar corpus e seed fixos; não usar duração ou espera real como critério.

**Critérios G3:**

- remetente e destinatário corretos; nenhum terceiro decifra;
- IDs, referência pedido/resposta, reconexão e deduplicação reconciliam sem perda ou duplicação na UI;
- relay só recebe os eventos previstos; plaintext/chaves não aparecem no relay nem em logs;
- statuses não afirmam entrega/leitura sem prova;
- conteúdo desconhecido é apresentado como texto não confiável ou rejeitado com explicação, sem executar ação;
- UI humana continua lendo, respondendo e bloqueando contatos humanos sem perfil de agente.

**Registro de execução:** G3 passou em ensaio técnico offline fixo no Ubuntu/Linux x64, com dois processos agentes independentes, três relays Geode isolados e a PWA em Firefox. O primeiro contato direto agente-pessoa foi iniciado pela pessoa; mensagens sem `in_reply_to` correspondente a um envio local anterior foram ignoradas antes de serem armazenadas ou exibidas. O relatório registra 360 casos, 100 mensagens cifradas na rede em ambas as direções, 20 respostas correlacionadas, três reinícios por agente, nove eventos de partição/reconexão e as contagens adversariais do gate. A suíte completa de smoke também passou. Consulte [`G3-20261103.md`](evidence/agent-messaging/G3-20261103.md), o [relatório Geode](evidence/agent-messaging/G3-geode-offline-report.json), os [testes de envelope](../tests/agent-messaging-smoke.mjs), a [captura do fluxo](evidence/agent-messaging/G3-browser/agent-direct-conversation.png) e o [smoke integral](evidence/agent-messaging/G3-full-smoke.log). A sessão automatizada não ficou controlada por service worker; isso não é critério de aprovação G3 e não é usado como evidência de controle offline do shell. A tentativa suplementar de Chromium caiu por limitação de recursos do ambiente e permanece pendente para a matriz G7; não é apresentada como aprovada.

### Fase 4 — Bridge MCP e SDK/CLI local (G4)

**Entregáveis:** pacote autocontido, setup assistido, configuração reproduzível por host, contrato de tools versionado e exemplo de agente de demonstração.

**Trabalho:** iniciar pelo protocolo/contrato independente do host; implementar somente tools aprovadas em G0; manter a chave do agente no cofre local; restringir cada chamada à identidade e conversas aprovadas; não expor endpoint de rede; incluir remoção/desconexão guiada.

**Cenários fixos:** 2 hosts MCP de referência, 2 agentes, 25 chamadas de leitura e 25 de envio por agente, 10 pedidos fora de escopo, 10 tentativas de tool inexistente, 10 desligamentos/reinícios e 10 respostas de erro. Testar também chamada simultânea e relay desconectado sem espera por timeout como critério de sucesso.

**Critérios G4:**

- nenhuma tool lista ou lê conversas fora da allowlist;
- nenhuma tool retorna chave privada, senha, token, arquivo arbitrário ou comando executável;
- envio usa destinatário e limite da aprovação visível; pedido fora do escopo exige ação humana e não tem fallback permissivo;
- instalação, atualização, remoção e falha do bridge têm instruções compreensíveis e não quebram o app sem bridge;
- a implementação e dependências são versionadas, licenciadas, empacotadas e verificadas sem baixar código durante uso.

### Fase 5 — Segurança, abuso e privacidade (G5)

**Entregáveis:** threat model atualizado, corpus adversarial, relatório de revisão independente, correções e limites por agente.

Testar 100 fixtures hostis fixas (prompt injection em texto/Markdown/URL, conteúdo de perfil falso, links maliciosos, JSON profundo, campos repetidos, payload grande, comandos embutidos e pedido de segredo); 100 replays/duplicatas; 50 violações de escopo; 50 mensagens acima de cota; 20 ciclos de rotação/revogação em relógio lógico. Validar todos os casos com saída de ferramentas e rede capturadas.

**Critérios G5:**

- mensagem hostil não aciona tool, exportação, relay novo, publicação pública, configuração ou pagamento;
- validação de assinatura e identidade ocorre antes de tratar perfil como autêntico;
- limites por agente, deduplicação, bloqueio e revogação são aplicados no ponto que assina/envia;
- auditoria diferencia corpo cifrado de metadados observáveis e documenta riscos residuais;
- nenhum defeito crítico/alto aberto; revisão independente cobre chave, bridge, consentimento e isolamento do agente;
- incidente/erro deixa a identidade humana e seus dados intactos.

### Fase 6 — UX, acessibilidade e não regressão (G6)

**Entregáveis:** nova rodada humana, regressão visual/responsiva, checklist de acessibilidade e comparação com tarefas do MVP atual.

Repetir as tarefas fixas de G1 com cinco participantes; executar ainda cinco ciclos de cada jornada humana principal em desktop e viewport móvel, testes de teclado/leitor de tela e revisão de mensagens de erro. Não usar emulação de viewport como alegação de teste físico iOS/Android.

**Critérios G6:**

- cinco de cinco identificam imediatamente quando estão falando com agente;
- zero erro crítico de contato, permissão ou revogação;
- ao menos quatro de cinco completam pareamento e primeira conversa sem explicação oral;
- conclusão das tarefas humanas principais não piora contra a linha de base em número de etapas, falhas ou entendimento;
- não há bloqueio de teclado/foco, controle sem rótulo ou estado sem alternativa compreensível;
- problemas de severidade alta corrigidos e testados de novo antes de seguir.

### Fase 7 — Compatibilidade, piloto e lançamento gradual (G7)

**Entregáveis:** matriz de compatibilidade, guias humanos e de agentes, release candidate reproduzível e procedimento de rollback.

- Executar primeiro no Ubuntu com runtimes locais e relays isolados, seguindo os gates fixos acima.
- No Ubuntu, validar o shell PWA em Firefox e Chromium: dez ciclos fixos de abertura/controle do service worker, dez ciclos de recarga com rede desabilitada e dez verificações dos recursos estáticos locais. Falha de controle/offline permanece pendente; emulação de viewport não conta como teste de dispositivo.
- Marcar testes Windows, macOS, Android e iOS como PENDING até serem executados nos ambientes correspondentes; não inferir suporte pelo build ou viewport.
- Comparar pelo menos duas implementações de agente contra o formato aprovado. Para qualquer alegação de conformidade A2A, executar e arquivar a suíte aplicável da especificação adotada.
- Pilotar opt-in para um grupo limitado de colaboradores; tornar reversível a desativação da função sem migração destrutiva de identidade ou mensagens humanas.
- Publicar somente após aprovação humana do diff e do relatório. O agente não publica versão, não faz push e não abre PR sozinho.

**Critérios G7:** todos os gates anteriores PASS, matriz publicada com PENDING claramente visível, artefatos e dependências com hashes, documentação em português, revisão humana e instruções para desativar/remover.

## 7. Plano de validação offline

### 7.1 Ambiente e repetibilidade

- Usar Geode real em processos isolados, rede local permitida e internet bloqueada.
- Inventariar commit, diff, OS, ferramentas, runtimes, dependências, hashes, topologia, seeds, relógio lógico e contagens no manifesto.
- Identidades, mensagens e permissões são sintéticas; segredos ficam em diretórios temporários privados.
- Repetir a mesma matriz e fixtures por contagem fixa. Não usar teste de 5h/24h, soak, intervalo mínimo, latência ou disponibilidade por tempo como critério de PASS.
- Testes com relay público, conta real, modelo remoto, pagamentos e aparelho não disponível são separados e não podem ser descritos como aprovados por este plano offline.

### 7.2 Evidência obrigatória por gate

Guardar relatório sanitizado com ID de caso, entrada/seed, contagem executada, resultado individual, commit, hash do plano, ambiente, mensagens de erro relevantes e SHA-256 dos artefatos. Não guardar chaves, senhas, payloads privados completos, tokens, dumps de memória ou saída bruta do modelo. O resumo declara PASS somente se 100% dos casos obrigatórios do gate passaram; qualquer parcial é `PENDING` ou `BLOCKED`, nunca PASS.

## 8. Critério de pronto do projeto

O MVP de comunicação entre agentes fica pronto para piloto somente quando G0–G7 estiverem completos, todos os casos obrigatórios passarem, a experiência humana tiver passado G1 e G6, não houver risco crítico/alto aberto, a documentação explicar metadados e limites, e o pacote funcionar sem fonte executável remota.

`PROPERTY_AGENT_MESSAGING_PILOT_PASS` não significa auditoria global de segurança, suporte de todos os sistemas, funcionamento móvel contínuo, compatibilidade com todo framework de IA ou garantia de que uma resposta de agente é correta. Cada uma dessas alegações exige evidência própria.

## 9. Pendências que G0 precisa resolver

1. Que combinação de NIP-17 e A2A dá interoperabilidade real sem trocar privacidade e UX por uma camada de protocolo excessiva?
2. Como gerar, armazenar, recuperar e remover uma identidade de agente em cada plataforma sem reutilizar a chave humana?
3. Como o pareamento local comprova a origem do host sem inventar uma autoridade central?
4. Que dados de Agent Card são úteis para pessoas, e quais devem ficar privados ou ser tratados como declarações não verificadas?
5. Qual runtime/SDK permite bridge local autocontida, assinada e suportável sem ferramenta global pré-instalada?
6. Como mostrar limites de leitura/envio e pedir aprovação sem interromper cada conversa humana nem permitir consentimento confuso?
7. Qual política de retenção e remoção pode ser prometida quando relays e agentes controlam cópias próprias?

Nenhuma resposta pode reduzir a identidade humana a uma credencial de agente nem introduzir uma conexão central obrigatória.

## 10. Referências primárias a revisar no Gate G0

As páginas online são referências de pesquisa e podem mudar; o gate deve fixar a revisão exata usada e arquivá-la no repositório antes da implementação.

- [NIP-17 — mensagens privadas Nostr](https://github.com/nostr-protocol/nips/blob/master/17.md)
- [NIP-89 — descoberta de aplicações que tratam eventos](https://github.com/nostr-protocol/nips/blob/master/89.md)
- [NIP-90 — Data Vending Machines](https://github.com/nostr-protocol/nips/blob/master/90.md)
- [Especificação A2A — Agent2Agent](https://a2a-protocol.org/latest/specification/)
- [MCP — transportes](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [MCP — práticas recomendadas de segurança](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)
