# Plano de Testes Central — Property

**Atualizado:** 2026-10-31. **Executor previsto:** Luna Max. **Estado desta revisão:** por instrução expressa do usuário, G11-03 foi reduzido de 24 horas para no máximo cinco horas reais (18.000 segundos). O ensaio anterior `property-full-netns-20261031-20` permanece `FAIL`: durou 20.018,732 segundos, não executou os reinícios previstos e perdeu o probe 333 depois das cinco horas. Ele não aprova G11-03 nem será reescrito como aprovado. G00–G08 passaram no full recente; G09-01–06 e G10-01–06 passaram; G11-02 e G12-01–05 estão bloqueados ou incompletos. Ainda não existe aprovação do candidato completo. A execução disponível nesta sessão registra Codex GPT-6, diferente do executor previsto Luna Max, e essa diferença deve permanecer explícita no relatório.

## 1. Objetivo e autoridade

Demonstrar, por testes reproduzíveis de uso e de integração, que todo o comportamento funcional previsto no escopo consolidado do Property funciona sem acesso à internet, inclusive com vários layers/relays, usuários, falhas e pagamentos em redes privadas locais. O resultado central é PROPERTY_SCOPE_OFFLINE_PASS, definido na seção 4. Uma coleção de testes unitários aprovados não basta.

Fontes de requisitos: [identidade do projeto](identidade-do-projeto.md), [plano central](plano-central.md), [pagamentos](pagamentos.md) e [migração](migracao-property.md). Esta revisão substitui a ordem de execução e os gates da versão anterior. Os cenários e resultados anteriores foram preservados integralmente em [histórico de testes de 2026-10-31](historico-testes-2026-10-31.md); não constituem aprovação dos novos gates.

Neste plano, offline significa **internet bloqueada, rede local de laboratório permitida**. HTTP, HTTPS, WebSocket, RPC de carteiras e sincronização de blockchains ocorrem somente entre processos, VMs ou aparelhos autorizados no laboratório isolado. Há dois ensaios distintos: comunicação pela rede local isolada e abertura do shell já armazenado com toda conexão de dados interrompida. Este último não deve prometer envio de mensagem sem nenhum relay alcançável.

Layers designa as camadas exercitadas no laboratório: navegador/identidade, descoberta, vários relays e pontes, armazenamento e adaptadores financeiros. A cadeia entre relays usa o comportamento real do Property. Não pressupõe roteamento privado genérico, onion routing, novo protocolo P2P ou execução permanente de PWA suspensa.

## 2. Escopo que não pode ser reduzido para aprovar

| Requisito | Comportamento obrigatório | Gates |
|---|---|---|
| Origem e autonomia | Reuso Amethyst/Geode documentado, licenças, hashes, dependências locais e nenhuma busca de código em runtime | G00, G02 |
| Identidade | Chave aleatória local, senha protegendo cofre, sessão, bloqueio, backup e recuperação da mesma identidade | G01, G03, G10 |
| Comunicação privada | NIP-17, kind 10050, destinatário offline, repetição, falhas, confidencialidade e conexão direta aos relays | G04, G05, G09, G10 |
| Descentralização | Escolha/troca de relays, pontes voluntárias, vários caminhos e continuidade sem o host do app | G05, G09 |
| PWA utilizável | Primeiro uso, erros claros, cache, atualização, migração, acessibilidade e fluxo completo pela interface | G02, G03, G10, G12 |
| Hangout | Publicar/ler notas públicas, verificar autoria, deduplicar e iniciar conversa a partir da autoria | G06, G10 |
| Marketplace inicial | Publicar, descobrir, editar e retirar ofertas; BTC/XMR/XNO exatos; iniciar contato | G06, G08, G10 |
| Sustentabilidade dos nodes | Oferta, aceite/recusa, publicação paga, expiração e devolução; patrocínio opt-in e sem rastreio central | G07, G08, G10 |
| Nodes de computador | Runtime incluído, dados persistentes, reinício, limites, retenção e disponibilidade por até cinco horas no ensaio G11-03 | G00, G09, G11, G12 |
| Plataformas | PWA em desktop/Android/iOS e pacotes de relay Linux x86_64, Windows x64 e macOS Apple Silicon | G12 |

A engine financeira de campanhas permanece no escopo planejado, mesmo estando ausente no MVP atual. Sua ausência reprova a implementação correspondente; não autoriza apagar o gate, trocar o teste por um mock ou declarar a campanha paga porque existe um txid no evento.

Checkout, custódia, escrow e pagamentos de compras do marketplace, grupos privados, Lightning e relay móvel continuamente ativo não estão definidos como funcionalidades do MVP consolidado. Testar explicitamente que o app não simula essas capacidades. Mac Intel e outras arquiteturas de relay continuam expansões pendentes, sem alegação de suporte aprovado. Se o mantenedor ampliar esse escopo, acrescentar casos e gates antes de promover a ampliação.

## 3. Instruções de execução para o Luna Max

1. Ler primeiro este documento, os resumos das fontes e o AGENTS.md mais próximo. Trabalhar em coercaodobem/property, branch modelo-mvp, preservando alterações existentes. Não usar Amethyst upstream ou Gymoo como destino.
2. Inventariar o que existe e o que falta. Diferenciar teste existente, teste a implementar, funcionalidade ausente e ferramenta de laboratório ausente. Este documento não afirma que os scripts novos da seção 7 já existam.
3. Executar os gates em ordem. Para cada caso, ligar requisito, código real exercitado, passos, resultado esperado e evidência. Abrir os trechos de código pertinentes à falha, evitando carregar toda a base upstream. O perfil full também executa diagnósticos posteriores a um gate bloqueado, mas marca inelegíveis os gates dependentes.
4. Construir a infraestrutura de testes que estiver faltando. Quando houver falha do produto, corrigi-la dentro do escopo autorizado, registrar o defeito e repetir o caso e sua regressão. Não mudar o resultado esperado para acomodar o defeito. Mudanças de protocolo, criptografia, chaves ou desenho financeiro seguem o escopo aprovado e as instruções do repositório.
5. Nenhuma afirmação de PASS vem de inspeção do código, texto de log isolado, tela inicial, mock de sucesso ou resultado histórico. Cada aprovação exige execução do comportamento e asserções independentes sobre seus efeitos.
6. Usar exclusivamente identidades, mensagens, carteiras e valores sintéticos. Segredos ficam em diretórios temporários privados; não vão para relatórios, commits, HAR, capturas ou console. Não substituir contas reais ou diretórios de dados do usuário.
7. Não pedir nova autorização para os mesmos testes locais já autorizados. Não alterar firewall global, desligar a rede do computador do usuário, reiniciar o host, usar mainnet ou publicar dados como parte do ensaio. Falhas de rede/energia são simuladas apenas nos processos, volumes e interfaces do laboratório.
8. Persistir progresso após cada caso/gate. Na retomada, ler o manifesto e o último resultado; verificar se o commit mudou e invalidar aprovações afetadas. Um ensaio interrompido não vira PASS.
9. Não delegar, trocar de modelo, abrir PR ou publicar uma release automaticamente por causa deste plano. Luna Max é o executor previsto; registrar a identidade real do executor e não atribuir ao Luna Max testes feitos por outro modelo.

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
| G11 | Repetibilidade, ensaio real de até cinco horas e reconciliação | G10 |
| G12 | Matriz offline dos sistemas e navegadores alvo | G11 |

Estados por caso: PASS, FAIL, BLOCKED ou NOT_RUN. Funcionalidade ausente corresponde a FAIL; ferramenta/aparelho ausente corresponde a BLOCKED. Casos de rejeição aprovam quando a rejeição esperada acontece e o efeito proibido é comprovadamente ausente. Não existe aprovação por skip, TODO, warning ou erro engolido.

Todos os casos de um gate são obrigatórios. O gate passa somente com 100% dos casos em PASS, asserções completas e evidências válidas do código testado. Dependência reprovada bloqueia a certificação dos gates seguintes; diagnósticos independentes podem continuar, mas não produzem aprovação integral antecipada.

- **OFFLINE_FUNCTIONAL_PASS:** G00 a G11 aprovados.
- **OFFLINE_PLATFORM_PASS:** G12 aprovado para a matriz declarada, sem usar emulação visual como prova de sistema nativo.
- **PROPERTY_SCOPE_OFFLINE_PASS:** os dois resultados anteriores aprovados sobre o mesmo código e artefatos compatíveis. Nenhum FAIL, BLOCKED, NOT_RUN ou defeito funcional aberto do escopo.
- Publicação GitHub Pages, redes públicas, revisão independente de segurança e homologação física adicional de instalação/background são registros separados. Não são simuladas como resultados reais, não são necessárias para o laboratório funcionar e não são certificadas pelo resultado offline.

O orquestrador deve retornar código 0 somente para o perfil solicitado integralmente aprovado; 1 para reprovação e 2 para bloqueio, interrupção ou infraestrutura incompleta. Um perfil parcial aprovado não deve usar o nome PROPERTY_SCOPE_OFFLINE_PASS.

## 5. Preparação e topologia do laboratório

### 5.1 Ambiente fechado

- Fixar commit/diff, versões de protocolo, Node.js 22+, Python local quando necessário, navegadores, ferramentas de automação, runtimes, binários de moedas e licenças. Inventariar hashes de todos os executáveis usados.
- Preparação de ferramentas é uma fase distinta da execução offline. Ferramenta faltante gera BLOCKED com caminho/versão/hash necessários. Não baixar pacotes, navegadores, imagens Docker, Maven, npm ou atualizações durante os testes. Caches preexistentes só valem se inventariados e verificáveis. Cache de build ausente bloqueia o teste de build offline, sem afetar a definição do pacote de runtime.
- Usar namespace de rede, VM ou rede de contêineres já disponível sem rota externa; em Windows/macOS, usar isolamento equivalente na VM/máquina de laboratório. Autorizar apenas loopback e endereços/portas locais declarados. Uma rota externa residual, inclusive IPv6, proxy, WebRTC ou processo filho, reprova o isolamento.
- Comprovar o isolamento antes de iniciar os fluxos pela inspeção das regras efetivas de firewall/namespace, tabela de rotas IPv4/IPv6, configuração DNS/proxy e política aplicada aos processos do laboratório. Registrar a configuração e os contadores disponíveis antes/depois. Não enviar sondas TCP, consultas DNS ou qualquer tráfego a endereços públicos, inclusive endereços de documentação; se a política de isolamento não puder ser inspecionada ou aplicada, marcar BLOCKED. Erro de resolução, variável de ambiente ou interceptação de browser isoladamente não prova isolamento.
- Capturar conexões por processo e requisições do navegador. Desativar no perfil descartável sincronização de conta, atualização/extensões e fallback para relays públicos. Relays padrão do app devem ser substituídos por configuração de laboratório antes de qualquer conexão externa; se não existir esse caminho seguro, preparar o harness/configuração e registrar a lacuna do produto.
- O bloqueio de rede deve ser provado antes dos fluxos e verificado ao final. Mock/interceptação do navegador é defesa adicional, nunca a única fronteira.
- Servir o mesmo bundle em localhost e sob o caminho /property/. Para HTTPS/WSS, usar CA/certificado local de teste confiado apenas no laboratório. Não aprovar ignorando globalmente erros TLS. Capturar também uma tentativa WSS com certificado inválido e comprovar rejeição.
- Cada relay usa processo, porta, configuração e banco separados; cada identidade usa contexto/perfil de navegador separado. Dados do laboratório ficam em diretório temporário exclusivo. Nenhum relay de produção é iniciado/parado.

**Recursos:** começar por dois relays e medir RSS, CPU, disco e tempo; ampliar para a topologia completa sem reduzir os cenários. Como orçamento inicial de laboratório, exigir 4 vCPUs, 8 GiB de RAM física e 6 GiB livres no volume scratch usado pelo runner. A capacidade física é o piso de hardware; o consumo livre é medido separadamente no início de cada execução. Limitar o conjunto dos processos filhos a 70% da RAM então disponível e, para sete relays Geode concorrentes, dividir esse teto por relay, aplicando limites explícitos de heap, metaspace, code cache, memória direta e threads. Registrar todos os valores no inventário e medir o RSS real durante a topologia. Reservar 2 GiB de disco e parar de forma limpa ao atingir o limite. Esses valores são parâmetros de ensaio, não consumo medido nem requisito final do produto. Hardware abaixo do piso físico, scratch abaixo do limite ou teto que não comporte ao menos 128 MiB de heap e 64 MiB de metaspace por JVM gera BLOCKED. O scratch deve ficar no volume declarado pelo runner, não ser inferido de um `/tmp` montado em tmpfs. O ensaio de no máximo cinco horas só começa após os gates curtos passarem e com orçamento registrado.

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

### 5.3 Relógio, carga e comparações

Usar seed explícita para geração de cenários e sequência de falhas. Aleatoriedade de teste pode ser determinística apenas nas fixtures/harness; geração real de chaves, nonces e criptografia do produto conserva sua fonte segura. Nunca introduzir chave fixa ou nonce reutilizado no runtime do app para tornar um teste repetível.

Separar relógio lógico injetável no harness de duração de relógio real. Expiração, rate limit e reorganização podem ter tempo controlado em testes específicos; G11-03 mede pelo menos 17.998 e no máximo 18.000 segundos reais (cinco horas menos a margem de encerramento de dois segundos) e não aceita avanço artificial do relógio.

Corpus mínimo: 100 notas públicas distintas, 50 mensagens por direção, 10 ofertas por moeda e 10 campanhas por moeda. Na carga normal, respeitar o menor limite de eventos/bytes de cada ligação; enviar as notas a até 30 eventos/minuto e executar fases separadas. Acima do limite, o resultado esperado é a contenção declarada, não entrega total. Para cada corpus, reconciliar IDs, autores, destinatários, valores atômicos, ACKs válidos, eventos consultáveis e aparições na UI.

## 6. Casos obrigatórios por gate

### G00 — Preparação, isolamento e evidência

| Caso | Procedimento e aprovação |
|---|---|
| G00-01 | Registrar fontes de requisitos, commit, diff, inventário de ferramentas, hashes, sistema, limites, portas e topologia. Falta de dependência é explícita e impede iniciar o perfil afetado. |
| G00-02 | Aplicar isolamento de laboratório; inspecionar as regras efetivas e comprovar ausência de rota/egress TCP, DNS, IPv4, IPv6 e proxies, mantendo somente loopback e endereços locais declarados. Não enviar tráfego externo para testar o bloqueio. Conferir também as políticas do browser, relays, bridges, RPCs e processos filhos. |
| G00-03 | Inicializar dois Geode reais, depois os sete relays isolados; verificar prontidão, bancos distintos, permissões privadas e encerramento seguro. Porta ocupada/timeout nunca ativa fallback público. |
| G00-04 | Interromper um teste propositalmente. Relatório fica BLOCKED, exit não zero, filhos encerrados, evidência sanitizada preservada e dados reais intactos. |

### G01 — Regressão existente

| Caso | Procedimento e aprovação |
|---|---|
| G01-01 | Executar todas as 15 suítes atuais de run-smoke.sh dentro do isolamento. Conferir individualmente resultado, código de saída e o número de suítes; validar casos negativos. Atualizar esta contagem quando a lista de suítes mudar. |
| G01-02 | Executar integração entre dois relays reais e integração nativa do launcher. Verificar ACK positivo, consulta por IDs e persistência exata após reinício, não só contagem total. Ampliar o teste existente se só comparar contagens. |
| G01-03 | Demonstrar sensibilidade dos testes: adulterar apenas fixtures isoladas de assinatura, bundle/hash, preço atômico e backup; cada caso deve falhar pelo motivo previsto. Restaurar fixtures sem editar esperado ou desativar checks. |

### G02 — Pacote autônomo, PWA e migração

| Caso | Procedimento e aprovação |
|---|---|
| G02-01 | Inventariar código reaproveitado de Amethyst/Geode, bibliotecas locais e licenças; conferir commits, hashes e ausência de dependências dinâmicas no runtime. Rebuild offline quando toolchain local completo; registrar incompatibilidade web sem declarar Compose recompilado. |
| G02-02 | Abrir bundle limpo em localhost e /property/ com egress bloqueado. Todos os scripts, estilos, fontes, workers e manifesto são locais; nenhuma tentativa de CDN, analytics ou execução remota. Em instalação nova sem relays configurados, criar/desbloquear identidade não tenta conectar a relays públicos; exemplos públicos só conectam após ação explícita em “Salvar e conectar”. Repetir com cache vazio. |
| G02-03 | Instalar service worker, armazenar identidade e dados sintéticos; encerrar H e cortar relays. Shell reabre, identidade permanece, estado desconectado é claro e não afirma entrega. Religar só os relays: app em cache comunica diretamente sem H. |
| G02-04 | Simular atualização completa, atualização interrompida e artefato misturado. Sem perda de chave, conversas ou preferências; versão do shell é consistente ou retorna erro recuperável. Caches de outros apps permanecem intactos. |
| G02-05 | Importar backups legados, abrir banco legado e testar caminhos antigo/novo na mesma origem local; mesma identidade preservada. Testar senha errada, backup alterado e armazenamento indisponível sem criação silenciosa de outra conta. |
| G02-06 | Testar TLS/WSS válido e inválido, CSP e conteúdo malicioso. Sem desativar validação TLS, aceitar script remoto ou mudar política de produção para acomodar o harness. |

### G03 — Identidade, senha, recuperação e contatos

| Caso | Procedimento e aprovação |
|---|---|
| G03-01 | Pela UI, criar A e B com mesmo nome/senha de teste em contextos separados. Chaves diferentes; cofre cifrado; rede/armazenamento/logs não expõem senha ou chave privada. |
| G03-02 | Senha errada não altera a conta; correta desbloqueia a mesma identidade. Testar continuar conectado ligado/desligado, reabrir navegador, bloqueio manual e inatividade. Depois de bloqueado não há assinatura até desbloquear. |
| G03-03 | Exportar backup cifrado pela UI e restaurar em contexto limpo; conferir mesma chave pública e acesso à conversa. Perda de senha/recuperação não oferece reset central nem substitui identidade silenciosamente. |
| G03-04 | A obtém contato de B pelo perfil/compartilhamento e pelo botão de autoria do Hangout; testa npub, nprofile com hints locais e hex válidos. Confirmar destinatário e nome local antes de enviar, sem digitar chave privada. Não exigir registro GitHub nem servidor central. |
| G03-05 | Reproduzir a entrada coercaodobem no campo de nova conversa; testar vazio, chave truncada, nsec, contato próprio e nomes iguais. Erro compreensível em português, sem stack/Bech32 bruto; orienta obter o contato correto e não envia a identidade errada. Nome simples não é convertido silenciosamente em chave nem tratado como único global. Se busca por nome não existir, a UI explica os formatos aceitos e oferece o caminho disponível de compartilhar/selecionar contato. |
| G03-06 | Capturar requests e perfis de armazenamento antes/depois de cada ação; reconciliação automática comprova ausência de segredo, endpoint de login/recuperação central e perda de dados durante atualização. Capturas preservadas devem estar sanitizadas. |

### G04 — Mensagens reais de ponta a ponta

| Caso | Procedimento e aprovação |
|---|---|
| G04-01 | Pela UI, publicar listas kind 10050 de A/B em R0; validar assinatura e selecionar versão válida mais recente. Lista falsa, antiga, ambígua ou sem relays válidos não autoriza destino indevido. |
| G04-02 | A envia a B; B responde. Conferir textos na UI e nos destinatários, cópias previstas do remetente e persistência cifrada nos inboxes corretos. C com outra chave não decifra; H não recebe corpo, senha ou chave. |
| G04-03 | Fechar o contexto B, enviar A->B, reabrir B e sincronizar. Mensagem aparece uma vez; repetição por dois relays/reconexão não duplica. Retenção do relay de teste é conhecida. |
| G04-04 | Desligar um inbox de B, depois todos; testar ACK negativo, falso ACK sem persistência e reconexão. UI distingue envio aceito por relay, falha/parcial e leitura; não anuncia leitura só por ACK. Consulta independente detecta relay que mentiu. |
| G04-05 | Faltar kind 10050, adulterar destinatário/assinatura/envelope, manipular timestamp e repetir IDs. Não envia por fallback público; rejeita inválidos; nenhum terceiro recebe plaintext. |
| G04-06 | Executar o corpus nas duas direções e reconciliar cada ID/envelope/conversa no browser e no relay. Em fluxo normal, zero perdas e uma aparição por mensagem na UI. Capturar limites de metadados visíveis sem afirmar anonimato total. |

### G05 — Vários layers/relays e pontes

| Caso | Procedimento e aprovação |
|---|---|
| G05-01 | Na cadeia R1->R2->R3->R4, trafegar o corpus público usando três pontes do módulo real. B recebe apenas por R4; assinaturas, IDs e conteúdo permanecem idênticos. Contadores/ACLs comprovam cada salto e ausência de atalho. |
| G05-02 | Parar P23: evento novo deixa de alcançar R4. Restaurar e usar a janela de consulta/replay declarada para sincronizar eventos ainda elegíveis. Evento expirado não é inventado nem retransmitido fora da política. |
| G05-03 | Acrescentar caminho redundante em diamante, depois ciclo e estrela. Deduplicação garante uma aparição na UI; não há amplificação ilimitada. Desligar um caminho mantém entrega pelo outro, quando a topologia ainda conecta origem e destino. |
| G05-04 | Particionar grupos de relays e uni-los novamente; reiniciar uma ponte, receber eventos em ordem diferente e reconsultar. Reconciliar apenas o que a política de idade/retenção permite; perdas fora dessa política ficam explícitas. |
| G05-05 | Injetar envelope NIP-17 de B em R1: P12/P23/P34 e identidade C recusam encaminhá-lo. Em seguida usar a ponte de B, com B como identidade local, entre os próprios inboxes de B; só ela encaminha seu envelope cifrado aos destinos permitidos. A cópia de A segue a lista de A. |
| G05-06 | Testar ponte desligada/ligada, exclusão da origem, deduplicação, eventos inválidos/antigos/futuros e limites de 60 eventos/minuto e 2.000.000 bytes/minuto. Bytes de UTF-8 contam cada destino; excesso tem contenção observável. |
| G05-07 | Suspender/encerrar contexto móvel simulado e parar sua ponte. Relays de PC continuam disponíveis; reabrir retoma sincronização possível. Não aprovar serviço móvel contínuo a partir de contexto desktop emulado. |

### G06 — Hangout e marketplace inicial

| Caso | Procedimento e aprovação |
|---|---|
| G06-01 | A publica nota kind 1; B descobre em outro relay via cadeia pública, identifica origem e autoria e inicia conversa pela UI. Feed público permanece identificado como público; não oferece sala privada inexistente. |
| G06-02 | Publicar, descobrir e editar ofertas BTC/XMR/XNO pela UI; round-trip em Geode real preserva autoria, d, moeda e inteiro price_atomic. Testar 1 satoshi, 1 piconero, 1 raw e fronteiras documentadas sem Number/arredondamento no valor exato. |
| G06-03 | Retirar oferta e receber cópia antiga por outro relay: não reaparece. Pedido de retirada de outro autor ou timestamp inválido não remove oferta legítima. |
| G06-04 | Testar moeda desconhecida, precisão excessiva, overflow, listagem malformada, expiração e URLs/imagens inseguras. Nada executa código, busca tracker ou troca moeda/unidade silenciosamente. |
| G06-05 | Iniciar contato com vendedor sem checkout: destinatário correto, preço/termos preservados, nenhuma cobrança ou compra fictícia. Registrar limite do draft NIP-15; não declarar interoperabilidade além do formato testado. |

### G07 — Engine real de campanhas e privacidade

| Caso | Procedimento e aprovação |
|---|---|
| G07-01 | D envia proposta assinada a N1/N2. A engine do node valida conteúdo, valor, moeda, prazo e política. N1 aceita, N2 recusa independentemente; decisões persistem sem autoridade central. Engine ausente resulta FAIL. |
| G07-02 | Recusa não solicita pagamento nem publica anúncio. Aceite assinado vincula campanha, moeda, montante, endereço exclusivo, prazo e condições de reembolso; alteração posterior invalida o acordo. |
| G07-03 | Usar simulador determinístico de ledger apenas para testar a máquina de estados real: oferta->aceite->aguarda pagamento->confirmado->publicado->expirado; caminhos de recusa, pagamento inválido e devolução. Sem mockar a própria engine. Aprovação aqui não substitui G08. |
| G07-04 | Duplicar notificações, atrasar pagamento, alterar moeda/valor/endereço, reiniciar em cada transição. Publicação e reembolso idempotentes, sem ativação por txid declarado, crédito duplicado ou perda de conciliação. |
| G07-05 | Opt-in desligado por padrão, identificação de patrocínio, bloqueio de node e limite local de exposição funcionam. Criativo fica separado de feed e mensagens; envelope cifrado permanece inalterado. |
| G07-06 | Inspecionar tráfego ao consultar, exibir e clicar. Sem pixel, script remoto ou telemetria de leitura/clique/perfil. Link só abre por ação explícita em destino local de teste; tráfego normal da navegação não é ocultado no relatório. |
| G07-07 | Trocar de N1 para N2 e comparar políticas de exposição/retenção. Preferências locais respeitadas; ausência de anunciante/receita não impede comunicação básica nem cria cobrança oculta. |

### G08 — Liquidação BTC/XMR/XNO inteiramente local

Preparar binários fixados e carteiras descartáveis. Usar Bitcoin regtest, Monero em rede privada/regtest suportada pela versão e Nano em rede local privada com genesis de teste. Desabilitar seeds, descoberta e peers externos. Não usar signet, stagenet ou testnet pública para passar este gate. Registrar comandos compatíveis com os binários instalados; não inventar flags ou tratar mock como blockchain.

| Caso | Procedimento e aprovação |
|---|---|
| G08-01 | Para cada moeda, a engine e o adaptador real recebem pagamento no endereço/subendereço exclusivo. A carteira/node local fornece prova de valor e estado; só então publicar campanha. Conferir oferta, endereço, inteiro atômico, transação, confirmação e uma publicação. |
| G08-02 | BTC: saída/endereço errado, valor errado, pendente em mempool, conflito/substituição, confirmação e reorganização na cadeia privada. Gate de confirmação é explícito; ausência de transferência confirmada não ativa campanha. |
| G08-03 | XMR: subendereço, carteira atrasada, confirmações/desbloqueio, reorganização, taxas e recebimento duplicado. Endereço de origem não é presumido; hash isolado não aprova. |
| G08-04 | XNO: 1 raw e fronteiras, pagamento pendente, recebimento processado e confirmação; repetição/notificação fora de ordem não credita duas vezes. Carteira Nostr e Nano são independentes. |
| G08-05 | Nas três moedas, testar reembolso por acordo autenticado, taxas/valor líquido e mínimo, falha RPC antes/depois do broadcast e retomada após crash. Conferir ledger e estado antes de repetir; no máximo um débito financeiro válido. Nano pode testar devolução à conta validada; BTC/XMR não inferem endereço de reembolso. |
| G08-06 | Saldo insuficiente, moeda errada, pagamento atrasado e reorganização deixam estado conciliável, sem sucesso fictício. Conservação contábil por carteira: saldo inicial + créditos - débitos - taxas = saldo final, distinguindo pendente/bloqueado e disponível. |
| G08-07 | RPC autenticado apenas no laboratório, sem credencial na PWA/eventos/logs, limites de saldo/ação e ausência de mainnet. Nenhuma semente sai do host do operador. Desligar ledger real deve impedir confirmação, provando que o adaptador não usa sucesso constante. |

Os parâmetros de confirmações, taxas, mínimos e retenção precisam ser fixados no manifesto antes dos casos. Só parâmetros de testabilidade podem ser menores no laboratório; relatar a diferença para produção. Um mock de saldo ou txid fictício não substitui nenhum caso de G08.

### G09 — Falhas, abuso, persistência e migração do node

| Caso | Procedimento e aprovação |
|---|---|
| G09-01 | Encerrar abruptamente apenas os processos de teste durante escrita, envio, edição e campanha. Reiniciar com o mesmo banco; dados confirmados permanecem, nenhuma operação financeira/publicação é repetida indevidamente. |
| G09-02 | Proxy local de falhas injeta latência, queda, reordenação, desconexão, frames inválidos, ACK falso/negativo e relay indisponível. Cliente sinaliza estado real, recupera conexões e limita retries/recursos. |
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
| G10-05 | Viewports 360x800, 390x844, 768x1024 e 1440x900; teclado, zoom 200%, foco visível, nomes acessíveis e avisos em português. Sem controle essencial oculto/inacessível ou rolagem horizontal involuntária. Tamanho móvel emulado não equivale a instalação iOS/Android. |
| G10-06 | Registrar bytes iniciais do bundle, CPU/RSS/disco e latência. Metas locais deste plano: shell utilizável em até 3 s; p95 de mensagem direta <=5 s; p95 de nota em três pontes <=10 s; retomada de conexão <=30 s após restaurar rota. Medir pelo menos 50 mensagens e 100 notas, após aquecimento, respeitando cotas. Não extrapolar para internet/4G. |

Se a ferramenta não fornecer uma métrica, instrumentar o harness ou registrar BLOCKED; nunca preencher com estimativa. Os limites acima são critérios de aceitação propostos por este plano, não resultados obtidos. Mudança exige justificativa técnica anterior ao reteste, nunca ajuste silencioso ao resultado.

### G11 — Repetibilidade, até cinco horas e fechamento

| Caso | Procedimento e aprovação |
|---|---|
| G11-01 | Repetir o conjunto funcional curto duas vezes com a mesma seed em laboratórios limpos e uma terceira vez com seed diferente. Mesmas invariantes e contagens esperadas; diferenças de chaves/IDs criptográficos não são comparadas como identidade entre execuções. |
| G11-02 | Repetir montagem/hash dos runtimes e empacotamento da PWA offline. Build do código reaproveitado usa ferramentas/dependências locais inventariadas; registrar hashes e explicar variações não determinísticas. Falta de toolchain bloqueia a alegação de rebuild reproduzível, sem fingir que hash do binário prova compilação. |
| G11-03 | Rodar o soak por 17.998–18.000 segundos reais (até cinco horas), com ao menos três relays, duas pontes e clientes de teste. O executor rejeita duração acima de 18.000 s. Enviar probes periódicas de publicação/consulta; programar três reinícios do relay intermediário em 1h, 2h30 e 4h; em cada parada, publicar um evento, provar que ele não pula a camada indisponível e confirmar a reconciliação após o retorno. Verificar persistência, zero perdas de eventos aceitos, ausência de duplicatas na UI (um evento consultado por relays múltiplos deve renderizar um cartão) e orçamento de recursos: RSS agregado dos três processos do relay <=70% da memória disponível no início do ensaio, CPU e disco registrados, scratch <=2 GiB. Após 30 min sem interação, confirmar que a identidade é bloqueada e a chave sai da sessão, enquanto o encaminhamento público explicitamente habilitado continua; confirmar que a tela bloqueada oferece comando para parar a ponte. Soak curto ou de um único relay não aprova o cenário. |
| G11-04 | Conciliar corpus, estados financeiros, caches e volumes; auditar egress do início ao fim. Sem inconsistência, perda de evento aceito e retido, operação financeira duplicada ou segredo nos artefatos. |
| G11-05 | Gerar relatório por gate, lista de defeitos encerrados/abertos, hashes de evidência e comando de reprodução. Ensaios interrompidos/faltantes impedem OFFLINE_FUNCTIONAL_PASS. |

### G12 — Sistemas e navegadores offline

| Caso | Ambiente e aprovação |
|---|---|
| G12-01 | Linux x86_64: launcher com runtime incluído, caminho com espaços, permissões, SQLite, corpus, reinício e PWA em Chromium/Firefox locais. Repetir sem Java no PATH do processo. |
| G12-02 | Windows x64 real ou VM Windows: PowerShell, runtime incluído, caminhos com espaços, persistência/limpeza e PWA Edge/Chrome. Wine, parsing do .ps1 ou runner Linux não aprovam execução nativa. |
| G12-03 | macOS Apple Silicon real ou VM compatível: launcher, runtime, persistência e PWA Safari/Chrome. WebKit Linux não certifica Safari macOS, nem runner x64 certifica arm64. |
| G12-04 | Android: navegador no emulador/aparelho de laboratório com rede isolada; identidade, mensagem, recuperação e reconexão após suspensão. Registrar browser/versão e capacidade de instalação observada. |
| G12-05 | iOS/iPadOS: Safari em simulador disponível em Mac ou aparelho local, sem internet; mesmos fluxos e retomada. Marcar se adicionar à tela inicial/instalação requer aparelho físico e não foi comprovado. |
| G12-06 | Conferir comportamento quando instalação PWA não é suportada: site segue utilizável e não oferece instrução falsa. Registrar instalação/background físicos como não comprovados quando só houve simulador; não bloquear indevidamente a aprovação funcional do site por ausência de API de instalação no ambiente declarado. |

O pacote e o mesmo conjunto de fixtures devem ser transferidos previamente para os ambientes locais; cada ambiente executa com egress bloqueado e produz relatório próprio. GitHub Actions pode entregar evidência complementar, mas jobs que baixam actions/toolchains não são ensaios offline desta revisão. Se um sistema/navegador não estiver disponível, o caso é BLOCKED e PROPERTY_SCOPE_OFFLINE_PASS não é concedido. A aprovação funcional em simulador não certifica instalação física ou funcionamento permanente em segundo plano.

## 7. O que já existe e o que o executor deve construir

### Comandos existentes, a executar somente dentro do isolamento preparado

Na raiz do checkout:

    bash property/tests/run-smoke.sh
    bash property/tests/run-bridge-integration.sh 17450 17451
    node property/tests/native-relay-integration.mjs

Ensaio existente de um relay, útil como diagnóstico e sem equivalência ao G11-03 completo:

    node property/tests/relay-soak.mjs 18000 60 17447

As portas são valores de exemplo; conferir disponibilidade e reservar portas por execução. O launcher deve usar DATA_DIR/CONFIG_DIR temporários, separados dos diretórios reais do usuário.

### Infraestrutura de teste: implementação e estado

| Entrega planejada | Contrato mínimo |
|---|---|
| Orquestrador offline | O perfil full percorre G00–G12; `run-offline.mjs` valida manifesto/inventário, exige a origem declarada do executor, falha fechado se isolamento não for provado e só inicia relays depois do G00 elegível. `--resume` verifica commit, diff, plano, manifesto, perfil, relatório e hashes, arquiva a tentativa e reinicia em G00 sem carregar PASS. Diagnósticos posteriores podem rodar mesmo quando um gate financeiro bloqueia, mas ficam inelegíveis. |
| Manifesto de laboratório | Valida seed, commit, origem do executor, orçamento, portas, browser/engine/versões e hashes. Registra diff, arquivos, fontes, ferramentas e ferramentas financeiras externas por caminho absoluto e SHA-256. Credenciais RPC são geradas apenas dentro do processo/teste e não constam no manifesto persistido. |
| Harness de múltiplos relays | Scripts de dois e sete Geode e os harnesses browser G05/G09/G11 exercitam relays reais, pontes PWA, topologias, falhas, limites, reinício, reconciliação e soak. G09 contém ensaios para crash, armazenamento limitado, eventos hostis, runtime adulterado e falha isolada; G11 contém repetição, ambiente de build e soak real de até cinco horas com três reinícios e reconciliação de partições. |
| Automação de navegador | Os executores usam Playwright/browser pinados por versão/hash, servidor localhost, proxy de bloqueio e captura de solicitações, WebSockets e erros. G10 herda as jornadas completas do mesmo full run e executa ainda viewports de desktop/móvel, zoom aproximado de 200%, foco, nomes acessíveis e fallback sem instalação PWA suportada. |
| Engine e adaptadores financeiros | G07 exercita a engine persistente/assinada com ledger determinístico, somente para a máquina de estados. G08 tem harness de BTC Core, Monero e Nano com binários reais e hash-pinned, redes/carteiras privadas, RPC local autenticado, reconciliação e casos financeiros. G07 não substitui a liquidação real de G08. |
| Relatório automatizado | O perfil full registra 74 casos, checkpoints, eventos, manifesto, inventário, topologia, isolamento, relatório e hashes. As evidências históricas não aprovam o candidato atual. A certificação requer o full run do mesmo candidato, incluindo G08, o G11-03 de até cinco horas e a matriz disponível de G12; plataformas físicas ausentes continuam BLOCKED. |

Comandos do runner parcialmente implementado:

    node property/tests/offline/run-offline.mjs --profile core --manifest /caminho/lab.json
    node property/tests/offline/run-offline.mjs --profile platforms --manifest /caminho/lab.json
    node property/tests/offline/run-offline.mjs --profile full --manifest /caminho/lab.json
    node property/tests/offline/run-offline.mjs --profile core --manifest /caminho/lab.json --output /caminho/run-id --resume

O runner full executa os casos de G00–G12, condicionando G08 ao manifesto hash-pinned das ferramentas de ledger. A retomada exige o mesmo manifesto e diretório; mudança no commit, diff/arquivos alterados, plano, configuração, perfil ou relatório dependente invalida a retomada antes de mover artefatos. Cada tentativa é arquivada, hashes são conferidos quando disponíveis, e a nova tentativa recomeça no G00 sem herdar PASS. Ausência de ferramenta/dispositivo permanece BLOCKED; funcionalidade ausente permanece FAIL.

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

Guardar o histórico de tentativa e correção, sem sobrescrever a falha inicial. Campo de observação não substitui uma asserção. Comparar o commit/diff e a configuração em cada retomada: alteração no código invalida ao menos o caso afetado e seus dependentes; qualquer certificação final requer regressão compatível do conjunto completo, incluindo soak da versão candidata final. Não reaproveitar soak de binário anterior como se fosse do novo.

## 9. Rastreabilidade do plano anterior

Todos os casos antigos permanecem consultáveis no histórico. A tabela explicita sua cobertura sem apagar requisitos pendentes; para cada caso individual, o relatório do Luna Max deve apontar o novo caso executado e sua evidência.

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

O histórico registra 12 suítes locais aprovadas, integração de dois relays, publicação anterior e matriz nativa Linux/Windows/macOS. Esses resultados ajudam a reproduzir o baseline; não aprovam automaticamente isolamento, sete relays, jornadas completas, engine financeira, redes privadas, novo soak ou nova matriz offline.

Lacunas conhecidas no início desta revisão: orquestrador full, harness de sete relays/falhas, jornadas de navegador, engine de campanhas/pagamentos, ferramentas de ledger local, soak de disponibilidade e matriz de plataformas. Os executores desses gates foram integrados desde então. A aprovação do candidato corrente continua pendente até o full run encerrar, e ausência de ambiente nativo em G12 deve constar como BLOCKED.

### Checkpoint histórico — 2026-10-31

Evidências sanitizadas do checkpoint anterior: `property/docs/evidence/offline/property-g00-resume-20261031-i/`; `...-c/`, `...-e/`, `...-f/`, `...-g/`, `...-h/` e `property-g00-shell-static-20261031/` foram preservados como histórico. `i` foi executado após a validação de retomada e o bloqueio de symlinks na árvore de evidências, no commit-base `7aff8e448898e674f8448a2dd847a64faceda8cd`, e registrou 79 arquivos alterados/não rastreados. G00-01 PASS; G00-02 BLOCKED; G00-03 BLOCKED e relays não iniciados; G00-04 PASS, porém inelegível para aprovar o gate porque o isolamento falhou. G01–G12 NOT_RUN; nenhum gate foi aprovado. `inventory.json` contém os hashes das fontes e do plano usados.

O diagnóstico corrente e seus hashes estão em `property/docs/evidence/offline/property-g00-shell-current/`; consulte `summary.json` e `isolation.json` para o resultado exato. O inventário inclui o fechamento estático dos assets locais e páginas no shell offline, os executores parciais G02 e a origem declarada do executor. `app-contract-smoke.mjs` e `g02-origin-smoke.mjs` passaram em execução direta de diagnóstico; isso não aprova G02 nem substitui jornadas reais de navegador com egress bloqueado.

O bloqueio ambiental anotado no checkpoint `property-g00-resume-20261031-i` era histórico: naquela tentativa não houve namespace nem bind loopback. A execução full `property-full-netns-20261031-11` comprovou isolamento com namespace distinto e rotas loopback-only; aprovou G00–G06 (37 casos) no candidato anterior a esta engine. O resultado geral permaneceu BLOCKED porque G07–G12 estavam NOT_RUN e o executor efetivo era Codex GPT-6, diferente do Luna Max solicitado. O resumo e o relatório estão no diretório de evidências do run 11; esse histórico não serve para aprovar as novas alterações.

### Checkpoint de retomada — 2026-10-31

O bloqueio antigo de G00 está superado. A execução full `property-full-netns-20261031-10` registrou G00–G05 como PASS e isolamento PASS: 32 casos aprovados, 42 NOT_RUN. O resultado geral permaneceu BLOCKED porque G06–G12 ainda não estavam integrados e o executor efetivo Codex GPT-6 diferiu do Luna Max previsto. Evidência: `property/docs/evidence/offline/property-full-netns-20261031-10/summary.json` e `report.md`. O registro histórico `property-g00-resume-20261031-i` está preservado e não representa o estado atual de G00.

O ensaio isolado `property-g05-isolated-20261031-08/browser-g05-report.json` aprovou G05-01–07 com quatro Geode reais e pontes PWA: cadeia R1→R4, falha e replay, diamante/ciclo/estrela, partição/reconciliação, isolamento de envelopes privados, toggle e cotas, e encerramento/reabertura de viewport móvel simulado. Ele não certifica suspensão real do sistema operacional móvel.

G05 encontrou e corrigiu uma corrida: o fechamento atrasado de um WebSocket antigo apagava o estado de assinatura da ponte nova. O callback agora só remove assinatura e consultas quando o socket que fechou ainda é o atual. O caso móvel também encontrou ausência de acesso às configurações de relays em viewport compacto; foi adicionado um botão de configurações no topo para essa largura.

O novo harness `browser-g06-smoke.mjs` aprovou G06-01–05 isoladamente em `property/docs/evidence/offline/property-g06-isolated-20261031-09/`: dois Geode, três clientes PWA, ponte R1→R2, Hangout kind 1, publicação/edição de um satoshi/um piconero/um raw, retirada/tombstone, autoria, expiração, moeda, timestamps, conteúdo hostil e contato sem checkout. A aplicação agora rejeita moeda não suportada, incoerência entre preço decimal e atômico, valor atômico fora dos limites, evento vencido/futuro e conteúdo inválido; o shell offline foi atualizado para a versão v11. O último `run-smoke.sh` aprovado contou 14 executores antes da inclusão da engine.

### Checkpoint atual — 2026-10-31, full run 14

Evidência sanitizada em `property/docs/evidence/offline/property-full-netns-20261031-14/`. O relatório registra 44 casos PASS e 30 NOT_RUN: G00–G07 PASS; G08–G12 NOT_RUN. O isolamento permaneceu PASS antes e depois, com namespace distinto do pai, somente `lo` ativo e rotas IPv4/IPv6 restritas ao loopback. O checkout e o commit-base observados foram `7aff8e448898e674f8448a2dd847a64faceda8cd`; as alterações locais estão discriminadas no inventário.

G00 **não está bloqueado**: os quatro casos e o isolamento passaram no full run 14. O run 13 foi iniciado sem o wrapper `run-isolated.sh`, não recebeu a identificação do namespace pai e foi corretamente bloqueado pelo controle. O run 14 usou o wrapper, provou o isolamento e aprovou G00.

G02 também foi retestado isoladamente em `property/docs/evidence/offline/property-g02-isolated-20261031-13/`: G02-04/05/06 PASS após aguardar o service worker controlar a página antes da interação. O runner preserva como NOT_RUN os casos que não começaram.

G07 passou integrado no run 14. A engine persistente e assinada e o harness real de browser/relays passaram nos sete casos usando ledger determinístico, permitido somente para validar a máquina de estados nesta etapa. G08 ainda exige ledgers privados reais; o inventário do run 14 não encontrou `bitcoind`, `monerod`, `monero-wallet-rpc` nem `nano_node`. O ledger determinístico de G07 não substitui G08.

O objetivo permanece PROPERTY_SCOPE_OFFLINE_PASS. G08–G12 e as evidências correspondentes ainda precisam de aprovação. Este checkpoint é parcial. Aprovação offline demonstra o comportamento nas condições e plataformas ensaiadas; não equivale a lançamento público ou auditoria independente de segurança.
