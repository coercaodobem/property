# Integração da UX do Ghostly na PWA Property

O Ghostly é uma referência para interações de conversa e detalhes de interface. O código de referência está preservado em [`archive/ghostly-source/`](../../archive/ghostly-source/) com as licenças upstream. O produto continua sendo um único app Property, servido em `https://coercaodobem.github.io/property/`.

## Limites do produto

- Manter a identidade Property existente, o armazenamento local de mensagens, os eventos Nostr e os relays escolhidos pela pessoa.
- Colocar UX e recursos compatíveis em `property/web/`; não publicar um segundo app, identidade, transporte ou histórico de conversas.
- Adaptar comportamentos que dependem de protocolo ao Nostr. Não importar o transporte P2P independente do Ghostly como uma segunda camada de rede.
- Recursos que não possam ser transportados com segurança pelos fluxos Nostr atuais ficam de fora até haver um desenho compatível e um gate de testes.

## Integrado nesta mudança

- Respostas privadas usam a referência `e` para a mensagem-pai em eventos `kind:14` NIP-17. O Property cria um rumor e cifra esse mesmo evento para as duas identidades, mantendo o ID da resposta igual nos dois aparelhos. Respostas recebidas mantêm o ID do rumor. A prévia e a ação de ir à mensagem citada usam apenas o histórico local.
- Ao redesenhar a conversa aberta, a rolagem mantém a mensagem visível ancorada enquanto a pessoa lê mensagens antigas. Se ela já estava no fim, a conversa continua no fim.
- A ação de responder, o contexto do compositor e a prévia da citação usam a mesma PWA Property, identidade local, identidade visual preta e amarela e escolha existente entre inglês e Português (Brasil).
- O GitHub Pages constrói e publica somente `property/web`; o shell da PWA não pré-carrega outro app. O antigo caminho `/direct/` é uma página de migração com um worker que remove o cache antigo e redireciona instalações anteriores para a PWA principal.

A tag de resposta segue a definição atual de mensagem NIP-17: <https://github.com/nostr-protocol/nips/blob/master/17.md>. Ela permanece criptografada dentro do rumor NIP-17 e do gift wrap. Os relays não recebem o texto em claro nem a prévia local da citação.

## Não declarado como integrado

Esta mudança não adiciona conversa em grupo, chamadas, transferência de arquivos nem transporte P2P separado. Cada item exige desenho compatível com Nostr, revisão de dependências e segurança e validação própria com contagens fixas. A PWA Property não é um nó móvel sempre ativo.

A PWA web continua sendo o único produto de navegador voltado ao usuário. O projeto Ghostly é referência de UX, não um cliente Property publicado separadamente.
