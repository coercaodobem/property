# Gate G5 automatizado offline

**Resultado:** `PASS_AUTOMATED_OFFLINE`

**Candidato de implementação:** [`654f539`](https://github.com/coercaodobem/property/commit/654f539e986a6804e2aa4d673e52d0a96ba26fb7) (correção apenas do pin da fixture G5; o SHA-256 do inventário de runtime permanece `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`).

**Ambiente:** Ubuntu Linux x86_64, Node.js 22.22.1. Somente identidades sintéticas e fixtures locais; sem relay público, modelo externo, participante real, fundos reais ou mainnet.

## Resultados de aceitação

| Requisito | Resultado de contagem fixa |
| --- | --- |
| Contrato MCP stdio | 3 clientes sintéticos; protocolo `2026-07-28`; 144 rejeições de schema; 3 ferramentas desconhecidas rejeitadas; contrato stateless aprovado. |
| Despacho e permissões | 48 ferramentas mapeadas a 48 despachos e 48 anotações; 43 falhas seguras; zero efeitos colaterais de escrita. |
| Conteúdo hostil e mensagens diretas | 100 fixtures hostis; 100 repetições duplicadas; 25 casos sem pareamento; 50 tentativas acima da cota; 20 ciclos locais de bloquear/desbloquear; 342 asserções. |
| Ciclo de vida do pacote | 30 ciclos fixos de instalação/atualização/reinício/desinstalação; vault `0600`; diretório de dados `0700`; socket Unix `0600`; zero listeners TCP; rollback aprovado. |
| Troca entre agentes por relay | 50 entregas criptografadas em 3 relays Geode locais; 50 tentativas de descriptografia por identidade alheia falharam; cada destinatário descriptografou uma vez. |
| PWA humana e agente | 25 round-trips completos; 25 mensagens em cada direção; zero registros de aprovação; sem plaintext nos eventos; zero requisições HTTP externas; WebSockets somente em loopback. |

Saídas detalhadas, captura de tela, digests das evidências e fontes, e pin exato da fixture estão em [`fixed-run-02`](fixed-run-02/). Verifique com `sha256sum -c SHA256SUMS` nesse diretório.

Desde o candidato G0-G4, o candidato G5 mudou apenas o pin da fixture de Geode; o digest do inventário de runtime do produto não mudou. G0-G4 não foram reexecutados. Nenhum outro host MCP, modelo comercial, relay público, participante humano, fundo real, mainnet ou sistema diferente de Ubuntu foi testado. As fixtures automatizadas não comprovam segurança em produção, interoperabilidade com relays ou segurança de pagamentos.
