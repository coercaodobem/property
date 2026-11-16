# Resultado do gate G0 — inventário do candidato e escopo executável

**Resultado: PASS — inventário automatizado em Ubuntu Linux x86_64.** Commit candidato da fonte: [`a2ac830e2c06715bb0f50e377b8dd12b4f889ca4`](https://github.com/coercaodobem/property/commit/a2ac830e2c06715bb0f50e377b8dd12b4f889ca4).

O head remoto e a branch local coincidiam antes do inventário. O checkout estava limpo antes de gravar as evidências. O inventário cobre 566 arquivos de runtime rastreados (249.496.372 bytes; SHA-256 da árvore `b7ba15fbb2dfb8ff494a2378752859c4d750e81aef3a73ec047edd9402ae001f`), 17 requisitos, seis pontos de entrada do produto, 15 classes de destino de rede e dez componentes de runtime com registros de licença/proveniência.

Os sete casos fixos de G0 passaram. O plano restringe a execução ao Ubuntu x86_64, redes funcionais locais/offline, identidades sintéticas e verificações automatizadas. Não foram usados outros sistemas operacionais, revisão humana, relays públicos, RPC de carteira ou mainnet.

Os hashes dos dados/resultados, ambiente e estado do checkout estão em [`fixed-run-02/`](fixed-run-02/). O [manifesto legível por máquina](manifest.json), inventário de requisitos, mapa das fontes, inventário de rede e inventário de dependências/licenças permanecem neste diretório de gate.