# Feed público Explorar como página inicial do Property

## Objetivo

Fazer de um feed público e somente para leitura a primeira tela do PWA do Property. Visitantes podem entender e navegar pela atividade pública antes de criar uma identidade ou conhecer outra pessoa. Conversas privadas continuam privadas e acessíveis pela navegação atual.

## Escopo

- Reutilizar o PWA do Property e as publicações públicas existentes do Hangout. Reutilizar ofertas do marketplace somente onde a interface atual já der suporte; não adicionar pagamentos nem capacidades novas ao marketplace.
- A leitura de publicações públicas não exige identidade, contato ou conversa.
- Publicar, responder e reagir exige uma identidade desbloqueada e usa os fluxos existentes do Property/Nostr.
- Atualizar a ação principal da página Sobre para abrir Explorar e explicar que é possível navegar antes de entrar.
- Manter inglês como idioma padrão e português (Brasil) disponível. Preservar layout responsivo e rótulos acessíveis.
- Não criar outro app, backend ou dependência carregada em tempo de execução.

## Gates de entrega

1. **Entrada em Explorar:** uma visita nova abre o feed público, inclusive para quem ainda não tem identidade. As conversas continuam acessíveis pela navegação.
2. **Estados honestos do feed:** exibir publicações públicas e explicar claramente carregamento, feed vazio, modo offline e erros. Não inventar usuários ou atividade. Conteúdo de demonstração, se houver, deve estar identificado e separado das publicações reais.
3. **Privacidade e participação:** nunca exibir conteúdo de mensagens privadas no feed público. Antes de desbloquear uma identidade, ações de escrita apresentam essa etapa e não produzem eventos assinados ou transmitidos.
4. **Página Sobre e idiomas:** a página Sobre leva a Explorar e descreve corretamente a navegação sem identidade; há textos em inglês e português do Brasil.

## Verificação mínima

Usar fixtures offline determinísticas e um smoke no navegador em larguras de desktop e celular:

1. Abrir uma sessão limpa, sem identidade, e confirmar que Explorar aparece sem exigir contato ou login.
2. Renderizar fixtures de publicações públicas e confirmar que mensagens privadas são excluídas.
3. Exercitar estados vazio e offline; confirmar que nenhuma atividade falsa aparece.
4. Tentar publicar sem entrar; confirmar que nenhum evento é assinado ou enviado e que a navegação para conversas existentes continua disponível.
5. Conferir os links alterados da página Sobre e inspecionar o fluxo visível no navegador.

Essas verificações comprovam somente a interface e as regras de acesso. Entrega por relay real, comportamento em dispositivo físico e outros sistemas operacionais ficam separados e não são validados por este plano. Não publicar mensagens de teste em relays públicos.
