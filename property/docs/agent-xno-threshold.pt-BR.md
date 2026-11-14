# Escrow experimental Nano 2-de-3 por assinatura de limiar

[English](agent-xno-threshold.md) · **Português (Brasil)**

O Property Agent agora tem um fluxo experimental de limiar 2-de-3 separado das ferramentas custodiais `xno.escrow.*` existentes. Três identidades Nostr recebem os papéis de comprador, vendedor e árbitro. Os dispositivos executam geração distribuída de chave (DKG) e guardam partes de assinatura separadas; não há custodiante confiável nem chave privada completa no protocolo. A chave pública se torna uma conta Nano comum.

## Fluxo implementado

- `xno.threshold.create`, `accept` e `sync` coordenam o DKG 2-de-3 fixo pelo transporte NIP-17 par a par existente. Shares da rodada dois são enviados somente ao participante indicado. O coordenador não consegue ler a mensagem NIP-17 privada de outro participante.
- O material DKG e a parte final de cada participante ficam em `xno-threshold.json`, cifrados com a senha local do cofre Property Agent usando AES-256-GCM/PBKDF2. Nonces temporários de assinatura ficam somente na memória do processo; após reiniciar, uma nova rodada usa nonces novos.
- O contrato assinado vincula três identidades Nostr, as contas Nano do comprador e vendedor, um valor raw, hash dos termos, rede, ID da troca e vencimento. A sessão deriva a conta Nano do grupo somente após o DKG.
- A liquidação disponível somente na rede dev cria um bloco de envio de estado exato. A liberação é fixa para a conta do vendedor e exige aprovação do comprador e vendedor. O reembolso é fixo para a conta do comprador, fica disponível após o vencimento do contrato e exige aprovação do comprador e árbitro. Cada signatário vê a mesma conta, destino, valor, frontier anterior, resultado e hash do bloco. O frontier e saldo confirmados da conta são consultados novamente no nó Nano local antes da aprovação e assinatura.
- Dois signatários aprovados criam shares FROST para o hash exato do bloco. O coordenador verifica e agrega os shares, verifica a assinatura Nano final e pode enviar o bloco ao nó Nano local de desenvolvimento configurado.
- `xno.threshold.status` mostra o estado do DKG, liquidação, aprovações e envio ao nó sem revelar shares.

## Limites que permanecem

Isso é uma **assinatura de limiar**, não uma multisig por script nem um recurso de gasto condicional integrado ao Nano. As ferramentas `xno.escrow.*` atuais continuam custodiais e não são substituídas por esse fluxo. O Nano vê uma conta e uma assinatura normais. As regras de liquidação dependem de signatários honestos usando o Property: quaisquer dois titulares de share podem se aliar ou usar outro software para assinar qualquer bloco válido. O app não consegue impor reembolso, entrega, arbitragem ou destinatário específico no nível do protocolo.

O contrato vincula identidades Nostr a contas Nano declaradas, mas ainda não prova que o titular da chave Nostr controla a chave privada Nano correspondente. Os usuários precisam verificar essas contas por conta própria. A perda de duas shares torna a conta impossível de gastar; perder uma share não tem recuperação implementada.

A criação da proposta, geração de work, assinatura e publicação de transação estão **desativadas fora da rede Nano dev**. O teste offline usa transporte sintético e adaptador de nó simulado; não exercita a criptografia NIP-17 real entre daemons nem a aceitação de um nó Nano. Ainda estão pendentes aceitação por nó privado real, entrega por relay real, recuperação após reinício entre daemons instalados, revisão independente criptográfica/de segurança e revisão humana do UX de assinatura. Uma resposta `process` confirma apenas o envio; esse fluxo ainda não acompanha confirmação. Não use fundos reais.

## Verificações offline

Execute a partir da raiz do repositório:

```bash
node property/tests/agent-xno-threshold-smoke.mjs
node property/tests/agent-xno-threshold-store-smoke.mjs
node property/tests/agent-xno-threshold-protocol-smoke.mjs
bash property/tests/run-smoke.sh
```

O teste de hash do bloco de estado coincide com um vetor de referência publicado no RPC Nano. Isso verifica serialização e comportamento criptográfico locais, não aceitação por nó independente ou segurança de produção. Consulte a [evidência offline G13-02](evidence/agent-messaging/G13-xno-threshold-integration-offline-20261113.md) e os [gates XNO restantes](plano-de-testes-central.pt-BR.md#extensão-separada-de-assinatura-de-limiar-xno-fora-da-aceitação-do-mvp).

Referências: [blocos de estado Nano](https://docs.nano.org/protocol-design/blocks/), [protocolo RPC Nano](https://docs.nano.org/commands/rpc-protocol/), [geração de work Nano](https://docs.nano.org/integration-guides/work-generation/) e [FROST RFC 9591](https://www.rfc-editor.org/rfc/rfc9591.html).
