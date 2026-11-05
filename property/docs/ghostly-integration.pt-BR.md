# UX do Ghostly adaptada dentro do Property

O [Ghostly](https://github.com/MiguelMedeiros/ghostly) é uma referência upstream para interações de conversa e detalhes de interface. O Property tem um único app para as pessoas: a PWA existente em `https://coercaodobem.github.io/property/`. Esta integração adapta padrões selecionados dentro de `property/web/`; não adiciona outro app, identidade, armazenamento de mensagens ou transporte.

## Limites do produto

- Manter a identidade Nostr do Property, o armazenamento local de mensagens, os eventos Nostr e os relays escolhidos pela pessoa.
- Adaptar interações compatíveis dentro da PWA Property e usar as conexões existentes com relays.
- Não incluir nem publicar outro cliente derivado do Ghostly. Ele é referência de design, não dependência de execução.
- Adaptar comportamentos que dependem de protocolo ao Nostr. Recursos incompatíveis com segurança pelos fluxos atuais ficam de fora até terem desenho e validação compatíveis.

## Integrado no Property

- Respostas privadas usam a referência `e` para a mensagem-pai em eventos `kind:14` NIP-17. O Property cria um rumor e cifra esse mesmo evento para as duas identidades, mantendo o ID da resposta igual nos dois aparelhos. Respostas recebidas mantêm o ID do rumor. A prévia e a ação de ir à mensagem citada usam apenas o histórico local.
- Reações privadas usam gift wraps NIP-17 contendo reações `kind:7` NIP-25. Elas ficam no mesmo chat e usam os relays inbox configurados pelas duas pessoas.
- Mensagens podem ser salvas no armazenamento de mensagens local já existente. Elas ficam neste aparelho e não são publicadas nos relays.
- Encaminhar cria uma nova mensagem NIP-17 criptografada pela mesma identidade Property para cada conversa existente selecionada. O resultado separa cópias locais de envelopes confirmados pelos relays; salvar uma cópia local não é apresentado como entrega.
- Ao redesenhar a conversa aberta, a rolagem mantém a mensagem visível ancorada enquanto a pessoa lê mensagens antigas. Se ela já estava no fim, a conversa continua no fim.
- Essas interações usam a identidade visual preta e amarela já existente e a opção entre inglês e Português (Brasil).
- O GitHub Pages constrói e publica somente a PWA Property a partir de `property/web`.

A tag de resposta segue a definição atual de mensagem NIP-17: <https://github.com/nostr-protocol/nips/blob/master/17.md>. O texto da mensagem permanece criptografado e a prévia da citação é local; os relays não recebem o texto em claro.

## Não declarado como integrado

Grupos, chamadas, transferência de arquivos, mensagens de voz, carteiras e mini-apps ainda não estão integrados. Cada recurso precisa de desenho compatível com Nostr, revisão de segurança e validação com contagens fixas. O transporte P2P independente do Ghostly não faz parte do Property. O sistema operacional pode suspender uma PWA móvel; ela não é um relay sempre ativo.
