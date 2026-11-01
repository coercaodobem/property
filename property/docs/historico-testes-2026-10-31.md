# Plano de Testes Central — Projeto Property

**Status:** execução parcial atualizada em 2026-10-31. Repositório e produto renomeados para Property. As 12 suítes smoke locais passaram, incluindo BTC/XMR/XNO, backups antigos e pacotes portáteis. A matriz [41186913676](https://github.com/coercaodobem/property/actions/runs/41186913676) passou em Linux x86_64, Windows x64 e macOS Apple Silicon, com runtime incluído e persistência após reinício. A PWA está publicada em HTTPS; o registro de arquivos servidos acompanha a versão correspondente. Em 2026-10-31, por decisão expressa do usuário, o requisito G11-03/NOD-01 foi reduzido para no máximo cinco horas reais; os registros de ensaios antigos de 24 horas abaixo permanecem apenas como histórico e não valem como aprovação do novo ensaio. Dispositivos móveis reais e engine de pagamento/checkout continuam pendentes.
**Objetivo:** verificar reuso do Amethyst, dependências, identidade, comunicação, nodes, PWA, publicidade e pagamentos BTC/XMR/XNO.

## 1. Baseline do MVP

Este plano considera a visão consolidada em [identidade-do-projeto.md](identidade-do-projeto.md) e [plano-central.md](plano-central.md):

- A interface principal é uma PWA para navegadores móveis e desktop. Durante desenvolvimento, usar ambiente local/staging; o site institucional e a publicação pública ficam para depois de o app estar pronto.
- Na fase de lançamento, o GitHub Pages pode servir o pacote estático diretamente do repositório público Property. Ele entrega a interface e atualizações; não encaminha mensagens nem fornece funções de backend.
- O navegador conecta diretamente por WebSocket seguro a vários relays compatíveis com Nostr; `ws://` só é permitido para localhost de desenvolvimento. Relays transportam eventos/dados, não código executável do cliente.
- O pacote de runtime contém os arquivos executáveis necessários: sem scripts, módulos, fontes ou WebAssembly carregados de CDNs, Amethyst, Maven ou JitPack enquanto o usuário abre o app. O repositório registra versões, hashes, origem e licenças das dependências.
- A base prioritária é um fork/reuso máximo do repositório público do Amethyst. Selecionar e registrar um commit fixo, revisar módulos e dependências, preservar atribuição e licença MIT. Reutilizar Quartz/lógica Nostr, eventos, relays, identidade, criptografia, NIP-17, NIP-15 e testes quando compatíveis. O alvo PWA não é presumido: a UI Android/desktop precisa passar por prova de compatibilidade web.
- Mensagens privadas usam criptografia ponta a ponta baseada em padrão Nostr compatível, com NIP-17 como escolha inicial. Relays guardam eventos cifrados; validar metadados visíveis e versão exata do protocolo antes de implementar.
- O cliente publica em mais de um relay selecionado. A PWA tem uma ponte opcional e de melhor esforço entre relays selecionados: eventos públicos assinados são replicados; gift wraps NIP-17 só seguem para inbox relays da própria identidade. Isso não é encaminhamento P2P genérico nem execução móvel em segundo plano.
- A identidade é criada com chave aleatória local. A senha cifra/desbloqueia a chave armazenada no navegador; não é usada diretamente como chave privada e não é enviada a nenhum servidor. A recuperação é local, sem redefinição central.
- PCs podem operar relays/nodes continuamente. A PWA móvel só colabora enquanto ativa e não promete manter conexão ou node em segundo plano.
- Publicidade é um evento/cartão separado de mensagens privadas. O anunciante envia uma campanha assinada com criativo, link, oferta com moeda, valor atômico e validade. O node revisa e aceita ou recusa antes de receber pagamento.
- Ao aceitar, o node emite endereço exclusivo da moeda e prazo. O anúncio só é publicado após pagamento confirmado. Recusa anterior ao pagamento não exige reembolso; pagamentos inesperados, atrasados ou incompatíveis seguem devolução como nova transferência.
- O preço é uma oferta por colocação durante período acordado, sem cobrança por clique nem garantia de impressões. O node controla sua carteira localmente; a chave Nano é separada das chaves Nostr e não fica na PWA.

Referências de protocolo para pesquisa e fixação da versão no projeto: [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [unidades e blocos Nano](https://docs.nano.org/integration-guides/the-basics/). Referências upstream do reuso: [Amethyst](https://github.com/vitorpamplona/amethyst), [README e arquitetura](https://github.com/vitorpamplona/amethyst/blob/main/README.md), [licença](https://github.com/vitorpamplona/amethyst/blob/main/LICENSE). Esses links são documentação; não podem ser dependências do cliente em runtime.

## Execução registrada

| Data | Comando/ensaio | Resultado e limite |
|---|---|---|
| 2026-10-27 | `node property/tests/protocol-smoke.mjs` | PASS: assinatura/embrulho NIP-17, isolamento de chave, plaintext ausente no envelope, validação e roteamento de listas kind 10050, AES-GCM e hash vendorizado. |
| 2026-10-27 | `node property/tests/vault-smoke.mjs` | PASS: criação e desbloqueio do cofre, senha incorreta, sessão local persistente e backup cifrado. |
| 2026-10-27 | `node property/tests/app-contract-smoke.mjs` | PASS: CSP, assets locais/PWA, caminhos relativos compatíveis com `/property/`, registro de service worker, ações Pages fixadas por SHA, ausência de `eval`, sintaxe JS e shell. |
| 2026-10-27 | Simulação local `http://127.0.0.1:4175/property/` e `/property/about.html` | PASS: app e página Sobre servidos da subpasta prevista para Pages; navegação interna permaneceu em `/property/`; nenhum conteúdo foi publicado externamente. |
| 2026-10-27 | ESLint 6.4 `--rule no-undef:error` nos módulos web | PASS: sem referências globais não definidas. |
| 2026-10-27 | `node property/tests/relay-package-smoke.mjs` | PASS: 130 segmentos reconstroem o pacote portátil exato de 67.845.545 bytes e conferem com SHA-256 fixado. |
| 2026-10-27 | `./property/relay/start.sh` usando somente `dist-parts/` e `node property/tests/relay-integration.mjs ws://127.0.0.1:7447` | PASS: reconstrução, verificação SHA-256 e início padrão sem Java instalado; relay validou eventos cifrados/kind 10050. |
| 2026-10-27 | `PROPERTY_RELAY_PORT=17450 PROPERTY_RELAY_DATA_DIR=/tmp/property-relay-cli-test-data PROPERTY_RELAY_CONFIG_DIR=/tmp/property-relay-cli-test-config ./property/relay/start.sh` + `node property/tests/relay-integration.mjs ws://127.0.0.1:17450` | PASS: launcher Ubuntu iniciou Geode em loopback usando dados temporários; NIP-17, kind 10050 e listagem NIP-15 com `price_raw` exato passaram; dados temporários removidos. |
| 2026-10-27 | `:geode:geodeImage` com JDK 21 local | PASS: Geode 1.20.0 e runtime Java portátil para Linux x86_64. |
| 2026-10-27 | `node property/tests/relay-integration.mjs ws://127.0.0.1:17447` e `ws://127.0.0.1:7447` | PASS: Geode aceitou/armazenou envelopes cifrados e kind 10050; consulta retornou a lista de inbox assinada e a mensagem permaneceu ilegível no relay. A segunda execução usou o comando/porta padrão do launcher; diretórios de dados temporários. |
| 2026-10-27 | `node property/tests/relay-integration.mjs ws://127.0.0.1:17448` | PASS: Geode local armazenou e serviu evento NIP-15 assinado com valor numérico `0.25` e `price_raw` exato, além dos testes NIP-17/kind 10050. O valor raw permaneceu inalterado; nenhum pagamento foi feito. |
| 2026-10-27 | Validar diretórios do launcher e usuário do processo | PASS: relay iniciado por UID não-root; pasta de dados e configuração `0700`, arquivo de configuração `0600`; hash do pacote portátil confere com o launcher. |
| 2026-10-27 | Abrir PWA em `http://127.0.0.1:4173/` e revisar DOM, scripts e console | PASS: tela inicial e assets carregaram; `routing.js` foi servido localmente; campos e controles NIP-17 existem; sem erros de console. Não cobre login interativo em dispositivos reais nem publicação web. |
| 2026-10-27 | `node property/tests/forwarding-smoke.mjs` | PASS: assinatura, tipo e idade de evento; deduplicação e exclusão da origem; kind 4 plaintext excluído; gift wrap NIP-17 somente para o destinatário local; limites de 60 eventos/minuto e 2 MB/minuto em bytes UTF-8 após fan-out. |
| 2026-10-27 | `bash property/tests/run-bridge-integration.sh 17448 17449` | PASS: dois Geode temporários; evento público assinado replicado, gift wrap cifrado encaminhado apenas ao inbox relay do destinatário, eco ignorado; NIP-17, kind 10050 e listagem NIP-15 com `price_raw` exato. Não prova execução em segundo plano ou operação na Internet pública. |
| 2026-10-27 | `node property/tests/nano-units-smoke.mjs` | PASS: XNO/raw em inteiros exatos, limites de 1 raw e 1 XNO, vírgula decimal e entradas inválidas. Não valida campanhas, carteiras, RPC ou transações. |
| 2026-10-27 | `node property/tests/marketplace-smoke.mjs` | PASS: parsing do preço XNO, campo `price_raw` exato, leitura/fallback seguro e rejeição de moeda e faixa incompatíveis com a publicação NIP-15. |
| 2026-10-27 | `node property/tests/marketplace-smoke.mjs` (edição/retirada) | PASS: link HTTPS seguro, identidade estável `d` ao editar e retirada NIP-09; evento de outra autoria e pedido mais antigo não removem a oferta, e ID inconsistente é rejeitado. |
| 2026-10-27 | `bash property/tests/run-bridge-integration.sh 17452 17453` | PASS: além da ponte pública/NIP-17, dois relays Geode locais aceitaram criação, atualização addressable e retirada assinada NIP-09; o leitor esconde cópia antiga após retirada. Sem tráfego para a Internet pública. |
| 2026-10-27 | `node property/tests/campaigns-smoke.mjs` | PASS: assinatura, IDs e marcadores únicos, URL HTTPS, rejeição de credenciais/IP/SVG, XNO raw inteiro, expiração, bloqueio local e limite local de 24 horas. Não valida pagamento na ledger nem aceite/refundo pelo node. |
| 2026-10-28 | `bash property/tests/run-smoke.sh` | PASS: suíte de unidades/raw Nano, marketplace, campanhas, protocolo NIP-17/kind 10050, cofre, ponte, contrato da PWA e reconstrução/hash dos 130 segmentos do relay. |
| 2026-10-27 | `node property/tests/relay-soak.mjs 86400 60 17447` (run `fb20fd0e-59c1-4c57-b4ad-4f616a7f087a`) | INCOMPLETO: o início foi registrado, mas não há processo ativo nem evidência de conclusão por 24 horas. Não contar como aprovação; reiniciar e aguardar o resultado final para fechar NOD-01. |
| 2026-10-28 | `node property/tests/relay-soak.mjs 86400 60 17447` (início 08:00:24 UTC, run `888f8ad3-f4a7-4425-897e-1870812fb7ff`) | SEM CONCLUSÃO COMPROVADA: houve prontidão do relay e probes aprovadas; em 2026-10-30, a sessão original já não está disponível e não foi recuperado resultado final de 24 horas. Não contar como PASS. |
| 2026-10-30 | Autenticação oficial do GitHub CLI e `push-github.sh` local | PASS: conta `coercaodobem`, destino `coercaodobem/property`, branch `modelo-mvp`; o comando de push retornou sucesso e a branch local estava sincronizada. Nenhuma chave da conta Gymoo foi usada para o envio. |
| 2026-10-30 | Habilitar Pages com origem GitHub Actions, permitir `modelo-mvp` e executar workflow `41130981007` | PASS: tentativa 2 concluída com sucesso no commit `e525f3028391cea6133fe7982b4e342ee576f449`; URL HTTPS `https://coercaodobem.github.io/property/`. |
| 2026-10-30 | Abrir a URL pública e comparar os 16 arquivos publicados com a fonte | PASS: tela inicial carregou; nenhum erro ou aviso no console; todos os arquivos responderam HTTP 200 com SHA-256 idêntico ao checkout. [Registro dos hashes](evidence/pages-2026-10-30.json). Não cobre criação de identidade, mensagens pela Internet ou dispositivos reais. |

| 2026-10-31 | Incorporar commit `55e379c9db` e renomear repositório/produto | Property em `coercaodobem/property`; diretório do produto `property/`; identificadores legados preservados somente para compatibilidade e evidências. |
| 2026-10-31 | `bash property/tests/run-smoke.sh` | PASS: 12 suítes, incluindo unidades BTC/XMR/XNO, ofertas/campanhas, cofre e backup legado, ponte, CSP/assets, migração de launcher, atualização segura do cache PWA e todos os segmentos. |
| 2026-10-31 | `bash property/tests/run-bridge-integration.sh 17452 17453` | PASS: dois relays isolados, ponte pública, NIP-17 e NIP-15. A primeira tentativa na sandbox foi bloqueada por permissão de sockets; repetição com acesso loopback autorizado passou. |
| 2026-10-31 | `node property/tests/native-relay-integration.mjs` local e CI | PASS em Linux x86_64, Windows x64 e macOS arm64: Java incluído, SQLite, NIP-17, ofertas de 1 satoshi e 1 piconero, edição/retirada e mesmos eventos após reinício. [Evidência da matriz](evidence/native-platforms-2026-10-31.json). A falha Windows inicial de `Get-FileHash` foi corrigida usando APIs .NET padrão. |

| 2026-10-31 | Pages [41186913639](https://github.com/coercaodobem/property/actions/runs/41186913639), commit `31956a60c485d77629cc6e549026822d05a7ae56` | PASS: nova URL principal mostra Property; seletor contém BTC/XMR/XNO; console sem erros/avisos; 17 arquivos públicos e raiz HTTP 200 com hashes idênticos ao checkout. [Evidência](evidence/pages-property-2026-10-31.json). Não prova login, mensagens em rede pública ou teste físico de celular. |

**Não aprovado ou não executado:** novo ensaio G11-03 de até cinco horas; Android/iOS; teste de perda de rede em aparelho; revisão independente de segurança; marketplace completo; engine de campanhas BTC/XMR/XNO e verificação de pagamento; checkout; auditoria integral de dependências. O repositório `coercaodobem/property`, o push e a publicação inicial de Pages foram verificados em 2026-10-30. O leitor de campanha opt-in não é evidência de pagamento. Os itens pendentes continuam gates antes de beta público.

Para repetir a suíte local: `bash property/tests/run-smoke.sh`. Para a integração entre dois relays isolados: `bash property/tests/run-bridge-integration.sh [porta-origem] [porta-destino]`. O ensaio single-relay de até cinco horas é separado: `node property/tests/relay-soak.mjs 18000 60 17447`; em execução curta, informe duração e intervalo menores mantendo porta loopback livre. Ele não substitui o G11-03 multi-relay.

## Mudanças do commit do mantenedor e migração Property

O commit `55e379c9dbdf8637b32422d32e982460aa5862e5` acrescentou a marca Property, XMR e a visão de Windows/macOS/Linux/Android/iOS. Os registros acima são históricos; a publicação de 2026-10-30 ocorreu no caminho anterior e seus hashes não devem ser alterados. A nova publicação deve ter relatório próprio.

| ID | Caso | Critério |
|---|---|---|
| PROP-01 | Nome público, repo, links e workflows | Property e `coercaodobem/property`; assets sob `/property/`, sem CDN executável; namespaces upstream e evidências históricas preservados |
| PROP-02 | Sessão/identidade após atualização no mesmo navegador/origem | Banco legado reutilizado, sem regenerar chave ou apagar conversas/preferências; validar em navegador real |
| PROP-03 | Importar backup anterior | Mesma chave pública com senha correta; senha errada/backup adulterado rejeitados |
| PROP-04 | Dados e configuração de relay existentes | `PROPERTY_RELAY_*` prevalece, aliases legados aceitos, diretórios antigos reutilizados sem apagar DB |
| PROP-05 | Publicação e instalação | Workflow passa, URL nova abre sem erros, manifesto/ícone/caches locais corretos; reinstalar atalho quando necessário |
| MONEY-01 | 1 XMR, 1 piconero e uint64 | Conversão exata em strings inteiras; mais de 12 casas ou overflow rejeitados |
| MONEY-02 | 1 XNO, 1 raw e uint128 | Conversão exata; mais de 30 casas ou overflow rejeitados |
| MONEY-03 | Oferta BTC/XMR/XNO e edição | Seleção de moeda, `price_atomic` exato, vitrine correspondente; `price_raw` exclusivo para compatibilidade XNO; round-trip no relay |
| MONEY-04 | Campanha v2 e legada | Moeda/unidade explícitas em v2; legado exclusivamente XNO; rejeitar moeda desconhecida, campos ambíguos, assinatura inválida e transação inexistente no futuro verificador |
| XMR-01 | Recebimento por subendereço | Carteira sincronizada identifica campanha, montante atômico e transação; hash declarado não é prova |
| XMR-02 | Confirmação/desbloqueio e reorganização | Política registrada, publicação suspensa enquanto insuficiente; repetir após reorganização sem duplicar campanha |
| XMR-03 | Recusa/reembolso | Endereço de devolução autenticado no acordo, taxas e mínimo explícitos, valor líquido conciliado, execução idempotente; não inferir origem de uma transferência Monero |
| XMR-04 | RPC e segredos | Carteira/RPC autenticado local, chave distinta da Nostr; sem seed/token em PWA, eventos ou logs |
| XMR-05 | Atraso/falha/valor errado | Pagamento pendente reconciliado após reinício; moeda errada e pagamento duplicado não ativam campanha indevidamente |

`money-smoke.mjs`, `marketplace-smoke.mjs`, `campaigns-smoke.mjs` e `vault-smoke.mjs` cobrem conversão, parsing e compatibilidade criptográfica local. `relay-integration.mjs` inclui round-trip de uma oferta de 1 piconero. Casos de carteira, checkout e reembolso continuam **não implementados/não executados**. Não usar fundos de produção.

### Matriz de plataformas exigida

| Plataforma | Interface | Relay |
|---|---|---|
| Ubuntu/Linux x86_64 | Navegador e instalação PWA quando suportada | Pacote incluído; executar smoke, integração e gate de até cinco horas |
| Windows | Validar Edge/Chrome, instalação e recuperação | Pacote PowerShell x64 incluído; validar execução, SQLite e reinício no CI Windows |
| macOS | Validar Safari/Chrome e instalação disponível | Pacote arm64 incluído; validar no CI macOS Apple Silicon. Intel e distribuição assinada/notarizada pendentes |
| Android | Validar navegador, instalação PWA, rede e suspensão reais | Solução contínua nativa ainda em pesquisa; não prometer segundo plano na PWA |
| iOS/iPadOS | Validar Safari, adicionar à tela inicial, recuperação e suspensão reais | Solução contínua ainda em pesquisa; registrar restrições efetivas da plataforma |

A matriz é um requisito de execução, não uma declaração de suporte testado. Critérios econômicos específicos e fontes estão em [pagamentos.md](pagamentos.md); preservação de dados em [migracao-property.md](migracao-property.md).

## 2. Preparação e segurança dos testes

### Ambientes

1. **Local:** aplicação, dois ou mais relays isolados, node de publicidade, carteira simulada e ferramenta de captura de rede.
2. **Staging/testnet:** PWA HTTPS em host controlado, relays de teste, Bitcoin regtest/signet, Nano testnet/local e Monero regtest/stagenet. Testar o fluxo planejado do GitHub Pages sem lançar o site institucional antes de o app estar pronto.
3. **Dispositivos reais:** pelo menos um Android, um iPhone/iPad e um PC; testar navegadores representativos.
4. **Ensaio de disponibilidade:** node de PC operando por até cinco horas, com interrupções de rede e reinicializações programadas.

Não usar seed, carteira ou fundos de produção. Testes em mainnet ficam fora deste plano.

### Dados de teste

- Usuário A, usuário B e usuário não autorizado C, com chaves independentes.
- Dois ou mais relays, incluindo um relay desligável durante os testes.
- Node de PC e PWA móvel.
- Campanhas válidas, expiradas, duplicadas, malformadas, com imagem excessiva e com link inseguro.
- Valores Nano em raw: 1 raw, valores fracionários representativos, 1 XNO em raw e valores de fronteira.

### Evidências por caso

Registrar ID do teste, versão/commit, dispositivo e navegador, configuração do relay, passos, resultado, horário e evidência mínima necessária. Não anexar chaves privadas, seeds, conteúdo de mensagens ou dados pessoais aos relatórios.

## 3. Fase 0 — Reuso do Amethyst e cadeia de dependências

| ID | Cenário | Critério de aprovação |
|---|---|---|
| SRC-01 | Registrar o commit Amethyst selecionado para a integração. | O commit é imutável e aparece no inventário de origem; build e testes não usam branch móvel ou snapshot como base de produção. |
| SRC-02 | Inventariar módulos reutilizados, dependências transitivas e licenças. | Cada componente tem origem/versão/licença registrada; avisos MIT e atribuições permanecem; componente não revisado não entra no pacote. |
| SRC-03 | Comparar as capacidades escolhidas com os módulos Amethyst existentes. | O que for reutilizado tem cobertura de teste ou teste de caracterização; código duplicado só é criado quando o componente não serve ao browser ou ao requisito. |
| SRC-04 | Abrir/buildar a PWA com carregamento de código externo bloqueado. | Todos os scripts, módulos, fontes e WebAssembly de execução vêm do repositório/pacote Property; conexões permitidas são apenas dados de relays e serviços explicitamente documentados. |
| SRC-05 | Inspecionar configuração e tráfego por dependências dinâmicas. | Nenhum código carregado de CDN, Amethyst upstream, JitPack, Maven ou versão SNAPSHOT durante uso; versão e hash de dependência fazem parte do inventário. |
| SRC-06 | Fazer prova de compatibilidade web do código Amethyst selecionado. | A prova conecta ao relay no navegador e não pressupõe que UI Android/desktop seja PWA; incompatibilidades e camada de adaptação são documentadas. |
| SRC-07 | Repetir build do mesmo commit em ambiente limpo/controlado. | Artefato e proveniência correspondem ao commit e às versões fixadas; diferenças de build ficam explicadas. A meta de reprodutibilidade é registrada antes do beta. |

## 4. Fase A — PWA e distribuição

| ID | Cenário | Critério de aprovação |
|---|---|---|
| PWA-01 | Abrir a aplicação em HTTPS no ambiente de teste e, na fase de lançamento, no GitHub Pages publicado do repositório público Property. | Interface carrega sem erro; fonte/commit da versão publicada é identificável; a origem de distribuição não é requisito para conectar aos relays depois do carregamento. |
| PWA-02 | Instalar ou adicionar à tela inicial nos navegadores móveis e desktop suportados. | Ícone, nome e modo de abertura corretos; onde a instalação não for suportada, o site continua utilizável e apresenta instrução adequada. |
| PWA-03 | Abrir a interface sem conexão após o primeiro carregamento. | Shell, navegação essencial e estado local são apresentados; o app informa que a rede está desconectada. |
| PWA-04 | Atualizar a versão hospedada e reabrir o PWA. | Atualização é aplicada sem apagar chaves, configurações, mensagens locais ou campanhas já processadas. |
| PWA-05 | Capturar tráfego após carregar a interface e enviar/receber mensagens. | Eventos de mensagem trafegam do navegador diretamente aos relays; corpo, conteúdo, senha e chave privada não são enviados ao GitHub Pages, a funções de host ou a terceiros. |
| PWA-06 | Desligar o relay principal e manter outro relay disponível. | Mensagens continuam sendo enviadas/recebidas pelo relay restante; a interface mostra a falha sem declarar perda total da rede. |
| PWA-07 | Abrir a PWA sem o host de publicação depois que os arquivos estiverem em cache. | O shell local abre e explica que a rede pode estar indisponível; sincronização de mensagens só acontece quando há conexão com relay. |
| PWA-08 | Abrir a aplicação com a rede externa de código bloqueada, mantendo acesso aos relays configurados. | App continua funcional sem carregar módulos ou atualizar código a partir de origem externa; requests aos relays continuam possíveis. |
| PWA-09 | Atualizar a versão hospedada a partir de release/commit revisado. | Atualização não apaga identidade, recuperação, configurações ou dados locais; hash e versão do bundle correspondem ao artefato aprovado. |

**Matriz mínima de navegadores:** Chrome Android, Safari iOS, Firefox Android ou desktop, Chrome/Edge desktop e Safari macOS. Registrar separadamente “site funciona” e “instalação PWA disponível”.

## 5. Fase B — Identidade, senha e sessão local

| ID | Cenário | Critério de aprovação |
|---|---|---|
| IDN-01 | Criar duas identidades usando a mesma senha e o mesmo nome de perfil. | Cada identidade tem chave aleatória independente; nome e senha não determinam a chave privada. |
| IDN-02 | Inspecionar rede e armazenamento durante criação, desbloqueio e uso da conta. | Senha e chave privada nunca são enviadas a Pages, relays, analytics ou terceiros; no navegador, a chave persistida fica cifrada. |
| IDN-03 | Desbloquear com senha errada e depois com senha correta. | Senha errada não revela nem altera a chave; senha correta restaura a mesma chave pública e identidade. |
| IDN-04 | Fechar e reabrir a PWA no mesmo navegador com “continuar conectado” habilitado. | A identidade persiste e a sessão segue a opção local; a senha não fica salva em texto puro e o usuário pode bloquear manualmente. |
| IDN-05 | Bloquear a sessão manualmente e após inatividade. | Operações de assinatura deixam de funcionar até desbloqueio; conversa local não expõe material secreto. |
| IDN-06 | Restaurar identidade em outro navegador/dispositivo com o segredo de recuperação. | A chave pública e o acesso à identidade são restaurados corretamente; senha e segredo de recuperação não são transmitidos a serviço central. |
| IDN-07 | Perder senha e segredo de recuperação e tentar redefinir pela interface. | O app explica que não existe recuperação central; não cria outra chave silenciosamente nem afirma ter restaurado a identidade antiga. |
| IDN-08 | Exportar/importar segredo de recuperação, quando suportado. | Avisos de risco são claros; segredo aparece apenas por ação explícita, não vai para clipboard ou logs sem consentimento. |

## 6. Fase C — Mensagens e relays

| ID | Cenário | Critério de aprovação |
|---|---|---|
| MSG-01 | A envia uma mensagem privada cifrada para B por dois relays. | B consegue ler; A mantém a cópia prevista pelo protocolo; C e os relays não conseguem ler o texto. |
| MSG-02 | B fica offline; A envia mensagem; B volta a conectar. | B recupera a mensagem cifrada de pelo menos um relay disponível. |
| MSG-03 | Um relay aceita o evento e outro está indisponível. | O app registra a aceitação parcial, tenta novamente sem duplicar a mensagem e sincroniza ao reconectar. |
| MSG-04 | O mesmo evento chega por múltiplos relays e é recebido novamente após reconexão. | O cliente deduplica por ID do evento e mostra uma única mensagem. |
| MSG-05 | Alterar conteúdo, assinatura, destinatário ou envelope de um evento de teste. | Evento inválido é rejeitado; não aparece como mensagem confiável. |
| MSG-06 | Inspecionar requests, logs do cliente, logs do relay e logs da hospedagem. | Chaves privadas e texto em claro não aparecem em tráfego para servidores ou logs. |
| MSG-07 | Suspender o navegador móvel, apagar a conexão e reabrir o PWA. | O app reconecta e sincroniza; não afirma que o celular manteve um node ativo enquanto suspenso. |
| MSG-08 | Reiniciar o relay de PC após interrupção de energia ou rede. | Serviço retorna, restaura estado e volta a aceitar conexões sem corromper eventos ou duplicar entrega. |

**Critério de entrega do MVP:** com remetente e destinatário online e pelo menos um relay escolhido disponível, a mensagem chega uma vez; com destinatário offline, a mensagem é recuperada na próxima sincronização, conforme as regras de retenção anunciadas pelo relay.

## 7. Fase D — Nodes e disponibilidade

| ID | Cenário | Critério de aprovação |
|---|---|---|
| NOD-01 | PC relay executa continuamente por até cinco horas no ensaio G11-03. | Mantém serviço e dados, registra três reinícios e recupera conexões após partições; não excede o orçamento de recursos definido para o laboratório. |
| NOD-02 | Interromper internet, energia e conexão WebSocket, uma de cada vez. | O node sinaliza indisponibilidade, reconecta com espera progressiva e não perde o estado confirmado. |
| NOD-03 | Desligar um relay escolhido pelo usuário. | Cliente usa outros relays e permite remover/substituir o relay indisponível. |
| NOD-04 | Encerrar o PWA no celular e deixar a tela apagada. | A rede continua disponível por relays de PC; a aplicação não promete serviço móvel contínuo. |
| NOD-05 | Reiniciar o PC durante processamento de campanha ou mensagem. | Operação retomada é idempotente; não publica anúncio duas vezes nem repete pagamento/reembolso. |
| NOD-06 | Verificar política de retenção, disco cheio e evento expirado. | Node aplica limites declarados, sinaliza armazenamento insuficiente e não apaga conteúdo fora da política configurada. |

## 8. Fase E — Campanhas e apresentação de anúncios

| ID | Cenário | Critério de aprovação |
|---|---|---|
| AD-01 | Anunciante publica oferta assinada com ID único, criativo, link, valor raw e expiração. | Node valida assinatura, campos e prazo antes de aceitar. |
| AD-02 | Node recusa conteúdo, oferta abaixo da política local ou campanha expirada. | Nenhum pagamento é solicitado, nenhum anúncio aparece e o motivo é registrado de forma legível. |
| AD-03 | Node aceita uma campanha. | Node publica aceite assinado, endereço exclusivo e prazo; anunciante consegue verificar que o aceite veio daquele node. |
| AD-04 | Pagamento exato e confirmado chega dentro do prazo. | Campanha é publicada uma vez como cartão patrocinado separado, com prazo e node identificáveis. |
| AD-05 | Pagamento não chega antes do prazo. | Aceite expira e campanha não é publicada. |
| AD-06 | Chega pagamento atrasado, abaixo, acima ou em endereço de outra campanha. | Não publica; devolve o valor recebido por nova transferência e registra o status para retomada idempotente. |
| AD-07 | Repetir notificação do mesmo bloco de pagamento ou reiniciar o node durante o fluxo. | Node não publica duas vezes nem envia reembolso duplicado. |
| AD-08 | Campanha inclui JavaScript, pixel, imagem remota rastreadora, EXIF ou arquivo inválido. | Node rejeita ou normaliza o arquivo; cliente não carrega trackers externos automaticamente. |
| AD-09 | Usuário abre a campanha sem clicar no link e depois toca explicitamente no link. | Nenhum clique é enviado ao Property; link só abre por ação explícita e aparece identificado como patrocinado. |
| AD-10 | Verificar publicidade junto a mensagens privadas. | Anúncio aparece separado; evento cifrado/assinado da conversa permanece inalterado. |
| AD-11 | Usuário altera preferência de publicidade e escolhe outro node. | Preferência é respeitada localmente; a seleção não exige perfil centralizado. |
| AD-12 | Abrir Hangout em aparelho sem habilitar campanhas; depois habilitar e carregar eventos. | Padrão permanece desligado; consulta kind 30078 só ocorre com opt-in, mostra campanha separada e usa texto/link/imagem sob validação. |
| AD-13 | Repetir campanha, bloquear node e inspecionar eventos enviados após abrir o link. | Limite de uma exposição local por campanha em 24h e bloqueio por node funcionam; cliente não publica eventos de clique/visualização. O destino HTTPS ainda recebe a navegação normal após clique explícito. |
| AD-14 | Mostrar campanha com `payment_block_hash` declarado, mas sem confirmação Nano independente. | UI identifica que o cliente não verificou o pagamento; nenhuma campanha pode ser anunciada como pagamento verificado até implementar e testar a engine Nano. |

**Regra de exposição escolhida para o MVP:** node vende uma colocação por período, não impressões ou cliques. O leitor atual aplica um limite local de repetição da mesma campanha; esse histórico não é enviado ao anunciante nem ao node. O campo de bloco Nano é apenas uma declaração assinada no estado atual, não uma prova de pagamento conferida pelo cliente.

## 9. Fase F — XNO, XMR e precisão financeira

| ID | Cenário | Critério de aprovação |
|---|---|---|
| XNO-01 | Converter valores entre XNO e raw, incluindo 1 raw e 1 XNO. | Conversão exata usando inteiros; nenhuma operação monetária usa ponto flutuante. A referência é 1 XNO = 10³⁰ raw. |
| XNO-02 | Criar duas ofertas para nodes/campanhas diferentes. | Cada campanha recebe endereço exclusivo; pagamentos não são associados só por horário ou valor. |
| XNO-03 | Verificar transferência ainda não confirmada/recebível. | Anúncio não é publicado antes da confirmação e do recebimento processado pelo node. |
| XNO-04 | Aceitar, receber e publicar campanha paga. | Valor, bloco de pagamento, campanha e aceite são reconciliados exatamente. |
| XNO-05 | Fazer reembolso de pagamento atrasado ou incompatível. | Devolução é uma nova transação ao endereço de origem, uma única vez, com valor raw correto. |
| XNO-06 | Interromper rede durante recebimento ou devolução. | Operação permanece pendente, é retomada após reconexão e não perde nem duplica fundos. |
| XNO-07 | Verificar separação de carteiras e chaves. | Chave Nano do node não é igual à chave Nostr, não está na PWA e não aparece em logs, Pages ou relays. |
| XNO-08 | Inspecionar a interface antes do pagamento. | Usuário vê claramente valor, unidade, endereço/campanha, validade e node recebedor antes de autorizar a transferência. |
| XNO-09 | Auditar a configuração RPC Nano usada pelo node de campanhas. | `enable_control` fica desligado até ser necessário; se habilitado, o endpoint fica em loopback ou tem controle de acesso equivalente fora do node; nenhuma chave, seed ou senha aparece na PWA, relay ou logs. |

O valor pago e os endereços Nano podem ser observados na ledger pública; validar que o produto explica isso e não reutiliza endereço pessoal do operador. Para XMR, não aplicar automaticamente a devolução à origem da tabela XNO; seguir os casos XMR acima. A documentação oficial do node Nano recomenda limitar RPCs de controle a IPs locais/loopback, pois essas chamadas podem acessar fundos da carteira e parar o node: [RPC Protocol](https://docs.nano.org/commands/rpc-protocol/) e [Node Configuration](https://docs.nano.org/running-a-node/configuration/).

## 10. Fase G — Segurança, privacidade e abuso

- **Criptografia:** teste negativo de acesso por terceiro, alteração de evento, chave errada e envelope inválido.
- **Segredos:** buscas automatizadas e revisão manual não encontram seeds, chaves privadas ou texto de mensagem em bundle, logs, analytics ou chamadas ao GitHub Pages.
- **Origem web:** testar atualização, espelho e CSP; documentar que o domínio que entrega JavaScript faz parte da confiança do cliente.
- **Publicidade:** sanitizar imagens; permitir apenas links HTTPS; impedir URLs javascript, data e file; não carregar recursos de terceiros sem ação explícita.
- **Abuso de oferta:** limitar frequência por identidade/campanha, validar tamanhos e impor prazo máximo de armazenamento de campanhas.
- **Fraude financeira:** validar assinatura do anunciante, aceitar apenas pagamento correspondente ao endereço e oferta aceitos, deduplicar por hash de bloco e registrar transições de estado.
- **Observabilidade:** não coletar clique, leitura de mensagem, lista de contatos ou texto privado. Métricas operacionais locais devem ser agregadas e configuráveis.

## 11. Fase H — Usabilidade e desempenho

- Completar criação/recuperação segura de identidade, escolha de relays, envio de mensagem e troca de node sem terminal.
- Confirmar leitura em tela pequena, teclado, zoom, navegação por teclado e rótulos para leitor de tela.
- Testar rede lenta, pacote de dados interrompido, sessão expirada e relay com latência alta.
- Medir tamanho inicial da PWA, tempo até interface utilizável, consumo de memória e dados durante sincronização.
- Definir metas numéricas de desempenho antes do beta público; não aceitar resultados de uma única rede/dispositivo como representativos.

## 12. Fase I — Hangout e marketplace

Executar após fechar as histórias de usuário e o protocolo de cada fluxo. A cobertura abaixo testa a primeira etapa de descoberta e publicação; não presume custódia ou pagamento de compras.

| ID | Cenário | Critério de aprovação |
|---|---|---|
| HNG-01 | Publicar e descobrir notas públicas kind 1 no Hangout. | Assinatura e autoria são verificadas; eventos duplicados são deduplicados e a interface mostra os relays dos quais cada nota veio. |
| HNG-02 | Abrir uma nota pública e iniciar conversa com a autoria. | Conteúdo público é identificado como público; o botão inicia uma conversa NIP-17 sem tornar a nota privada. |
| HNG-03 | Procurar mensagens privadas em espaços públicos/grupos. | A UI informa que Hangout é feed público; grupos e salas privadas não são oferecidos até existir protocolo e teste de criptografia/grupo. |
| HNG-04 | Desligar um relay que fornece conteúdo de um Hangout. | Outro relay disponível permite recuperar eventos válidos; não há perda indevida de dados locais. |
| MKT-01 | Publicar e descobrir listagem compatível com NIP-15 a partir do perfil do vendedor. | Evento e autoria são validados; preço, moeda e termos são mostrados como publicados, sem conversão ou alteração silenciosa. |
| MKT-02 | Editar, retirar ou receber cópia antiga de uma listagem. | Edição conserva o `d` do produto addressable; retirada publica um NIP-09 assinado pelo autor; o cliente valida autoria/tempo e oculta a oferta retirada mesmo se um relay servir cópia antiga. |
| MKT-03 | Processar listagem malformada, expirada ou com link/arquivo inseguro. | Conteúdo inválido é ocultado ou sinalizado; nenhum recurso remoto de rastreamento é carregado automaticamente. |
| MKT-04 | Iniciar contato sobre uma oferta sem função de pagamento/custódia implementada. | O cliente não simula compra, não recebe fundos e deixa claro quais passos ocorrem fora do Property. |
| MKT-05 | Verificar telemetria de busca e navegação no marketplace. | Não são enviados ao anunciante ou a serviço central cliques, leituras, lista de contatos ou histórico individual. |

**Gate de Hangout/marketplace:** os casos da Fase I passam antes de anunciar esses módulos como prontos. Pagamentos ou custódia de compras continuam fora do escopo até terem especificação e testes próprios.

## 13. Critérios de saída

O MVP só passa para beta quando:

1. Mensagens privadas permanecem ilegíveis para terceiros e relays; eventos inválidos são rejeitados.
2. O navegador comunica mensagens diretamente com relays e mantém sincronização com mais de um relay.
3. A PWA funciona como site mesmo quando a instalação não é oferecida pelo navegador.
4. Nodes de PC recuperam serviço após falha; o PWA móvel não promete funcionamento persistente suspenso.
5. Campanhas recusadas não geram pagamento; campanhas aceitas só são exibidas após o pagamento correto.
6. Conversão raw, identificação de campanha, expiração e reembolso passam os testes sem arredondamento ou duplicação.
7. Anúncios ficam separados das mensagens; não há pixel, clique ou leitura de conteúdo privado enviado como telemetria.
8. Seeds e chaves de carteira não aparecem no frontend hospedado, nos logs ou nos relays.
9. Ensaio de até cinco horas do relay de PC conclui sem perda de dados e com recuperação documentada.
10. Reuso do Amethyst tem commit, escopo, dependências, licenças e atribuições registrados; código que não pode rodar no browser foi separado sem reimplementar protocolo existente sem justificativa.
11. O pacote publicado corresponde ao commit revisado, funciona sem baixar código executável externo e conecta-se diretamente aos relays.
12. A conta permanece disponível no mesmo navegador sem persistir senha em texto puro; recuperação, bloqueio e perda irrecuperável são explicados e testados.
13. Site institucional e publicação pública só avançam após o gate de lançamento; a versão do GitHub Pages corresponde a release identificável.

## 14. Registro dos resultados

Para cada caso, registrar:

- ID e versão testada;
- ambiente, relay, carteira de teste, dispositivo e navegador;
- passos executados;
- resultado esperado e observado;
- evidência sanitizada;
- status: aprovado, reprovado, bloqueado ou não executado;
- defeito associado, severidade e reteste.

Este arquivo é o plano. Ele não confirma que as funcionalidades já existem ou que os testes passaram.

## Extensão BTC e plataformas de computador

- BTC-01: converter 1 BTC/1 satoshi e limite de 21 milhões; rejeitar mais de 8 casas, expoente, negativo e overflow.
- BTC-02: publicar/ler oferta e campanha BTC sem reinterpretar Nano raw ou Monero piconero.
- BTC-03 (pendente): regtest/signet, carteira local, output/endereço exclusivo, mempool, confirmações, conflitos/substituição, reorganização e reembolso idempotente com taxas explícitas. Nenhuma liquidação ativada.
- OS-01: Linux x86_64, Windows x64 e macOS arm64 executam `native-relay-integration.mjs` no CI com o Java do pacote, sem depender de Java instalado.
- OS-02: validar caminhos com espaços, criar SQLite persistente e conferir os mesmos eventos após reiniciar.
- OS-03: comparar cada segmento, hash do ZIP, hash dos JARs comuns e pin do launcher; pacote adulterado não pode executar.
- OS-04: PWA em navegadores Windows/macOS/Linux/Android/iOS; separar ensaio automatizado desktop de teste físico de instalação/suspensão móvel.

A inspeção dos JARs atuais identificou SQLite nativo macOS arm64, Windows x64 e Linux x64/arm64, mas não macOS Intel. Portanto não declarar relay Mac Intel suportado apenas porque existe JRE Intel.
