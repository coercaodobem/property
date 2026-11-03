# Ensaio suplementar de pagamento Nano na rede principal

- **Data:** 2026-11-03
- **Rede:** Nano `live`
- **Escopo:** recebimento de faucet, abertura de conta, transferência entre duas contas de teste, confirmação on-chain e leitura pelo adaptador Nano do Property. Este ensaio complementar não altera nem substitui os gates offline do Plano de Testes Central.

## Resultado

**PASS:** a rede principal confirmou uma transferência de `1 raw` da conta de teste A para a conta de teste B. O adaptador `createNanoNodeLedger().lookupPayment()` reconheceu o pagamento confirmado com `proof: true`.

| Etapa | Valor | Hash | Estado observado |
| --- | ---: | --- | --- |
| Faucet recebido na conta A | `0.0005 XNO` (`500000000000000000000000000` raw) | `0687ED8B65D9307C620C89024F1DDB2E55F5DAB6BD84499D82203E361F284F40` | `confirmed: true` |
| Abertura da conta A | saldo `0.0005 XNO` | `433F021A9B1FC43A043BEC8B253C604E2788C131B2C9B5D6F2A07BF4FDA2BE86` | `confirmed: true` |
| Envio A → B | `1 raw` | `4905F92452181D2A71D50B630F1FE8381C79E8C8902D4C184A2BC5ACE5E561B7` | `subtype: send`, `amount: 1`, `confirmed: true` |
| Recebimento na conta B | `1 raw` | `3ED509CCF8A9BFE464B0C74C0D1D5E6316F4527341EB9F7BB340036CCA596EF1` | `subtype: receive`, `amount: 1`, `confirmed: true` |

Após a confirmação, a conta A mostrou saldo confirmado de `499999999999999999999999999` raw; a conta B mostrou `1` raw. Os hashes de frontier das respostas coincidiram com os blocos de envio e recebimento, respectivamente.

## Validação pelo Property

O RPC público consultado retornou uma linha de `account_history` normalizada, sem `link` nem `source` com o hash do bloco de envio. Antes da correção, o adaptador retornava `null` para esse pagamento confirmado. O adaptador agora busca o bloco de recebimento via `block_info` e obtém o hash de origem de `contents.link`/`contents.source`.

Depois da correção, a consulta do adaptador retornou:

```json
{
  "currency": "XNO",
  "amount_atomic": "1",
  "txid": "4905F92452181D2A71D50B630F1FE8381C79E8C8902D4C184A2BC5ACE5E561B7",
  "confirmations": 1,
  "proof": true
}
```

Também foi acrescentado ao teste smoke um caso fixo que simula esse histórico normalizado. A suíte `bash property/tests/run-smoke.sh` passou integralmente após a mudança.

## Limites deste ensaio

- O envio e o recebimento ocorreram na rede pública principal, mas entre duas contas de teste controladas pelo mesmo wallet local.
- O adaptador foi exercitado em `lookupPayment`; `createAddress`, reembolso automático e pagamentos BTC/XMR não fazem parte deste ensaio.
- O nó Nano local estava vinculado ao loopback e serviu para criar/assinar blocos e validar proof-of-work. A confirmação final foi conferida por RPC público; isso não demonstra sincronização integral do nó local.
- O banco do wallet de teste permanece apenas no diretório local privado `.property-xno-mainnet-20261103`, com permissões restritas. A seed e a chave privada não foram exportadas nem incluídas neste repositório.
- Este arquivo documenta somente evidências públicas de transação e resultados técnicos; nenhum segredo ou dado de usuário está incluído.

## Reconsulta pública da cadeia

Em 2026-11-03, uma chamada de leitura `blocks_info` ao endpoint público `https://rpc.nano.to/` revalidou os três hashes registrados acima. O bloco do faucet (`0687ED8B65D9307C620C89024F1DDB2E55F5DAB6BD84499D82203E361F284F40`) retornou `confirmed=true` e `amount=500000000000000000000000000` raw (`0.0005 XNO`). O envio de teste (`4905F92452181D2A71D50B630F1FE8381C79E8C8902D4C184A2BC5ACE5E561B7`) retornou `subtype=send`, `amount=1` raw e `confirmed=true`. O recebimento (`3ED509CCF8A9BFE464B0C74C0D1D5E6316F4527341EB9F7BB340036CCA596EF1`) retornou `subtype=receive`, `amount=1` raw, `confirmed=true` e `link` igual ao hash do envio. Essa reconsulta foi somente leitura e não transmitiu uma nova transação.

## Fontes técnicas

- [Protocolo RPC oficial do Nano](https://docs.nano.org/commands/rpc-protocol/) — `block_create`, `process`, `block_info`, histórico e confirmação.
- [Documentação do Nano.to RPC](https://rpc.nano.to/docs/rpc) — endpoint público JSON HTTP POST usado para a reconsulta independente dos hashes.
