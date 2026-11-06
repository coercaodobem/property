# Identidade do Projeto — Property

**Português (Brasil)** · [English](identidade-do-projeto.pt-BR.md)


**Status:** visão do produto e registro da primeira implementação local na branch `modelo-mvp`; o app tem publicação inicial; a marca e a URL Property têm publicação e validação próprias registradas no plano de testes.
**Atualizado:** 2026-10-31.

## Propósito

Property é um cliente de comunicação e convivência digital baseado em Nostr. A pessoa usa uma interface web instalável no celular ou computador e controla a própria identidade. No primeiro uso, o cliente sorteia dois relays de uma lista incluída no app, salva a seleção localmente e conecta após ativar a identidade; a pessoa pode substituí-los quando quiser. A interface não deve ser dona das contas nem intermediária obrigatória das mensagens.

O projeto pretende aproveitar ao máximo o trabalho existente no Amethyst, em vez de reimplementar desde o início os componentes que já funcionam. A adaptação deve preservar a autonomia de execução: o código usado pelo Property fica no seu repositório e no pacote publicado, sem baixar código executável de serviços externos durante o uso.

## Princípios

1. **Identidade sob controle da pessoa.** Não há servidor central de contas. O cliente cria uma chave Nostr aleatória com fonte criptográfica segura, protege a chave localmente com uma senha e permite recuperação por um segredo de recuperação. O navegador mantém a identidade entre sessões e oferece a opção de continuar conectado naquele dispositivo, com bloqueio manual e política local de inatividade. Nome de usuário é perfil/identificador, não a chave.
2. **A senha não é a chave privada.** A senha desbloqueia uma chave aleatória armazenada cifrada localmente. Uma função de derivação de chave resistente a tentativa de senha, com parâmetros e implementação fixados no projeto, protege essa chave. A senha não é enviada a relays nem ao host. Perder senha e recuperação significa perder acesso; não existe redefinição central.
3. **Mensagens privadas com criptografia ponta a ponta.** Para conversas individuais, adotar protocolo Nostr maduro e compatível, inicialmente NIP-17 após revisão da especificação e da implementação reaproveitada. O remetente e o destinatário podem ler o conteúdo; relays e host veem no máximo eventos cifrados e metadados observáveis pelo protocolo.
4. **Conexão direta com relays.** O JavaScript executado no navegador abre conexões seguras diretamente aos relays salvos no aparelho. Uma instalação nova sorteia dois relays de uma lista incluída no app; a pessoa pode trocá-los nas configurações. GitHub Pages serve arquivos estáticos do app; não recebe nem encaminha o conteúdo das mensagens. Relays públicos podem ver o endereço IP e metadados de eventos públicos.
5. **Ponte voluntária entre relays.** Quando habilitada, a PWA pode encaminhar eventos públicos assinados entre relays selecionados. Gift wraps NIP-17 só são encaminhados se foram endereçados à identidade local e apenas para os relays inbox dessa identidade; o app não decifra a mensagem para encaminhá-la. A ponte não lê, altera nem cria uma rota para envelopes de outras pessoas. Ela limita encaminhamento a 60 eventos e 2 MB de tráfego de saída por minuto, contando cada destino, e funciona somente enquanto a PWA estiver ativa.
6. **Camadas claras.** A interface é cliente; relays transportam e armazenam eventos conforme suas políticas; nodes operados por pessoas podem oferecer serviços adicionais e permanecer online em PCs. A ponte no celular é best effort, pode transferir dados móveis e não equivale a relay público de entrada nem a serviço sempre ligado. Não introduzir protocolo P2P próprio antes de demonstrar necessidade.
7. **Sem promessa falsa de segundo plano.** No celular, a pessoa pode habilitar colaboração do node enquanto o navegador/app está ativo. O sistema operacional pode suspender a PWA; o projeto não promete relay móvel sempre ligado, tela acesa, root ou funcionamento oculto. PCs podem operar nodes continuamente.
8. **Código auditável e pacote autônomo.** Código-fonte, versões de dependências e artefatos necessários à execução pertencem ao repositório/pacote do Property. O cliente não carrega scripts, módulos, fontes ou rastreadores executáveis de CDNs em tempo de uso. Builds e versões de origem devem ser identificáveis e verificáveis.
9. **Descentralização prática.** A pessoa escolhe mais de um relay e pode operar um node. Uma falha ou recusa de um relay não deve transformar o host do app em ponto central de comunicação.
10. **Financiamento voluntário e transparente.** Um node pode aceitar ou recusar campanhas de marketing remuneradas em BTC, XMR ou XNO. A aceitação vem antes do pagamento. Uma campanha paga é apresentada como patrocinada, separada de mensagens e sem rastreamento centralizado de cliques ou leituras.

## Produto e experiência

- **Primeiro acesso:** criar ou recuperar identidade, explicar a recuperação com clareza e usar os dois relays sugeridos e salvos localmente, sem precisar conhecer ou digitar endereços. Se ainda não houver lista NIP-17 de recebimento, as configurações preenchem os relays selecionados; publicar a lista kind 10050 continua sendo uma ação explícita, pois torna os endereços de roteamento públicos. As duas pessoas precisam publicar suas listas para trocar mensagens privadas. O login pode persistir no navegador; senha em texto puro nunca fica armazenada.
- **Comunicação:** mensagens privadas, conversas e espaços públicos/grupais conforme protocolos Nostr suportados e validados.
- **Agentes:** identidade Nostr independente pode trocar mensagens diretamente por chave pública, sem convite, pareamento ou aprovação do Property. A conversa de agente é identificada e separada; a pessoa pode bloquear localmente, e mensagens recebidas não são executadas. Revisão humana, segurança independente, interoperabilidade externa e matriz multiplataforma ainda exigem evidência própria.
- **Hangout:** notas públicas Nostr kind 1 e comunidades públicas NIP-29 são consultadas e publicadas diretamente nos relays selecionados. Cada comunidade é identificada pelo relay que a hospeda e pelo ID do grupo; históricos de relays conflitantes permanecem separados. Grupos privados/ocultos não aparecem na busca pública, e a descoberta de migrações `kind:10009` continua pendente.
- **Campanhas de nodes:** a PWA pode, por opt-in local desligado por padrão, ler eventos assinados e exibi-los separados do Hangout; não envia telemetria de clique/visualização nem contém carteiras. A biblioteca do relay tem engine e adaptadores BTC/XMR/XNO, exercitados em G07–G08 com redes e carteiras locais privadas. Isso não ativa uma experiência de operação do node em produção; revisão de segurança e política de produção continuam necessárias antes de usar fundos reais.
- **Marketplace:** a primeira versão publica e descobre ofertas no formato NIP-15. O padrão está em draft e marcado como não recomendado pela especificação atual; esta versão é uma experiência de compatibilidade. Compra, checkout, custódia e escrow não são implementados. O marketplace de produtos e o mercado de publicidade de nodes são capacidades distintas.
- **Nodes:** preferência por nodes de PC para disponibilidade contínua; colaboração do navegador móvel é voluntária e limitada ao tempo em que o app permanecer ativo.
- **Distribuição:** PWA utilizável em navegador e adicionável à tela inicial nos navegadores que suportarem a instalação. Não exigir publicação em loja ou root para o caminho principal.

## Nome e origem do código

O projeto se chama **Property**; o produto web, o manifesto instalável, o ícone e os fluxos visíveis devem usar esse nome. O código-fonte upstream do Amethyst permanece reconhecível no fork, com licença, histórico e autoria preservados. O código Amethyst necessário ao produto é adaptado dentro da árvore do repositório e distribuído com ele; nenhuma dependência de execução é consultada em um host upstream. `modelo-mvp` é a branch de trabalho e registra o snapshot upstream fixado e os commits da adaptação Property.

## Reuso do Amethyst

O Amethyst é a base técnica prioritária. O repositório público atual identifica licença MIT, separa app Android, biblioteca Nostr Quartz, componentes compartilhados Commons e app desktop, e lista suporte a NIP-15 (marketplace) e NIP-17 (mensagens privadas). Isso oferece uma base significativa de protocolos, modelos, criptografia, conexão a relays, fluxos de produto e testes.

A origem fixada é o commit `948135f7dbbae81d79a0b985282ce673397a7618`. O repositório `coercaodobem/property` publica o snapshot adaptado; o histórico upstream completo permanece no Amethyst. O relay Geode é reutilizado e inclui seu runtime. A interface PWA usa `nostr-tools` local, não uma compilação web do Compose/Quartz selecionado. Melhorias compatíveis devem continuar avaliando e reaproveitando upstream, com origem e licença registradas.

O repositório do Amethyst é descrito como Android/desktop, não como uma PWA pronta. Portanto, a interface Compose e APIs específicas do Android não serão consideradas compatíveis com navegador sem uma prova técnica. Se não houver alvo web suportado, manter o núcleo de protocolo reutilizado e criar uma camada web fina dentro do próprio repositório Property. Não reescrever lógica de protocolo já validada apenas para uniformizar tecnologia.

Antes de incorporar cada módulo, revisar licença e dependências transitivas, preservar avisos de copyright/licença MIT, registrar commit e origem, remover referências de build a versões dinâmicas como snapshots e trazer o código/dependências de runtime para o repositório ou bundle. Nenhum componente necessário à execução pode ser carregado de um servidor Amethyst, Maven, JitPack ou CDN quando o usuário abre o app. A versão web atual inclui localmente `nostr-tools@2.25.2` porque o Quartz KMP não publica target JS/WASM; sua cadeia de dependências precisa de auditoria antes de beta público.

Referências para a auditoria inicial: [repositório Amethyst](https://github.com/vitorpamplona/amethyst), [README e arquitetura](https://github.com/vitorpamplona/amethyst/blob/main/README.md), [licença MIT](https://github.com/vitorpamplona/amethyst/blob/main/LICENSE). Esses links servem para pesquisa e não são dependências de runtime.

## Hospedagem e confiança

Durante desenvolvimento, usar ambiente local e staging controlado; não é necessário lançar o site institucional antes de o app estar pronto. Na fase de lançamento, o GitHub Pages pode publicar o app estático diretamente de uma branch/pasta do repositório público Property. O site institucional do projeto será preparado para essa fase final; app e apresentação podem compartilhar domínio ou ser separados.

O Pages é distribuição de arquivos, não backend. Mensagens e eventos vão diretamente do navegador aos relays. O host HTTPS continua sendo uma raiz de confiança para a primeira abertura e as atualizações de uma PWA; releases revisadas, tags assinadas, artefatos reproduzíveis e espelhos ajudam a verificar a distribuição, mas não tornam o domínio irrelevante.

## Fora do escopo inicial

- Garantir execução permanente de nodes em navegador móvel suspenso.
- Criar relays, protocolos de criptografia ou um sistema P2P próprio antes de avaliar os existentes.
- Conta centralizada, autenticação ou recuperação de senha por servidor, e armazenamento remoto de chave.
- Publicidade baseada em impressão, clique, leitura ou perfil central.
- Lançar site institucional/marketing antes de o app estar funcional e revisado.

## Plataformas e moedas

O objetivo inclui Windows, macOS, Linux/Ubuntu, Android e iOS. Os pacotes de relay incluem Linux x86_64, Windows x64 e macOS Apple Silicon; a PWA é a interface comum. Instalação e operação exigem evidência separada por sistema; Mac Intel e outras arquiteturas continuam pendentes. Android/iOS ainda não têm relay Property continuamente ativo validado.

Ofertas declaram BTC, XMR ou XNO. Valores atômicos usam strings inteiras, sem conversão entre moedas ou cotação automática. Campanhas novas usam `property-sponsored-v2`; eventos legados XNO continuam legíveis. A especificação e os gates de pagamento estão em [pagamentos.md](pagamentos.pt-BR.md). Nenhum leitor ou hash declarado comprova liquidação.
