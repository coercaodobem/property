# Resultado do gate G4 — comunicação direta, recuperação de relays e PWA

**Resultado: PASS — automatizado/offline em Ubuntu Linux x86_64.** Candidato: [`4ec3ae5100e2aa39832a3312a5fca1a145080f1d`](https://github.com/coercaodobem/property/commit/4ec3ae5100e2aa39832a3312a5fca1a145080f1d).

Passaram 35 casos de contagem fixa: cinco casos auxiliares de entrega, seis casos da matriz de relays isolados e 24 casos de navegador/PWA. A suíte de navegador inclui busca no histórico direto e em grupo, 10 aberturas da PWA sem relays e 10 com um relay loopback. A matriz com seis identidades sintéticas e cinco relays passou 1.500 mensagens privadas sem descriptografia não autorizada, 100 eventos públicos, 40 transições de partição, 20 atualizações conflitantes, 10 reinícios de relay, 20 tentativas de repetição e 10 fixtures de cada categoria de falha. Sem relays públicos ou fundos.

A falha anterior ocorria porque uma renderização assíncrona removia o destaque da mensagem histórica selecionada. O candidato preserva o resultado durante novas renderizações da mesma conversa; G04-14 passou em conversas diretas e em grupo.

Os relatórios, capturas de tela, digests de origem e `SHA256SUMS` estão em [`fixed-run-09/`](fixed-run-09/). O gate não é uma revisão humana de segurança nem comprova entrega/recibos de leitura.
