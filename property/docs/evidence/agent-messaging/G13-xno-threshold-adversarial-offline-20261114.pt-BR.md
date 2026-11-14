# Verificação adversarial do limiar XNO — offline

**Resultado:** PASS somente para o fixture local fixo do protocolo.
**Comando:** `node property/tests/agent-xno-threshold-protocol-smoke.mjs`
**Revisão do protocolo:** `property-xno-threshold/v2`
**Revisão-base:** `3a139513a418a24e654cbfac44a0341e6f7b01b4`

Três revisões isoladas dos papéis de comprador, vendedor e árbitro encontraram dois ataques no fluxo anterior: um coordenador árbitro podia enviar uma proposta de reembolso válida antes do vencimento, e podia enviar propostas válidas diferentes ao comprador e vendedor na mesma sessão. No cenário de reembolso antecipado, o comprador ainda precisava aprovar e contribuir com uma share de assinatura; o árbitro não podia gastar sozinho. A assinatura de grupo simulada era uma assinatura Nano normal e válida para o bloco escolhido, não uma prova de aceitação por um nó Nano.

O fixture offline atualizado passou **23 casos nomeados** com sete identidades sintéticas fixas, uma sessão com árbitro malicioso, transporte de mensagens em memória e adaptador de nó de desenvolvimento simulado. Depois que comprador e vendedor bloquearam localmente o árbitro reportado, quatro outros árbitros candidatos fixos completaram sessões separadas. O teste verifica:

- propostas de reembolso antecipado são rejeitadas pelo comprador e vendedor usando seus relógios contratuais locais e aparecem como alertas de segurança locais;
- liberação é rejeitada no instante exato do vencimento, enquanto reembolso fica elegível nesse instante;
- os três participantes precisam observar a mesma impressão digital da proposta antes da aprovação/assinatura;
- um participante que recebe duas propostas do coordenador envia um relato de conflito; os três status locais mostram o relato e não podem iniciar a assinatura pelo fluxo Property;
- após os participantes adicionarem localmente o árbitro reportado às listas de bloqueio injetadas, uma nova sessão com essa identidade é recusada; quatro candidatos alternativos distintos conseguem completar sessões independentes.
- uma sessão v1 armazenada recusa sincronização pelo cliente v2.

O identificador de protocolo v2 é incompatível intencionalmente com v1, para clientes antigos não participarem silenciosamente da nova rodada de observação. Sessões v1 existentes não devem ser retomadas com clientes v2.

## Limites

As mensagens são sintéticas; esta execução não exercita assinaturas reais de eventos NIP-17, daemons instalados separadamente, nó Nano, relays públicos ou fundos. Um relato de conflito autenticado pelo participante não é prova criptográfica para as outras partes de que o coordenador acusado enviou ambas as propostas; um participante malicioso pode enviar um relato falso e congelar a sessão. Os testes de bloqueio usam um fixture de callback local; o relatório não prova que ambos os humanos ou agentes bloquearão permanentemente a identidade, e não existe reputação compartilhada ou resistente a Sybil. Os quatro árbitros alternativos foram testados em quatro sessões separadas; cada sessão continua tendo apenas um árbitro, sem quórum multiárbitro. Relógios locais e regras do cliente Property podem ser contornados por software modificado. Quaisquer dois titulares de share podem assinar outro bloco Nano válido fora do Property, e o consenso Nano não impõe a política do escrow.

A criação/assinatura/publicação em mainnet permanece desativada. Nenhum saldo de faucet ou transação real foi usado. Permanecem pendentes aceitação por nó privado XNO-T2, integração real com relay privado XNO-T3b e revisões independentes criptográfica/de segurança e de UX humano XNO-T4.
