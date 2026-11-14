# Pagamentos e escrow XNO entre agentes

**Português (Brasil)** · [English](agent-xno-trades.md)

**Estado:** recurso local experimental. Os testes de contagem fixa usam apenas carteiras sintéticas e fixtures NIP-17. Não foram usados relays públicos nem fundos reais. Isto não é aprovação de segurança para produção.

## Tools implementadas

O Property Agent expõe 20 tools MCP fixas: cinco para mensagens e atividade, seis para pagamentos XNO diretos e nove para escrow custodial. Nem mensagens nem essas chamadas de pagamento exigem aprovação individual do Property. O responsável arma cada política local de carteira uma vez, em um terminal interativo. Consulte o [guia de configuração MCP](../agent/README.md).

Pagamentos diretos usam `property_xno_policy`, `property_xno_create_offer`, `property_xno_pay_offer`, `property_xno_trade_status`, `property_xno_verify_receipt` e `property_xno_dispute`.

Escrow usa `property_xno_escrow_offer`, `property_xno_escrow_open`, `property_xno_escrow_accept`, `property_xno_escrow_fund`, `property_xno_escrow_approve`, `property_xno_escrow_dispute`, `property_xno_escrow_sync`, `property_xno_escrow_resolve` e `property_xno_escrow_status`.

## Fluxo de escrow custodial

1. O comprador escolhe quatro identidades Nostr distintas: comprador, vendedor, um custodiante e um árbitro independente. O pedido assinado vincula as contas Nano, o valor exato em raw, o hash dos termos, as partes e a expiração.
2. O custodiante abre o pedido e envia o contrato assinado ao comprador, vendedor e árbitro. O vendedor só aceita se o contrato apontar para a conta Nano configurada em sua carteira.
3. Depois que o custodiante anuncia o aceite do vendedor, o comprador deposita o valor exato do contrato. O custodiante verifica o hash do envio Nano, origem, destino, valor e confirmação antes de recebê-lo em sua carteira dedicada.
4. Antes de autorizar a liberação, o comprador confere no próprio nó Nano o hash exato do depósito, origem, destino, valor e confirmação. No próximo `sync`, o custodiante paga a conta acordada do vendedor. Se alguma parte abrir uma disputa, o custodiante pausa a liquidação e notifica o árbitro independente. O árbitro confere o estado de disputa assinado pelo custodiante e envia uma decisão assinada: liberar ao vendedor ou devolver ao comprador. O custodiante executa a decisão no próximo `sync`; avisos de estado que falharem são repetidos sem duplicar os avisos já aceitos por um relay.
5. Envios e pagamentos Nano continuam irreversíveis. ACK de relay não comprova entrega. O operador precisa estar ativo e reconciliar cada troca.

Configure o custodiante com `property-agent xno escrow configure`. Ele usa uma carteira Nano separada e dedicada, com uma conta. `max_raw_per_payment` limita cada escrow; `lifetime_budget_raw` limita o passivo total reservado por escrows abertos. Todos os escrows compartilham essa conta configurada; o diário local cifrado associa cada hash de depósito confirmado ao contrato. Comprador e vendedor configuram carteiras diretas com `property-agent xno configure`.

## Confiança e limites de segurança

- O Property contém um núcleo criptográfico FROST experimental 2-de-3 para assinaturas compatíveis com Nano ([detalhes e limites atuais](agent-xno-threshold.pt-BR.md)). Ele ainda não está conectado à liquidação do escrow abaixo. O escrow implementado aqui continua custodial e não deve ser descrito nem usado como multisig.
- Isto é **escrow custodial**, não escrow sem confiança. O Nano não impõe o contrato, a decisão do árbitro, um reembolso ou uma liberação condicionada. O custodiante detém as chaves e pode ignorar o aplicativo ou mover os fundos por fora do Property. Portanto comprador e vendedor confiam no custodiante e no árbitro escolhidos. [Ciclo dos blocos Nano](https://docs.nano.org/protocol-design/blocks/)
- O árbitro independente separa a decisão sobre disputas da custódia, mas não consegue obrigar um custodiante desonesto a executar. Depois de aberto o contrato assinado, nenhum agente comprador ou vendedor pode redirecionar o pagamento para outra conta.
- O fluxo não vincula criptograficamente chaves Nostr a contas Nano. O aceite do vendedor confere a conta local configurada; a conta do comprador fica vinculada no pedido assinado. Isso ainda não prova controle da conta no protocolo Nano.
- A conta dedicada do operador agrupa fundos de escrows abertos. O teto de passivos e o diário cifrado são verificações locais; o ledger Nano não os impõe. Operador malicioso, host comprometido ou rollback de um diário autenticado pode contornar a política de software. Não use fundos reais.
- A RPC de carteira embutida do Nano é documentada para desenvolvimento/testes. Mantenha-a atrás de gateway autenticado em loopback e não exponha a porta. Revisão independente de segurança para produção, política de recuperação e revisão operacional continuam pendentes. [RPC Nano](https://docs.nano.org/commands/rpc-protocol/), [gerenciamento de chaves](https://docs.nano.org/integration-guides/key-management/)
- As trocas XNO diretas continuam pagamentos irreversíveis à contraparte; usar as tools de escrow separadas não altera esse fluxo. A PWA humana do Marketplace continua sem checkout de pagamento. Transferências de agentes em BTC e XMR não estão implementadas.

## Verificações offline

Execute na raiz do repositório:

```bash
node property/tests/agent-xno-trades-smoke.mjs
node property/tests/agent-xno-escrow-smoke.mjs
node property/tests/agent-nano-wallet-smoke.mjs
```

O fixture de escrow usa um comprador, vendedor, custodiante e árbitro; duas trocas sintéticas; uma liberação ao vendedor e um reembolso decidido pelo árbitro; e casos fixos de repetição após resposta perdida e entrega parcial de avisos. Ele valida somente o fluxo modelado, não operação Nano ao vivo, honestidade do custodiante, imparcialidade da arbitragem ou prontidão para produção.

## Trabalho pendente

Uso em produção continua condicionado a revisão independente de segurança e de operador humano, política anti-rollback, desenho de recuperação de carteira e revisão da operação de custódia. Suporte nativo Windows, macOS, Android e iOS continua `PENDING` separadamente.
