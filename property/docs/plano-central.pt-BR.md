# Plano Central — Execução do Projeto Property

**Português (Brasil)** · [English](plano-central.pt-BR.md)


**Status:** snapshot Amethyst publicado em `coercaodobem/property`, branch padrão `modelo-mvp`; PWA e runtime Geode incluídos. A publicação anterior foi verificada em 2026-10-30; a publicação Property possui evidência própria em `docs/evidence`; consultar o plano de testes para commits, hashes e limites. Engine de pagamentos BTC/XMR/XNO, auditoria integral e gates restantes continuam pendentes.
**Atualizado:** 2026-10-31.

## Objetivo

Entregar um cliente Nostr chamado Property que funcione como PWA em navegadores móveis e desktop, permita comunicação privada, preserve controle local da identidade e possa usar relays escolhidos pela pessoa. Reaproveitar ao máximo o código e os testes do Amethyst, mantendo o pacote de execução dentro do repositório público do Property.

Este documento organiza a execução. A visão do produto está em [identidade-do-projeto.md](identidade-do-projeto.pt-BR.md); os critérios verificáveis estão em [plano-de-testes-central.md](plano-de-testes-central.pt-BR.md).

**Diretriz de validação offline (2026-10-31; escopo de execução atualizado em 2026-11-02):** o executor previsto é **Luna Max**. O plano de testes exige gates G00–G12, internet bloqueada, jornadas pelo app real, topologia de sete relays locais e pontes, falhas controladas e redes financeiras privadas. O objetivo de certificação completa continua **PROPERTY_SCOPE_OFFLINE_PASS**, sem ignorar funções pendentes. Nesta etapa, execute todos os casos disponíveis no Ubuntu; testes nativos de Windows, macOS, Android e iOS/iPadOS ficam PENDING e não interrompem o avanço nem a aprovação do perfil Ubuntu. Resultados anteriores são históricos, não aprovação dos novos gates. Ferramentas ou plataformas ausentes bloqueiam apenas a certificação do perfil correspondente; publicação pública e homologação física adicional têm evidência separada.

## Decisões consolidadas

| Tema | Decisão |
|---|---|
| Base existente | Começar pela auditoria e fork do repositório público Amethyst, preservando histórico e referências upstream. Reusar módulos e testes compatíveis antes de implementar equivalentes. |
| Alvo principal | Interface web PWA utilizável em navegadores de celular e computador; o site institucional público vem na fase de lançamento, depois que o app estiver pronto. |
| Compatibilidade Amethyst | Amethyst oferece app Android/desktop e módulos compartilhados Nostr; ainda não presumir que sua UI atual seja PWA. Provar o alvo web e reaproveitar o núcleo portável. |
| Identidade | Gerar chave Nostr aleatória localmente. Senha protege/desbloqueia a chave, não é convertida diretamente em chave privada, evitando que uma senha fraca determine a identidade. Conta persiste localmente e pode continuar conectada por opção; permitir bloqueio manual/inatividade, sem guardar senha em texto puro ou criar servidor central. |
| Conversas privadas | Usar protocolo Nostr padronizado e interoperável, com NIP-17 como escolha inicial sujeita à revisão da versão da especificação e da implementação de origem. |
| Transporte | Cliente conecta diretamente por WebSocket seguro a vários relays. GitHub Pages entrega apenas arquivos do app. |
| Nodes | PC pode operar node/relay continuamente. Celular pode colaborar enquanto o app estiver ativo, sem promessa de execução em segundo plano. |
| Dependências | Nenhum código executável externo carregado em runtime. Fixar versões, manter código e dependências de runtime no repo/bundle, preservar licenças e evitar snapshots ou refs dinâmicas. |
| Hospedagem | Quando o produto estiver pronto, publicar a PWA estática via GitHub Pages a partir do repositório público Property. A hospedagem não fornece backend de comunicação. |
| Marketplace e Hangout | Primeira versão do Hangout é um feed público Nostr kind 1; marketplace faz descoberta/publicação de ofertas NIP-15. NIP-15 é draft marcado como não recomendado; checkout/custódia ficam fora. |
| Receita dos nodes | A PWA mantém campanhas opt-in, assinadas, separadas das mensagens e sem telemetria de clique/visualização. A biblioteca local do relay tem engine de oferta/aceite/reconciliação/reembolso e adaptadores BTC/XMR/XNO; os ensaios G07–G08 usam a engine e nós/carteiras em redes privadas locais. O fluxo de operação do node ainda não está integrado como produto ativado para operadores. |

## Fork do Amethyst e adaptação de nome/produto (roteiro executável)

A origem é o snapshot Amethyst `948135f7dbbae81d79a0b985282ce673397a7618`, com módulos e avisos de autoria preservados. O repositório publicado contém o snapshot adaptado; não contém todo o histórico upstream. O histórico original continua no repositório Amethyst. Não mesclar backups locais antigos na branch publicada: eles podem conter fixtures que foram sanitizadas.

1. Clonar `https://github.com/coercaodobem/property.git`, branch `modelo-mvp`, para contribuir. Preservar `vitorpamplona/amethyst` como referência de origem, sem enviar alterações para lá.
2. Manter os componentes do produto em `property/web`, `property/relay`, `property/tests` e `property/docs`. Usar `property` como remoto do mantenedor; em forks os nomes podem variar, portanto conferir a URL.
3. Preservar Geode/Quartz e módulos Amethyst reutilizáveis. A interface web atual usa `nostr-tools` vendorizado porque o Quartz selecionado não oferece target JavaScript/WASM; a PWA não é a interface Compose recompilada.
4. Usar Property em textos, manifesto, ícone e artefatos do projeto. Preservar namespaces, marcas e licenças upstream e identificadores legados necessários à leitura de dados existentes.
5. Registrar versão, hash, origem e licença dos bundles. Atualizações de dependência passam por revisão; nenhum script de CDN em runtime.
6. Publicar `property/web` com `.github/workflows/property-pages.yml` e conferir workflow, URL e hashes do artefato servido.

```bash
git clone --branch modelo-mvp https://github.com/coercaodobem/property.git
cd property
./property/relay/start.sh
```

Para reconstituir a base upstream em uma auditoria separada: clonar `vitorpamplona/amethyst`, selecionar exatamente `948135f7dbbae81d79a0b985282ce673397a7618` e comparar os módulos preservados. Não substituir a branch Property por esse checkout sem reaplicar e revisar as adaptações.

## Fases de execução

### 0. Congelar escopo e evidências

- Manter os documentos de identidade, arquitetura e testes alinhados.
- Distinguir requisito confirmado, hipótese técnica e trabalho ainda não executado.
- Antes de qualquer promoção pública, definir o commit que foi revisado e a versão do protocolo adotada.

**Saída:** escopo do MVP e critérios de aceitação aprovados internamente no projeto.

### 1. Auditar Amethyst e provar o caminho web

- Selecionar e registrar um commit específico do repositório Amethyst; não desenvolver contra a branch móvel sem referência fixa.
- Fazer inventário de módulos, APIs, dependências transitivas, licenças e testes.
- Identificar o que pode ser reutilizado diretamente: Quartz e lógica Nostr, eventos, relays, criptografia, identidade, NIP-17, NIP-15 e testes existentes.
- Avaliar Commons/Compose e targets Kotlin Multiplatform para navegador. Criar uma prova pequena que conecte a um relay pelo navegador sem buscar código de execução externo.
- Se a UI não puder ser reaproveitada no navegador com confiabilidade, preservar o núcleo e os fluxos de domínio do Amethyst e fazer UI PWA fina, sem recriar o núcleo de protocolo.
- Confirmar as obrigações MIT e de todas as dependências antes de copiar, compilar ou distribuir.

**Gate:** decisão técnica documentada sobre módulos reutilizados, portados e não aproveitáveis no navegador. Nenhum código ou dependência é declarado compatível sem build e teste.

### 2. Criar a base Property autocontida

- Manter o fork/histórico e atribuições; registrar upstream, commit, arquivos importados e licenças.
- Trazer o código de runtime escolhido para o repositório Property ou para o bundle final; não carregar scripts de CDN, snapshots remotos ou dependências durante uso.
- Fixar dependências e toolchain de build, gerar inventário de componentes e tornar o build repetível na medida suportada pela stack.
- Definir fronteira entre interface PWA, núcleo de protocolo reaproveitado, armazenamento local, relays e processos de node.

**Gate:** abrir o app com rede externa de código bloqueada e comprovar que todos os assets executáveis vêm do pacote Property. Conexões de dados com relays ficam permitidas.

### 3. Identidade local e mensagens privadas

- Criar identidade a partir de chave aleatória gerada no navegador com fonte criptográfica segura.
- Proteger a chave em armazenamento local cifrado por senha; nunca enviar senha ou chave privada a Pages, relays ou telemetria.
- Implementar recuperação local e teste de troca de dispositivo; documentar que perda da senha e do segredo de recuperação não tem reset central.
- Reutilizar e validar criptografia/eventos NIP-17 do Amethyst ou biblioteca de origem; não criar criptografia própria.
- Implementar seleção de relays e comunicação direta, sincronização, deduplicação e estados desconectado/parcialmente conectado.

**Gate:** remetente e destinatário leem a conversa; relay e terceiro não leem conteúdo; nova sessão restaura apenas com recuperação autorizada.

### 4. PWA e distribuição controlada

- Desenvolver interface responsiva e instalável, com shell offline e atualização sem apagar identidade.
- Testar Chrome Android, Safari iOS, navegador desktop e outros navegadores alvo; registrar as diferenças de instalação/background.
- Durante desenvolvimento usar localhost/staging. Não lançar site institucional antes de o app estar pronto.
- Na fase de lançamento, publicar artefato estático revisado do repositório público Property no GitHub Pages; proteger a origem de publicação e publicar versões identificáveis.
- Verificar que a interface não envia eventos, mensagens ou credenciais ao host.

**Gate:** bundle estático e revisado funciona em navegador móvel/desktop; a captura de tráfego mostra conexão direta aos relays e nenhuma dependência de código remoto.

### 5. Nodes e continuidade

- Priorizar node de PC com execução contínua, recuperação após falha, limites de armazenamento e seleção de relays.
- Permitir colaboração do celular somente como ação voluntária e de melhor esforço enquanto a PWA está ativa: encaminhar eventos públicos assinados entre relays escolhidos e encaminhar gift wraps NIP-17 somente quando destinados à identidade local, e somente para os inbox relays dessa identidade. A ponte exclui o relay de origem, deduplica IDs, verifica assinatura/idade/tipo e limita encaminhamento a 60 eventos e 2 MB de tráfego de saída por minuto, contando cada destino. Não apresentar a PWA móvel como relay público de entrada sempre ligado.
- Não divulgar o celular como relay sempre ligado nem exigir tela acesa, root ou serviço pago.

**Gate:** executar o G11-03 por contagens fixas do Plano de Testes Central: 300 probes, três reinícios, nove eventos de partição reconciliados, zero perda e checkpoints por quantidade; comportamento móvel documentado como best effort.

### 6. Hangout, marketplace e sustentabilidade

- Depois da base de mensagens, evoluir Hangout e marketplace com eventos compatíveis e componentes reaproveitados do Amethyst.
- Criar fluxo de campanhas para node: conteúdo e proposta assinada; revisão local; aceite ou recusa; se aceita, moeda BTC, XMR ou XNO, valor em unidades atômicas, endereço exclusivo e publicação somente após confirmação verificada pelo adaptador da moeda.
- Se recusada antes do pagamento, não cobrar. Pagamento inesperado, atrasado ou incompatível segue política explícita de devolução como nova transferência; em XMR, o endereço de reembolso precisa ser acordado e autenticado, sem presumir que a transação revele a origem. Taxas e valor líquido precisam de consentimento; nenhuma carteira do usuário fica na PWA.
- As carteiras Monero e Nano ficam sob controle local do operador e separadas da identidade Nostr. A integração RPC de cada carteira roda no próprio host, com autenticação/loopback; `enable_control` fica desligado salvo necessidade operacional. Se ativado, o RPC deve escutar apenas em loopback ou ter uma restrição equivalente fora do node, nunca ficar aberto à internet.
- Exibir patrocínio com clareza, permitir preferência local e não enviar clique/leitura ao anunciante.

**Gate:** política de anúncio, estados financeiros e privacidade aprovados nos gates G07–G08, com a engine real e redes privadas locais Bitcoin/Monero/Nano, sem internet nem fundos reais. Testnet pública ou mock de sucesso não substitui essa validação.

### 7. Beta e lançamento

- O Luna Max executa o [plano de testes central](plano-de-testes-central.pt-BR.md), constrói o harness faltante, corrige falhas dentro do escopo autorizado e guarda evidência sanitizada por requisito/caso/gate. Primeiro concluir PROPERTY_UBUNTU_OFFLINE_PASS; os casos nativos de outros sistemas ficam pendentes para uma etapa posterior. Função ausente ou caso exigido no perfil atual sem execução impede a aprovação desse perfil.
- Fazer revisão independente de criptografia, identidade, cadeia de dependências, código copiado e permissões do node.
- Só então preparar site institucional e distribuição pública no GitHub Pages, com release versionada, origem/commit visíveis e procedimento de recuperação/atualização.

**Gate de lançamento:** PROPERTY_SCOPE_OFFLINE_PASS sobre a versão candidata, revisão independente e homologações de instalação/dispositivos previstas aprovadas; sem falhas críticas abertas; versão e artefato publicados correspondem ao commit revisado. Aprovação do laboratório offline não certifica publicação, redes públicas ou hardware que não foi ensaiado.

## Progresso de implementação na branch

- **PWA:** shell responsivo, manifesto/ícone, cache offline, IndexedDB, cofre PBKDF2-SHA-256 + AES-GCM, opção de sessão persistente com CryptoKey não exportável, bloqueio de 30 minutos, backup cifrado, NIP-17 1:1, configuração de relays, feed público kind 1 com origem por relay, listagem/publicação/edição/retirada NIP-15 e ponte voluntária de melhor esforço entre relays selecionados. A ponte só encaminha gift wraps NIP-17 para os inbox relays da própria identidade e não promete execução em segundo plano. Pages já foi habilitado e validado sob o nome anterior; a nova URL usa Property e suas validações estão no plano de testes.
- **NIP-17:** kind 10050 é publicado por ação explícita; descoberta valida assinatura e encaminha cada gift wrap somente para a lista inbox do destinatário correspondente. Sem lista kind 10050 descoberta, o cliente não tenta enviar.
- **Relay:** Geode 1.20.0 compilado com JDK 21 e empacotado com JRE para Linux x86_64. O tarball portátil está no repositório como 130 segmentos binários; `property/relay/start.sh` remonta e verifica o SHA-256, grava no diretório do usuário e por padrão faz bind em `127.0.0.1:7447`.
- **Campanhas e pagamentos de nodes:** `property/relay/campaign-engine.mjs` persiste ofertas, decisões assinadas, reconciliação, publicação e pedidos de reembolso; `ledger-rpc.mjs` fornece adaptadores para Bitcoin Core, Monero Wallet RPC e Nano RPC. G07–G08 exercitam essa biblioteca e nós/carteiras reais em redes privadas locais. O resultado comprova os ensaios locais, não a ativação de campanhas em produção: ainda faltam uma experiência de operação para o node, política de produção e revisão independente antes de habilitar uso com fundos reais.
- **Unidades financeiras:** a vitrine NIP-15 publica o preço numérico exigido pelo draft e uma extensão `price_atomic` exata em inteiro decimal e `currency` explícita. `price_raw` continua disponível para compatibilidade XNO. Monero usa 10¹² piconero/XMR; Nano usa 10³⁰ raw/XNO. O pacote local testa 1 raw, 1 XNO, vírgula decimal e rejeição de expoentes/precisão excedida. O checkout e os pagamentos de compras do marketplace continuam fora do MVP.
- **Fora do MVP entregue até aqui:** integração de operação/ativação da engine de campanhas para operadores; execução da ponte móvel em segundo plano; relay público de entrada no celular; administração de grupos NIP-29; checkout, pedidos, compra, custódia e pagamentos do marketplace.

## Política de origem e dependências

- GitHub é a origem pública de código e pode ser o host estático. O conteúdo servido deve corresponder a uma versão revisada do próprio repositório Property.
- O Amethyst é uma origem de código upstream durante auditoria e integração, não uma dependência de runtime. Após a incorporação, o cliente não consulta o repositório Amethyst para funcionar.
- Bundles não devem importar JavaScript, CSS, fontes, WebAssembly ou chaves de configuração executáveis de CDNs. Relays são fontes de dados do protocolo, não de código do app.
- Registrar commit e licenças do código Amethyst reaproveitado; conservar avisos MIT. Não incluir dependências transitivas sem inventário/licença.
- Fixar dependências de build e seus hashes; evitar branches, versões SNAPSHOT e artefatos mutáveis na configuração de produção. Diferenciar artefatos de build de código baixado quando o usuário executa o produto.
- Assinar tags/releases e publicar hashes do artefato. Planejar builds reproduzíveis e espelhos para que a confiança não dependa apenas do botão de download do host.
- Não guardar seeds, chaves privadas, senhas ou segredos de assinatura no repositório.

## Pendências e dependências externas

- Completar auditoria real do commit Amethyst que servirá de base; leitura de código já iniciou, mas a análise de segurança e de dependências ainda não foi concluída.
- Manter a proveniência do snapshot Amethyst e os avisos legais; não substituir o histórico publicado por backups locais.
- Manter o runtime Geode completo: os 130 segmentos já publicados devem continuar com os mesmos hashes após a mudança de caminho.
- Conferir a publicação Property por workflow, URL nova, manifesto e hashes servidos; repetir após cada mudança de distribuição.
- Validar PWA em Android e Safari/iOS, incluindo instalação, sincronização móvel e fluxos de usuário completos.
- Fechar parâmetros da derivação de senha, algoritmo de cifragem local e formato de recuperação após protótipo de compatibilidade.
- Definir retenção e política de abuso de nodes, comunidades do Hangout, marketplace e campanha.
- Definir domínio, identidade visual final e operação do site institucional na fase de lançamento.

## Revisão Property de 2026-10-31

O commit do mantenedor `55e379c9dbdf8637b32422d32e982460aa5862e5` foi incorporado antes da adaptação. Nome público, repositório, produto, PWA, workflows e guias passam a Property. A matriz de plataforma inclui Windows, macOS, Linux/Ubuntu, Android e iOS. Há pacotes de relay Linux x86_64, Windows x64 e macOS Apple Silicon; a matriz de CI valida execução real nesses sistemas. Outras arquiteturas e relay móvel contínuo permanecem pendentes. A interface ganha moeda BTC/XMR/XNO e valores atômicos exatos. Detalhes econômicos em [pagamentos.md](pagamentos.pt-BR.md); preservação de dados em [migracao-property.md](migracao-property.pt-BR.md).

### Extensão de plataformas e Bitcoin

Por solicitação posterior do mantenedor, BTC é moeda aceita nas ofertas e campanhas v2 (1 BTC = 10⁸ satoshis), junto de XMR e XNO. O checkout continua pendente. Foram preparados launchers Windows PowerShell e macOS arm64 com Temurin incluído, versões/hashes fixados e integração nativa no CI. O teste deve validar criação de eventos, SQLite persistente e reinício usando caminhos com espaços. Sem downloads de runtime durante execução. A distribuição web continua apenas `property/web`.

### Resultado da matriz de computador

A execução [41186913676](https://github.com/coercaodobem/property/actions/runs/41186913676), no commit `31956a60c485d77629cc6e549026822d05a7ae56`, concluiu as quatro jobs com sucesso: 12 suítes smoke e integração nativa em Linux x86_64, Windows x64 e macOS arm64. Cada relay usou seu Java incluído e preservou eventos após reinício. O primeiro erro Windows foi corrigido sem desabilitar a verificação de hash. Ver [registro sanitizado](evidence/native-platforms-2026-10-31.json). Esse resultado histórico não equivale ao G11-03 atual por contagens fixas nem a teste físico de Android/iOS.
