# UX do Ghostly adaptada dentro do Property

O Ghostly é uma referência para interações de conversa e detalhes de interface. O código de referência está preservado em [`archive/ghostly-source/`](../../archive/ghostly-source/) com as licenças upstream. O Property continua sendo um único app: a PWA existente, sua identidade Nostr, armazenamento local e relays escolhidos pela pessoa, servido em `https://coercaodobem.github.io/property/`.

## Limites do produto

- Manter a identidade Property existente, o armazenamento local de mensagens, os eventos Nostr e os relays escolhidos pela pessoa.
- Adaptar UX e recursos compatíveis dentro de `property/web/`; não há um cliente Property separado nem um segundo app de conversa.
- Adaptar comportamentos que dependem de protocolo ao Nostr. Não importar o transporte P2P independente do Ghostly como uma segunda camada de rede.
- Recursos que não possam ser transportados com segurança pelos fluxos Nostr atuais ficam de fora até haver um desenho compatível e um gate de testes.

## Integrado nesta mudança

- Respostas privadas usam a referência `e` para a mensagem-pai em eventos `kind:14` NIP-17. O Property cria um rumor e cifra esse mesmo evento para as duas identidades, mantendo o ID da resposta igual nos dois aparelhos. Respostas recebidas mantêm o ID do rumor. A prévia e a ação de ir à mensagem citada usam apenas o histórico local.
- Reações privadas usam gift wraps NIP-17 contendo reações `kind:7` NIP-25. O seletor está no mesmo chat; os envelopes são enviados somente aos relays inbox configurados pelas duas pessoas. O Property mostra a reação mais recente de cada participante por mensagem.
- Ao redesenhar a conversa aberta, a rolagem mantém a mensagem visível ancorada enquanto a pessoa lê mensagens antigas. Se ela já estava no fim, a conversa continua no fim.
- A ação de responder, o contexto do compositor e a prévia da citação usam a mesma PWA Property, identidade local, identidade visual preta e amarela e escolha existente entre inglês e Português (Brasil).
- O GitHub Pages constrói e publica um único app a partir de `property/web`.

A tag de resposta segue a definição atual de mensagem NIP-17: <https://github.com/nostr-protocol/nips/blob/master/17.md>. Ela permanece criptografada dentro do rumor NIP-17 e do gift wrap. Os relays não recebem o texto em claro nem a prévia local da citação.

## Não declarado como integrado

Grupos, chamadas, transferência de arquivos, mensagens de voz, carteiras e mini-apps ainda não estão integrados. Cada recurso precisa de um desenho compatível com Nostr, revisão de segurança e validação com contagens fixas. O transporte P2P independente do Ghostly não faz parte do Property. A PWA não é um nó móvel sempre ativo.

Cada função voltada ao usuário permanece neste mesmo app e usa a identidade Property e os relays Nostr escolhidos. Ghostly é uma referência upstream de UX, não um produto Property separado.
