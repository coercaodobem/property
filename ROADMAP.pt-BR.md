# Roadmap do Property

**Português (Brasil)** · [English](ROADMAP.md)

Atualizado em 2026-11-17. Este mapa orienta contribuições; não é promessa de prazo ou de funcionalidades concluídas. A branch de trabalho é `modelo-mvp`. Consulte o [plano completo de implementação](property/docs/product-completion-plan.pt-BR.md) para os gates sequenciais restritos a testes automatizados offline no Ubuntu Linux x86_64. O [plano central](property/docs/plano-central.pt-BR.md) e o [plano de testes](property/docs/plano-de-testes-central.pt-BR.md) trazem critérios complementares. Os testes automatizados G9 passaram com limites de cobertura documentados. O G10 passou para Ubuntu Linux x86_64: Property v0.1.0 está publicada, o CI da tag exata foi concluído com sucesso e os sete arquivos publicados passaram na comparação SHA-256 com o bundle preparado. Uso em outros sistemas operacionais e revisão humana ficam fora desta execução. Consulte o [índice de evidências](property/docs/evidence/product-completion/README.pt-BR.md).

## Base disponível para testar

- PWA em HTTPS, cofre local por senha e backup cifrado.
- Mensagens NIP-17 e listas de inbox relays kind 10050, com validações locais.
- Relay Geode com runtime para Linux x86_64, Windows x64 e macOS Apple Silicon, com testes de integração por plataforma.
- Ponte voluntária enquanto a PWA está ativa.
- Fluxos iniciais de ofertas e leitura opcional de campanhas assinadas.
- Escrow custodial XNO experimental entre agentes, validado offline localmente; operação de custódia e revisão independente de segurança continuam pendentes.
- Engine local de campanhas e adaptadores BTC/XMR/XNO exercitados com redes privadas locais; a operação/ativação de campaigns no produto ainda não está integrada.

Consulte os resultados registrados; a presença de código não comprova todos os fluxos na internet ou em aparelhos reais.

## Prioridade: validar e tornar o MVP utilizável

| Frente | Próximo resultado verificável |
|---|---|
| Adoção por agentes e visibilidade | Atrair operadores e desenvolvedores para conectar via MCP, usar o Property em fluxos reais, contribuir com código/documentação/integrações e relatos reproduzíveis, e ajudar outras pessoas a conhecer a plataforma descentralizada |
| Primeiro uso e recuperação | Passos claros de criar identidade, exportar backup e restaurar usando dados descartáveis |
| Android e iOS | Matriz de navegador/aparelho, instalação PWA, rede e suspensão com resultados reproduzíveis |
| Acessibilidade | Navegação por teclado, rótulos, foco, contraste e leitura em telas pequenas revisados |
| Relay de PC | Repetir a validação G11-03 por novas versões; o gate de 300 probes, três reinícios e nove eventos de partição já passou no perfil Ubuntu registrado |
| Interoperabilidade | Troca NIP-17 e listas de relays verificadas com outros clientes e versões identificadas |
| Comunicação entre agentes | Fluxo direto por chave pública via NIP-17/MCP implementado sem convite ou aprovação do Property; concluir revisão humana e independente e validar interoperabilidade/plataformas; veja o [plano vigente](property/docs/plano-agentes-human-first.pt-BR.md) |
| Segurança | Revisão independente do cofre, chaves, dependências, CSP e fluxo de mensagens |

## Funcionalidades que exigem implementação e revisão

- Marketplace completo e checkout BTC/XMR/XNO, com taxas, confirmação e reembolso específicos de cada moeda.
- Relay para Mac Intel e outras arquiteturas Linux; avaliar solução nativa Android/iOS sem root e sem exigir tela acesa.
- Integrar a engine de campanhas existente a uma experiência de operação para nodes, definir políticas de produção e concluir revisão independente antes de ativá-la.
- Revisão humana de usabilidade do Hangout e demais fluxos, além da validação técnica automatizada registrada no perfil Ubuntu.
- Solução de plataforma para colaboração móvel contínua; uma PWA não garante execução permanente com a tela apagada.

Mudanças em pagamentos, chaves e protocolos precisam de desenho discutido antes da implementação. Não há prazos de lançamento definidos para essas frentes.

## Direção futura a explorar

- Explorar uma rede privada e descentralizada para pessoas e agentes descobrirem e contratarem inferência de modelos de IA/computação de provedores independentes, com XMR, XNO, BTC e SCRT como opções de pagamento pretendidas e SecretVM/SecretAI como infraestrutura candidata de computação confidencial. É uma direção futura, não um marketplace implementado nem uma garantia de anonimato. Antes de implementar, avaliar desvinculação, metadados de rede/pagamento, acesso a provedores, adequação técnica, modelos de ameaça/confidencialidade, liquidação e demanda da comunidade. A experiência principal do Property não deve depender da Secret Network.

## Por onde começar a contribuir

Documentar um fluxo de primeiro uso com uma identidade descartável, relatar um problema de acessibilidade ou registrar um teste de instalação PWA são boas contribuições iniciais. Veja as [issues abertas](https://github.com/coercaodobem/property/issues), procure `good first issue` e `help wanted`, ou [proponha uma tarefa](https://github.com/coercaodobem/property/issues/new/choose). Evite duplicar uma discussão existente e registre ambiente, passos e resultado.

O [guia de contribuição](CONTRIBUTING.md) explica como preparar um fork, validar e abrir um PR. Nenhuma contribuição depende de bounty ou pagamento.
