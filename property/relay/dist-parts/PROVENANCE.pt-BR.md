# Proveniência do runtime Linux do relay

[English](PROVENANCE.md) · **Português (Brasil)**

Esta pasta contém o Geode 1.20.0 e OpenJDK 21.0.13 para Linux x86_64. A imagem foi recompilada offline a partir da base de código Amethyst `948135f7dbbae81d79a0b985282ce673397a7618` mais as quatro alterações de fonte do Property para retenção, registradas em `property/relay/runtime-dependencies.json`. O build usou Gradle 9.8.2 e Temurin JDK 21.0.13+9 com `--offline`; nenhuma dependência foi baixada. O hash da imagem gerada está fixado, mas não se afirma reprodutibilidade bit a bit.

## Verificações registradas

- Comando de build: `gradle :geode:geodeImage --offline --no-daemon --console=plain`.
- `geode --version` retornou `geode 1.20.0`; o Java incluso informou `21.0.13` (build Temurin `21.0.13+9`).
- SHA-256 do arquivo remontado: `b149a14cc4d87c56086f32c96542d6ae8120690f0004aa91f73044d4a03a445a` (67.366.437 bytes).
- `SHA256SUMS` registra os 129 segmentos de 512 KiB; `manifest.txt` e `relay-package-smoke.mjs` verificam cada parte, o tamanho total e o hash do arquivo.
- O arquivo contém 171 entradas: 142 arquivos regulares e 29 diretórios, todos sob `geode/`; não foram encontrados links simbólicos, caminhos absolutos ou caminhos com `..`.
- O arquivo foi extraído e comparado recursivamente com `geode/build/geode-image/geode`; não houve diferenças.
- Os pacotes Windows e macOS mantêm o hash da imagem-fonte Geode anterior e não foram recompilados com esta alteração de retenção Linux. Seus gates de plataforma continuam pendentes.

Estas verificações locais documentam a relação entre as fontes deste repositório, a saída do build e o runtime segmentado. Não são atestação upstream, scan de vulnerabilidades nem alegação de compilação reproduzível.
