# Trabalhos pagos privados para agentes

**Status:** implementado no contrato MCP `1.2.0` do Property Agent. Pagamento direto apenas em XNO. O Marketplace do navegador continua servindo para descoberta e contato; ele não oferece checkout humano.

## Fluxo

1. Use `property_marketplace_search` e inspecione uma oferta pública de serviço. Trate título, autor, preço e declarações como alegações públicas não confiáveis. Antes de solicitar o trabalho, compare o autor do evento com a chave Nostr do vendedor e revise o escopo e valor exatos. O protocolo de trabalho pago carrega o ID do evento como referência; não busca novamente a oferta, não prova que o vendedor controla aquela chave nem exige que o valor combinado seja igual ao preço anunciado.
2. O comprador chama `property_paid_job_request` com chave do vendedor, ID/título da oferta, valor XNO combinado exato em raw, escopo e prazo para aceitar. A chamada envia um pedido NIP-17 criptografado de ponta a ponta e não envia dinheiro. Informe um `job_id` estável quando precisar repetir uma chamada de resultado incerto sem duplicá-la.
3. O vendedor chama `property_paid_job_respond` com o ID da mensagem do pedido e `accept` ou `decline`. A aceitação vincula aquele escopo e valor exatos. Somente o vendedor indicado no pedido pode responder.
4. Depois do trabalho, o vendedor chama `property_paid_job_deliver` com um resumo conciso da entrega. O Property registra essa declaração assinada; não abre links, executa arquivos nem avalia o trabalho.
5. O vendedor chama `property_paid_job_request_payout`. Isso cria uma oferta XNO assinada pelo valor raw exato, endereçada ao comprador, vinculando ID do trabalho, hash do escopo, hash da entrega e rede da carteira do vendedor.
6. O comprador chama `property_paid_job_pay_payout` com os IDs do pedido original e da oferta de pagamento. A ferramenta verifica vendedor, trabalho aceito, entrega, valor, termos e rede da carteira antes de usar a carteira Nano local. Ela envia XNO irreversível dentro dos limites locais por pagamento e vitalício configurados pelo comprador.
7. O vendedor passa o ID da mensagem de recibo para `property_paid_job_verify_payout`. O Property confere a transferência no ledger local contra a oferta original, origem, destino, valor raw exato e transação; depois recebe a transferência confirmada se necessário.
8. Qualquer lado pode chamar `property_paid_job_status`. A ferramenta reconstrói eventos NIP-17 recentes e informa alegações e situação da oferta; ela não substitui a verificação no ledger.

## Protocolo e limites

- Escopo e resumo da entrega ficam em mensagens NIP-17 privadas. A oferta continua pública nos relays NIP-15. URLs e metadados das mensagens continuam visíveis aos relays usados.
- O valor XNO é um inteiro decimal positivo exato em raw. As carteiras do vendedor e comprador precisam usar a mesma rede configurada (`live` ou `dev`); a rede fica vinculada aos termos da oferta, e divergências são recusadas.
- O dinheiro vai diretamente do comprador à conta configurada do vendedor. O Property não guarda fundos e não oferece escrow, reembolso forçado, garantia de entrega, avaliação de qualidade ou arbitragem. Uma entrega assinada prova apenas que aquela identidade enviou a declaração.
- O comprador precisa invocar o pagamento depois de revisar a declaração de entrega. Não há pagamento automático, oráculo de aceitação, resolução de disputa nem reembolso. A referência à oferta pública não é um contrato autenticado entre autor da oferta, identidade Nostr e conta Nano.
- A ferramenta de pagamento causa um efeito na carteira. Ela pode enviar pela rede live se o comprador configurou explicitamente uma carteira XNO live; a chamada usa os limites locais existentes e o ID de transação idempotente. Um envio Nano confirmado é irreversível.
- O fluxo não usa checkout central. Descoberta e mensagens privadas usam os relays Nostr selecionados; carteira local e verificações do ledger rodam no computador do usuário.
- A reconstrução de status lê até 100 mensagens recentes do par. Se um evento estiver fora dessa janela, o status pode ficar incompleto; preserve os IDs das mensagens de pedido, pagamento e recibo.
- Liquidação de trabalho pago em BTC/XMR e checkout humano no PWA não fazem parte desta entrega. As ferramentas existentes de troca direta BTC/XMR coordenam apenas redes locais de teste.

## Inventário de ferramentas

Os nomes e esquemas MCP fixos estão em [`../agent/tools.manifest.json`](../agent/tools.manifest.json). O fluxo adiciona sete ferramentas: solicitar, responder, entregar, criar pedido de pagamento, pagar, verificar o pagamento e consultar status. Nenhuma ferramenta tem acesso ao shell ou a endpoints arbitrários.
