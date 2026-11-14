# Escrow experimental Nano 2-de-3 por assinatura de limiar

[English](agent-xno-threshold.md) · **Português (Brasil)**

O Property Agent agora tem um fluxo experimental de limiar 2-de-3 separado das ferramentas custodiais `xno.escrow.*` existentes. Três identidades Nostr recebem os papéis de comprador, vendedor e árbitro. Os dispositivos executam geração distribuída de chave (DKG) e guardam partes de assinatura separadas; não há custodiante confiável nem chave privada completa no protocolo. A chave pública se torna uma conta Nano comum.

## Fluxo implementado

- `xno.threshold.create`, `accept` e `sync` coordenam o DKG 2-de-3 fixo pelo transporte NIP-17 par a par existente. Shares da rodada dois são enviados somente ao participante indicado. O coordenador não consegue ler a mensagem NIP-17 privada de outro participante.
- O material DKG e a parte final de cada participante ficam em `xno-threshold.json`, cifrados com a senha local do cofre Property Agent usando AES-256-GCM/PBKDF2. Nonces temporários de assinatura ficam somente na memória do processo; após reiniciar, uma nova rodada usa nonces novos.
- O contrato assinado vincula três identidades Nostr, as contas Nano do comprador e vendedor, um valor raw, hash dos termos, rede, ID da troca e vencimento. A sessão deriva a conta Nano do grupo somente após o DKG.
- A liquidação disponível somente na rede dev cria um bloco de envio de estado exato. A liberação é fixa para a conta do vendedor e exige aprovação do comprador e vendedor. O reembolso é fixo para a conta do comprador, fica disponível após o vencimento do contrato e exige aprovação do comprador e árbitro. Cada signatário vê a mesma conta, destino, valor, frontier anterior, resultado e hash do bloco. O frontier e saldo confirmados da conta são consultados novamente no nó Nano local antes da aprovação e assinatura.
- O protocolo v2 faz os três participantes trocarem a impressão digital exata da proposta de liquidação antes que alguém aprove ou assine. Uma divergência congela a sessão e aparece no status; violações da janela temporal são rejeitadas e informadas ao participante local. Sessões v1 e v2 não interoperam.
- Após um conflito ser informado, cada participante pode bloquear localmente o árbitro com `agent.block`; listas locais não são compartilhadas. Uma nova negociação pode escolher outro árbitro, mas isso não é um sistema global de reputação nem de prova.
- Dois signatários aprovados criam shares FROST para o hash exato do bloco. O coordenador verifica e agrega os shares, verifica a assinatura Nano final e pode enviar o bloco ao nó Nano local de desenvolvimento configurado.
- `xno.threshold.status` mostra o estado do DKG, liquidação, aprovações e envio ao nó sem revelar shares.

## Limites que permanecem

Isso é uma **assinatura de limiar**, não uma multisig por script nem um recurso de gasto condicional integrado ao Nano. As ferramentas `xno.escrow.*` atuais continuam custodiais e não são substituídas por esse fluxo. O Nano vê uma conta e uma assinatura normais. As regras de liquidação dependem de signatários honestos usando o Property: quaisquer dois titulares de share podem se aliar ou usar outro software para assinar qualquer bloco válido. O app não consegue impor reembolso, entrega, arbitragem ou destinatário específico no nível do protocolo.

O contrato vincula identidades Nostr a contas Nano declaradas, mas ainda não prova que o titular da chave Nostr controla a chave privada Nano correspondente. Os usuários precisam verificar essas contas por conta própria. Uma sessão tem exatamente um árbitro; escolher entre candidatos exige criar sessões separadas. Um relato de conflito autenticado por um participante não prova criptograficamente para as outras partes que o coordenador enviou ambas as propostas; um participante malicioso pode enviar um relato falso e causar negação de serviço. Isso não cria reputação global resistente a Sybil nem garante que futuras contrapartes bloquearão um árbitro. A perda de duas shares torna a conta impossível de gastar; perder uma share não tem recuperação implementada.

A criação de propostas, geração de work, assinatura e publicação pelo Property Agent continuam desativadas fora da rede Nano dev. Um ensaio mainnet separado, financiado por faucet com 1 raw, confirmou em 2026-11-14 um round-trip de recebimento/envio/recebimento 2-de-3 em dois endpoints RPC públicos distintos. Foi usado um harness temporário, não o fluxo de produção do Property Agent, e isso não satisfaz XNO-T2. Consulte a [evidência mainnet](evidence/agent-messaging/G13-xno-threshold-mainnet-20261114.pt-BR.md); ela também registra uma falha anterior do harness que deixou um raw pendente numa conta de grupo efêmera ainda não aberta.

O teste offline usa transporte sintético e adaptador de nó simulado; não exercita a criptografia NIP-17 real entre daemons. Ainda estão pendentes aceitação do fluxo Property por nó Nano dev privado descartável, entrega por relay real, recuperação após reinício entre daemons instalados, revisão independente criptográfica/de segurança e revisão humana do UX de assinatura. Uma resposta `process` confirma apenas o envio; esse fluxo ainda não acompanha confirmação. Não use fundos pessoais ou de produção. Qualquer teste mainnet deve usar carteira dedicada financiada por faucet e autorização explícita.

## Verificações offline

Execute a partir da raiz do repositório:

```bash
node property/tests/agent-xno-threshold-smoke.mjs
node property/tests/agent-xno-threshold-store-smoke.mjs
node property/tests/agent-xno-threshold-protocol-smoke.mjs
bash property/tests/run-smoke.sh
```

O teste de hash do bloco de estado coincide com um vetor de referência publicado no RPC Nano. Isso verifica serialização e comportamento criptográfico locais, não aceitação por nó independente ou segurança de produção. O fixture adversarial de 14/11/2026 passou 23 casos nomeados offline para rejeição de reembolso antecipado, bloqueio por conflito de proposta, bloqueio local e quatro sessões com árbitros alternativos. Mensagens e identidades são sintéticas. Consulte a [evidência adversarial offline](evidence/agent-messaging/G13-xno-threshold-adversarial-offline-20261114.pt-BR.md), a [evidência-base G13-02](evidence/agent-messaging/G13-xno-threshold-integration-offline-20261113.md) e os [gates XNO restantes](plano-de-testes-central.pt-BR.md#extensão-separada-de-assinatura-de-limiar-xno-fora-da-aceitação-do-mvp).

Referências: [blocos de estado Nano](https://docs.nano.org/protocol-design/blocks/), [protocolo RPC Nano](https://docs.nano.org/commands/rpc-protocol/), [geração de work Nano](https://docs.nano.org/integration-guides/work-generation/) e [FROST RFC 9591](https://www.rfc-editor.org/rfc/rfc9591.html).
