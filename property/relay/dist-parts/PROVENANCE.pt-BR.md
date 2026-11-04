# Proveniência do runtime portátil

[English](PROVENANCE.md) · **Português (Brasil)**

O pacote desta pasta é o runtime do Geode 1.20.0 para Linux x86_64 com OpenJDK 21.0.12.1. Ele foi montado a partir da árvore local `geode/build/geode-image/geode`, gerada pelo task `:geode:geodeImage` do checkout Amethyst usado como base para Property.

## Verificações registradas

- Base de código Amethyst: commit `948135f7dbbae81d79a0b985282ce673397a7618`.
- O conteúdo extraído do tarball foi comparado recursivamente com `geode/build/geode-image/geode`; `diff -qr` não encontrou diferenças.
- SHA-256 do arquivo remontado: `9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7` (67.845.545 bytes).
- O inventário contém 170 entradas, todas dentro de `geode/`: 141 arquivos e 29 diretórios; não há links simbólicos nem caminhos absolutos ou com `..`.
- Varredura do conteúdo extraído para marcadores comuns de chaves privadas e tokens não encontrou correspondências.
- `geode --version` retornou `geode 1.20.0`; o Java incluso retornou `21.0.12.1`.
- `SHA256SUMS` registra os 130 segmentos usados para remontar o arquivo; `manifest.txt` e `relay-package-smoke.mjs` verificam tamanho e hash total.

Estas verificações foram feitas localmente e documentam a relação entre os segmentos e o build presente no checkout; não são uma assinatura ou atestação upstream do GitHub.
