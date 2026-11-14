# BTC, XMR e XNO no Property

**Português (Brasil)** · [English](pagamentos.md)


Atualizado em 2026-11-13. A mudança incorpora o requisito do commit `55e379c9dbdf8637b32422d32e982460aa5862e5` e o estado atual da engine local de campanhas.

## Implementado e planejado

O cliente PWA publica preços de ofertas em BTC, XMR ou XNO e lê campanhas assinadas; verifica formato e assinatura, mas não contém checkout de marketplace nem confirmação de pagamento de campanha. Separadamente, a biblioteca local do relay inclui uma engine de campanhas e adaptadores para Bitcoin Core, Monero Wallet RPC e Nano RPC. Os gates G07–G08 exercitam essa engine e esses adaptadores com nós/carteiras reais em redes privadas locais, sem fundos reais. O Property Agent oferece pagamento direto XNO experimental e um fluxo opcional de escrow custodial para trocas entre agentes; nenhum deles é usado pelo checkout humano do Marketplace. Ao lado do fluxo custodial, agora existe um caminho experimental de liquidação com assinatura de limiar FROST/Nano 2-de-3. Ele está restrito a um nó Nano dev e ainda não passou por aceitação de bloco em nó privado nem por revisão independente de segurança. Não está pronto para produção nem é sem confiança: o Nano não impõe a política de liberação/devolução do app, e dois titulares de share podem assinar outro envio válido com software diferente. Consulte o [estado e os gates da assinatura de limiar](agent-xno-threshold.pt-BR.md). A PWA nunca deve tratar uma declaração de pagamento em um evento como confirmação própria.

## Pagamentos experimentais XNO entre agentes

O daemon MCP local pode enviar um pagamento Nano com limites configurados para uma oferta NIP-17 autenticada, não expirada e endereçada à identidade do agente. O responsável configura uma carteira Nano de conta única, um teto por pagamento e um orçamento total uma única vez; cada transação segue a oferta assinada e esses limites locais sem tela de aprovação do Property. O diário cifrado reserva o valor antes da chamada RPC e repete usando o mesmo ID Nano. O recebedor verifica o recibo assinado contra a própria oferta e o envio Nano confirmado exato, depois recebe aquele bloco uma vez. Se a resposta RPC do recebimento se perder, o sistema procura o hash do envio, origem e valor exatos no histórico da conta recebedora.

Pagamentos diretos **não são comércio sem confiança**: envio Nano é irreversível e o protocolo não impõe entrega, reembolso, arbitragem ou liberação condicionada. A ferramenta de escrow do Property guarda o depósito sob controle do custodiante e segue a decisão assinada de liberação/devolução de um árbitro separado, mas o custodiante pode contornar o app ou mover os fundos. As contas Nano não têm vínculo criptográfico com as chaves Nostr. Tetos locais não são impostos pelo Nano; administrador, malware ou rollback do diário podem contorná-los. A RPC de carteira embutida do Nano destina-se a desenvolvimento/testes; esta integração experimental ainda não passou por revisão independente de segurança para produção. Consulte a [implementação e os limites de ameaça dos pagamentos XNO de agentes](agent-xno-trades.pt-BR.md). Não use fundos reais.

## Encaminhamento para carteira externa nos cartões

O cartão de pagamento entre pessoas monta localmente uma URI sem se conectar a carteira ou serviço de pagamento. Bitcoin usa a URI `bitcoin:` definida pela [BIP 321](https://github.com/bitcoin/bips/blob/master/bip-0321.mediawiki), com o valor BTC em formato decimal; SegWit testnet usa o parâmetro `tb`. Signet e endereços Base58 legados da testnet não recebem URI de carteira porque o formato não preserva essa escolha de rede com segurança. Monero usa `monero:` com `tx_amount` e `tx_description`; Nano usa `nano:` com `amount` em raw inteiro e `message`, conforme o [guia de URI do Nano](https://docs.nano.org/integration-guides/the-basics/). Nano Beta não é encaminhado porque a URI não identifica essa rede.

O botão `Open in wallet` pede ao aparelho para abrir uma carteira externa compatível; `Copy payment request` e o QR local expõem a mesma URI. Se o cartão não tiver valor, o pedido contém apenas o endereço. Combinações de rede não suportadas ou ambíguas usam um QR somente com endereço. As verificações locais examinam formato e indicadores da rede, não checksum nem propriedade do endereço. A carteira deve validar o endereço e mostrar destinatário, rede, valor e taxas finais para a pessoa confirmar. O Property não assina, envia, verifica nem acompanha pagamentos.

| Moeda | Unidade mínima | Unidades por moeda | Limite do campo inteiro |
|---|---|---|---|
| BTC (Bitcoin) | satoshi | 10⁸ | 21 milhões de BTC em satoshis |
| XNO (Nano) | raw | 10³⁰ | uint128 |
| XMR (Monero) | piconero | 10¹² | uint64 |

Conversões usam BigInt e strings decimais. Não há câmbio entre moedas. Os limites são de representação, não saldo ou oferta monetária disponível. Referências: [unidades Nano](https://docs.nano.org/protocol-design/distribution-and-units/), [unidades Monero](https://www.getmonero.org/resources/moneropedia/atomic-units.html) e [Wallet RPC Monero](https://www.getmonero.org/resources/developer-guides/wallet-rpc.html).

## Ofertas NIP-15

O draft exige `price` numérico; esse campo é somente compatibilidade e pode perder precisão. O preço exato do Property é `price_atomic` como string inteira junto de `currency: "BTC"`, `"XNO"` ou `"XMR"`. Para XNO, publicar também `price_raw` para clientes antigos. Nunca interpretar `price_raw` como piconero. Cada moeda tem sua vitrine; mudar a moeda de uma oferta seleciona a vitrine correspondente. Checkout futuro deve usar exclusivamente o inteiro validado, sem calcular dinheiro com `Number`.

## Campanhas

Eventos são kind 30078, com um único `t` e um único `d`:

```json
{
  "tags": [["t", "property-sponsored-v2"], ["d", "property-sponsored-v2:123e4567-e89b-42d3-a456-426614174000"]],
  "content": "JSON do payload assinado abaixo"
}
```

O payload mantém `title`, `body`, `link`, `expires_at`, `offer_event_id`, `acceptance_event_id` e imagem PNG/JPEG inline limitada. Acrescenta `currency`, `amount_atomic` e `payment_tx_id` (identificador hexadecimal de 64 caracteres). Não aceita `amount_raw` ou `payment_block_hash` em v2. O parser exige montante positivo, prazo limitado e moeda conhecida. `node_pubkey`, quando presente, precisa coincidir com o signatário.

O leitor aceita também `liberdade-sponsored-v1`, estritamente como XNO, com `amount_raw` e `payment_block_hash`. Nunca reinterpreta uma campanha antiga como Monero nem altera eventos já assinados. O opt-in, bloqueio local e limite local de repetição continuam aplicáveis. O app não envia eventos de clique/visualização.

## Operação e ativação em produção: pendências

1. Integrar a engine a uma ferramenta de operação do node, documentando criação, revisão/aceite, recusa, monitoramento, parada e recuperação sem exigir segredo da identidade Nostr.
2. Revisar de forma independente a autenticação RPC local, o isolamento de carteiras, limites, logs sanitizados, geração de endereço e manuseio de credenciais.
3. Fixar e publicar políticas de confirmações, desbloqueio, valor mínimo, taxas e tratamento de reorganização por moeda; os parâmetros usados no laboratório não são automaticamente parâmetros de produção.
4. Revisar as regras de devolução e idempotência em cada moeda; Bitcoin e Monero exigem endereço de reembolso autenticado no acordo, sem presumir origem utilizável.
5. Não prometer custo zero nem viabilidade de micropagamento em XMR. Não ativar uso com fundos reais antes de revisão de segurança, política e operação.

## Bitcoin

BTC foi incluído por solicitação posterior do mantenedor. Valores usam satoshis inteiros (8 casas), até 21 milhões de BTC. Ofertas e campanhas v2 aceitam a moeda; isso não ativa transferências. Referência: [unidades Bitcoin](https://bitcoin.org/en/vocabulary).

O adaptador futuro Bitcoin deve usar endereço exclusivo por oferta, confirmar via node/carteira local, verificar valor e output, tratar mempool, confirmações, substituição/conflitos e reorganizações. O txid declarado não comprova o recebimento. Reembolsos exigem endereço autenticado acordado com o pagador e política explícita de taxas/valor líquido, sem presumir endereço de origem. Testar em regtest/signet sem fundos reais. Lightning é um fluxo separado e ainda não está implementado; não confundir satoshi on-chain com millisatoshi.
