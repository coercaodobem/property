# G5 — Revisão técnica de segurança, abuso e privacidade

**Estado do gate:** `PENDING_INDEPENDENT_REVIEW`. Os ensaios técnicos offline passaram; isso não substitui a revisão independente exigida pelo plano.
**Data:** 2026-11-03.
**Código e harness exercitados:** `a0a6c6e05aae1e22d28317ddce91328ad286fa53` (`coercaodobem/property:modelo-mvp`, SHA remoto conferido; contém o endurecimento em `55ecc94c8daf90c6ead74f21d71f35ad9cee061f`).
**Seed:** `property-g5-hostile-replay-scope-quota-revoke-v1`.
**Relógio lógico:** `1900000000`; sem espera real como critério.

## Execução técnica

O harness produziu **365 resultados individuais PASS**, em Ubuntu/Linux x64 com Node.js 22.22.1. Foram usados apenas identidades e dados sintéticos; sem modelo externo, pessoa participante, identidade humana, fundos ou relay público.

| Matriz | Executado | Resultado |
|---|---:|---|
| Fixtures hostis em texto, Markdown/link, URL, perfil falso, JSON profundo/duplicado, payload grande, comando e pedido de segredo | 100 | 90 corpos dentro do limite permaneceram texto literal e sem ação lateral; 10 acima de 8 KiB foram recusados |
| Cópias de replay de evento | 100 | Deduplicadas entre duas fontes simuladas; uma cópia com assinatura inválida antes da válida não a suprimiu |
| Violações de escopo de leitura/envio | 50 | Recusadas antes de chamar o transporte |
| Envios acima da cota | 50 após 30 aceitos | Todos recusados antes do transporte; relógio lógico fixo |
| Rotação de escopo de contato e revogação local | 20 ciclos | Após cada revogação, leitura e envio foram negados |
| Casos detalhados no total | 365 | Sem resultado parcial ou falha no harness |

As capturas WebSocket são fixtures em processo que substituem o cliente WebSocket: elas registram frames de leitura e tentativas de publicação para verificar deduplicação, limites e ACK oversized. **Não são captura de pacotes do sistema operacional.** Nenhuma conexão externa foi aberta. Duas tentativas `EVENT` na fixture serviram para confirmar que um ACK acima do limite não vira sucesso. A leitura dos 100 corpos hostis não publicou eventos, não criou convites e não alterou configuração; os testes também confirmaram que 50 violações de escopo e 50 excedentes de cota não chegam ao transporte.

## Achados e correções incluídas

1. **Assinatura e replay:** a implementação inseria `event.id` na tabela de deduplicação antes de verificar a assinatura. Uma cópia inválida com o ID de uma cópia válida poderia suprimi-la. Agora a assinatura é verificada primeiro; deduplicação usa ID do evento e `message_id` após decifrar/validar o envelope.
2. **Entrada JSON/local:** configuração persistida era lida com `JSON.parse`, sem rejeição de chaves repetidas, symlink, modo incorreto ou arquivo excessivo. Agora o parser é estrito e limita arquivos a 256 KiB; somente arquivo regular do usuário com modo `0600` é lido.
3. **Frames sem limite:** o bridge MCP só avaliava tamanho depois de formar uma linha completa, e o transporte não limitava frames de relay nem acumulava limite efetivo de eventos. Agora linhas MCP e frames WebSocket são limitados a 64 KiB, o parser se recupera após linha oversized e cada relay acumula no máximo 500 eventos por consulta.
4. **Exposição residual na VM:** os campos temporários usados para converter segredo e evento JSON agora são limpos após a conversão. O bloqueio do daemon limpa o segredo em memória e não deixa cópia hexadecimal redundante no transporte.

Os ensaios verificaram também segredo ausente nas tools e no `stdout` protocolar, dados de identidade sintética intactos, armazenamento local restrito e contato removido ao revogar. O diff de implementação está publicado em `55ecc94c8daf90c6ead74f21d71f35ad9cee061f`; a última versão do harness e hashes de rastreabilidade está em `a0a6c6e05aae1e22d28317ddce91328ad286fa53`.

## Evidências reproduzíveis

- [`G5-offline-report.json`](G5-offline-report.json): 365 IDs de caso, resultado individual, ambiente, seed, contagens, limitações e hash do harness.
- [`G5-adversarial-corpus-manifest.json`](G5-adversarial-corpus-manifest.json): categorias, tamanhos e SHA-256 por fixture; não armazena os corpos.
- [`G5-full-smoke.log`](G5-full-smoke.log): suíte regressiva completa, incluindo G3/G4, instalação de pacote e G5.
- [`agent-security-g5.mjs`](../../../tests/offline/agent-security-g5.mjs): harness determinístico, com corpos sintéticos e transporte WebSocket substituído.
- [Threat model atualizado](../../agent-messaging-g0.md) e [plano sequencial](../../plano-agentes-human-first.md).

## Pendências que mantêm G5 em PENDING

- **Revisão independente ainda não feita.** O autor das mudanças não pode substituir a pessoa revisora exigida pelo plano. Permanecem pendentes a revisão de chaves, bridge, consentimento e isolamento do agente, incluindo classificação independente de severidade.
- **Modelo/host externo não executado.** O teste prova que o Property não interpreta texto recebido nem dispara tool por conta própria; não prova como um modelo comercial reage ao texto hostil. Nenhum modelo foi usado ou simulado.
- As 20 repetições cobrem rotação dos contatos/suas permissões e revogação local. A identidade criptográfica do agente não tem comando de rotação; aviso de revogação remota também não é publicado por esta versão.
- G1/G6 permanecem `PENDING`; não houve participantes reais. Windows, macOS, Android e iOS continuam sem ensaio nativo.

Não há declaração de `PASS` integral de G5, prontidão de piloto ou ausência independente de defeitos críticos/altos enquanto essas pendências não forem avaliadas.
