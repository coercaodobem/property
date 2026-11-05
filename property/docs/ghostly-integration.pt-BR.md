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
- Conversas privadas em grupo são criadas no fluxo existente de Nova conversa e ficam nos stores de conversas e mensagens que o Property já usa. A sala é identificada pela lista ordenada de chaves públicas dos participantes. As mensagens usam um rumor NIP-17 `kind:14`, com os outros membros nas tags `p` e uma tag opcional `subject`; o Property cria um gift wrap separado para cada participante, incluindo quem envia, e roteia cada envelope aos relays inbox kind 10050 publicados por aquela pessoa. O cliente limita a sala a 10 participantes, incluindo quem envia, e mantém respostas, reações, mensagens salvas e encaminhamento na mesma interface de conversa.
- Salas NIP-17 não oferecem aprovação de entrada, administração ou controles confiáveis para sair/remover participantes. Cada membro precisa já ter publicado uma lista inbox que o remetente consiga descobrir pelos relays configurados. Crie salas com pessoas que concordaram em participar. Grupos acima de 10 pessoas precisam de outro protocolo mais adequado.
- Mensagens podem ser salvas no armazenamento de mensagens local já existente. Elas ficam neste aparelho e não são publicadas nos relays.
- Encaminhar cria uma nova mensagem NIP-17 criptografada pela mesma identidade Property para cada conversa existente selecionada. O resultado separa cópias locais de envelopes confirmados pelos relays; salvar uma cópia local não é apresentado como entrega.
- A busca no chat filtra as mensagens renderizadas localmente na conversa atual. Ignora maiúsculas/minúsculas e acentos, destaca os resultados e permite navegar entre eles. Não consulta relays, publica a busca nem a inclui na URL.
- Ao redesenhar a conversa aberta, a rolagem mantém a mensagem visível ancorada enquanto a pessoa lê mensagens antigas. Se ela já estava no fim, a conversa continua no fim.
- Essas interações usam a identidade visual preta e amarela já existente e a opção entre inglês e Português (Brasil).
- O GitHub Pages constrói e publica somente a PWA Property a partir de `property/web`.

As tags de resposta e as salas de conversa seguem a definição atual do [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), incluindo a orientação para usar um protocolo mais adequado em salas com mais de 10 pessoas. O texto da mensagem permanece criptografado e a prévia da citação é local; os relays não recebem o texto em claro.

## Não declarado como integrado

Chamadas, transferência de arquivos, mensagens de voz, carteiras e mini-apps ainda não estão integrados. Cada recurso precisa de desenho compatível com Nostr, revisão de segurança e validação com contagens fixas. O transporte P2P independente do Ghostly não faz parte do Property. O sistema operacional pode suspender uma PWA móvel; ela não é um relay sempre ativo.
