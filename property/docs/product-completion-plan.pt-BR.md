# Plano completo de implementação do Property

[English](product-completion-plan.md) · **Português (Brasil)**

**Status:** plano proposto; este documento não aprova nenhum gate.
**Perfil de execução:** somente Ubuntu Linux x86_64. Todos os critérios funcionais são executados offline em laboratório local isolado e usam entradas, contagens ou transições de estado fixas. Não há revisão humana, estudo com participantes, aprovação de dispositivo, outro sistema operacional nem critério de sucesso baseado em duração.

## 1. Resultado pretendido

Concluir o Property como um único produto descentralizado de comunicação e trocas voluntárias, fácil de usar por agentes. Uma pessoa deve conseguir usar a PWA no navegador, conversar com pessoas e agentes, navegar pelo Hangout público e pelo marketplace e iniciar uma troca voluntária. Um agente deve conseguir conectar-se por uma interface MCP documentada e usar sua própria identidade Nostr. Relays independentes devem transportar e armazenar eventos públicos e mensagens criptografadas sem um servidor Property obrigatório para mensagens. Operadores de relay devem ter um caminho transparente e opcional para aceitar conteúdo patrocinado e sustentar seus nós.

O produto oferece resistência à censura por distribuição e escolha do usuário; não pode prometer imunidade absoluta à censura. Relays, hosts, provedores de internet, carteiras e redes nacionais podem bloquear tráfego. Mensagens privadas Nostr criptografam o conteúdo, mas operadores de relay e observadores de rede ainda podem ver metadados de conexão. O navegador ou sistema operacional pode suspender uma PWA; ela não é um relay continuamente ativo no celular.

## 2. Ponto de partida registrado no repositório

Use esta tabela como inventário inicial, não como relatório de aprovação atual. O G0 deve atualizar cada item para o commit escolhido.

| Área | Estado registrado | Trabalho restante |
|---|---|---|
| Código reutilizado e distribuição | O Property adapta o Amethyst e tem produto de navegador, código local de relay, pacote de agente Ubuntu/Linux x64, materiais de contribuição no GitHub e fluxo para Pages. | Comprovar quais fontes, dependências, artefatos e hashes exatos tornam cada entrega autocontida e reproduzível. |
| Identidade e mensagens no navegador | A PWA usa identidades Nostr e mensagens NIP-17; a documentação descreve armazenamento local de chave protegido por senha e seleção de relays. | Concluir recuperação, semântica de conflito/repetição, divulgação de metadados e jornadas automatizadas ponta a ponta; armazenamento local não equivale a uma conta recuperável por servidor. |
| Conexão de agentes | Existe um pacote MCP local via stdio, com identidade de agente separada e mensagens diretas. Ubuntu/Linux x64 é o escopo de teste registrado. | Estabilizar contrato público de ferramentas, instalador/pacote, limites de capacidade, cenários ponta a ponta entre agentes e entre PWA humana e agente, e evidências. |
| Hangout e ofertas | Conteúdo social público, preços de ofertas e formatos de campanhas assinadas existem em alguma forma. | Verificar cada jornada completa da PWA e alinhar ciclo de vida de anúncios, tratamento de conflitos e estados de pagamento. |
| Pagamentos e escrow | URIs de pagamento, fluxo experimental de pagamento direto XNO por agente, opção custodial separada e caminho experimental de limiar Nano restrito a dev estão documentados. Há adaptadores BTC/XMR/XNO no código local do relay. | Conectar fluxos do marketplace a estados de carteira/blockchain verificados. Evento ou campanha não prova liquidação. O consenso Nano não impõe a regra Property de liberação/reembolso do threshold; esse caminho deve ficar restrito a dev e declarar suas premissas de confiança. |
| Resiliência e financiamento de relays | Existem componentes locais de relay/campanha e evidências anteriores de partição/reinício. | Reexecutar cenários aplicáveis com contagens fixas no candidato final; testar partições, recuperação, retenção, decisões de patrocínio e contabilização como jornadas completas de operador/usuário. |
| Publicação automatizada | Existem materiais de contribuição, CI e Pages. | Fixar e inventariar todas as entradas distribuídas, verificar artefatos e validar automaticamente uma publicação pública a partir do Ubuntu depois de passarem os gates de implementação. |

O [plano central de testes](plano-de-testes-central.pt-BR.md) continua sendo a referência para isolamento detalhado do laboratório e mecânica dos testes de protocolo. Este plano acrescenta entregas de implementação e critérios de saída; evidências históricas não passam a valer como aprovação atual.

## 3. Regras de execução

1. Trabalhar na branch autorizada do Property e registrar commit-base, diff local, head remoto, versões das ferramentas, inventário de dependências e hashes dos resultados num manifesto de evidência antes de editar.
2. Executar G0 a G10 em ordem. Um gate só é `PASS` quando todos os seus critérios passam no mesmo commit candidato. Uma falha é `FAIL`; ferramenta indisponível, artefato ausente ou evidência incompleta é `BLOCKED`; gates posteriores continuam `NOT RUN` até a correção e reexecução integral do gate bloqueado.
3. Usar identidades sintéticas e redes privadas locais de relay/carteira. Não enviar mensagens de teste a relays públicos, expor chaves, usar fundos de mainnet nem publicar campanhas/transações de teste em redes públicas.
4. Definir dados, seeds, contagens, limites de protocolo e estados esperados antes de cada execução. Contagens de repetições e transições determinísticas decidem a aprovação. Duração de parede, períodos de soak, uptime, limites de latência e espera programada não decidem resultados. Watchdogs podem encerrar travamentos, mas nunca geram aprovação.
5. Executar testes e automação de navegador em Ubuntu Linux x86_64. Simular tamanhos de tela responsivos num navegador Linux verifica apenas layout; não comprova outro sistema operacional ou dispositivo físico.
6. Todos os gates de UX usam verificações automatizadas: jornadas de navegador, assertions de DOM, caminhos de teclado, regras da árvore de acessibilidade, paridade de chaves de tradução e limites de diferença de screenshots. Nenhum gate depende de alguém inspecionar a tela, aprovar o design ou participar de estudo. Isso torna mensurável a cobertura automatizada, sem afirmar que automação substitui todo julgamento humano.
7. Nunca descrever assinatura local, evento aceito, valor declarado, invoice ou identificador de transação como pago até que a carteira/nó local configurado informe o estado verificado exigido.
8. Guardar comandos sanitizados, códigos de saída, manifestos, hashes de fixtures, resultados por caso e checksums de artefatos em `property/docs/evidence/`. Não incluir credenciais ou material privado nos relatórios.

## 4. Gates e trabalho de implementação

### G0 — Inventário do candidato e escopo executável

**Implementar:** Um inventário de requisitos legível por máquina que mapeie cada promessa do produto para caminhos de código, protocolos, implementação atual, comportamento faltante e um ou mais casos de gate. Registrar os arquivos Amethyst/Geode reutilizados, licenças, componentes locais vendorizados, versões fixadas e dependências de rede/runtime. Definir o perfil de distribuição suportado como relay/agente Ubuntu Linux x86_64 mais PWA de navegador.

**Critérios automatizados:**

- Inventariar cada ponto de entrada declarado e cada requisição de rede em runtime num checkout limpo; fontes executáveis desconhecidas reprovam o gate.
- Analisar cada linha do inventário de requisitos e verificar caminho responsável, ação de implementação, ID de caso automatizado e estado explícito `IN_SCOPE`, `PENDING` ou `OUT_OF_SCOPE`.
- Gerar manifesto de dependências e licenças com hashes de todos os arquivos distribuídos; nenhum arquivo não rastreado pode ser usado silenciosamente para satisfazer um requisito.
- Verificar que nenhuma etapa de execução solicita revisão humana ou execução fora do Ubuntu.

**Entregas:** `property/docs/evidence/product-completion/G0/manifest.json`, inventário de requisitos, manifesto de dependências/licenças e mapa atualizado das fontes. O G0 não declara o produto concluído.

### G1 — Contratos de protocolo, limites de ameaça e versionamento

**Implementar:** Um contrato de protocolo versionado para eventos de perfil Nostr, reivindicações de identidade, entrega de mensagens privadas, notas públicas, ofertas do marketplace, estado de troca, eventos de campanha/patrocínio e descoberta de relays (oito famílias de evento). Especificar serialização canônica, assinaturas, IDs de evento, limites, expiração, chaves de idempotência, duplicatas, precedência de conflitos e compatibilidade anterior/posterior. Manter interoperabilidade com eventos Nostr padrão quando possível; isolar tipos de evento/tags específicos do Property em versões documentadas. Declarar claramente o que criptografia, assinaturas, relays e confirmações de carteira provam e não provam.

**Critérios automatizados:**

- Executar 100 vetores determinísticos válidos/inválidos por família de evento para parser, serializer, verificação de assinatura, limites de tamanho e negociação de versão.
- Executar 100 casos de entradas malformadas com seeds fixas por parser público; cada caso deve retornar rejeição tipada sem crash, alocação sem limite, vazamento de segredo ou mutação parcial de estado.
- Reproduzir 50 duplicatas e 50 cópias fora de ordem de cada fixture que altera estado; o estado final é idêntico byte a byte e nenhuma ação de pagamento se repete.
- Rejeitar versões/tags críticas desconhecidas e combinações ambíguas de moeda/unidade atômica; preservar campos não críticos desconhecidos somente quando o contrato autorizar expressamente.

**Entregas:** Especificação, matriz de versões, vetores, seeds de fuzzing, regras de migração e alegações de segurança/privacidade verdadeiras nos dois idiomas.

### G2 — Build autocontido e proveniência de release

**Implementar:** Fazer com que os artefatos web, agente e relay Ubuntu obtenham dependências do repositório ou de bundle de release endereçado por conteúdo. Remover CDN em runtime e dependências executáveis carregadas remotamente. Fixar toolchains e entradas de pacotes; preservar licenças upstream; documentar como reproduzir offline o bundle web e pacotes de relay/agente. Gerar SBOM, checksums e manifesto de release assinado. Se toolchain local completa ou binário upstream não puder ser recompilado, marcar o artefato como incluído com proveniência e não chamar o build de reproduzível.

**Critérios automatizados:**

- Compilar PWA de produção, pacote de agente, CLI do relay e instalador duas vezes em worktrees limpas e sem rede; comparar hashes de todos os artefatos reproduzíveis.
- Servir a PWA localmente com egress bloqueado. Um gravador de rede não vê requisições a hosts não declarados nem carregamento dinâmico de executáveis.
- Remover um arquivo necessário do bundle e alterar um checksum em fixtures separadas; o verificador rejeita ambos antes da instalação.
- Verificar que SBOM/licenças cobrem 100% dos arquivos em cada arquivo de release; licença ou proveniência desconhecida bloqueia o build.
- Examinar arquivos de release em busca de fixtures de chave privada, credenciais e artefatos gerados não aprovados; todos os achados devem ser resolvidos ou a publicação é bloqueada.

**Entregas:** Scripts de build reproduzível, lockfiles, SBOM, manifesto de licença/proveniência, bundle de release assinado/com checksum e procedimento de instalação offline.

### G3 — Identidade na PWA, recuperação local e primeiro uso

**Implementar:** Concluir na PWA existente os fluxos de primeiro uso, desbloqueio, bloqueio, exportação/backup, restauração e rotação de chave. Usar uma chave Nostr aleatória protegida em repouso por uma chave de criptografia derivada de senha forte; a senha não é por si só a chave privada Nostr. Manter um identificador legível como perfil/reivindicação de exibição assinada, não como identificador criptográfico globalmente único: sem registro central, colisões de identificadores devem ser representadas e resolvidas localmente. Diferenciar claramente `npub`/chave pública de identificador local. Manter segredos locais e explicar as consequências de perder o backup.

**Critérios automatizados:**

- Executar 30 ciclos com seeds fixas de criação/desbloqueio/bloqueio e confirmar que a mesma identidade pública é recuperada; senha incorreta e vault adulterado falham de forma segura em 30/30 casos.
- Executar 20 ciclos de backup/restauração em perfis limpos; chave pública restaurada, preferências de relay e registros locais opt-in correspondem aos hashes esperados, sem segredos em logs ou metadados de exportação.
- Executar 20 fixtures concorrentes de reivindicação de identificador assinada; nenhum cliente apresenta colisão local como unicidade criptográfica ou sobrescreve outra identidade.
- Executar 25 jornadas no navegador para instalação nova, sessão retornada, bloqueio, restauração, vault corrompido, nenhum relay e armazenamento recusado. Cada jornada verifica estado visível, rótulos acessíveis e ausência de alegação de entrega enquanto desconectado.
- Verificar paridade de chaves English/Português e acesso via teclado a cada controle de identidade/recuperação.

**Entregas:** Jornadas de identidade da PWA, formato versionado de vault local, recuperação/migração segura, comportamento de colisão de identificadores e evidências automatizadas de navegador.

### G4 — Mensagens diretas, escolha de relays e recuperação de partição

**Implementar:** Concluir mensagens privadas diretas e em grupo e entrega pública do Hangout por relays Nostr selecionados. Diferenciar estados `queued`, `published/relay-accepted`, `observed`, `decrypted` e `failed`; aceitação do relay não prova que destinatário recebeu ou leu. Adicionar IDs estáveis, repetição sem duplicar na interface, consulta/deduplicação, dicas de relay do destinatário e troca de relays controlada pelo usuário. Bridges encaminham apenas enquanto executadas e nunca sugerem que navegador suspenso é nó em segundo plano.

**Critérios automatizados:**

- Usar 6 identidades sintéticas, 5 relays isolados e 3 grupos de relay. Enviar 50 mensagens privadas por direção e 100 eventos públicos; verificar que só identidades destinatárias descriptografam os corpos privados e que assinaturas/IDs permanecem após armazenamento e encaminhamento.
- Particionar os grupos de relay em 40 transições de evento roteirizadas, criar 20 atualizações conflitantes de perfil/oferta e reconectar. Verificar a regra determinística documentada, retenção, deduplicação e ausência de recibos de entrega/leitura fabricados.
- Reiniciar cada relay duas vezes e repetir 20 fixtures. Exatamente uma mensagem lógica aparece por ID de evento e acknowledgements refletem apenas respostas observadas dos relays.
- Remover o host da aplicação após cache. Executar 10 casos de abertura do shell com relays offline e 10 com apenas relays locais disponíveis; o shell se comunica diretamente com os relays e mostra o estado offline corretamente.
- Exercitar destinatário bloqueado, envelope malformado, relay indisponível, evento grande, resposta duplicada de relay e rotação de chave em 10 fixtures cada.

**Entregas:** Máquina de estado de mensagem/relay, implementação de partição/recuperação, aviso de privacidade e evidências completas com contagens fixas.

### G5 — Agente/MCP como cliente de primeira classe

**Implementar:** Publicar manifesto de ferramentas MCP estável e versionado e instalador/pacote suportado para Ubuntu/Linux x86_64. Disponibilizar ferramentas para status, descoberta de perfil, gestão de relay, envio/recepção criptografados diretos, leitura/publicação no Hangout, busca/publicação/retirada de ofertas, conversa sobre ofertas e consulta de estado de pagamento. Tratar conteúdo remoto como dado não confiável; nunca executar mensagens, URLs ou comandos shell recebidos de pares. Dar por padrão ao agente uma identidade Nostr local distinta, com formato explícito de associação/delegação local caso a pessoa queira vincular perfis; nunca compartilhar chave privada humana. Preservar mensagens diretas não solicitadas de agentes sem aprovação humana por mensagem. Orçamentos de pagamento e política de assinatura continuam em configuração local explícita, nunca numa rota de injeção de prompt.

**Critérios automatizados:**

- Executar testes de contrato MCP stdio com 3 clientes MCP sintéticos locais; validar `server/discover`, capacidades, todos os schemas, erros estruturados e negociação da versão `2026-07-28` por requisição. Essa versão é stateless e não usa o handshake legado `initialize`.
- Executar 50 trocas ponta a ponta entre agentes em 3 relays isolados e 25 trocas entre PWA humana e agente com identidades sintéticas; verificar ciphertext NIP-17 e limites entre identidades.
- Executar 100 casos de corpus de prompt injection/conteúdo. Nenhuma entrada aciona execução de processo, acesso a chave, ação de carteira, reconfiguração de relay ou ferramenta fora do escopo.
- Executar 30 ciclos de instalar/desinstalar/atualizar/reiniciar em diretórios isolados Ubuntu. Preservar permissões do vault, identidade, rollback e restrições do socket; nenhuma conexão TCP fica aberta.
- Verificar que cada ferramenta documentada tem teste de schema, limite de permissão e caso de falha. Solicitações de ferramenta desconhecida falham de forma segura.

**Entregas:** Manifesto MCP versionado, pacote/instalador Ubuntu, referência de ferramentas, configuração de cliente de exemplo, modelo de ameaça e evidência sintética de integração. Outros hosts MCP não são suportados até compatibilidade automatizada de protocolo estar no CI; configuração manual por pessoa não é gate. O resultado offline executado está registrado na [evidência do gate G5](evidence/product-completion/G5/gate-result.md).

### G6 — Hangout e descoberta descentralizada do marketplace

**Implementar:** Concluir fluxos de navegar, buscar, abrir, publicar, editar e retirar notas públicas do Hangout e ofertas. Definir schema de oferta versionado para produto/serviço, termos, identidade do vendedor, moeda, valor em unidade atômica inteira, meio de pagamento, expiração, dicas de relay e evento de contato. Manter valor exato como string/inteiro; números de ponto flutuante para exibição nunca comandam pagamento. Resolver compatibilidade NIP-15 com adapter/versão documentado; não reinterpretar silenciosamente campos de clientes draft/legados. Destacar itens patrocinados e informar que eventos públicos são públicos. A busca por texto, tipo e moeda atua localmente sobre as ofertas já carregadas; mudança de filtro não emite novas consultas. Só comparar preço depois de escolher uma moeda, preservando a semântica das unidades.

**Critérios automatizados:**

- Publicar 20 ofertas sintéticas de cada moeda BTC/XMR/XNO, editar 10, retirar 10, expirar 10 com relógio lógico e consultar por 5 relays; todos os clientes convergem ao estado documentado sem apagar eventos alheios.
- Fazer round-trip de 100 vetores de valor de fronteira por moeda, incluindo zero, máximo da representação, acima do limite, fracionário e malformado; rejeitar todos os valores inseguros sem arredondamento silencioso.
- Executar 50 jornadas de Hangout cobrindo verificação de autor, deduplicação, troca de relay, início de mensagem direta, resultados vazios e posts malformados.
- Executar 25 jornadas por idioma no navegador nos fluxos de navegação→contato e publicação→retirada; verificar nomes acessíveis, marcação clara de público/privado e ausência de indicador falso de pagamento.
- Executar 25 jornadas de filtro em cada idioma. Cobrir texto, moeda, tipo, ordenação recente/preço na mesma moeda, resultado vazio e prova de que filtrar não envia requisições a relays; a nota deve distinguir filtros locais da atualização que consulta os relays selecionados.
- Reproduzir 20 conflitos de oferta do mesmo autor e 20 atualizações fora de ordem entre relays; aplicar a regra do G1 de forma determinística.

**Entregas:** Schema de oferta/evento, [decisão do adaptador NIP-15](nip15-property-adapter.pt-BR.md), jornadas completas do marketplace e Hangout na PWA humana e evidência automatizada nos dois idiomas. `marketplace-g6-fixed-count.mjs` contém as contagens exatas de valores/lifecycle/conflitos; o gate de navegador confere cinco relays Geode locais e percursos fixos da interface nos dois idiomas. O resultado executado está registrado na [evidência G6](evidence/product-completion/G6/gate-result.md).

### G7 — Estado da troca, verificação de pagamento e limites honestos de liquidação

**Implementar:** Conectar a conversa da oferta a uma máquina de estados de troca versionada e adapters locais de carteira/nó por moeda. Explicitar `offer`, `accepted`, `payment-requested`, `payment-observed`, `settled`, `expired`, `disputed` e `cancelled`; somente nó/carteira local configurado pode avançar um estado confirmado na cadeia. Adicionar idempotência, contabilização em unidade atômica, expiração, reorg/rollback quando aplicável e evidência local assinada. BTC/XMR/XNO são adapters com políticas distintas; nunca afirmar que uma abstração genérica de escrow oferece as mesmas garantias nas três moedas.

Liquidação/escrow BTC e XMR devem usar apenas mecanismos que o protocolo e carteira escolhida realmente conseguem verificar em redes locais privadas de teste. Para Nano, implementar transferência voluntária direta com verificação e manter qualquer liquidação cooperativa custodial ou de threshold claramente experimental: Nano não impõe regras de liberação/refund do Property e participantes do threshold podem usar outro software. Nenhum texto da interface pode chamar isso de escrow sem confiança ou garantir entrega do produto. A liquidação em mainnet permanece desabilitada até que uma mudança de implementação e seus gates específicos de protocolo a autorizem expressamente.

**Critérios automatizados:**

- Executar 50 fixtures de estado de troca por moeda cobrindo transição válida, expirada, duplicada, malformada, rede errada, valor abaixo/acima e RPC incerto; nenhuma fixture inválida chega a `settled`.
- Usar somente Bitcoin regtest privado, rede de teste Monero privada e nó Nano dev. Por adapter, criar 10 invoices/ofertas sintéticas, observar 10 recebimentos válidos e executar 10 casos de duplicata/resposta perdida/reinício sem crédito ou gasto duplicado.
- BTC: invalidar uma de 10 fixtures de teste confirmadas e verificar que estado reabre ou marca reorg conforme a política. XMR: verificar estados de confirmação/desbloqueio configurados contra Wallet RPC local. Nano: conferir conta, origem, quantidade em raw e hash do bloco exatos contra nó local.
- Executar 30 fixtures independentes de vínculo de identidade. A interface deve apresentar titularidade não verificada de carteira/conta como declaração e não inferi-la de assinatura Nostr.
- Adulterar ID de transação, valor, destino, rede, hash da oferta e journal em 10 fixtures por item; falhar de modo seguro sem segunda tentativa de pagamento.

**Entregas:** Contratos por adapter, máquina de estados, evidência em redes privadas, textos de liquidação e matriz que classifica cada mecanismo como direto, custodial, threshold/cooperativo ou imposto pelo protocolo. Mecanismo que não cumpra seu modelo de segurança fica desabilitado ou explicitamente experimental. O resultado executado está registrado na [evidência do gate G7](evidence/product-completion/G7/gate-result.pt-BR.md), com os relatórios e checksums em `evidence/product-completion/G7/fixed-run-02/`.

### G8 — Campanhas de relay, patrocínio voluntário e economia do operador

**Implementar:** Ferramentas para operador de relay inspecionar proposta de campanha, aceitar ou rejeitar, definir escopo de publicação e receber pagamento suportado declarado. A rejeição deve seguir moeda/meio declarado e valor atômico exato; não prometer reembolso automático sem confirmação do adapter aplicável. Identificar conteúdo patrocinado, preservar proveniência assinada e evitar rastreamento individual de cliques/visualizações. Expor contabilização local do operador e controles de retenção. Aceitar campanha é opcional e decisão local de cada relay.

**Critérios automatizados:**

- Executar 20 fixtures do ciclo de campanha por moeda: enviar, aceitar, rejeitar, publicar, substituir, expirar, duplicar e assinatura inválida. Verificar exatamente uma decisão de política e rótulo de patrocínio correto.
- Em redes locais privadas de carteira, verificar 10 casos de observação de pagamento BTC, 10 XMR e 10 XNO aceitos; verificar 10 casos de rejeição/devolução por moeda apenas quando existir caminho de retorno implementado e confirmável. Caso contrário, registrar `UNSUPPORTED_RETURN` e não anunciar reembolso.
- Garantir que 100% dos registros reconciliem ID da oferta, ID da aceitação, valor, moeda, referência de transação, assinante e estado; pagamento ambíguo/não confirmado não libera publicação.
- Inspecionar cada fixture de cliente/relay em busca de contadores de clique/visualização, analytics de terceiros e rastreamento não informado; qualquer caminho assim reprova o gate.

**Entregas:** Interface local JSON-RPC stdio do operador com nove ferramentas de campanha, máquina de estados, limites de devolução por moeda, recibos assinados, exportação do livro-razão local e evidência sem rastreamento. Um host incorpora a interface fornecendo assinador, adapters de ledger e publicador; o launcher Geode simples não a inicia. O resultado automatizado está registrado na [evidência do gate G8](evidence/product-completion/G8/gate-result.pt-BR.md).

### G9 — Resistência a abuso, minimização de dados e segurança automatizada

**Implementar:** Concluir mutar/bloquear/reportar local, limites de taxa/tamanho/retenção no relay, tratamento de evento malformado e fronteiras de moderação explicáveis. Deixar claro que bloqueios locais não apagam eventos globalmente e descoberta pública não prova reputação global nem elimina identidades Sybil. Adicionar descoberta de relay sem registro central, defaults assinados embutidos, override do usuário e tratamento explícito quando defaults estiverem obsoletos/inacessíveis. Minimizar metadados e documentar visibilidade residual de IP/relay.

**Critérios automatizados:**

- Executar 200 casos de eventos malformados, grandes demais, duplicados, repetidos e assinados incorretamente por todos os parsers públicos; sem crash, vazamento de segredo ou mutação de estado.
- Executar 50 casos de bloqueio/mute local entre 5 identidades sintéticas e 5 relays. As visualizações locais suprimem o conteúdo bloqueado; registros do relay e clientes alheios não são apresentados falsamente como apagados.
- Testar limites de taxa e armazenamento em limite−1, limite e limite+1 para 20 limites configurados; verificar estado limitado e erro determinístico.
- Executar 100 casos de lista de relay assinada: válida, expirada, revogada, duplicada, chave errada, versão crítica desconhecida e URL maliciosa; entradas inválidas nunca provocam busca de código em runtime fora da lista nem vazamento de chave privada.
- Executar análise estática, scan de vulnerabilidade/licença de dependências, secret scan, verificação SBOM e regressões de segurança no candidato exato. Achados críticos/altos não resolvidos bloqueiam release; relatar cobertura e limitações das ferramentas.

**Entregas:** Controles de abuso, formato de descoberta de relay, relatório automatizado de segurança, declaração de metadados/privacidade e registro explícito de riscos residuais. Aprovação automatizada não será apresentada como auditoria humana de segurança.

### G10 — Release pública, pacote operador Ubuntu e onboarding de contribuidores

**Implementar:** Empacotar uma release versionada com PWA estática, CLI de relay Ubuntu/Linux x86_64, instalador de agente/MCP Ubuntu, manifestos de dependência offline, checksums/assinatura, SBOM, licenças, instruções de atualização/desinstalação e declarações de compatibilidade legíveis por máquina. Publicar pelo repositório público Property via Pages/release configurado depois dos gates offline. Tornar GitHub a fonte canônica e documentar verificação independente de hash entre fonte e artefato. Adicionar instruções para iniciantes, contribuição por agentes de IA, templates de issues, código de conduta e um kit de lançamento pronto para compartilhar no X/Reddit/comunidades, com links de contribuição. Não alegar adoção comunitária por causa da publicação ou métricas do repositório.

**Critérios automatizados:**

- Partindo de imagem limpa Ubuntu x86_64, instalar arquivos PWA localmente, CLI relay e pacote MCP do bundle sem rede; verificar jornadas smoke declaradas e desinstalação limpa.
- Compilar, empacotar, instalar, atualizar, fazer downgrade/rollback e verificar checksums em 10 ciclos de perfil limpo; preservar dados e rejeitar artefatos corrompidos.
- Executar CI na tag exata do release; exigir manifestos de evidência G0–G9, checks de licença/SBOM/segurança e todas as suítes com contagem fixa. Suíte ignorada não é aprovação.
- Com egress bloqueado, servir localmente o bundle exato da PWA de release e executar 25 jornadas de navegador roteirizadas; comparar hashes de conteúdo com o manifesto de release. A aprovação funcional permanece offline. Metadados de deployment e digests dos artefatos do workflow Pages/release são registrados separadamente depois da publicação e não substituem nem alteram os resultados dos gates.
- Verificar links da documentação English e Português (Brasil), navegação, comandos de instalação e metadados de release; nenhum link interno quebrado é permitido.
- Validar mecanicamente o kit de lançamento: links de repositório/comunidade apontam corretamente no checkout local, cada texto cabe no limite declarado da plataforma e toda chamada direciona ao guia de contribuição ou repositório público.

**Entregas:** URL pública versionada, bundle verificado, índice final de evidências, README/ROADMAP/índice de documentação atualizados, guias rápidos de operador/agente Ubuntu, kit de lançamento pronto para plataformas e declaração explícita de plataformas pendentes.

## 5. Regra de conclusão geral

O plano só está concluído quando G0–G10 forem `PASS` no mesmo candidato de release usando testes funcionais offline, os digests dos artefatos publicados corresponderem ao manifesto assinado/com checksum e cada limitação financeira/de segurança estiver visível na documentação do produto e operador. `PENDING`, `BLOCKED`, evidência omitida, moeda não testada ou escrow experimental apresentado como garantia impedem declarar conclusão. A disponibilidade da publicação é informada pelos metadados do workflow; não substitui a aprovação offline.

## 6. Exclusões explícitas desta execução

- Revisão humana, estudo com usuários, testes operados por participantes, aprovação visual manual ou aprovação manual de segurança.
- Executar, instalar, compilar ou alegar validação de suporte em Windows, macOS, Android, iOS ou qualquer sistema que não seja Ubuntu Linux x86_64.
- Promessa de que navegador/PWA permanece acordado ou retransmite continuamente no fundo do celular.
- Imunidade absoluta à censura, identificador globalmente único sem autoridade/consenso, reputação global resistente a Sybil ou garantia de entrega/leitura que relay não oferece.
- Tráfego de teste em relay público, fundos de mainnet em teste ou alegação de escrow Nano sem confiança.

Essas exclusões não impedem implementação automatizada ou trabalho de código portável; limitam o que este plano pode executar ou declarar como verificado.

## 7. Referências

- [Plano central de testes do Property](plano-de-testes-central.pt-BR.md)
- [Pagamentos Property e limites atuais de liquidação](pagamentos.pt-BR.md)
- [Plano de mensagens entre agentes](plano-agentes-human-first.pt-BR.md)
- [NIP-17: mensagens privadas diretas](https://github.com/nostr-protocol/nips/blob/master/17.md)
- [NIP-15: marketplaces](https://github.com/nostr-protocol/nips/blob/master/15.md)
- [Transportes MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
