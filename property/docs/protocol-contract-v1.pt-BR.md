# Contrato de protocolo do Property v1

Estado: normativo para os parsers e emissores do Property cobertos por este contrato. Ele descreve formatos atuais e comportamento limitado; não transforma confirmações de relay ou observações de carteira em consenso.

## Serialização e análise

Os IDs de eventos Nostr seguem a NIP-01: SHA-256 dos bytes UTF-8 de `[0, pubkey, created_at, kind, tags, content]`. A verificação confere esse ID e a assinatura Schnorr. Emissores de payload JSON do Property ordenam as chaves de objetos pela ordem de unidades de código JavaScript, preservam a ordem de arrays e geram JSON UTF-8 compacto. Aceitam apenas objetos simples, arrays, strings, booleanos, nulo, números JSON finitos e inteiros seguros quando o número é integral. Valores monetários usados em decisões são strings decimais canônicas; decimais de exibição NIP-15 precisam corresponder exatamente ao valor atômico. O texto não passa por normalização Unicode porque isso alteraria os bytes assinados.

Leitores aceitam JSON legado limitado com outra ordem de chaves. Chaves duplicadas, JSON malformado, profundidade/tamanho excessivos, valores ambíguos ou não canônicos e versões críticas não suportadas são rejeitados antes de alterar estado. Toda nova serialização usa o formato canônico. Os limites por família e os tipos suportados estão em [protocol-versions.json](protocol-versions.json) e são implementados por `property/agent/protocol-contract.mjs`; o navegador usa as mesmas regras de JSON canônico em `property/web/protocol-contract.js`.

`property-crit` é uma tag de extensão do Property cujos valores indicam tags que o leitor precisa entender. Uma tag crítica ausente ou desconhecida rejeita o evento. Uma tag Nostr desconhecida e não marcada continua fazendo parte do evento assinado original e é ignorada por leitores que não a conhecem. Nostr não tem uma negociação global de versões: a negociação local do Property cruza os identificadores anunciados com o registro suportado. O valor `protocol` ou `schema` de um payload personalizado é crítico e precisa corresponder exatamente a um identificador registrado.

## Famílias no fio

| Família | Formato Nostr existente | IDs do contrato Property | Limite |
| --- | --- | --- | --- |
| Reivindicação de identidade | NIP-39, kind 10011 | `nostr-nip39-kind-10011/v1` | 16 KiB de conteúdo, 64 tags |
| Mensagem privada | Gift wrap NIP-17/NIP-59, kind 1059 | `nostr-nip17-nip59/v1` | 32 KiB de conteúdo, 8 tags |
| Nota pública | NIP-01, kind 1 | `nostr-nip01-kind-1/v1` | 16 KiB de conteúdo, 128 tags |
| Marketplace | Vitrine/produto NIP-15, kinds 30017/30018 | `nostr-nip15-kind-30018/v1` | 16 KiB de conteúdo, 32 tags |
| Estado de troca | Envelope NIP-17, kind 1059 | XNO trade v1, XNO escrow v1, threshold v2 | 24 KiB de conteúdo, 16 tags |
| Patrocínio de campanha | Eventos substituíveis Property, kinds 30078/30079/30080/30082 | offer/decision/refund v1; sponsored v2 | 200.000 bytes de conteúdo do evento, 16 tags; parsers de proposta/devolução limitam o payload a 16 KiB |
| Descoberta de relays | NIP-02 kind 3, NIP-65 kind 10002, inbox NIP-17 kind 10050 | IDs Nostr correspondentes | 8 KiB de conteúdo, 512 tags |

Esses limites são de aceitação do Property, não uma afirmação sobre o que todo relay Nostr aceita. Os limites do evento são conferidos antes da assinatura ou de qualquer alteração de estado. Tags desconhecidas e não críticas continuam interoperáveis com clientes Nostr comuns. Protocolos específicos do Property ficam dentro de eventos Nostr assinados ou payloads NIP-17 criptografados; eles não substituem os tipos padrão de nota, perfil ou gift wrap.

## Versões e conflitos

- Famílias Nostr padrão usam os snapshots fixados em `property/docs/protocol-snapshots/nostr/`; uma atualização de padrão exige alteração revisada no código, sem download em runtime.
- Payloads personalizados identificam seu esquema em `protocol` ou `schema`. Versões críticas desconhecidas falham de forma segura; não há downgrade silencioso.
- `property-xno-threshold/v1` não pode autorizar assinatura v2. É rejeitado e exige uma nova sessão v2.
- Novas publicações de campanhas usam `property-sponsored-v2`. Um registro legado sponsored-v1 só pode ser exibido por um leitor que o suporte explicitamente; ele não autoriza novo pagamento ou transição.
- Valores decimais exibidos pela NIP-15 só são aceitos se converterem exatamente para a string atômica declarada em BTC, XMR ou XNO. Conflitos falham de forma segura.
- IDs de eventos idênticos são deduplicados. Uma entrada com mesmo ID e conteúdo diferente é equivocation e é rejeitada. Para eventos substituíveis, vence o maior `created_at`; em empate, vence o ID lexicograficamente menor, conforme NIP-01. Exclusões continuam limitadas ao autor e seguem a NIP-09.
- Chaves de idempotência vinculam uma ação financeira à identidade da troca/campanha e aos termos exatos. Um replay pode devolver o resultado salvo, mas não pode iniciar outra transferência, devolução ou publicação.

Valores atômicos são strings de inteiros positivos em base 10 sem zeros à esquerda: BTC usa satoshis (máximo `2100000000000000`), XMR usa piconero (máximo `18446744073709551615`) e XNO usa raw (máximo `340282366920938463463374607431768211455`). Aliases de ticker, decimais sem moeda, conversões entre moedas, valores negativos e ponto flutuante são rejeitados.

## Alegações de segurança e privacidade

- Uma assinatura válida prova que a chave privada correspondente assinou os bytes do evento e que eles não foram alterados. Não prova identidade humana, controle de conta externa, veracidade nem autoridade sobre um endereço de pagamento.
- A criptografia NIP-17/NIP-59 protege o conteúdo para as chaves destinatárias. Relays e observadores da rede ainda podem ver metadados de roteamento, IPs, horários, tamanhos e padrões de tráfego. Um ACK significa que o relay aceitou o evento; não prova propagação global, entrega ao destinatário, exibição ou leitura.
- Notas públicas, eventos de perfil, ofertas de marketplace e listas de relay são eventos públicos assinados. Assinaturas não tornam o conteúdo privado nem verdadeiro.
- Intenção de troca BTC/XMR/XNO, mensagem de recibo ou ID de transação declarado não prova pagamento. Uma observação de carteira/nó local configurado prova somente os dados retornados e conferidos pelo adaptador.
- O consenso Nano não impõe escrow, entrega, devolução, arbitragem nem vínculo entre identidade Nostr e conta Nano. O protocolo threshold XNO do Property é experimental e somente dev; não é escrow confiável imposto pela rede Nano.

## Contrato de testes

`property/tests/protocol-contract-g1.mjs` usa seeds fixas e somente código local. Exercita 100 vetores por família de evento; 100 payloads malformados por parser de família; versões/tags críticas e desconhecidas; limites monetários; e 50 cópias duplicadas mais 50 reordenadas de cada fixture de evento substituível. Os testes existentes de campanha e dos serviços XNO conferem separadamente que operações repetidas de status/devolução/recibo não repetem ações de pagamento. Nenhum relay público ou RPC de carteira é acessado.

Consulte [o contrato em inglês](protocol-contract-v1.md) para a versão equivalente.
