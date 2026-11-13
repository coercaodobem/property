# Pagamentos diretos XNO entre agentes

**Português (Brasil)** · [English](agent-xno-trades.md)

**Estado:** recurso local experimental; testes offline de contagem fixa passaram. Não foram usados fundos reais nem relays públicos. Isso não é aprovação de segurança para produção.

## O que está implementado

O Property Agent expõe seis tools MCP fixas para pagamentos Nano diretos com limites entre identidades Nostr independentes de agentes. As tools de mensagens e pagamentos não exigem aprovação do Property a cada chamada. Antes, o responsável pelo perfil precisa configurar em um terminal interativo uma carteira Nano dedicada com uma conta, limite por pagamento em raw, orçamento total em raw e rede esperada; depois precisa digitar `ARMAR`. O daemon verifica o gateway autenticado local, a carteira, a conta e a rede antes de salvar a configuração cifrada. A configuração não envia pagamentos.

As tools são `property_xno_policy`, `property_xno_create_offer`, `property_xno_pay_offer`, `property_xno_trade_status`, `property_xno_verify_receipt` e `property_xno_dispute`. Consulte o [guia de instalação e configuração MCP](../agent/README.md) para conectar o servidor local.

## Fluxo da troca

1. O vendedor envia uma oferta NIP-17 privada e assinada à identidade do agente comprador. Ela contém chaves Nostr do comprador e vendedor, conta Nano de destino declarada pelo vendedor, valor inteiro em raw, termos e SHA-256, e validade.
2. O comprador só pode pagar uma oferta cuja assinatura foi verificada, que não expirou, foi endereçada à identidade do comprador e respeita os limites locais por pagamento e totais. O valor é reservado no diário cifrado antes da chamada RPC da carteira.
3. O ID do envio Nano é derivado de forma determinística da identidade do comprador e do ID da troca. Repetir a mesma troca reutiliza esse ID, evitando que uma resposta RPC perdida crie intencionalmente outro envio.
4. O comprador envia um recibo NIP-17 assinado com o hash do envio, contas declaradas e valor. ACK do relay significa somente que o relay aceitou o evento.
5. O vendedor confere o recibo contra a própria oferta salva e consulta o node Nano configurado para verificar origem, destino, valor raw e confirmação exatos. Só então recebe aquele envio confirmado em sua única conta configurada.
6. Se a RPC de recebimento aceitou o bloco, mas a resposta se perdeu, a repetição confere a lista de valores a receber e o histórico paginado da conta no Nano. O sistema compara o hash do envio, origem, valor e bloco de recebimento confirmado antes de informar sucesso. O teste offline simula a resposta perdida e verifica que só uma ação `receive` foi emitida.
7. Qualquer agente pode enviar uma nota de disputa assinada. Ela é somente um registro: não congela fundos nem faz devolução automática.

## Segurança e limites

- Um envio Nano confirmado é irreversível. O Nano não tem pagamento condicionado à entrega, escrow nativo ou arbitragem; o Property não pode obrigar o comprador a receber o produto nem o vendedor a reembolsar. A disputa não altera o ledger. [Ciclo dos blocos Nano](https://docs.nano.org/protocol-design/blocks/)
- A conta Nano na oferta assinada é declarada pelo vendedor. O Property não prova que o signatário Nostr controla a conta Nano nem que os termos foram cumpridos.
- Os limites locais são verificações de política, não limites do protocolo Nano. Quem controla o host desbloqueado, malware ou quem restaura um diário autenticado antigo pode contornar o orçamento total local. A cifragem detecta adulteração e identidade/senha erradas, mas não impede rollback.
- A documentação do Nano descreve a RPC de carteira embutida como destinada a desenvolvimento e testes. Não exponha a porta RPC; o adaptador exige gateway autenticado local, em loopback. Uma arquitetura de carteira adequada a fundos reais e revisão independente de segurança continuam pendentes. [Protocolo RPC Nano](https://docs.nano.org/commands/rpc-protocol/), [guias de integração Nano](https://docs.nano.org/integration-guides/)
- O diário de trocas fica cifrado em repouso com AES-256-GCM e PBKDF2-HMAC-SHA-256 (600.000 iterações), vinculado à identidade local do agente e a um contexto dedicado. Credenciais da carteira não são copiadas para o diário. Perder a senha do cofre ou o diário impede a recuperação normal; diários em texto puro/adulterados falham fechados.
- Ofertas e recibos trafegam em mensagens NIP-17 cifradas, mas relays ainda podem observar roteamento e metadados de tráfego. ACK do relay não comprova que o outro agente recebeu ou leu a mensagem.
- Após a configuração não há tela de aprovação humana por pagamento. O responsável arma explicitamente a política local uma vez, e o limite local separado restringe os gastos automáticos do agente. O host de IA pode impor confirmação própria fora do Property.
- O Marketplace PWA continua sendo uma vitrine de ofertas; não usa este fluxo de pagamento de agentes como checkout. As tools ainda não implementam pagamentos de agentes em BTC ou XMR.

## Evidência offline

Execute da raiz do repositório:

```bash
node property/tests/agent-xno-trades-smoke.mjs
node property/tests/agent-nano-wallet-smoke.mjs
```

G8 tem 28 casos determinísticos. G9 tem 14 casos contra um servidor RPC sintético vinculado somente a loopback. Os relatórios registram zero fundos e nenhum uso de rede externa/relay. Os fixtures validam transições implementadas; não substituem integração com carteira nativa, revisão de segurança independente, avaliação de UX com pessoas ou aprovação da operação de produção.

## Trabalho pendente

Uso em produção depende de uma arquitetura RPC de carteira adequada a fundos reais, política contra rollback ou decisão explícita de aceitar esse limite, política de recuperação/migração, revisão independente de segurança e revisão da UX de operação real. Suporte nativo Windows, macOS, Android e iOS continua `PENDING` à parte.
