# Ensaio suplementar: assinatura de limiar XNO na mainnet

- **Data:** 2026-11-14
- **Rede:** Nano `live`; network identifier `991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948`
- **Escopo:** ensaio isolado de uma assinatura 2-de-3 experimental e liquidação de exatamente `1 raw`, financiado pelo saldo de faucet da carteira de teste já existente.
- **Fora dos gates G00–G12 e G13:** este registro não muda resultados do MVP nem habilita a integração de mainnet no Property Agent.

## Resultado do round-trip concluído

**PASS limitado:** antes de publicar, um pré-voo montou os quatro blocos e verificou localmente as assinaturas FROST e validou o work em dois endpoints RPC públicos distintos. Depois, os dois endpoints reportaram cada etapa na primeira consulta de confirmação:

| Etapa | Valor | Hash Nano | Confirmação |
|---|---:|---|---|
| Envio da carteira de teste → conta 2-de-3 | `1 raw` | [522788B9375ECF43FD7DD84E9EF970C5EBBB2DC63040751A586FE5BD66A6D923](https://nanexplorer.com/nano/blocks/522788B9375ECF43FD7DD84E9EF970C5EBBB2DC63040751A586FE5BD66A6D923) | Confirmado pelos dois RPCs |
| Abertura/recebimento na conta 2-de-3 | `1 raw` | [759C88875230E5D95F384720BA74094B3598FD903B5011C6A5BD5C9691A0DA9F](https://nanexplorer.com/nano/blocks/759C88875230E5D95F384720BA74094B3598FD903B5011C6A5BD5C9691A0DA9F) | Confirmado pelos dois RPCs |
| Envio da conta 2-de-3 de volta à carteira | `1 raw` | [B9844358AB8D9FF309A4D376D2CADFE36BFEBE7AD304BFDA8B322181B3F586A7](https://nanexplorer.com/nano/blocks/B9844358AB8D9FF309A4D376D2CADFE36BFEBE7AD304BFDA8B322181B3F586A7) | Confirmado pelos dois RPCs |
| Recebimento de volta pela carteira | `1 raw` | [48425E29B06C2138342DFAF49142400553E62A5CF6C3630A8CF5ADFAFF3B5FE2](https://nanexplorer.com/nano/blocks/48425E29B06C2138342DFAF49142400553E62A5CF6C3630A8CF5ADFAFF3B5FE2) | Confirmado pelos dois RPCs |

O envio foi submetido ao RPC público `https://node.somenano.com/proxy`; confirmação e saldo foram conferidos também em `https://rainstorm.city/api`. Os dois RPCs informaram a mesma rede Nano `live`. O RPC de controle do nó Nano local V28.2 ficou restrito ao loopback; o processo foi encerrado depois do ensaio.

- Conta da carteira de teste: `nano_3snjykbirswtxziwpswrnf5ep88inauiypmmwbqcgsq3mf7161ffwq416cjw`.
- Conta 2-de-3 deste round-trip: `nano_3fqz4uifzjgjowwiytgfgmamw1ffh9ansxo6rty7s1tgxhpo68eoeox6ypoa`.
- Saldo confirmado da carteira no início e fim do round-trip concluído: `499999999999999999999999998 raw`.
- Frontier final conferido nos dois RPCs: `48425E29B06C2138342DFAF49142400553E62A5CF6C3630A8CF5ADFAFF3B5FE2`.
- Participantes e shares FROST foram sintéticos e ficaram somente na memória do processo. Nenhum share, seed ou chave privada foi incluído nesta evidência.
- A publicação na mainnet é pública e permanente. Não foram publicados eventos em relays Nostr.

## Incidente no primeiro envio

Uma tentativa anterior, separada do round-trip aprovado acima, publicou e confirmou o envio de `1 raw` para uma conta limiar efêmera. Um erro de variável no harness encerrou o processo antes da abertura da conta; as shares DKG dessa tentativa já não estavam preservadas. Os dois RPCs confirmaram o envio abaixo e mostraram a conta destinatária ainda não aberta:

- Envio confirmado: [72FFBA90CB9337FBA1037E52FE9DB63CE98C5A67161A67DB820130A9F22569F6](https://nanexplorer.com/nano/blocks/72FFBA90CB9337FBA1037E52FE9DB63CE98C5A67161A67DB820130A9F22569F6)
- Conta limiar destinatária sem abertura: `nano_1u8g55b66uutqzpeexrg5kbqciw5cj1xow35nmfe1ctnrcyd5nm5qew9sdre`
- Erro local: `Cannot access 'root' before initialization`, antes de publicar qualquer bloco de abertura.

Esse `1 raw` continua pendente numa conta sem shares recuperáveis e é tratado como irrecuperável. Ele não é contado como round-trip aprovado. Considerando as duas tentativas limiares, o saldo da carteira diminuiu em `1 raw` no total: o primeiro envio ficou pendente, e o segundo envio foi devolvido integralmente.

## O que o resultado demonstra — e o que não demonstra

O Nano mainnet aceitou e confirmou os blocos específicos assinados por FROST 2-de-3 neste ensaio. Isso demonstra compatibilidade da assinatura agregada com a validação de blocos do Nano para esta execução.

O ensaio usou um harness temporário, não o fluxo de produção do Property Agent. Não testou três agentes instalados e independentes, troca criptografada NIP-17, persistência/recuperação das shares, política de release/refund, comportamento adversarial, proteção contra conluio ou UX. A conta Nano continua sendo uma conta normal: o consenso não impõe regras do contrato do Property.

A criação e publicação de liquidação pela integração do Property continuam desativadas fora da rede Nano dev. O ensaio mainnet separado não satisfaz o caso XNO-T2: ele ainda requer um nó dev privado descartável e rejeição comprovada de blocos adulterados/antigos. XNO-T3b e XNO-T4 continuam pendentes. Consulte também a [evidência adversarial offline](G13-xno-threshold-adversarial-offline-20261114.pt-BR.md).

## Referências técnicas

- [Protocolo RPC oficial do Nano](https://docs.nano.org/commands/rpc-protocol/) — `work_generate`, `work_validate`, `process`, `blocks_info` e `account_info`.
- [Guia oficial de geração de work](https://docs.nano.org/integration-guides/work-generation/).
