# Roadmap do Property

Atualizado em 2026-11-03. Este mapa orienta contribuições; não é promessa de prazo ou de funcionalidades concluídas. A branch de trabalho é `modelo-mvp`. Os critérios detalhados estão no [plano central](property/docs/plano-central.md) e no [plano de testes](property/docs/plano-de-testes-central.md).

## Base disponível para testar

- PWA em HTTPS, cofre local por senha e backup cifrado.
- Mensagens NIP-17 e listas de inbox relays kind 10050, com validações locais.
- Relay Geode com runtime para Linux x86_64, Windows x64 e macOS Apple Silicon, com testes de integração por plataforma.
- Ponte voluntária enquanto a PWA está ativa.
- Fluxos iniciais de ofertas e leitura opcional de campanhas assinadas.
- Engine local de campanhas e adaptadores BTC/XMR/XNO exercitados com redes privadas locais; a operação/ativação de campaigns no produto ainda não está integrada.

Consulte os resultados registrados; a presença de código não comprova todos os fluxos na internet ou em aparelhos reais.

## Prioridade: validar e tornar o MVP utilizável

| Frente | Próximo resultado verificável |
|---|---|
| Primeiro uso e recuperação | Passos claros de criar identidade, exportar backup e restaurar usando dados descartáveis |
| Android e iOS | Matriz de navegador/aparelho, instalação PWA, rede e suspensão com resultados reproduzíveis |
| Acessibilidade | Navegação por teclado, rótulos, foco, contraste e leitura em telas pequenas revisados |
| Relay de PC | Repetir a validação G11-03 por novas versões; o gate de 300 probes, três reinícios e nove eventos de partição já passou no perfil Ubuntu registrado |
| Interoperabilidade | Troca NIP-17 e listas de relays verificadas com outros clientes e versões identificadas |
| Comunicação entre agentes | Fluxo direto por chave pública via NIP-17/MCP implementado sem convite ou aprovação do Property; concluir revisão humana e independente e validar interoperabilidade/plataformas; veja o [plano vigente](property/docs/plano-agentes-human-first.md) |
| Segurança | Revisão independente do cofre, chaves, dependências, CSP e fluxo de mensagens |

## Funcionalidades que exigem implementação e revisão

- Marketplace completo e checkout BTC/XMR/XNO, com taxas, confirmação e reembolso específicos de cada moeda.
- Relay para Mac Intel e outras arquiteturas Linux; avaliar solução nativa Android/iOS sem root e sem exigir tela acesa.
- Integrar a engine de campanhas existente a uma experiência de operação para nodes, definir políticas de produção e concluir revisão independente antes de ativá-la.
- Revisão humana de usabilidade do Hangout e demais fluxos, além da validação técnica automatizada registrada no perfil Ubuntu.
- Solução de plataforma para colaboração móvel contínua; uma PWA não garante execução permanente com a tela apagada.

Mudanças em pagamentos, chaves e protocolos precisam de desenho discutido antes da implementação. Não há prazos de lançamento definidos para essas frentes.

## Por onde começar a contribuir

Documentar um fluxo de primeiro uso com uma identidade descartável, relatar um problema de acessibilidade ou registrar um teste de instalação PWA são boas contribuições iniciais. Veja as [issues abertas](https://github.com/coercaodobem/property/issues), procure `good first issue` e `help wanted`, ou [proponha uma tarefa](https://github.com/coercaodobem/property/issues/new/choose). Evite duplicar uma discussão existente e registre ambiente, passos e resultado.

O [guia de contribuição](CONTRIBUTING.md) explica como preparar um fork, validar e abrir um PR. Nenhuma contribuição depende de bounty ou pagamento.
