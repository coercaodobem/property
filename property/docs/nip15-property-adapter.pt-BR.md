# Adaptador de ofertas NIP-15 do Property

**Identificador do adaptador:** `property-marketplace-offer/v1`
**Família de eventos Nostr:** draft NIP-15 `kind:30017` para vitrine e `kind:30018` para produto
**Implementação:** `property/web/marketplace.js` e `property/web/app.js`

NIP-15 é um draft marcado como não recomendado. O Property mantém os tipos de evento e o identificador endereçável `d`, mas publica novos produtos com o schema de conteúdo versionado abaixo. A assinatura Nostr vincula a oferta à chave pública do evento; ela não confirma identidade no mundo real nem controle de uma conta de pagamento.

## Conteúdo da versão 1

O conteúdo de um novo `kind:30018` inclui:

| Campo | Regra |
| --- | --- |
| `schema` | Texto exato `property-marketplace-offer/v1`; versões desconhecidas são rejeitadas. |
| `id`, `stall_id` | Strings não vazias; `id` precisa corresponder à única tag `d`. |
| `offer_type` | `item` ou `service`. |
| `name`, `terms`, `description` | Campos legíveis da oferta. `terms` e `description` precisam ser iguais. |
| `seller_pubkey` | Precisa ser igual ao `pubkey` do evento assinado; é uma declaração de chave Nostr, não verificação de identidade legal. |
| `currency`, `price_atomic` | A moeda é exatamente `BTC`, `XMR` ou `XNO`; o valor é uma string inteira não negativa canônica em satoshi, piconero ou raw. Zero significa oferta grátis e não autoriza pagamento. |
| `price` | Projeção numérica de compatibilidade exigida pelo draft NIP-15; clientes nunca devem calcular ou liquidar valores a partir dela. |
| `price_raw` | Publicado somente para XNO e igual a `price_atomic`. Não representa unidade de Monero. |
| `payment_rail` | Declaração do vendedor: `bitcoin-onchain`, `monero-onchain` ou `nano-direct`, correspondente à moeda. Não prova controle de carteira nem pagamento. |
| `expires_at` | Segundos Unix ou `null`. Um valor preenchido precisa corresponder exatamente a uma tag Nostr `expiration`; `null` exige ausência dessa tag. |
| `relay_hints` | Até cinco URLs `wss://`. Somente dicas seguras são publicadas; relays locais de teste `ws://` são omitidos. |
| `contact_event` | `null` na versão 1. Abrir uma conversa privada não publica evento de contato; o Property não inventa um evento nem associa atividade privada à oferta. |
| `images` | Zero ou uma URL HTTPS segura. |

O valor exato é exibido e validado a partir de `price_atomic`. O ponto flutuante binário é mantido somente porque o draft NIP-15 exige `price` numérico; ofertas fora da faixa compatível com essa vitrine são rejeitadas em vez de serem arredondadas para um valor de pagamento. `quantity`, `specs` e `shipping` continuam como campos de compatibilidade NIP-15 e não comprovam estoque, entrega ou liquidação.

## Leitura de eventos anteriores

Ofertas NIP-15 sem versão seguem uma trilha explícita de compatibilidade somente para exibição. O Property exige moeda compatível e extensão com valor exato (`price_atomic`, ou `price_raw` XNO pela regra legada); não infere moeda, não reinterpretar campos arbitrários do draft e não converte `price` flutuante para raw. Se os dois campos de valor XNO existirem, precisam ser iguais. `schema` desconhecido, divergência de valor, moeda não compatível, tag de endereço/vencimento duplicada, assinatura inválida ou valor inseguro são ignorados sem alterar o estado da oferta.

A edição mantém o mesmo endereço `d`. A retirada é um pedido de exclusão NIP-09 assinado; relays e clientes podem manter cópias antigas. Com timestamps iguais, clientes escolhem a oferta com o menor ID de evento em ordem lexicográfica. Um evento mais novo do mesmo autor vence; uma exclusão do mesmo autor se aplica somente ao endereço/evento indicado e quando seu timestamp não for anterior. Outras ofertas continuam visíveis.

## Limites

O marketplace oferece descoberta pública, contato, publicação, edição, expiração e pedidos de retirada. Não oferece checkout, custódia de pagamento, escrow nem prova de entrega. Uma rede declarada ou uma oferta assinada não comprova que o vendedor controla uma carteira ou que fará a entrega. O botão de contato abre a conversa privada do vendedor, sem enviar mensagem nem expor essa ação em evento público.

Os testes de contagem fixa estão em `property/tests/offline/marketplace-g6-fixed-count.mjs`; as evidências de navegador e cinco relays serão registradas em `property/docs/evidence/product-completion/G6/gate-result.md` após a execução do gate.
