# Trocas diretas entre agentes em redes locais de teste

[English](agent-test-network-trades.md) · **Português (Brasil)**

O Property Agent coordena uma oferta de troca direta por NIP-17 cifrado e pode observar um pagamento por meio de um nó BTC, XMR ou XNO configurado localmente em rede de teste. Este é um fluxo para agente/MCP. O checkout atual da PWA humana não expõe este fluxo.

## Escopo e configuração

As nove ferramentas MCP `property_trade_*` aceitam somente Bitcoin regtest, Monero fakechain e Nano dev. Mainnet é rejeitada pelo validador local e por cada adapter. URLs RPC usam endereço numérico de loopback (`127.0.0.0/8` ou `::1`) por HTTP; as credenciais ficam no cofre cifrado do agente. O responsável pelo perfil configura cada adapter local no terminal:

```bash
property-agent trade configure BTC
property-agent trade configure XMR
property-agent trade configure XNO
property-agent trade status
property-agent trade disable
```

Cada comando de configuração confere a rede informada pelo nó antes de salvá-la. `disable` remove os adapters ativos e preserva o journal cifrado e a chave local de assinatura de evidências. Configure somente nós criados para a respectiva rede privada de teste.

## Fluxo da troca

1. O vendedor cria uma oferta com moeda, valor atômico exato, hash e texto dos termos, destino exclusivo gerado pelo nó local, chave Nostr do destinatário e prazo. O Property a envia pelos relays NIP-17 selecionados pelo agente.
2. O comprador confere os campos e aceita a oferta recebida. A aceitação registra o estado local e envia uma resposta NIP-17 assinada; não efetua pagamento.
3. O vendedor sincroniza a aceitação autenticada e envia o pedido de pagamento exato.
4. O comprador paga separadamente por uma carteira e pode conferir destino, valor e rede. Neste fluxo, o Property não inicia esse pagamento.
5. Qualquer participante com acesso a um nó local apropriado de teste pode reconciliar o destino exato da oferta com seu próprio adapter de ledger. O vendedor também pode enviar um aviso de liquidação; o outro participante o apresenta como `seller-reported-unverified` até que seu próprio nó local confirme.

O journal local usa valores em unidades atômicas, correspondência exata de destino e rede, limites de confirmação específicos de cada adapter, detecção de duplicatas, rollback de reorganização BTC e evidências assinadas encadeadas por hash e cifradas em repouso. Repetir leituras selecionadas é seguro; ferramentas que reenviam mensagem NIP-17 assinada estão marcadas como não idempotentes, pois uma repetição pode criar outro evento no relay.

## Garantias e limites

- Este fluxo é pagamento direto, não escrow. Não há garantia de entrega, arbitragem, reembolso forçado ou condição imposta pelo protocolo.
- A autenticação NIP-17 prova qual chave Nostr enviou a oferta; não prova que a mesma pessoa controla a carteira declarada.
- O resultado do nó local registra a observação daquele nó conforme as verificações do adapter. Um ACK do relay não prova entrega nem leitura.
- O destinatário não aceita a afirmação de liquidação do par como confirmação local. Ele pode consultar seu próprio nó configurado.
- O fluxo não envia pagamento e não oferece opção mainnet. As ferramentas de pagamento direto XNO, escrow custodial e threshold experimental têm políticas separadas e não foram convertidas para este fluxo.
- Os ensaios usam identidades sintéticas, nós privados/locais e relays de loopback. Não provam publicação em produção, compatibilidade com carteiras externas, comportamento de relays públicos nem uma experiência na PWA humana.

Veja [mensagens entre agentes](plano-agentes-human-first.pt-BR.md), [modelos de pagamento BTC/XMR/XNO](pagamentos.pt-BR.md) e o [índice de evidências G7](evidence/product-completion/G7/gate-result.md).
