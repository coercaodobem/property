# Gate G6 automatizado offline

**Resultado:** `PASS_AUTOMATED_OFFLINE` no candidato de implementação `456f1603e55d45d7b55d487b9eeb6099b74a4244`. SHA-256 do inventário de runtime do produto: `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`.

O navegador rodou no Ubuntu Linux x86_64 em namespace de rede separado. Cinco relays Geode sintéticos aceitaram apenas loopback; foram registradas zero requisições HTTP externas e zero erros de página. Não foram usados relay público, carteira, pagamento ou participante real.

| Cenário | Resultado de contagem fixa |
| --- | --- |
| Hangout e contato | 50 jornadas, 25 em inglês e 25 em pt-BR; verificação do autor assinado e deduplicação de relays aprovadas. |
| Navegação no marketplace | 50 jornadas completas, 25 por idioma, em BTC/XMR/XNO; publicar, descobrir, contatar, exibir rótulos e retirar com assinatura passaram. |
| Filtros locais | 50 jornadas, divididas por idioma; texto, tipo, moeda, resultado vazio e ordenação na mesma moeda passaram; zero consultas a relays durante os filtros. |
| Ciclo e convergência de ofertas | Por moeda: 20 ofertas, 10 edições, 10 retiradas e 10 vencimentos; cinco relays convergiram e ofertas alheias foram preservadas. |
| Limites de valores atômicos | 100 valores por moeda: 50 round-trips exatos e 50 valores inválidos rejeitados. |
| Ordenação de conflitos | 20 conflitos de timestamp do mesmo autor e 20 atualizações fora de ordem entre relays resolvidos deterministicamente. |
| Casos de navegador | Todos os nove casos fixos G06 passaram. |

Relatórios legíveis por máquina e hashes de ferramentas/fontes estão em [`fixed-run-03`](fixed-run-03/) (o relatório completo do navegador está comprimido como `browser-g06-report.json.gz`; o arquivo JSON ao lado resume os nove casos). Confira todos os digests dos relatórios e do manifesto com `sha256sum -c SHA256SUMS` nesse diretório.

Não houve revisão humana, teste em outro sistema operacional, dispositivo físico, relay público, carteira real ou pagamento.
