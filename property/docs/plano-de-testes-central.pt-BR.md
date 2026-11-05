# Plano de Testes Central — Property

**Português (Brasil)** · [English](plano-de-testes-central.pt-BR.md)


**Atualizado:** 2026-11-04. **Executor:** o modelo ativo é escolhido pelo mantenedor; registrar a identidade real no relatório. Diferenças entre rótulos de modelo em prompts antigos e o executor ativo são apenas proveniência e nunca bloqueiam um gate. Todos os critérios de aprovação usam contagens e entradas predeterminadas; nenhum teste exige duração mínima, janela de soak, heartbeat por tempo ou prazo de permanência. Watchdogs dos casos e do build têm limite máximo de 30 minutos; o workflow nativo tem limite operacional de 45 minutos para interromper provisionamento travado. Nenhum watchdog conta como critério de PASS. Os ensaios antigos por duração permanecem apenas como histórico e não substituem os critérios atuais. A execução Ubuntu pode manter G12-02–G12-05 PENDING como perfil intermediário; esses casos não contam como PASS nem como aprovação nativa. `PROPERTY_SCOPE_OFFLINE_PASS` exige a matriz G12 completa aprovada no mesmo candidato.

## 1. Objetivo e autoridade

Demonstrar, por testes reproduzíveis de uso e de integração, que todo o comportamento funcional previsto no escopo consolidado do Property funciona sem acesso à internet, inclusive com vários layers/relays, usuários, falhas e pagamentos em redes privadas locais. O resultado central é PROPERTY_SCOPE_OFFLINE_PASS, definido na seção 4. Uma coleção de testes unitários aprovados não basta.

Fontes de requisitos: [identidade do projeto](identidade-do-projeto.pt-BR.md), [plano central](plano-central.pt-BR.md), [pagamentos](pagamentos.pt-BR.md) e [migração](migracao-property.pt-BR.md). Esta revisão substitui a ordem de execução e os gates da versão anterior. Os cenários e resultados anteriores foram preservados integralmente em [histórico de testes de 2026-10-31](historico-testes-2026-10-31.md); não constituem aprovação dos novos gates.

Neste plano, offline significa **internet bloqueada, rede local de laboratório permitida**. HTTP, HTTPS, WebSocket, RPC de carteiras e sincronização de blockchains ocorrem somente entre processos, VMs ou aparelhos autorizados no laboratório isolado. Há dois ensaios distintos: comunicação pela rede local isolada e abertura do shell já armazenado com toda conexão de dados interrompida. Este último não deve prometer envio de mensagem sem nenhum relay alcançável.

Layers designa as camadas exercitadas no laboratório: navegador/identidade, descoberta, vários relays e pontes, armazenamento e adaptadores financeiros. A cadeia entre relays usa o comportamento real do Property. Não pressupõe roteamento privado genérico, onion routing, novo protocolo P2P ou execução permanente de PWA suspensa.

## 2. Escopo que não pode ser reduzido para aprovar

| Requisito | Comportamento obrigatório | Gates |
|---|---|---|
| Origem e autonomia | Reuso Amethyst/Geode documentado, licenças, hashes, dependências locais e nenhuma busca de código em runtime | G00, G02 |
| Identidade | Chave aleatória local, senha protegendo cofre, sessão, bloqueio, backup e recuperação da mesma identidade | G01, G03, G10 |
| Comunicação privada | Conversas diretas e em grupo NIP-17 (até 10 pessoas), kind 10050, destinatário offline, repetição, falhas, confidencialidade e conexão direta aos relays | G04, G05, G09, G10 |
| Descentralização | Escolha/troca de relays, pontes voluntárias, vários caminhos e continuidade sem o host do app | G05, G09 |
| PWA utilizável | Primeiro uso, erros claros, cache, atualização, migração, acessibilidade e fluxo completo pela interface | G02, G03, G10, G12 |
| Hangout | Publicar/ler notas públicas, verificar autoria, deduplicar e iniciar conversa a partir da autoria | G06, G10 |
| Marketplace inicial | Publicar, descobrir, editar e retirar ofertas; BTC/XMR/XNO exatos; iniciar contato | G06, G08, G10 |
| Sustentabilidade dos nodes | Oferta, aceite/recusa, publicação paga, expiração e devolução; patrocínio opt-in e sem rastreio central | G07, G08, G10 |
| Nodes de computador | Runtime incluído, dados persistentes, reinício, limites, retenção e recuperação após ciclos fixos de partição/reinício | G00, G09, G11, G12 |
| Plataformas | PWA em desktop/Android/iOS e pacotes de relay Linux x86_64, Windows x64 e macOS Apple Silicon | G12 |

A engine financeira de campanhas permanece no escopo planejado, mesmo estando ausente no MVP atual. Sua ausência reprova a implementação correspondente; não autoriza apagar o gate, trocar o teste por um mock ou declarar a campanha paga porque existe um txid no evento. Grupos privados NIP-17 com até 10 participantes fazem parte do escopo; não têm administração, aprovação de entrada ou controles confiáveis para sair/remover membros. Grupos acima de 10 pessoas, checkout/custódia/escrow do marketplace, Lightning e relay móvel continuamente ativo não fazem parte do MVP consolidado. Verificar explicitamente que o app não simula recursos fora do escopo. Mac Intel e outras arquiteturas de relay continuam extensões futuras, sem alegação de aprovação. Acrescentar casos e gates antes de aceitar ampliação de escopo.

## 3. Instruções de execução para o modelo ativo escolhido pelo mantenedor

1. Ler primeiro este documento, os resumos das fontes e o AGENTS.md mais próximo. Trabalhar em coercaodobem/property, branch modelo-mvp, preservando alterações existentes. Não usar Amethyst upstream ou Gymoo como destino.
2. Inventariar o que existe e o que falta. Diferenciar teste existente, teste a implementar, funcionalidade ausente e ferramenta de laboratório ausente. Este documento não afirma que os scripts novos da seção 7 já existam.
3. Executar os gates em ordem estrita. Para cada caso, ligar requisito, código real exercitado, passos, resultado esperado e evidência. Abrir os trechos de código pertinentes à falha, evitando carregar toda a base upstream. Um gate dependente só começa depois que todos os casos do anterior passam; quando isso não ocorre, registrar os dependentes como NOT_RUN e corrigir/retestar antes de avançar. Retestes isolados servem para diagnóstico, sem aprovar nem avançar a sequência.
4. Construir a infraestrutura de testes que estiver faltando. Quando houver falha do produto, corrigi-la dentro do escopo autorizado, registrar o defeito e repetir o caso e sua regressão. Não mudar o resultado esperado para acomodar o defeito. Mudanças de protocolo, criptografia, chaves ou desenho financeiro seguem o escopo aprovado e as instruções do repositório.
5. Nenhuma afirmação de PASS vem de inspeção do código, texto de log isolado, tela inicial, mock de sucesso ou resultado histórico. Cada aprovação exige execução do comportamento e asserções independentes sobre seus efeitos.
6. Usar exclusivamente identidades, mensagens, carteiras e valores sintéticos. Segredos ficam em diretórios temporários privados; não vão para relatórios, commits, HAR, capturas ou console. Não substituir contas reais ou diretórios de dados do usuário.
7. Não pedir nova autorização para os mesmos testes locais já autorizados. Não alterar firewall global, desligar a rede do computador do usuário, reiniciar o host, usar mainnet ou publicar dados como parte do ensaio. Falhas de rede/energia são simuladas apenas nos processos, volumes e interfaces do laboratório.
8. Persistir progresso após cada caso/gate. Na retomada, ler o manifesto e o último resultado; verificar se o commit mudou e invalidar aprovações afetadas. Um ensaio interrompido não vira PASS.
9. Não delegar, trocar de modelo, abrir PR ou publicar uma release automaticamente por causa deste plano. O mantenedor escolhe o modelo ativo. Registrar o executor real como proveniência; não pedir troca de modelo e não usar divergência com rótulos antigos como bloqueio ou critério de aprovação.

**Definição de conclusão:** entregar o relatório final com os resultados de todos os gates e os artefatos necessários para outra execução. Se faltar recurso ou implementação, entregar o estado real sem anunciar que o escopo inteiro passou. Não transferir ao usuário testes que possam ser executados no laboratório disponível.

## 4. Gates e regra de aprovação

| Gate | Entrega verificável | Depende de |
|---|---|---|
| G00 | Laboratório preparado, inventariado e isolado da internet | — |
| G01 | Regressão técnica existente aprovada dentro do isolamento | G00 |
| G02 | Origem, pacote, shell offline, atualização e migração | G01 |
| G03 | Identidade, recuperação e contato pela interface | G02 |
| G04 | Mensagens ponta a ponta por relays reais | G03 |
| G05 | Rede com múltiplos relays/camadas, caminhos e limites | G04 |
| G06 | Hangout e marketplace percorridos pela interface e pelo relay | G05 |
| G07 | Máquina de estados real de campanhas e privacidade | G06 |
| G08 | BTC/XMR/XNO em redes privadas locais com adaptadores reais | G07 |
| G09 | Falhas, abuso, recuperação e persistência | G08 |
| G10 | Jornadas completas no navegador e metas de usabilidade | G09 |
| G11 | Repetibilidade, ciclos multi-relay com variáveis fixas e reconciliação | G10 |
| G12 | Matriz offline dos sistemas e navegadores alvo | G11 |

Estados por caso: PASS, FAIL, BLOCKED, NOT_RUN ou PENDING. Funcionalidade ausente corresponde a FAIL; falta de infraestrutura necessária a um caso que faz parte do perfil solicitado corresponde a BLOCKED; PENDING registra um caso explicitamente adiado fora do perfil da execução atual. PENDING não é aprovação, mas também não bloqueia a sequência nem a conclusão do perfil Ubuntu. NOT_RUN indica caso que deveria ter sido executado no perfil, mas não chegou a iniciar ou concluir. Casos de rejeição aprovam quando a rejeição esperada acontece e o efeito proibido é comprovadamente ausente. Não existe aprovação por skip, TODO, warning ou erro engolido.

Todos os casos do perfil solicitado são obrigatórios. O gate passa somente com 100% desses casos em PASS, asserções completas e evidências válidas do código testado. Casos PENDING ficam visíveis no relatório e não podem ser contados como PASS. Os gates são executados em ordem estrita: qualquer FAIL, BLOCKED, NOT_RUN ou interrupção encerra a sequência antes de iniciar o gate dependente. Retestes diagnósticos isolados não avançam nem certificam gates posteriores.

- **OFFLINE_FUNCTIONAL_PASS:** G00 a G11 aprovados.
- **OFFLINE_PLATFORM_PASS:** G12 aprovado para a matriz declarada, sem usar emulação visual como prova de sistema nativo.
- **PROPERTY_UBUNTU_OFFLINE_PASS:** G00–G11 e os casos Ubuntu G12-01/G12-06 aprovados, com isolamento e evidências válidos; G12-02–G12-05 podem ficar PENDING por estarem fora da execução Ubuntu. Esse resultado conclui o perfil Ubuntu, mas não certifica Windows, macOS, Android, iOS/iPadOS nem equivale ao passe de escopo completo.
- **PROPERTY_SCOPE_OFFLINE_PASS:** os dois resultados anteriores aprovados sobre o mesmo código e artefatos compatíveis. Nenhum FAIL, BLOCKED, NOT_RUN ou defeito funcional aberto do escopo.
- Publicação GitHub Pages, redes públicas, revisão independente de segurança e homologação física adicional de instalação/background são registros separados. Não são simuladas como resultados reais, não são necessárias para o laboratório funcionar e não são certificadas pelo resultado offline.

O orquestrador retorna código 0 para o perfil Ubuntu integralmente aprovado (`PROPERTY_UBUNTU_OFFLINE_PASS`), mesmo que os casos nativos de outros sistemas permaneçam PENDING; 1 para reprovação e 2 para bloqueio, interrupção ou infraestrutura incompleta dentro do perfil solicitado. Ele só usa `PROPERTY_SCOPE_OFFLINE_PASS` quando a matriz completa também passou. Um perfil parcial nunca usa esse nome.

Enquanto Windows, macOS, Android e iOS/iPadOS estiverem adiados, pushes e pull requests executam somente smoke e relay Ubuntu. A matriz nativa normalmente só inicia por `workflow_dispatch` quando o mantenedor define explicitamente `run_deferred_platforms=true`; o padrão é `false`. Para uma execução completa solicitada durante trabalho automatizado sem acesso ao despacho de workflow, um push autorizado à branch `modelo-mvp` pode usar a marca de commit `[run-g12-now]`. O marcador só habilita essa execução para um push na branch de desenvolvimento; não altera critérios nem converte PENDING em PASS.

## 5. Preparação e topologia do laboratório

### 5.1 Ambiente fechado

- Fixar commit/diff, versões de protocolo, Node.js 22+, Python local quando necessário, navegadores, ferramentas de automação, runtimes, binários de moedas e licenças. Inventariar hashes de todos os executáveis usados.
- Preparação de ferramentas é uma fase distinta da execução offline. Ferramenta faltante gera BLOCKED com caminho/versão/hash necessários. Não baixar pacotes, navegadores, imagens Docker, Maven, npm ou atualizações durante os testes. Caches preexistentes só valem se inventariados e verificáveis. Cache de build ausente bloqueia o teste de build offline, sem afetar a definição do pacote de runtime.
- Usar namespace de rede, VM ou rede de contêineres já disponível sem rota externa; em Windows/macOS, usar isolamento equivalente na VM/máquina de laboratório. Autorizar apenas loopback e endereços/portas locais declarados. Uma rota externa residual, inclusive IPv6, proxy, WebRTC ou processo filho, reprova o isolamento.
- Comprovar o isolamento antes de iniciar os fluxos pela inspeção das regras efetivas de firewall/namespace, tabela de rotas IPv4/IPv6, configuração DNS/proxy e política aplicada aos processos do laboratório. Registrar a configuração e os contadores disponíveis antes/depois. Não enviar sondas TCP, consultas DNS ou qualquer tráfego a endereços públicos, inclusive endereços de documentação; se a política de isolamento não puder ser inspecionada ou aplicada, marcar BLOCKED. Erro de resolução, variável de ambiente ou interceptação de browser isoladamente não prova isolamento.
- Capturar conexões por processo e requisições do navegador. Desativar sincronização de conta e extensões em perfis descartáveis; bloquear a saída para relays públicos. Instalações novas agora salvam localmente dois relays sugeridos por sorteio; injetar a lista isolada do laboratório antes do boot e confirmar que nenhum relay público incluído no app foi contatado. Se não houver caminho seguro, preparar o harness/configuração e registrar a lacuna do produto.
- O bloqueio de rede deve ser provado antes dos fluxos e verificado ao final. Mock/interceptação do navegador é defesa adicional, nunca a única fronteira.
- Servir o mesmo bundle em localhost e sob o caminho /property/. Para HTTPS/WSS, usar CA/certificado local de teste confiado apenas no laboratório. Não aprovar ignorando globalmente erros TLS. Capturar também uma tentativa WSS com certificado inválido e comprovar rejeição.
- Cada relay usa processo, porta, configuração e banco separados; cada identidade usa contexto/perfil de navegador separado. Dados do laboratório ficam em diretório temporário exclusivo. Nenhum relay de produção é iniciado/parado.

**Recursos:** começar por dois relays e medir RSS e disco em checkpoints de contagem; ampliar para a topologia completa sem reduzir os cenários. Como orçamento inicial de laboratório, exigir 4 vCPUs, 8 GiB de RAM física e 6 GiB livres no volume scratch usado pelo runner. A capacidade física é o piso de hardware; o consumo livre é medido separadamente no início de cada execução. Limitar o conjunto dos processos filhos a 70% da RAM então disponível e, para sete relays Geode concorrentes, dividir esse teto por relay, aplicando limites explícitos de heap, metaspace, code cache, memória direta e threads. Registrar todos os valores no inventário e medir RSS em checkpoints fixos. Reservar 2 GiB de disco e parar de forma limpa ao atingir o limite. Esses valores são parâmetros de ensaio, não consumo medido nem requisito final do produto. Hardware abaixo do piso físico, scratch abaixo do limite ou teto que não comporte ao menos 128 MiB de heap e 64 MiB de metaspace por JVM gera BLOCKED. O scratch deve ficar no volume declarado pelo runner, não ser inferido de um `/tmp` montado em tmpfs.

### 5.2 Atores e sete relays reais

| Ator | Papel isolado |
|---|---|
| A e B | Remetente e destinatário, com identidades e cofres independentes |
| C | Terceiro sem autorização, relay hostil e entradas adulteradas |
| P12, P23, P34 | Pontes públicas usando o módulo real do Property; uma instância por ligação |
| D | Anunciante sintético, sem relação de confiança com os usuários |
| N1 e N2 | Operadores independentes de node/campanha, com políticas e carteiras distintas |
| H | Servidor estático local; entrega somente arquivos, sem backend de mensagens |

| Relay | Função |
|---|---|
| R0 | Descoberta local de perfis e listas kind 10050 |
| R1, R2, R3, R4 | Rede de distribuição de eventos públicos |
| R5, R6 | Inboxes privados de A e B, respectivamente |

Usar a lista de A com R5 e R3, e a de B com R6 e R4 para testar redundância de inbox. O mesmo relay pode armazenar eventos públicos e envelopes privados; isso não autoriza a ponte pública a encaminhar esses envelopes.

Topologia inicial, com ACLs de teste que impedem atalhos:

    A -> R1 -> P12 -> R2 -> P23 -> R3 -> P34 -> R4 -> B
    A/B -> R0                       descoberta assinada
    A -> inboxes de B: R6 e R4       NIP-17 direto
    B -> inboxes de A: R5 e R3       NIP-17 direto
    H -> arquivos da PWA             sem encaminhar mensagens

Para a cadeia pública, A só publica em R1, B só lê em R4 e cada ponte só acessa os dois endpoints previstos. Depois testar diamante, ciclo, estrela e partição. Registrar explicitamente cada ligação adicional. Interromper P23 deve interromper a cadeia simples; se o evento ainda chegar, existe atalho ou isolamento incorreto e o caso reprova.

**Fronteira privada obrigatória:** pontes genéricas não carregam mensagens de A para B através de terceiros. O envio NIP-17 usa a lista inbox assinada de cada destinatário. A ponte de B pode replicar o próprio envelope cifrado apenas para os inboxes de B; a de A faz o equivalente para A. Não habilitar encaminhamento de envelopes alheios para conseguir passar o teste de várias camadas. Se todos os inboxes do destinatário estiverem inacessíveis, a UI mostra indisponibilidade; o laboratório não inventa um roteador privado.

### 5.3 Variáveis fixas, relógio lógico e contagens

Usar seed explícita para geração de cenários e sequência de falhas. Aleatoriedade de teste pode ser determinística apenas nas fixtures/harness; geração real de chaves, nonces e criptografia do produto conserva sua fonte segura. Nunca introduzir chave fixa ou nonce reutilizado no runtime do app para tornar um teste repetível.

Todos os testes usam valores de entrada e contagens previamente definidos. O relógio lógico injetado valida regras temporais do produto por fronteiras discretas, sem esperar o relógio real. O conjunto comum usa `NOW_EPOCH_SECONDS=1800000000`; para a ponte, testar `createdAt=NOW`, `NOW-300`, `NOW-301`, `NOW+60` e `NOW+61` (idade máxima de 300 segundos e avanço futuro máximo de 60 segundos); para ofertas, `createdAt=NOW`, `NOW+300` e `NOW+301` (avanço futuro máximo de 300 segundos). Para expiração, usar `expiredAt=NOW-1`; para campanhas, usar `expiresAt=NOW+1`, `maximumDurationSeconds=2592000` e o limite seguinte `2592001`; também verificar a transição com `expiresAt=NOW+180`, avaliando em `NOW` e depois em `NOW+181`. Para testar pagamento observado após o prazo, usar `latePaymentExpirySeconds=1` e reconciliar em `expiresAt+1`, sem atraso real. Para exposição local, consultar duas vezes no mesmo instante e novamente com idade lógica de `EXPOSURE_WINDOW_SECONDS+1=86401`. Para a ponte, enviar 61 eventos na mesma janela lógica: exatamente 60 são aceitos; avançar um passo lógico de 60.000 ms inicia a janela seguinte. A política de retenção é fixada no manifesto e usa três registros sintéticos na fronteira (`NOW-retention-1`, `NOW-retention` e `NOW-retention+1`), sem aguardar expiração real. Reinício de ledger/reorganização usa contagens fixas: BTC, 1 confirmação, invalidar 1 bloco e minerar 1 bloco após reconsideração; XMR, 10 confirmações, minerar 11 blocos para desbloqueio e testar pop de 1 bloco; Nano, observar a transição de um bloco enviado até sua confirmação. Nunca se usa o relógio do host para decidir PASS.

Corpus mínimo: 100 notas públicas distintas, 50 mensagens por direção, 10 ofertas por moeda e 10 campanhas por moeda. Cada corpus tem contagem exata, identidade sintética e seed no manifesto. Enviar em lotes fixos abaixo do limite; executar separadamente os lotes-limite e os que excedem cada cota. Para cada corpus, reconciliar IDs, autores, destinatários, valores atômicos, ACKs válidos, eventos consultáveis e aparições na UI. Tempos de início/fim podem ser registrados como metadados de auditoria, mas não entram em asserções nem alteram o resultado.

Prazos de `waitFor`, socket, subprocesso e watchdog são apenas proteções contra travamento do harness. Eles não medem a funcionalidade, não são metas de desempenho e nunca produzem PASS por serem atendidos; expirar um watchdog resulta em FAIL/BLOCKED conforme a causa.

## 6. Casos obrigatórios por gate

### G00 — Preparação, isolamento e evidência

| Caso | Procedimento e aprovação |
|---|---|
| G00-01 | Registrar fontes de requisitos, commit, diff, inventário de ferramentas, hashes, sistema, limites, portas e topologia. Falta de dependência é explícita e impede iniciar o perfil afetado. |
| G00-02 | Aplicar isolamento de laboratório; inspecionar as regras efetivas e comprovar ausência de rota/egress TCP, DNS, IPv4, IPv6 e proxies, mantendo somente loopback e endereços locais declarados. Não enviar tráfego externo para testar o bloqueio. Conferir também as políticas do browser, relays, bridges, RPCs e processos filhos. |
| G00-03 | Inicializar dois Geode reais, depois os sete relays isolados; verificar prontidão, bancos distintos, permissões privadas e encerramento seguro. Porta ocupada ou falha de prontidão nunca ativa fallback público. |
| G00-04 | Interromper um teste propositalmente. Relatório fica BLOCKED, exit não zero, filhos encerrados, evidência sanitizada preservada e dados reais intactos. |

### G01 — Regressão existente

| Caso | Procedimento e aprovação |
|---|---|
| G01-01 | Executar todas as suítes declaradas em run-smoke.sh e agent-package-smoke.sh dentro do isolamento. Conferir cada resultado, código de saída, quantidade real de suítes e caso negativo; registrar a contagem diretamente dos scripts, sem depender de número histórico fixo. |
| G01-02 | Executar integração entre dois relays reais e integração nativa do launcher. Verificar ACK positivo, consulta por IDs e persistência exata após reinício, não só contagem total. Ampliar o teste existente se só comparar contagens. |
| G01-03 | Demonstrar sensibilidade dos testes: adulterar apenas fixtures isoladas de assinatura, bundle/hash, preço atômico e backup; cada caso deve falhar pelo motivo previsto. Restaurar fixtures sem editar esperado ou desativar checks. |

### G02 — Pacote autônomo, PWA e migração

| Caso | Procedimento e aprovação |
|---|---|
| G02-01 | Inventariar código reaproveitado de Amethyst/Geode, bibliotecas locais e licenças; conferir commits, hashes e ausência de dependências dinâmicas no runtime. Rebuild offline quando toolchain local completo; registrar incompatibilidade web sem declarar Compose recompilado. |
| G02-02 | Abrir bundle limpo em localhost e /property/ com egress bloqueado. Todos os scripts, estilos, fontes, workers e manifesto são locais; nenhuma tentativa de CDN, analytics ou execução remota. Uma instalação nova salva localmente um par aleatório e único da lista de relays incluída no app. Antes do boot, substituir essa lista pelos relays isolados do laboratório; após ativar a identidade, comprovar que conexões tentam somente os relays locais salvos e nunca os endpoints públicos incluídos no app. Repetir com cache vazio. |
| G02-03 | Instalar service worker, armazenar identidade e dados sintéticos; encerrar H e cortar relays. Shell reabre, identidade permanece, estado desconectado é claro e não afirma entrega. Religar só os relays: app em cache comunica diretamente sem H. |
| G02-04 | Simular atualização completa, atualização interrompida e artefato misturado. Sem perda de chave, conversas ou preferências; versão do shell é consistente ou retorna erro recuperável. Caches de outros apps permanecem intactos. |
| G02-05 | Importar backups legados, abrir banco legado e testar caminhos antigo/novo na mesma origem local; mesma identidade preservada. Testar senha errada, backup alterado e armazenamento indisponível sem criação silenciosa de outra conta. |
| G02-06 | Testar TLS/WSS válido e inválido, CSP e conteúdo malicioso. Sem desativar validação TLS, aceitar script remoto ou mudar política de produção para acomodar o harness. |

### G03 — Identidade, senha, recuperação e contatos

| Caso | Procedimento e aprovação |
|---|---|
| G03-01 | Pela UI, criar A e B com mesmo nome/senha de teste em contextos separados. Chaves diferentes; cofre cifrado; rede/armazenamento/logs não expõem senha ou chave privada. |
| G03-02 | Senha errada não altera a conta; correta desbloqueia a mesma identidade. Testar continuar conectado ligado/desligado, reabrir navegador e bloqueio manual em três ciclos. O caso determinístico de bloqueio por inatividade fica em G11, com relógio lógico injetado e sem espera real. |
| G03-03 | Exportar backup cifrado pela UI e restaurar em contexto limpo; conferir mesma chave pública e acesso à conversa. Perda de senha/recuperação não oferece reset central nem substitui identidade silenciosamente. |
| G03-04 | A obtém contato de B pelo perfil/compartilhamento e pelo botão de autoria do Hangout; testa npub, nprofile com hints locais e hex válidos. Confirmar destinatário e nome local antes de enviar, sem digitar chave privada. Não exigir registro GitHub nem servidor central. |
| G03-05 | Reproduzir a entrada coercaodobem no campo de nova conversa; testar vazio, chave truncada, nsec, contato próprio e nomes iguais. Erro compreensível no idioma selecionado, sem stack/Bech32 bruto; orienta obter o contato correto e não envia a identidade errada. Nome simples não é convertido silenciosamente em chave nem tratado como único global. Se busca por nome não existir, a UI explica os formatos aceitos e oferece o caminho disponível de compartilhar/selecionar contato. |
| G03-06 | Capturar requests e perfis de armazenamento antes/depois de cada ação; reconciliação automática comprova ausência de segredo, endpoint de login/recuperação central e perda de dados durante atualização. Capturas preservadas devem estar sanitizadas. |

### G04 — Mensagens reais de ponta a ponta

| Caso | Procedimento e aprovação |
|---|---|
| G04-01 | Pela UI, publicar listas kind 10050 de A/B em R0; validar assinatura e selecionar versão válida mais recente. Lista falsa, antiga, ambígua ou sem relays válidos não autoriza destino indevido. |
| G04-02 | A envia a B; B responde. Conferir textos na UI e nos destinatários, cópias previstas do remetente e persistência cifrada nos inboxes corretos. C com outra chave não decifra; H não recebe corpo, senha ou chave. |
| G04-03 | Fechar o contexto B, enviar A->B, reabrir B e sincronizar. Mensagem aparece uma vez; repetir consulta/reconexão em três relays não duplica. Fixar a retenção do relay no manifesto e testar três eventos com timestamps na fronteira definida em 5.3, sem aguardar envelhecimento real. |
| G04-04 | Desligar um inbox de B, depois todos; testar ACK negativo, falso ACK sem persistência e reconexão. UI distingue envio aceito por relay, falha/parcial e leitura; não anuncia leitura só por ACK. Consulta independente detecta relay que mentiu. |
| G04-05 | Faltar kind 10050, adulterar destinatário/assinatura/envelope, manipular timestamp e repetir IDs. Não envia por fallback público; rejeita inválidos; nenhum terceiro recebe plaintext. |
| G04-06 | Executar o corpus nas duas direções e reconciliar cada ID/envelope/conversa no browser e no relay. Em fluxo normal, zero perdas e uma aparição por mensagem na UI. Capturar limites de metadados visíveis sem afirmar anonimato total. |
| G04-07 | No laboratório isolado, criar pela UI do Property uma sala NIP-17 com quatro participantes. Configurar inbox kind 10050 distinto para cada um, enviar uma mensagem fixa e reconciliar exatamente quatro gift wraps: uma cópia do remetente e uma para cada outro membro. Os quatro decifram o mesmo rumor/ID; uma quinta identidade não decifra; nenhum relay ou host vê plaintext. O conjunto ordenado de membros e o `subject` produzem a mesma identidade/título de sala em cada destinatário. |
| G04-08 | Na mesma sala com quatro participantes, testar uma resposta, uma reação e uma mensagem encaminhada para um segundo grupo criado antes. Reconciliar tags de participantes, ID do evento-pai, contagem exata de envelopes por pessoa, destinos inbox, deduplicação e autoria visível. Inbox ausente, envelope ausente/duplicado/extra, participantes duplicados ou mais de 10 membros falham de modo fechado; não adicionar fallback público nem por terceiros. |

### G05 — Vários layers/relays e pontes

| Caso | Procedimento e aprovação |
|---|---|
| G05-01 | Na cadeia R1->R2->R3->R4, trafegar o corpus público usando três pontes do módulo real. B recebe apenas por R4; assinaturas, IDs e conteúdo permanecem idênticos. Contadores/ACLs comprovam cada salto e ausência de atalho. |
| G05-02 | Parar P23: evento novo deixa de alcançar R4. Restaurar e usar a sequência fixa de consulta/replay para sincronizar o evento elegível. Repetir três consultas de ausência nos destinos enquanto P23 está parado; depois conferir a cópia única em R3/R4. Idade de evento é verificada separadamente em G05-06 com os timestamps fixos de 5.3. |
| G05-03 | Acrescentar caminho redundante em diamante, depois ciclo e estrela. Deduplicação garante uma aparição na UI; não há amplificação ilimitada. Desligar um caminho mantém entrega pelo outro, quando a topologia ainda conecta origem e destino. |
| G05-04 | Particionar grupos de relays e uni-los novamente; reiniciar uma ponte, receber dois eventos em ordem diferente e reconsultar cada ID. Reconciliar os dois eventos uma vez em cada destino; verificar idade/retenção somente com as fixtures de timestamp fixo descritas em 5.3. |
| G05-05 | Injetar envelope NIP-17 de B em R1: P12/P23/P34 e identidade C recusam encaminhá-lo. Em seguida usar a ponte de B, com B como identidade local, entre os próprios inboxes de B; só ela encaminha seu envelope cifrado aos destinos permitidos. A cópia de A segue a lista de A. |
| G05-06 | Testar ponte desligada/ligada, exclusão da origem, deduplicação, eventos inválidos/antigos/futuros e limites por lote com relógio lógico fixo: uma fixture em cada fronteira e três fixtures negativas por classe; 61 tentativas em uma janela (60 aceitas) e um evento após um passo lógico; bytes UTF-8 agregados por destino acima de 2.000.000 são rejeitados. Excesso tem contenção observável; não aguardar janela real. |
| G05-07 | Suspender/encerrar contexto móvel simulado e parar sua ponte. Relays de PC continuam disponíveis; reabrir retoma sincronização possível. Não aprovar serviço móvel contínuo a partir de contexto desktop emulado. |
| G05-08 | Recuperação de conflitos: separar R1/R2 de R3/R4 sem caminho de ponte. Dois clientes isolados, com a mesma identidade sintética de assinatura, publicam versões válidas diferentes de um item endereçável do marketplace (mesmo `pubkey`, `kind=30018` e tag `d`) com `created_at=NOW`; cada lado também publica um evento regular. Comprovar três consultas de ausência no destino antes de reconectar. Restaurar somente a ponte configurada, reconciliar o item e fornecer as mesmas duas versões assinadas ao seletor real do marketplace do Property nas duas ordens de entrada; exigir o mesmo item efetivo nos quatro relays e exatamente um card na UI. Para timestamps iguais, o Property resolve o empate pelo menor ID de evento, conforme a [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md). Parar a ponte entre os grupos para criar uma segunda partição, publicar em um lado uma versão válida mais recente em `NOW+1`, comprovar três consultas de ausência no outro lado, reconectar e exigir que a versão mais nova se torne efetiva em todos os lugares, independentemente da ordem de chegada. Os dois eventos regulares permanecem consultáveis e aparecem uma vez cada. Uma assinatura adulterada nunca vence. Relays não se federam automaticamente, e o teste não pode exigir que retenham versões históricas descartadas. Valores dos eventos, ordens de entrada, IDs e passos do relógio lógico são fixtures; nenhum critério usa tempo real. |

G05-08 foi adicionado em 2026-11-04 a partir de uma sugestão de teste de partição com conflitos. As evidências históricas de G05 cobrem somente G05-01–07 e não aprovam este caso adicional; o gate G05 ampliado permanece pendente até G05-08 ser executado com evidência.

### G06 — Hangout e marketplace inicial

| Caso | Procedimento e aprovação |
|---|---|
| G06-01 | A publica nota kind 1; B descobre em outro relay via cadeia pública, identifica origem e autoria e inicia conversa pela UI. Feed público permanece identificado como público; não oferece sala privada inexistente. |
| G06-02 | Publicar, descobrir e editar ofertas BTC/XMR/XNO pela UI; round-trip em Geode real preserva autoria, d, moeda e inteiro price_atomic. Testar 1 satoshi, 1 piconero, 1 raw e fronteiras documentadas sem Number/arredondamento no valor exato. |
| G06-03 | Retirar oferta e receber cópia antiga por outro relay: não reaparece. Pedido de retirada de outro autor ou timestamp inválido não remove oferta legítima. |
| G06-04 | Testar moeda desconhecida, precisão excessiva, overflow, listagem malformada, expiração (`expiration=NOW-1`), evento futuro (`createdAt=NOW+301`) e URLs/imagens inseguras. Antes de cada edição do evento addressable, avançar a hora lógica em exatamente dois passos de 1.000 ms para obter timestamp posterior sem espera real. Nada executa código, busca tracker ou troca moeda/unidade silenciosamente. |
| G06-05 | Iniciar contato com vendedor sem checkout: destinatário correto, preço/termos preservados, nenhuma cobrança ou compra fictícia. Registrar limite do draft NIP-15; não declarar interoperabilidade além do formato testado. |

### G07 — Engine real de campanhas e privacidade

| Caso | Procedimento e aprovação |
|---|---|
| G07-01 | D envia proposta assinada a N1/N2 com relógio fixo `NOW`. A engine do node valida conteúdo, valor, moeda, prazo e política; N1 aceita, N2 recusa independentemente. Decisões persistem sem autoridade central. Engine ausente resulta FAIL. |
| G07-02 | Recusa não solicita pagamento nem publica anúncio. Aceite assinado vincula campanha, moeda, montante, endereço exclusivo, prazo e condições de reembolso; alteração posterior invalida o acordo. |
| G07-03 | Usar simulador determinístico de ledger apenas para testar a máquina de estados real: oferta `expiresAt=NOW+180`; avaliar pagamento em estados pendente/confirmado e expirar por um avanço lógico de 181 segundos após `NOW`. Reconciliar cada transição exatamente uma vez; testar recusa, pagamento inválido e devolução. Sem mockar a própria engine. Aprovação aqui não substitui G08. |
| G07-04 | Publicar três notificações idênticas e repetir reconciliação três vezes; testar pagamento observado em `expiresAt+1` após uma oferta com prazo lógico `NOW+1`, além de alterar moeda/valor/endereço e reiniciar em cada estado. Publicação e reembolso idempotentes, sem ativação por txid declarado, crédito duplicado ou perda de conciliação. |
| G07-05 | Opt-in desligado por padrão, identificação de patrocínio e bloqueio de node. Fazer duas consultas no mesmo instante lógico para verificar o limite local de exposição; então gravar uma exposição sintética em `NOW-(EXPOSURE_WINDOW_SECONDS+1)` e consultar novamente em `NOW` para comprovar nova exibição sem esperar. Criativo fica separado de feed e mensagens; envelope cifrado permanece inalterado. |
| G07-06 | Inspecionar tráfego ao consultar, exibir e clicar. Sem pixel, script remoto ou telemetria de leitura/clique/perfil. Link só abre por ação explícita em destino local de teste; tráfego normal da navegação não é ocultado no relatório. |
| G07-07 | Trocar de N1 para N2 e comparar políticas de exposição/retenção. Preferências locais respeitadas; ausência de anunciante/receita não impede comunicação básica nem cria cobrança oculta. |

### G08 — Liquidação BTC/XMR/XNO inteiramente local

Preparar binários fixados e carteiras descartáveis. Usar Bitcoin regtest, Monero em rede privada/regtest suportada pela versão e Nano em rede local privada com genesis de teste. Desabilitar seeds, descoberta e peers externos. Não usar signet, stagenet ou testnet pública para passar este gate. Registrar comandos compatíveis com os binários instalados; não inventar flags ou tratar mock como blockchain.

| Caso | Procedimento e aprovação |
|---|---|
| G08-01 | Para cada moeda, a engine e o adaptador real recebem pagamento no endereço/subendereço exclusivo. A carteira/node local fornece prova de valor e estado; só então publicar campanha. Reconciliar a mesma transação em uma repetição após a confirmação para provar idempotência; usar as confirmações e blocos fixados em 5.3. Conferir oferta, endereço, inteiro atômico, transação e uma publicação. |
| G08-02 | BTC: saída/endereço errado, valor errado, pendente em mempool, conflito/substituição e confirmação. Reorganizar invalidando exatamente um bloco antes da reconciliação e minerar exatamente um após reconsideração. Gate de confirmação é explícito; ausência de transferência confirmada não ativa campanha. |
| G08-03 | XMR: subendereço, carteira antes/depois de `refresh` (duas leituras), 10 confirmações/desbloqueio, pop de um bloco, taxas e recebimento duplicado. Endereço de origem não é presumido; hash isolado não aprova. |
| G08-04 | XNO: 1 raw e fronteiras, pagamento pendente, recebimento processado e confirmação; repetição/notificação fora de ordem não credita duas vezes. Carteira Nostr e Nano são independentes. |
| G08-05 | Nas três moedas, testar reembolso por acordo autenticado, taxas/valor líquido e mínimo, falha RPC antes/depois do broadcast e retomada após crash. Conferir ledger e estado antes de repetir; no máximo um débito financeiro válido. Nano pode testar devolução à conta validada; BTC/XMR não inferem endereço de reembolso. |
| G08-06 | Saldo insuficiente, moeda errada, liquidação pendente e reorganização deixam estado conciliável, sem sucesso fictício. Repetir a leitura da mesma transação três vezes sem minerar blocos; só a contagem de confirmações fixada no manifesto permite transição. Conservação contábil por carteira: saldo inicial + créditos - débitos - taxas = saldo final, distinguindo pendente/bloqueado e disponível. |
| G08-07 | RPC autenticado apenas no laboratório, sem credencial na PWA/eventos/logs, limites de saldo/ação e ausência de mainnet. Nenhuma semente sai do host do operador. Desligar ledger real deve impedir confirmação, provando que o adaptador não usa sucesso constante. |

Os parâmetros de confirmações, taxas, mínimos e retenção precisam ser fixados no manifesto antes dos casos. Só parâmetros de testabilidade podem ser menores no laboratório; relatar a diferença para produção. Um mock de saldo ou txid fictício não substitui nenhum caso de G08.

### G09 — Falhas, abuso, persistência e migração do node

| Caso | Procedimento e aprovação |
|---|---|
| G09-01 | Encerrar abruptamente apenas os processos de teste durante escrita, envio, edição e campanha. Reiniciar com o mesmo banco; dados confirmados permanecem, nenhuma operação financeira/publicação é repetida indevidamente. |
| G09-02 | Proxy local injeta queda, reordenação por fila de liberação, desconexão, frames inválidos, ACK falso/negativo e relay indisponível. Cliente sinaliza estado real, recupera conexões e respeita o número fixo de retries/recursos. Não inserir atrasos cronometrados. |
| G09-03 | Limitar disco/retensão em volume temporário e testar banco ocupado/config inválida. Node informa a falha, preserva dados conforme política, não toca volume do usuário nem informa persistência sem gravação. |
| G09-04 | Receber eventos duplicados, grandes, inválidos e flood acima da cota. Rate limits de eventos/bytes e memória funcionam sem travar UI; corpus normal posterior continua utilizável. |
| G09-05 | Testar PROPERTY_RELAY_* e aliases legados, precedência e diretórios antigos com dados sintéticos. Runtime adulterado/segmento ausente impede início; nunca baixa substituto da internet. |
| G09-06 | Retirar H, um relay, uma ponte e um node de campanha separadamente. Só as rotas/funcionalidades dependentes falham; rede remanescente funciona e conteúdo privado não escapa por fallback. |

### G10 — Jornadas completas e critérios de experiência

Cada jornada usa o app real no navegador, por controles visíveis; chamadas diretas às funções internas só apoiam as asserções, sem substituir cliques, formulários e navegação. Proibido mockar backend/relay nos casos ponta a ponta. Capturar console, tráfego sanitizado e telas em pontos de aceitação.

| Caso | Procedimento e aprovação |
|---|---|
| G10-01 | Contextos novos: criar A/B, configurar relays locais, publicar inboxes, compartilhar/selecionar contato, conversar e responder. Nenhum terminal para o usuário do app, nenhuma chave privada solicitada no fluxo cotidiano e instruções claras para identificar destinatário. |
| G10-02 | B ausente, A envia, um inbox cai, H cai, B reabre shell em cache e recupera. Uma aparição de cada mensagem; estados de rede coerentes e nenhuma dependência central oculta. |
| G10-03 | Pela UI: Hangout->autoria->conversa; marketplace->publicar->editar->contatar->retirar; campanha->opt-in->exibir->bloquear node. Validar efeitos nos relays/engine, não apenas existência dos botões. |
| G10-04 | Backup/recuperação em perfil limpo, sessão, bloqueio e migração com dados. Voltar à identidade correta sem apagar origem nem expor segredo em captura. |
| G10-05 | Viewports 360x800, 390x844, 768x1024 e 1440x900; teclado, zoom 200%, foco visível, nomes acessíveis e avisos no idioma selecionado. Em perfil novo, confirmar inglês como padrão; mudar para Português (Brasil), recarregar e confirmar que a seleção persiste. Confirmar que nomes, publicações, ofertas, mensagens de usuários e corpos de mensagens entre agentes nunca são traduzidos. Sem controle essencial oculto/inacessível ou rolagem horizontal involuntária. Tamanho móvel emulado não equivale a instalação iOS/Android. |
| G10-06 | Em quatro relays e três pontes reais, enviar exatamente 50 mensagens privadas e 100 notas públicas. Reconciliar conteúdo, autoria, IDs, ACKs, entrega no destino e armazenamento único; capturar bytes do bundle, RSS e disco após o lote de mensagens e cada lote de 50 notas. A deduplicação visual é verificada nos cinco samples de G11. Critério de PASS é a contagem e as invariantes, sem metas de latência, carregamento ou retomada cronometrada. Não extrapolar para internet/4G. |
| G10-07 | No mesmo PWA, criar e reabrir um grupo privado; conferir título, total de participantes, identificação de quem enviou, controles de resposta/reação/encaminhamento, erros de membros inválidos e explicação de inbox NIP-17 em inglês e português. Repetir em 390x844 e 1440x900; não aparece outro app, identidade, transporte ou etapa de chave privada. Informar claramente que o protocolo não tem administração nem controles confiáveis para sair/remover membros. |
| G10-08 | Conferir Instalar Property antes e depois da ativação da identidade. Executar exatamente três ciclos do harness por estado: prompt nativo aceito, prompt recusado, ausência de prompt e app já instalado. O prompt nunca aparece antes do toque; a recusa abre instruções opcionais, navegador incompatível orienta continuar no site quando não oferece instalação e o modo instalado oculta o controle. Fazer exatamente três aberturas de cada atalho Nova conversa, Hangout e Marketplace, comprovando que só telas permitidas do Property abrem após ativar a identidade; ação desconhecida na URL não faz nada. Repetir os textos visíveis em inglês e português. |

Se a ferramenta não fornecer uma contagem ou evidência exigida, instrumentar o harness ou registrar BLOCKED; nunca preencher com estimativa. Os limites de memória/disco são critérios de recurso aferidos nos checkpoints fixos, não metas de velocidade. Mudança exige justificativa técnica anterior ao reteste, nunca ajuste silencioso ao resultado.

### G11 — Repetibilidade, ciclos multi-relay e fechamento

| Caso | Procedimento e aprovação |
|---|---|
| G11-01 | Repetir o conjunto funcional curto duas vezes com a mesma seed em laboratórios limpos e uma terceira vez com seed diferente. Mesmas invariantes e contagens esperadas; diferenças de chaves/IDs criptográficos não são comparadas como identidade entre execuções. |
| G11-02 | Repetir montagem/hash dos runtimes e empacotamento da PWA offline. Build do código reaproveitado usa ferramentas/dependências locais inventariadas; registrar hashes e explicar variações não determinísticas. Se o cache da toolchain impedir uma nova compilação, PASS só pode herdar evidência de duas compilações offline aprovadas quando todo o conjunto de entradas Geode/Gradle estiver sem mudanças desde aquele candidato e a árvore instalada atual for idêntica, por conteúdo, às duas saídas registradas. Registrar a tentativa atual bloqueada e os hashes/commits herdados; não alegar que uma compilação nova ocorreu. Sem essa prova exata, o caso fica BLOCKED. |
| G11-03 | Executar exatamente 300 probes sequenciais em três relays reais e duas pontes, com timestamp lógico fixo. Reiniciar o relay intermediário após as probes 60, 150 e 240. Em cada reinício, publicar exatamente três eventos na origem, comprovar ausência no destino enquanto a camada está parada e reconciliar os três eventos no relay intermediário e no destino após a retomada. Avançar o relógio lógico em um passo fixo após cada lote de 50 probes para testar a cota de 60 eventos por janela sem espera. Verificar os 300 IDs aceitos no destino, as nove probes de partição, zero perda, duplicação visual em cinco probes amostradas e RSS/disco em checkpoints a cada 25 probes, com RSS agregado <=70% da memória disponível no início e scratch <=2 GiB. Por fim, avançar o relógio lógico em 31 passos fixos de 60.000 ms; confirmar bloqueio por inatividade, remoção da chave da sessão, continuidade da ponte pública habilitada e funcionamento do comando para parar a ponte bloqueada. O resultado depende somente das quantidades e invariantes declaradas; não se mede duração real. |
| G11-04 | Conciliar corpus, estados financeiros, caches e volumes; auditar egress do início ao fim. Sem inconsistência, perda de evento aceito e retido, operação financeira duplicada ou segredo nos artefatos. |
| G11-05 | Antes de G12, auditar os casos G00–G11: conjunto exato de IDs, estado, referências de evidência existentes e checkpoints. Depois de G12, gerar auditoria separada da matriz completa G00–G12. Ensaios interrompidos/faltantes impedem o resultado correspondente. |
| G11-06 | Executar exatamente 96 probes em sete processos Geode reais e seis pontes PWA com IDs distintos. Cada evento assinado usa epoch sintético fixo mais a sequência predeterminada; conteúdo e contadores geram IDs distintos e cada evento precisa ser aceito e consultável exatamente uma vez nos sete relays. As seis pontes avançam um segundo de relógio lógico por evento, em passo sincronizado e contado, para preservar ordenação do feed sem espera real. Reiniciar o relay central após as probes 24, 48, 72 e 96. Em cada ciclo publicar exatamente três eventos enquanto a camada está particionada, consultar uma vez o destino para comprovar ausência e, após a retomada, reconciliar cada ID exatamente uma vez nos sete relays. Verificar a deduplicação da UI nas probes 1, 24, 48 e 96, em cada uma das seis pontes. Medir RSS/disco no início, a cada seis probes e após cada reinício; RSS agregado <=70% da memória disponível no início e scratch <=2 GiB. Exigir 17 checkpoints de recurso da sequência de probes (inicial + 16 contagens), quatro pós-reinício, quatro amostras de UI, 12 eventos reconciliados, zero perda/duplicação e zero saída externa. Watchdogs de prontidão são apenas proteção contra travamento. O candidato no manifesto deve ser o HEAD executado. O resultado depende somente das quantidades e invariantes predefinidas; não há condição por tempo decorrido. |

### G12 — Sistemas e navegadores offline

| Caso | Ambiente e aprovação |
|---|---|
| G12-01 | Linux x86_64: launcher com runtime incluído, caminho com espaços, permissões, SQLite, corpus, reinício e PWA em Chromium/Firefox locais. Repetir sem Java no PATH do processo. |
| G12-02 | Windows x64 real ou VM Windows: PowerShell, runtime incluído, caminhos com espaços, persistência/limpeza e PWA Edge/Chrome. Wine, parsing do .ps1 ou runner Linux não aprovam execução nativa. |
| G12-03 | macOS Apple Silicon real ou VM compatível: launcher, runtime, persistência e PWA Safari/Chrome. WebKit Linux não certifica Safari macOS, nem runner x64 certifica arm64. |
| G12-04 | Android: navegador em emulador de laboratório; desativar Wi-Fi e dados móveis do guest e provar que o host não tem rota pública/default antes e depois da jornada. Identidade, mensagem, recuperação e reconexão em três ciclos de suspender/retomar. Registrar rotas observadas, browser/versão e capacidade de instalação; não exigir root no guest nem usar duração suspensa como critério. |
| G12-05 | iOS/iPadOS: Safari em simulador disponível em Mac ou aparelho local, sem internet; repetir os mesmos fluxos em três ciclos de suspender/retomar. Marcar se adicionar à tela inicial/instalação requer aparelho físico e não foi comprovado; não usar duração suspensa como critério. |
| G12-06 | Conferir comportamento quando instalação PWA não é suportada: site segue utilizável e não oferece instrução falsa. Registrar instalação/background físicos como não comprovados quando só houve simulador; não bloquear indevidamente a aprovação funcional do site por ausência de API de instalação no ambiente declarado. |

O pacote e o mesmo conjunto de fixtures devem ser preparados em cada ambiente antes de bloquear egress; downloads de actions, toolchains ou imagens pertencem somente à preparação. Durante a jornada nativa, remover rotas públicas/default ou comprovar firewall de saída bloqueando o egress público; rotas locais privadas, link-local e loopback podem permanecer para o laboratório. Registrar tabelas IPv4/IPv6 sem rotas públicas/default, ausência de proxy e loopback funcional antes e depois. No Android, a prova combina guest emulado com Wi-Fi/dados móveis desativados e bloqueio de rotas públicas no host; rotas do guest via gateway local podem permanecer porque o host não consegue encaminhar tráfego público. A política do proxy deny-all no browser complementa essa prova; não substitui o isolamento do host nem do Android guest. Não enviar tráfego externo para verificar o bloqueio. GitHub Actions pode produzir relatórios nativos desde que a preparação ocorra antes do isolamento e o teste permaneça offline; restaurar conectividade apenas depois de fechar o harness e registrar a prova, para publicar artefatos. Um perfil Ubuntu intermediário pode deixar G12-02–05 PENDING e concluir `PROPERTY_UBUNTU_OFFLINE_PASS`; esses casos não são aprovação e impedem `PROPERTY_SCOPE_OFFLINE_PASS` e a conclusão da meta ativa. A aprovação funcional em simulador não certifica instalação física ou funcionamento permanente em segundo plano.

## 7. O que já existe e o que o executor deve construir

### Comandos existentes, a executar somente dentro do isolamento preparado

Na raiz do checkout:

    bash property/tests/run-smoke.sh
    bash property/tests/run-bridge-integration.sh 17450 17451
    node property/tests/native-relay-integration.mjs

As portas são valores de exemplo; conferir disponibilidade e reservar portas por execução. O launcher deve usar DATA_DIR/CONFIG_DIR temporários, separados dos diretórios reais do usuário.

### Infraestrutura de teste: implementação e estado

| Entrega planejada | Contrato mínimo |
|---|---|
| Orquestrador offline | O perfil full percorre G00–G12; `run-offline.mjs` valida manifesto/inventário e registra a origem declarada do executor, falha fechado se isolamento não for provado e só inicia relays depois do G00 elegível. A seleção/modelo do executor é metadado, não critério de aprovação. JVMs filhas gravam bibliotecas nativas no TMPDIR isolado da execução por `java.io.tmpdir`, evitando quotas ocultas de `/tmp`. `--resume` verifica commit, diff, plano, manifesto, perfil, relatório e hashes, arquiva a tentativa e reinicia em G00 sem carregar PASS. O runner não inicia um gate dependente se qualquer caso do gate anterior falhar, bloquear, ficar pendente ou não concluir; retestes isolados não alteram a certificação da execução integral. |
| Manifesto de laboratório | Valida seed, commit, origem do executor, orçamento, portas, browser/engine/versões e hashes. Registra diff, arquivos, fontes, ferramentas e ferramentas financeiras externas por caminho absoluto e SHA-256. Credenciais RPC são geradas apenas dentro do processo/teste e não constam no manifesto persistido. |
| Harness de múltiplos relays | Scripts de dois e sete Geode e os harnesses browser G05/G09/G11 exercitam relays reais, pontes PWA, topologias, falhas, limites, reinício e reconciliação. G09 contém ensaios para crash, armazenamento limitado, eventos hostis, runtime adulterado e falha isolada; G11-03 cobre 300 probes, três reinícios e nove eventos de partição, e G11-06 cobre 96 probes, quatro reinícios, 12 eventos reconciliados e checkpoints fixos de UI/recursos em sete relays e seis pontes. |
| Automação de navegador | Os executores usam Playwright/browser pinados por versão/hash, servidor localhost, proxy de bloqueio e captura de solicitações, WebSockets e erros. G10 herda as jornadas completas do mesmo full run e executa ainda viewports de desktop/móvel, zoom aproximado de 200%, foco, nomes acessíveis e fallback sem instalação PWA suportada. |
| Engine e adaptadores financeiros | G07 exercita a engine persistente/assinada com ledger determinístico, somente para a máquina de estados. G08 tem harness de BTC Core, Monero e Nano com binários reais e hash-pinned, redes/carteiras privadas, RPC local autenticado, reconciliação e casos financeiros. G07 não substitui a liquidação real de G08. |
| Relatório automatizado | O perfil full registra 76 casos, checkpoints, eventos, manifesto, inventário, topologia, isolamento, relatório e hashes. No perfil Ubuntu intermediário, G12-02–05 podem ficar PENDING; G12-01 e G12-06 são executados no Linux. G11-06 exige 96 probes, quatro reinícios, 12 eventos reconciliados e as amostras fixas descritas acima. O passe integral exige G00–G12 e os quatro relatórios nativos do mesmo candidato. A identidade do executor é registrada como proveniência e não afeta o resultado. |

Comandos do runner parcialmente implementado:

    node property/tests/offline/run-offline.mjs --profile core --manifest /caminho/lab.json
    node property/tests/offline/run-offline.mjs --profile platforms --manifest /caminho/lab.json
    node property/tests/offline/run-offline.mjs --profile full --manifest /caminho/lab.json
    node property/tests/offline/run-offline.mjs --profile core --manifest /caminho/lab.json --output /caminho/run-id --resume

O perfil full executa os casos de G00–G12, condicionando G08 ao manifesto hash-pinned das ferramentas de ledger. O perfil Ubuntu full mantém G12-02–05 como PENDING até ensaios nativos independentes. Para a meta integral, execute esses quatro casos nos ambientes Windows/macOS/Android/iOS/iPadOS correspondentes e reconcilie evidências do mesmo candidato; não simule aprovação. A retomada exige o mesmo manifesto e diretório; mudança no commit, diff/arquivos alterados, plano, configuração, perfil ou relatório dependente invalida a retomada antes de mover artefatos. Cada tentativa é arquivada, hashes são conferidos quando disponíveis, e a nova tentativa recomeça no G00 sem herdar PASS. Ausência de ferramenta necessária a caso do perfil atual permanece BLOCKED; funcionalidade ausente permanece FAIL.

## 8. Evidência e retomada

Diretório de trabalho sugerido: /tmp/property-offline/<run-id>, com permissões privadas. Persistir a versão sanitizada em property/docs/evidence/offline/<run-id>/, revisando tamanho e conteúdo antes de versionar. Dumps brutos, perfis, carteiras, senhas e tráfego não sanitizado não entram no repositório.

Artefatos mínimos:

- manifest.json: schema, run_id, executor previsto e efetivo (identificar a fonte do valor efetivo), versão de ferramenta/modelo quando disponível, horário, commit/diff, hashes do produto/harness, seed, plataforma, browser e orçamento.
- isolation.json: regras/allowlist inspecionadas, contadores de egress disponíveis e configuração do laboratório; declarar explicitamente que nenhuma sonda pública foi enviada. Não conter valores de proxy, credenciais ou dados pessoais.
- topology.json: processos, relays, bancos, ligações permitidas, corpus, injeções de falha e timestamps de cada transição.
- cases.jsonl: um registro final por caso com gate, requisito, comando, início/fim, esperado, observado, status, exit code, motivo e referências a evidências.
- case-events.jsonl, cases.latest.jsonl e gate-checkpoints.jsonl: histórico incremental de mudanças por caso e checkpoint por gate, para retomar sem apagar tentativas anteriores.
- resume-state.json e resume-review.json: fingerprint da tentativa, decisão de compatibilidade, resumo do que permanece pendente e caminho do arquivo histórico. A retomada sempre reinicia em G00.
- reconciliation.json: IDs públicos/envelopes e contagens por relay/UI; saldos atômicos sintéticos, taxas e estados financeiros. Sem conteúdo privado/chaves.
- summary.json e report.md: estado de cada gate, totais de PASS/FAIL/BLOCKED/NOT_RUN, metas medidas, defeitos e resultado final derivado.
- SHA256SUMS: hashes dos artefatos sanitizados, incluindo capturas necessárias; verificar depois de consolidar o relatório.

Guardar o histórico de tentativa e correção, sem sobrescrever a falha inicial. Campo de observação não substitui uma asserção. Comparar o commit/diff e a configuração em cada retomada: alteração no código invalida ao menos o caso afetado e seus dependentes; qualquer certificação final requer regressão compatível do conjunto completo, incluindo G11-03 na versão candidata final. Uma execução antiga por duração não substitui as novas contagens.

## 9. Rastreabilidade do plano anterior

Todos os casos antigos permanecem consultáveis no histórico. A tabela explicita sua cobertura sem apagar requisitos pendentes; para cada caso individual, o relatório da execução deve apontar o novo caso executado e sua evidência.

| IDs anteriores | Gates sucessores |
|---|---|
| SRC-01 a SRC-07 | G00, G02, G11 |
| PWA-01 a PWA-09 | G02, G04, G09, G10, G12; publicação pública é registro separado |
| IDN-01 a IDN-08 | G03, G10 |
| MSG-01 a MSG-08 | G04, G05, G09, G10, G12 |
| NOD-01 a NOD-06 | G05, G07, G09, G11 |
| AD-01 a AD-14 | G07, G08, G10 |
| XNO-01 a XNO-09 | G07, G08 |
| XMR-01 a XMR-05 | G07, G08 |
| BTC-01 a BTC-03 | G06, G07, G08 |
| MONEY-01 a MONEY-04 | G01, G06, G08 |
| HNG-01 a HNG-04 | G05, G06, G10 |
| MKT-01 a MKT-05 | G06, G10 |
| PROP-01 a PROP-05 | G02, G03, G09, G12; deploy é registro separado |
| OS-01 a OS-04 | G12 |
| Segurança, privacidade, usabilidade e critérios de saída sem ID | G00, G02, G03, G04, G07, G08, G09, G10, G11 |

## 10. Estado e entrega esperada

O histórico registra 12 suítes locais aprovadas, integração de dois relays, publicação anterior e matriz nativa Linux/Windows/macOS. Esses resultados ajudam a reproduzir o baseline; não aprovam automaticamente isolamento, sete relays, jornadas completas, engine financeira, redes privadas, os novos ciclos de repetição ou a nova matriz offline.

Lacunas conhecidas no início desta revisão: orquestrador full, harness de sete relays/falhas, jornadas de navegador, engine de campanhas/pagamentos, ferramentas de ledger local, ciclos de recuperação por repetições e matriz de plataformas. Os executores desses gates foram integrados desde então. A aprovação do perfil Ubuntu depende do full run de Ubuntu encerrar; testes nativos de outros sistemas ficam PENDING e não interrompem esse avanço. A certificação multiplataforma só é concedida depois dos ensaios nativos correspondentes.

**Política atual de executor (2026-11-03):** registros históricos que mantêm `BLOCKED` por divergência entre o modelo solicitado e o executor efetivo descrevem a regra antiga. O mantenedor escolhe o modelo ativo; o runner preserva a identidade observada para proveniência, mas essa divergência não bloqueia gates nem resultados atuais.

### Checkpoint histórico — 2026-10-31

Evidências sanitizadas do checkpoint anterior: `property/docs/evidence/offline/property-g00-resume-20261031-i/`; `...-c/`, `...-e/`, `...-f/`, `...-g/`, `...-h/` e `property-g00-shell-static-20261031/` foram preservados como histórico. `i` foi executado após a validação de retomada e o bloqueio de symlinks na árvore de evidências, no commit-base `7aff8e448898e674f8448a2dd847a64faceda8cd`, e registrou 79 arquivos alterados/não rastreados. G00-01 PASS; G00-02 BLOCKED; G00-03 BLOCKED e relays não iniciados; G00-04 PASS, porém inelegível para aprovar o gate porque o isolamento falhou. G01–G12 NOT_RUN; nenhum gate foi aprovado. `inventory.json` contém os hashes das fontes e do plano usados.

O diagnóstico corrente e seus hashes estão em `property/docs/evidence/offline/property-g00-shell-current/`; consulte `summary.json` e `isolation.json` para o resultado exato. O inventário inclui o fechamento estático dos assets locais e páginas no shell offline, os executores parciais G02 e a origem declarada do executor. `app-contract-smoke.mjs` e `g02-origin-smoke.mjs` passaram em execução direta de diagnóstico; isso não aprova G02 nem substitui jornadas reais de navegador com egress bloqueado.

O bloqueio ambiental anotado no checkpoint `property-g00-resume-20261031-i` era histórico: naquela tentativa não houve namespace nem bind loopback. A execução full `property-full-netns-20261031-11` comprovou isolamento com namespace distinto e rotas loopback-only; aprovou G00–G06 (37 casos) no candidato anterior a esta engine. O resultado geral permaneceu BLOCKED porque G07–G12 estavam NOT_RUN e o executor efetivo era Codex GPT-6, diferente do Luna Max solicitado. O resumo e o relatório estão no diretório de evidências do run 11; esse histórico não serve para aprovar as novas alterações.

### Checkpoint de retomada — 2026-10-31

O bloqueio antigo de G00 está superado. A execução full `property-full-netns-20261031-10` registrou G00–G05 como PASS e isolamento PASS: 32 casos aprovados, 42 NOT_RUN. O resultado geral permaneceu BLOCKED porque G06–G12 ainda não estavam integrados e o executor efetivo Codex GPT-6 diferiu do Luna Max previsto. Evidência: `property/docs/evidence/offline/property-full-netns-20261031-10/summary.json` e `report.md`. O registro histórico `property-g00-resume-20261031-i` está preservado e não representa o estado atual de G00.

O ensaio isolado `property-g05-isolated-20261031-08/browser-g05-report.json` aprovou G05-01–07 com quatro Geode reais e pontes PWA: cadeia R1→R4, falha e replay, diamante/ciclo/estrela, partição/reconciliação, isolamento de envelopes privados, toggle e cotas, e encerramento/reabertura de viewport móvel simulado. Ele não certifica suspensão real do sistema operacional móvel.

G05 encontrou e corrigiu uma corrida: o fechamento atrasado de um WebSocket antigo apagava o estado de assinatura da ponte nova. O callback agora só remove assinatura e consultas quando o socket que fechou ainda é o atual. O caso móvel também encontrou ausência de acesso às configurações de relays em viewport compacto; foi adicionado um botão de configurações no topo para essa largura.

O novo harness `browser-g06-smoke.mjs` aprovou G06-01–05 isoladamente em `property/docs/evidence/offline/property-g06-isolated-20261031-09/`: dois Geode, três clientes PWA, ponte R1→R2, Hangout kind 1, publicação/edição de um satoshi/um piconero/um raw, retirada/tombstone, autoria, expiração, moeda, timestamps, conteúdo hostil e contato sem checkout. A aplicação agora rejeita moeda não suportada, incoerência entre preço decimal e atômico, valor atômico fora dos limites, evento vencido/futuro e conteúdo inválido; o shell offline foi atualizado para a versão v11. O último `run-smoke.sh` aprovado contou 14 executores antes da inclusão da engine.

### Histórico de execução full — 2026-10-31, run 14

Evidência sanitizada em `property/docs/evidence/offline/property-full-netns-20261031-14/`. O relatório registra 44 casos PASS e 30 NOT_RUN: G00–G07 PASS; G08–G12 NOT_RUN. O isolamento permaneceu PASS antes e depois, com namespace distinto do pai, somente `lo` ativo e rotas IPv4/IPv6 restritas ao loopback. O checkout e o commit-base observados foram `7aff8e448898e674f8448a2dd847a64faceda8cd`; as alterações locais estão discriminadas no inventário.

G00 **não está bloqueado**: os quatro casos e o isolamento passaram no full run 14. O run 13 foi iniciado sem o wrapper `run-isolated.sh`, não recebeu a identificação do namespace pai e foi corretamente bloqueado pelo controle. O run 14 usou o wrapper, provou o isolamento e aprovou G00.

G02 também foi retestado isoladamente em `property/docs/evidence/offline/property-g02-isolated-20261031-13/`: G02-04/05/06 PASS após aguardar o service worker controlar a página antes da interação. O runner preserva como NOT_RUN os casos que não começaram.

G07 passou integrado no run 14. A engine persistente e assinada e o harness real de browser/relays passaram nos sete casos usando ledger determinístico, permitido somente para validar a máquina de estados nessa etapa. G08-01–07 passaram no full run 21 com ledgers locais reais: Bitcoin regtest, Monero fakechain e Nano dev node; o relatório e os logs estão em `property/docs/evidence/offline/property-full-netns-20261031-21/ledger-g08/`. A falta de binários observada no run 14 foi superada e não é um bloqueio atual. O ledger determinístico de G07 não substitui essa evidência financeira de G08.

### Retestes focados por contagem — 2026-11-02

Os retestes por contagem fixa estão preservados em `property/docs/evidence/offline/property-fixed-count-retake-20261102-01/`: G05 7/7, G06 5/5, G07 7/7, G08 7/7 em Bitcoin regtest/Monero fakechain/Nano dev, G09-04, G10-06, G11-03 e a suíte smoke local passaram. O relatório G08 foi reexecutado após fixar o relógio das identidades e campanhas em `NOW_EPOCH_SECONDS=1800000000`. G11-03 registrou 300 probes, três reinícios, nove eventos de partição reconciliados, zero perda, cinco amostras de deduplicação visual, 16 amostras de recursos e bloqueio por inatividade em 31 passos lógicos. G07 também verificou pagamento observado em `expiresAt+1` sem publicar campanha. A tentativa anterior baseada em duração está preservada como BLOCKED, com 115 probes parciais que não contam para os critérios atuais por contagem. Casos de sistemas diferentes do Ubuntu permanecem pendentes e devem ser identificados individualmente, sem impedir o avanço dos casos executáveis no Ubuntu.

### Perfil integral Ubuntu, primeira execução — 2026-11-03

O perfil `property-ubuntu-full-20261103-09` executou o plano full no commit candidato `70b67d3199d8b342bf3e6770325674063879eb6e`: G00–G11 passaram; G12-01 e G12-06 passaram; G12-02 a G12-05 ficaram PENDING para Windows, macOS, Android e iOS/iPadOS. O total foi 70 PASS e quatro PENDING, sem FAIL, BLOCKED ou NOT_RUN dentro do perfil. Resultado: `PROPERTY_UBUNTU_OFFLINE_PASS`, não `PROPERTY_SCOPE_OFFLINE_PASS`. Relatório, manifesto, casos e hashes: `property/docs/evidence/offline/property-ubuntu-full-20261103-09/`.

O HEAD remoto publicado `3b2d4092ef4693a4a65e4c7e22aae6bb63669891` contém a evidência e os logs sanitizados. A comparação dos caminhos de produto `property/web`, `property/relay` e `property/tests` entre o commit candidato e esse HEAD não encontrou diferenças. Para registrar uma verificação no HEAD exato, `bash property/tests/run-smoke.sh` foi repetido com exit code 0 em 22 executores; o pacote e o resultado estão em `property/docs/evidence/offline/property-ubuntu-smoke-20261103-current-head/`. Esse smoke não substitui o perfil integral nem afirma isolamento de rede por si só.

G11-02 passou pela exceção de reutilização prevista no plano: o rebuild Gradle novo não concluiu offline porque havia dependências não armazenadas em cache; os hashes do runtime instalado coincidiram com dois builds offline anteriores de entradas idênticas. Isso não é reportado como um rebuild novo. G11-03 aprovou exatamente 300 probes, três reinícios, nove eventos de partição reconciliados, zero perda e as amostras fixas previstas. Critérios por duração não fazem parte da aprovação atual. Revisões humanas e independentes continuam pendentes e não foram simuladas; o conjunto de sistemas não Ubuntu também continua pendente conforme a orientação do mantenedor.

### Perfil integral Ubuntu no HEAD publicado — 2026-11-03

O reteste `property-ubuntu-full-20261103-10` usou como candidato o HEAD publicado `2be9b798c325499b1c42dbc3b6e863efc8fd1dfd`. O runner isolado terminou com exit code 0 e resultado `PROPERTY_UBUNTU_OFFLINE_PASS`: G00–G11 PASS; G12-01 e G12-06 PASS; G12-02–G12-05 PENDING para Windows, macOS, Android e iOS/iPadOS. Foram 70 casos PASS e quatro PENDING, sem FAIL, BLOCKED ou NOT_RUN entre os casos do perfil. A matriz de outros sistemas fica pendente por orientação do mantenedor; este resultado não é `PROPERTY_SCOPE_OFFLINE_PASS`.

G11-03 foi medido por contagem fixa no mesmo candidato: 300 probes, nove eventos de partição, três ciclos de reinício, zero perdas, cinco amostras de deduplicação e 16 checkpoints de recursos. O G11-02 não produziu um novo rebuild Gradle porque plugins/dependências estavam ausentes do cache offline; passou pela exceção prevista usando dois manifestos de builds anteriores com entradas e hash do runtime instalado coincidentes. As cópias necessárias desses manifestos estão no diretório do run e todos os caminhos de evidência agora resolvem.

A primeira invocação desse run apontou para um manifesto que ainda não existia e terminou antes de criar o diretório de saída ou iniciar qualquer caso. Ela foi registrada separadamente em `preflight-attempts.jsonl`, resolvida preparando o manifesto pinado e repetindo a execução; não é caso do plano nem foi contada como PASS. Após completar o run, os caminhos pessoais e IDs de carteira nos logs foram redigidos, os hashes foram regenerados e a auditoria confirmou 106 entradas SHA-256 válidas e zero referências de caso ausentes. O relatório, manifesto, casos, checkpoints e reconciliações estão em `property/docs/evidence/offline/property-ubuntu-full-20261103-10/`.

### Perfil integral Ubuntu, terceira execução — 2026-11-03

O run `property-ubuntu-full-20261103-11` usou o candidato `b2ea3ca53d55aa21be8efaf3ce069ea5b73be36b` e terminou com `PROPERTY_UBUNTU_OFFLINE_PASS`: 70 casos PASS e quatro PENDING; G00–G11 passaram, G12-01/G12-06 passaram, e G12-02–G12-05 continuam PENDING para Windows, macOS, Android e iOS/iPadOS conforme orientação do mantenedor. Não houve FAIL, BLOCKED ou NOT_RUN no perfil Ubuntu. G05 passou tecnicamente, com revisão independente ainda pendente. O relatório registra que o executor solicitado e o executor desta sessão não coincidiram; o resultado não é apresentado como execução do Luna Max.

O G11-03 usou contagens fixas: 300 probes, três reinícios, nove eventos de partição, cinco amostras de deduplicação e 16 checkpoints de recursos. O G11-02 não gerou novo rebuild Gradle por dependências ausentes do cache offline; aplicou a exceção de reutilização prevista no plano, com entradas e hash do runtime instalado coincidentes com dois builds offline registrados. Antes de publicar a evidência, caminhos locais e dois identificadores de wallet nos logs foram redigidos. Os 103 hashes do manifesto conferem e todos os 104 arquivos do snapshot estão versionados em `property/docs/evidence/offline/property-ubuntu-full-20261103-11/`.

### Perfil integral Ubuntu, quarta execução — 2026-11-03

O run `property-ubuntu-full-20261103-12` validou o candidato `69600084c6818ad48df6f6e25a2ace1e8634821f`, que removeu pedidos de aprovação por mensagem/chamada da bridge de agentes. O runner terminou com exit code 0 e `PROPERTY_UBUNTU_OFFLINE_PASS`: G00–G11 PASS; G12-01 e G12-06 PASS; G12-02–G12-05 PENDING para Windows, macOS, Android e iOS/iPadOS. Foram 70 casos PASS e quatro PENDING, sem FAIL, BLOCKED ou NOT_RUN; o isolamento passou e sua fronteira permaneceu inalterada. Esse resultado não é `PROPERTY_SCOPE_OFFLINE_PASS`.

O G4 incluído nesta execução manteve zero tools de solicitação de aprovação: chamadas dentro dos escopos de contato configurados seguem sem prompts por mensagem/sessão; chamadas fora deles são recusadas automaticamente. A identidade e os escopos ainda são definidos uma vez no setup/pareamento, e hosts MCP externos ainda podem aplicar confirmações próprias. Não se simulou revisão de pessoas reais. G11-03 passou pelos números fixos de 300 probes, três reinícios, nove partições e zero perdas. G11-02 usou a exceção documentada de reutilização: plugins necessários ao rebuild estavam ausentes do cache offline, mas os inputs Geode/build e a árvore instalada atual coincidiram com dois builds offline anteriores registrados; nenhum rebuild novo foi alegado. O executor registrado foi Codex GPT-6, preservado como proveniência e não como critério bloqueador. O plano lido pelo runner tinha SHA-256 `0ba5c29286d6e71bfc46fe6d8190e71c0e47e87f0ccce1567d278c184886fdd0`.

Os relatórios, manifesto, isolamento, inventário, 74 casos, checkpoints e reconciliações estão em `property/docs/evidence/offline/property-ubuntu-full-20261103-12/`. A auditoria local confirmou 103 checksums, 104 arquivos, JSON válidos, zero caminhos pessoais `/home/guilherme` e correspondência do hash do manifesto público sanitizado. Os padrões `nsec1` restantes aparecem apenas em código/regex de validação do formato, não em chaves ou segredos de ensaio. Uma auditoria cruzada posterior encontrou duas referências locais ausentes em G11-02; embora os manifestos herdados estivessem disponíveis na execução-fonte, os refs do pacote run12 não resolviam. Por isso, o PASS global calculado pelo runner run12 não é aceito como evidência completa; veja o run13 e a correção do auditor.

### Perfil integral Ubuntu, quinta execução — 2026-11-03 — falhou

O run `property-ubuntu-full-20261103-13` usou o candidato `331403a48d9c4433767e235e2eb1a70dd111d5ba` e terminou com exit code 1, resultado `FAIL`: 68 PASS, dois FAIL e quatro PENDING. G00–G10 passaram; G11 falhou em G11-01 e G11-05. G12-01 e G12-06 foram executados apenas como diagnósticos e ficaram inelegíveis por dependerem de G11; G12-02–G12-05 continuam PENDING por orientação do mantenedor.

As duas repetições de G11-01 reprovaram G04-04 em 3/6 subcasos: a UI marcou a mensagem “enviada” após ACK de outro relay, e a asserção fotografou zero envelopes no fixture falso antes de o kind 1059 chegar. A captura escrita no tratamento do erro registrou o envelope logo depois, confirmando a corrida de sincronização no teste; a execução não prova falha do produto nem aprova a jornada repetida. G11-02 passou pela reutilização exata prevista no plano, G11-03 passou 300 probes/três reinícios/nove partições/zero perdas e G11-04 passou. G11-05 achou zero referências de evidência ausentes, mas falhou porque somou os 74 registros iniciais aos 23 resultados atualizados e reportou 97/74; a consolidação precisa mesclar pelo ID do caso. As correções do auditor e da fixture estão no worktree para o próximo reteste integral desde G00. Evidências, incluindo os casos falhos e logs, estão em `property/docs/evidence/offline/property-ubuntu-full-20261103-13/`.

A sanitização do snapshot redigiu 45 ocorrências de caminhos pessoais em 18 arquivos, preservou o hash do manifesto bruto e registrou o hash do manifesto público sanitizado. A verificação final confirmou 104 arquivos, 103 checksums válidos, JSON/JSONL válidos e zero referências `/home/guilherme`; os dois textos `nsec1` restantes são regexes de validação do formato em código, não chaves. A checagem independente do G11-05 registrou 157 referências de evidência e zero ausentes; o FAIL foi a reconciliação 97/74 descrita acima.

### Perfil integral Ubuntu, sexta execução — 2026-11-03 — `PROPERTY_UBUNTU_OFFLINE_PASS`

O run `property-ubuntu-full-20261103-14` executou desde G00 com o candidato `44dd208fe98b5dc02b1a877b72c216edff672b4e`, terminou com exit code 0 e registrou 70 PASS e quatro PENDING, sem FAIL, BLOCKED ou NOT_RUN. G00–G11 passaram; G12-01 e G12-06 passaram; G12-02–G12-05 continuam PENDING para Windows, macOS, Android e iOS/iPadOS, conforme o escopo Ubuntu autorizado. O resultado é `PROPERTY_UBUNTU_OFFLINE_PASS`, não `PROPERTY_SCOPE_OFFLINE_PASS`.

G11-01 passou com 6/6 casos na execução inicial e em cada uma das duas repetições. G11-02 teve a compilação atual e sua repetição BLOCKED porque plugins/dependências Gradle não estavam no cache offline; o caso passou exclusivamente pela exceção expressa no próprio plano: os dois builds offline anteriores de entradas Geode/Gradle inalteradas tiveram a mesma árvore (`e72ec71548b600a37930307160cc52fbf93319cf7dec1998a967ea7eb6807f61`), idêntica à árvore instalada, sem entradas de build não rastreadas. Nenhum rebuild novo foi alegado. G11-03 passou 300 probes, três reinícios, nove eventos de partição e zero perdas. G11-05 reconciliou os 74 IDs do plano exatamente uma vez, sem caso NOT_RUN, com 159 referências e zero evidências ausentes. A evidência está em `property/docs/evidence/offline/property-ubuntu-full-20261103-14/`. A auditoria sanitizou 45 ocorrências de caminhos pessoais em 18 arquivos, preservou o hash de entrada do manifesto `8013f621adeea1cdcccdf83c9e5c738ec1a4e87dfbefedb29cff0ffe298d97aa` e registrou o hash do manifesto público `b7b14fb0634f429397fc386b94cca94973f2827b6731b9d5a64ab808d970c512`. Foram verificados 104 arquivos, 103 checksums válidos, JSON/JSONL válidos, zero caminhos pessoais e nenhum padrão de chave privada/credencial na evidência publicada.

### Ensaio suplementar XNO mainnet e correção posterior — 2026-11-03

Fora dos gates offline, um faucet creditou `0.0005 XNO` a um wallet local de teste. Duas contas de teste próprias realizaram e confirmaram uma transferência de `1 raw` na rede `live`. O `createNanoNodeLedger().lookupPayment()` inicialmente retornou `null` porque o RPC consultado normalizou `account_history` e omitiu o hash do bloco de origem. O adaptador passou a recuperar esse hash por `block_info`; o caso de regressão está em `ledger-rpc-smoke.mjs` e o ensaio mainnet sanitizado em `property/docs/evidence/live/nano-mainnet-20261103.md`.

Após essa correção, `node property/tests/ledger-rpc-smoke.mjs` e `bash property/tests/run-smoke.sh` passaram. A transação mainnet foi confirmada e o adaptador retornou `amount_atomic=1`, o hash do send, `confirmations=1` e `proof=true`. Esse ensaio não cobre `createAddress`, reembolso XNO, BTC/XMR mainnet, sincronização integral do nó local nem altera os resultados do run 11, que pertencem ao candidato anterior. O processo do nó de teste foi encerrado; o banco do wallet permanece privado e nenhuma seed/chave foi exportada.

### Perfil integral Ubuntu, execução 15 — 2026-11-03 — falhou em G02

O run `property-ubuntu-full-20261103-15` usou o candidato `6f96ad1bd41bd10777a7fd1f362205558e750c83` e terminou com exit code 1: G00 e G01 passaram; G02 falhou em G02-04; G02-05/G02-06 e G03–G12 ficaram NOT_RUN por dependência. O único FAIL foi uma premissa obsoleta do harness, que exigia `property-shell-v18` embora o service worker candidato já declarasse `property-shell-v19`. Este run não aprova G02 nem qualquer gate dependente.

O harness foi corrigido para ler a versão atual do service worker e derivar as versões dos três pacotes de atualização. O reteste isolado focado `property-ubuntu-g02-retake-20261103-02` aprovou G02-04, G02-05 e G02-06 no Chromium pinado (3/3), com saída zero do wrapper de isolamento. Seus relatórios e hashes estão no diretório citado. Esse reteste não substitui a execução sequencial do perfil: depois de publicar o candidato corrigido, o perfil integral deve começar novamente em G00 e executar todos os casos elegíveis.


### Perfil integral Ubuntu, execução 16 — 2026-11-03

No candidato publicado `505c000c0e36d0149d76acc1d9948dd3202c4030`, o run `property-ubuntu-full-20261103-16` terminou em `PROPERTY_UBUNTU_OFFLINE_PASS`: G00–G11 e G12-01/G12-06 passaram (70 casos); G12-02–G12-05 ficaram PENDING; não houve FAIL, BLOCKED ou NOT_RUN no perfil Ubuntu. O executor real foi Codex GPT-6, registrado como proveniência, não Luna Max. Isso não é `PROPERTY_SCOPE_OFFLINE_PASS`. A evidência está em `property/docs/evidence/offline/property-ubuntu-full-20261103-16/`; a auditoria redigiu 45 caminhos pessoais em 18 arquivos, validou JSON/JSONL e os 103 hashes da árvore, sem caminhos pessoais ou padrões de credencial na cópia pública.

O harness experimental de soak, posteriormente retirado do escopo, teve execuções de diagnóstico para depurar queda de processos e reconciliação. Os registros históricos incluem recuperações com SIGTERM/SIGKILL e reconciliação de 68/68 eventos em lotes de até 50 IDs (`property/docs/evidence/offline/property-relay-soak-harness-20261103-02/`). Esses ensaios não são critérios atuais nem deixam teste temporal pendente. A cobertura vigente usa contagens fixas; em G11-03, são 300 probes, três reinícios e nove eventos de partição reconciliados.

No workflow GitHub Actions `41726473880` do candidato `505c000c0e36d0149d76acc1d9948dd3202c4030`, as integrações nativas do relay em Windows, macOS e Ubuntu passaram, mas não houve isolamento de rede e o escopo não cobriu as jornadas completas de G12; são evidências complementares. O smoke da CI falhou porque `rg` não existia no runner. `agent-package-smoke.sh` foi ajustado para usar `grep -Fq`, e `bash property/tests/offline/run-isolated.sh bash property/tests/run-smoke.sh` passou integralmente no Ubuntu local, incluindo o pacote de agentes. O próximo push dispara a revalidação da CI.

### Revisão sem ensaio por duração e perfil integral Ubuntu — 2026-11-03/04

A meta suplementar de 24 horas foi removida por instrução do mantenedor. O ensaio de até cinco horas já aceito fica apenas no histórico; nenhum caso atual usa duração real como critério de aprovação. G11-03 continua baseado em contagens fixas.

O run `property-ubuntu-full-20261103-18`, candidato `f98cf906f9248669cc9d982f8b944c62f63fbe27`, terminou com `FAIL`, exit code 1: 68 PASS, dois FAIL e quatro PENDING. G00–G09 passaram. G10 falhou em G10-05 porque o cabeçalho ultrapassou a largura CSS de 180 px no cenário de 360×800 a 200% de zoom; G11 ficou BLOCKED por dependência; G12-06 não foi elegível por depender de G10; G12-02–G12-05 permaneceram PENDING conforme o perfil Ubuntu autorizado. O G11-03 diagnóstico executou 300 probes, três reinícios e nove eventos de partição sem perda, mas não certifica G11 enquanto G10 estiver reprovado. Evidências sanitizadas e checksums estão em `property/docs/evidence/offline/property-ubuntu-full-20261103-18/`.

O cabeçalho foi ajustado para larguras efetivas até 200 px e a versão dos caches PWA avançou para v21. O reteste focado G10-05/G12-06 passou nas oito larguras/zoom declaradas e a suíte smoke local completa passou; esse reteste é diagnóstico sobre o diff de trabalho, não substitui a próxima execução integral desde G00. A auditoria da evidência do run18 registrou 51 redações de caminhos locais em 18 arquivos, conferiu 103/103 hashes e não encontrou padrões residuais de caminho pessoal, token GitHub ou chave Nostr.

### Perfil integral Ubuntu, execução 19 — 2026-11-03/04 — aprovação visual retida

No candidato publicado `d8fa7e6e21b098468f70ead9bbd385f733abb390`, o harness terminou com exit code 0 e `PROPERTY_UBUNTU_OFFLINE_PASS`: G00–G11 e G12-01/G12-06 passaram (70 casos); G12-02–G12-05 ficaram PENDING; não houve FAIL ou BLOCKED. O G11-03 executou 300 probes, três reinícios, nove partições e cinco checkpoints de deduplicação, sem perda. G11-02 registrou que a recompilação offline não era possível por plugins Gradle ausentes, mas os inputs Geode/build e a árvore instalada correspondiam aos builds reprodutíveis já registrados. Isso é ressalva de build, não uma compilação nova neste candidato.

A inspeção visual feita pelo executor Codex reteve a aprovação UX do run19: na captura 180×400 CSS px, os quatro rótulos da navegação inferior ficaram comprimidos e difíceis de distinguir, embora as verificações automatizadas não encontrassem overflow. Essa inspeção não foi uma validação por pessoa usuária. A captura diagnóstica está em `property/docs/evidence/offline/property-ubuntu-full-20261103-19/later-gates/g10-05/g10-viewport-180x400.png`. O run19, portanto, documenta os resultados automatizados, mas não aprova a UX nem o candidato para fechamento.

A navegação para larguras efetivas até 200 px foi reorganizada em grade 2×2, com rótulos mantidos, e os caches PWA avançaram para v22. A nova captura local mostra os quatro destinos separados e legíveis. O candidato corrigido precisa passar novamente pelo perfil integral desde G00 antes de ser aceito. A execução não usa critérios por duração; Windows, macOS, Android e iOS continuam PENDING conforme o escopo Ubuntu autorizado.

### Perfil integral Ubuntu, execução 20 — 2026-11-04 — aprovação Ubuntu

O candidato publicado `0577a23c7ee6de0faf95ee8ca1b30649feb08ea9` terminou o perfil integral desde G00 com exit code 0 e `PROPERTY_UBUNTU_OFFLINE_PASS`: G00–G11 passaram e G12-01/G12-06 passaram (70 PASS); G12-02–G12-05 ficaram PENDING (4 casos); não houve FAIL, BLOCKED ou NOT_RUN. O namespace offline foi verificado. A inspeção visual do executor Codex na captura `later-gates/g10-05/g10-viewport-180x400-visual-review.png` confirmou que os quatro destinos aparecem separados e legíveis em grade 2×2 a 180×400 CSS px. Isso não equivale a validação por pessoa usuária; nenhuma revisão humana ou teste com participantes reais foi simulado.

G11-03 completou 300 probes, três reinícios, nove eventos de partição e os checkpoints de deduplicação/relógio lógico, sem perda. G11-02 passou pela comparação reprodutível dos inputs e da árvore instalada com os builds registrados: a recompilação Geode offline não foi possível porque plugins Gradle não estavam em cache, e nenhum download foi tentado. Portanto, este resultado não afirma um novo rebuild offline do Geode neste run.

O executor registrado foi Codex GPT-6; a identidade é metadado, não critério de gate. Os ensaios de Windows, macOS, Android e iOS/iPadOS seguem PENDING, conforme instrução do mantenedor. O resultado não é `PROPERTY_SCOPE_OFFLINE_PASS`. A evidência sanitizada, com hashes e relatórios estruturados, está em `property/docs/evidence/offline/property-ubuntu-full-20261103-20/`.

### Perfil integral Ubuntu, execução 21 — 2026-11-04 — evidência visual incompleta

O run `property-ubuntu-full-20261104-05`, candidato `dfa72e6116dcc8f2fea0455a84badeced95aff83`, encerrou com exit code 0 e o runner emitiu `PROPERTY_UBUNTU_OFFLINE_PASS` (70 PASS e quatro PENDING). A auditoria posterior encontrou que G10-05 não havia salvo as capturas de viewport exigidas para revisão visual. O resultado técnico fica preservado como histórico, mas não é aceito como evidência integral final; a captura foi adicionada ao harness e reexecutada desde G00 no run seguinte.

### Perfil integral Ubuntu, execução 22 — 2026-11-04 — aprovação técnica Ubuntu

O candidato publicado `2db0ccd8c36f780776cb30872becd8efd98042c7`, run `property-ubuntu-full-20261104-06`, concluiu o perfil offline desde G00 com exit code 0 e `PROPERTY_UBUNTU_OFFLINE_PASS`: G00–G11 passaram, G12-01 e G12-06 passaram, e G12-02–G12-05 permanecem PENDING para Windows, macOS, Android e iOS/iPadOS, conforme adiamento explícito do mantenedor. Foram 70 PASS e quatro PENDING em 74 casos, sem FAIL, BLOCKED ou NOT_RUN. O namespace de rede e as rotas IPv4/IPv6 somente de loopback foram verificados; nenhuma consulta DNS pública nem sonda TCP pública foi enviada. O resultado não é `PROPERTY_SCOPE_OFFLINE_PASS`.

G10-05 passou nas verificações automatizadas e salvou as oito capturas listadas em `property/docs/evidence/offline/property-ubuntu-full-20261104-06/later-gates/g10-05/visual-review.md`. No diagnóstico suplementar a 180 × 400 CSS px, o atalho “Nova conversa” do cabeçalho ficou visível e funcional; o botão central exigiu rolagem e então abriu o mesmo diálogo. A revisão visual por pessoa permanece `PENDING_HUMAN_REVIEW`; nenhuma aprovação humana nem resultado de participante foi simulado. G11-03 passou por 300 probes, três reinícios, nove eventos de partição reconciliados, zero perdas, cinco amostras de deduplicação visual e 31 passos lógicos de inatividade. G08 usou somente os ledgers locais declarados, sem fundos reais.

Em G11-02, plugins Gradle ausentes do cache bloquearam uma recompilação Geode nova. A exceção documentada passou pela comparação dos inputs inalterados, dos dois builds offline anteriores e da árvore instalada, cujo SHA-256 é `e72ec71548b600a37930307160cc52fbf93319cf7dec1998a967ea7eb6807f61`; este run não afirma um rebuild novo. A auditoria cobriu 188 referências a 67 arquivos únicos, sem ausências, e todos os hashes do `SHA256SUMS` passaram. A evidência sanitizada está em `property/docs/evidence/offline/property-ubuntu-full-20261104-06/`.

O executor real foi Codex GPT-6; Luna Max consta apenas como executor solicitado e não foi usado nesta sessão. Um worker suplementar de soak, separado dos gates por contagem fixa, foi interrompido por SIGTERM segundo a orientação vigente: registrou 189 probes sem falhas, mas não completou as interrupções planejadas; seu resultado é interrompido, não PASS, e não altera G11-03. A versão então registrada do plano não tinha critérios por duração; uma inclusão posterior de soak em G11-06 foi removida na revisão seguinte.

### Remoção do critério por duração e retomada de G11-06 — 2026-11-04

O run `property-ubuntu-full-20261104-07`, candidato `753521620a975bd53e5c77d11b2686d8d76a3e8d`, foi interrompido enquanto G11-06 ainda exigia 24 horas: o relatório parcial registrava 10/96 probes, zero ciclos de reinício e nenhuma falha funcional observada até ali. O processo externo terminou com exit code 1 porque a execução foi cancelada; o relatório do caso foi corrigido para `INTERRUPTED`, não uma falha funcional do produto. Essa tentativa é INCOMPLETA, não PASS, e não conta para os critérios revistos. O ensaio foi encerrado após o mantenedor reiterar que testes não devem depender de duração. G11-06 agora usa 96 probes, quatro reinícios em checkpoints de contagem, 12 eventos de partição, quatro checkpoints de deduplicação UI e amostras de recurso por contagem. A execução integral no novo candidato precisa recomeçar em G00; nenhum PASS anterior é herdado.

O run `property-ubuntu-full-20261104-08`, candidato `476c83a35bb8c5afad5bc38c614391f9e3eff116`, terminou com 68 PASS, um FAIL e seis NOT_RUN: G00–G10 e G11-01–05 passaram; G11-06 e o gate G12 não passaram/começaram. O harness iniciou sete relays e seis pontes, mas não observou o primeiro evento no segundo relay (0/96 probes; zero reinícios). A comparação com G11-03 identificou uma diferença no fixture: as pontes desse caso não usavam o mesmo epoch lógico fixo dos eventos. O harness foi corrigido para alinhar os relógios sintéticos; essa correção é hipótese de causa a confirmar por nova execução integral, e o run08 não aprova G11-06.

O run `property-ubuntu-full-20261104-09`, candidato `504faa2c9ef3201b6fbc88ec76503d01e0e48af6`, também terminou com 68 PASS, um FAIL e seis NOT_RUN. G00–G10 e G11-01–05 passaram; G11-06 passou as probes 1–54, dois dos quatro reinícios, seis eventos reconciliados e três checkpoints de UI, então o evento seguinte não chegou ao segundo relay. O fixture avançava o `created_at` a cada evento enquanto mantinha o relógio lógico das pontes fixo; depois de 54 eventos, a diferença fez o bridge tratar o evento seguinte como futuro. O run09 não aprova G11-06.

O run `property-ubuntu-full-20261104-10`, candidato `b272dd18aa512796a89ee881814ec0294b87e22d`, terminou com 68 PASS, um FAIL e seis NOT_RUN. G00–G10 e G11-01–05 passaram; G11-06 concluiu 48 probes, um reinício e três eventos de partição; a amostra visual da probe 48 não apareceu dentro do limite de 50 eventos do Hangout. Com epoch empatado em todo o corpus e três eventos adicionais da primeira partição, a ordem de retorno entre eventos empatados não garantia que o evento amostrado estivesse no feed. A revisão seguinte avançará o relógio lógico de todas as pontes em um passo fixo por evento, permitindo ordenar o corpus sem espera real. O run10 não aprova G11-06.

### Perfil integral Ubuntu, run `property-ubuntu-full-20261104-11` — 2026-11-04

O candidato `032dc5e56b749e1c85f78d118e83c90443eb47df`, run `property-ubuntu-full-20261104-11`, concluiu o perfil offline full desde G00 com `PROPERTY_UBUNTU_OFFLINE_PASS`: 71 PASS e quatro PENDING, sem FAIL, BLOCKED ou NOT_RUN. G00–G11 passaram; G12-01 e G12-06 passaram no Ubuntu; G12-02–G12-05 permanecem PENDING para Windows, macOS, Android e iOS/iPadOS, conforme instrução do mantenedor. Portanto, o resultado não é `PROPERTY_SCOPE_OFFLINE_PASS`.

G11-06 passou com 96/96 probes únicas em sete Geode e seis pontes; quatro reinícios após os checkpoints 24/48/72/96; três eventos de partição por ciclo (12/12 IDs reconciliados); quatro checkpoints UI com um card em cada ponte; 17 amostras de recurso por probe e quatro amostras após reconciliação (21 no total); zero perda, duplicação ou saída externa. Os eventos usaram epoch e relógio lógico fixos, avançados em um passo sintético por evento. Nenhuma duração real foi critério de aprovação. Em G11-02, a recompilação offline do Geode continuou indisponível por plugins Gradle fora do cache; a aprovação veio da reutilização exata, documentada, de builds anteriores com as mesmas entradas e do hash instalado coincidente, sem alegar recompilação neste run.

G10-05 passou nas verificações automatizadas e capturas; a aprovação humana das capturas continua pendente e não foi simulada. O executor Codex GPT-6 inspecionou as capturas, mas isso não substitui validação independente por pessoa. O relatório sanitizado, os manifestos, logs, capturas, JSON/JSONL e hashes estão em `property/docs/evidence/offline/property-ubuntu-full-20261104-11/`; a auditoria confirmou 114 checksums válidos, dados estruturados válidos, zero credenciais/chaves reconhecíveis e zero caminhos pessoais após sanitização.

### Reteste no commit publicado `f13bf27` — 2026-11-04

O run `property-ubuntu-full-20261104-12` passou G00 e G01, mas ficou BLOCKED em G02-02 porque o manifesto de laboratório registrou o hash do arquivo de entrada do Playwright em vez do hash da árvore inteira que o harness valida. A tentativa foi preservada em `property/docs/evidence/offline/property-ubuntu-full-20261104-12/`; não foi uma falha do produto. O manifesto foi corrigido usando o mesmo algoritmo recursivo do harness e o perfil reiniciado desde G00 no mesmo commit, sem alterar código de produto.

O run `property-ubuntu-full-20261104-13` executou o perfil Ubuntu integral no candidato `f13bf27ed9cf21de4a74ba514154d1611548107f` e terminou com `PROPERTY_UBUNTU_OFFLINE_PASS`: 71 PASS e quatro PENDING, sem FAIL, BLOCKED ou NOT_RUN no perfil. G00–G11 passaram; G12-01 e G12-06 passaram; G12-02–G12-05 continuam PENDING para Windows, macOS, Android e iOS/iPadOS. Isso não é `PROPERTY_SCOPE_OFFLINE_PASS`.

G11-03 passou com 300 probes, três reinícios, nove eventos de partição reconciliados, zero perdas, cinco amostras de deduplicação e 16 checkpoints de recursos. G11-06 passou com 96 probes em sete Geode e seis pontes, quatro reinícios, 12 eventos de partição reconciliados, quatro amostras de UI, 21 checkpoints de recursos e zero perdas, duplicações ou egress externo. Ambos usam contagens e relógios lógicos fixos; duração real não é critério. BTC regtest, XMR fakechain e Nano privado foram exercitados nos sete casos G08.

G10-05 passou nas asserções automatizadas e capturas, mas a aprovação humana das telas continua pendente; não foi simulada. A evidência dos runs 12 e 13 foi sanitizada, os arquivos JSON/JSONL foram revalidados, 25 e 114 checksums respectivamente conferem, e a auditoria não encontrou chaves `nsec`, tokens GitHub, credenciais RPC ou caminhos pessoais após a redação.

### Correção do harness G12 para não sondar destinos externos — 2026-11-04

A revisão do harness G12 encontrou uma requisição deliberada a `example.com` usada para tentar provar o bloqueio de egress. Isso contrariava a regra deste plano de não enviar tráfego externo para testar isolamento. A requisição e seu endpoint local de fixture foram removidos. O relatório G12 passou ao schema 2: exige zero probes externos intencionais e zero requisições externas observadas no proxy deny-all; relatórios antigos com a sonda não são aceitos. Isso corrige o harness, mas não executa nem aprova G12-02–G12-05.

Validação do ajuste: `node --check` passou nos três arquivos JavaScript alterados e `node property/tests/offline/runner-contract-smoke.mjs` passou. A suíte local completa (`bash property/tests/run-smoke.sh`) parou em `ledger-rpc-smoke.mjs` com `listen EPERM` ao abrir loopback dentro do sandbox; a tentativa de repeti-la em namespace de rede foi negada pelo ambiente com `unshare: Operation not permitted`. Essas falhas são limitações de execução do ambiente e não são registradas como aprovação nem como defeito funcional. Nenhuma sonda externa ou ensaio por duração foi executado. G12-02–G12-05 e a revisão humana de G10-05 permanecem pendentes.

### Perfil integral Ubuntu, run `property-ubuntu-full-20261104-16` — 2026-11-04

O candidato `91f27e6e3e38c4d99eaef1c164e4a76623a57a5d` completou a execução integral no Ubuntu desde G00 com `PROPERTY_UBUNTU_OFFLINE_PASS`: 71 PASS e quatro PENDING, sem FAIL, BLOCKED ou NOT_RUN. G00–G11 passaram; G12-01 e G12-06 passaram no Ubuntu. G12-02–G12-05 continuam PENDING para Windows, macOS, Android e iOS/iPadOS, conforme o escopo autorizado. Isso não é `PROPERTY_SCOPE_OFFLINE_PASS` nem certificação desses sistemas.

Todos os critérios de aprovação desta execução foram contagens, invariantes e entradas fixas. Não houve soak nem critério por duração real; timestamps são metadados e watchdogs apenas interrompem travamentos. G11-03 passou 300 probes, três reinícios e nove eventos de partição; G11-06 passou 96 probes, quatro reinícios e 12 eventos reconciliados. G08 usou somente ledgers privados locais e não envolveu fundos reais. G11-02 não fez rebuild Geode novo porque plugins Gradle não estavam no cache offline; passou pela exceção documentada de igualdade exata entre entradas e árvore instalada e dois builds anteriores, sem alegar recompilação neste run.

G10-05 passou as asserções de viewport e salvou as oito capturas, mas a revisão humana independente permanece PENDING; não foi simulada aprovação humana nem resultado de participante. O executor registrado no manifesto foi Codex GPT-6, como proveniência e sem efeito nos gates. A evidência está em `property/docs/evidence/offline/property-ubuntu-full-20261104-16/`: 115 entradas de `SHA256SUMS` conferidas, 32 JSON e sete JSONL válidos, 47 caminhos pessoais redigidos em 19 arquivos de texto e nenhuma chave privada, credencial RPC ou token reconhecível na auditoria.

### Auditoria do run `property-ubuntu-full-20261104-17` — evidência não aceita como integral

O executor havia reportado 71 PASS e quatro PENDING no candidato anterior, mas a auditoria descobriu que G00-02 estava PASS sem referência de evidência válida e que a verificação do runner não rejeitava um caso PASS sem referências. Esse resultado fica registrado como não auditável para fechamento; não se herda sua aprovação. O runner foi corrigido para exigir ao menos uma referência existente em todo caso PASS e a suíte de contrato cobre essa regressão. A correção foi publicada no commit `f7ef06e7408ae0406edb14539dde43a9bd300cf0`; o perfil integral reiniciou em G00 nesse candidato.

### Perfil integral Ubuntu, run `property-ubuntu-full-20261104-18` — 2026-11-04 — aprovação técnica Ubuntu

O candidato publicado `f7ef06e7408ae0406edb14539dde43a9bd300cf0` concluiu o perfil integral desde G00 com exit code 0 e `PROPERTY_UBUNTU_OFFLINE_PASS`: 71 PASS e quatro PENDING, sem FAIL, BLOCKED ou NOT_RUN. G00–G11 passaram; G12-01 e G12-06 passaram; G12-02–G12-05 continuam PENDING para Windows, macOS, Android e iOS/iPadOS, conforme instrução do mantenedor. Isso não é `PROPERTY_SCOPE_OFFLINE_PASS` nem certificação dos sistemas pendentes.

Todos os critérios de aprovação foram contagens, invariantes e entradas fixas. Não houve espera de soak nem aprovação por duração real; timestamps são metadados e watchdogs apenas encerram travamentos. G11-03 passou 300 probes, três reinícios, nove eventos de partição, cinco amostras de deduplicação visual e 16 checkpoints de recurso; o bloqueio por inatividade usou 31 passos de relógio lógico predeterminados, sem esperar 31 minutos. G11-06 passou 96/96 probes em sete Geode e seis pontes, quatro reinícios, 12 eventos de partição reconciliados, quatro amostras de UI e 21 checkpoints de recurso. G08 usou apenas ledgers locais privados, sem fundos reais. No run 18, o rebuild Geode não ocorreu: o log mostra que Gradle não encontrou o JDK 21 exigido e não havia provisionamento offline de toolchain configurado. O resumo automático atribuiu essa tentativa incorretamente a plugins/dependências ausentes; o reteste abaixo corrigiu o diagnóstico e executou dois builds novos.

A auditoria final confirmou 71 casos PASS com referências de evidência existentes, quatro PENDING, zero IDs duplicados, zero FAIL/BLOCKED/NOT_RUN e nenhuma referência faltante. O namespace de rede isolado foi verificado e não houve consulta DNS pública nem sonda TCP pública. G10-05 passou nas verificações e capturas automatizadas, mas a revisão humana independente da UX segue PENDING e não foi simulada; o índice com as oito imagens está em `property/docs/evidence/offline/property-ubuntu-full-20261104-18/later-gates/g10-05/HUMAN-REVIEW.md`. O snapshot original tinha 115 entradas SHA-256, 32 JSON e sete JSONL válidos; após o reteste G11-02 e o índice de revisão, a pasta contém 150 entradas verificadas, 37 JSON, sete JSONL e dois manifestos PWA válidos. Os 47 caminhos pessoais removidos pertencem ao snapshot original; o novo reteste não contém caminho pessoal nem padrões encontrados de token GitHub, chave Nostr ou PEM privado.

### Reteste isolado G11-02 com JDK 21 — 2026-11-04

No HEAD `f2e922bf867c338ff41c7a45e0a20d6d4361ba9a`, G11-02 foi reexecutado após disponibilizar OpenJDK 21.0.12.1 extraído em `/tmp`, sem instalação global ou inclusão do pacote no repositório. Os hashes dos pacotes Ubuntu usados, o candidato, o comando e a configuração estão em `property/docs/evidence/offline/property-ubuntu-full-20261104-18/later-gates/retakes/G11-02/retake-provenance.json`.

O reteste foi executado por `run-isolated.sh`; o namespace de rede passou pela asserção de isolamento e Gradle usou `--offline`. Duas execuções de `:geode:installDist` terminaram com código 0 e produziram a mesma árvore: SHA-256 `e72ec71548b600a37930307160cc52fbf93319cf7dec1998a967ea7eb6807f61`, 50 arquivos e 42.811.209 bytes, sem diferenças entre as saídas. O empacotamento PWA também passou com 23 assets e SHA-256 `09568357b884249ef664115e6b5dbf13534a77c51bb0f18928b25da4c673c9cb`. Essa evidência substitui, para G11-02, a reutilização dos builds anteriores no run 18. Os demais casos continuam cobertos pelo perfil integral no mesmo código de produto; entre o candidato de código `f7ef06e` e esse HEAD houve apenas documentação/evidência, sem mudanças nos inputs de build Geode/Gradle.
