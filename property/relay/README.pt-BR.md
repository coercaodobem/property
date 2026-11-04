# Relay Property no computador

**Português (Brasil)** · [English](README.md)

O relay é o Geode do Amethyst reutilizado sob licença MIT. O comando é executado sem root e, por padrão, escuta apenas no loopback para evitar expor um serviço sem TLS à internet.

```bash
./property/relay/start.sh
```

- Endereço padrão: `127.0.0.1:7447`.
- Banco persistente: `~/.local/share/property-relay/events.db`.
- Configuração: `~/.config/property-relay/geode.toml`.
- Encerrar: `Ctrl+C`.

Variáveis opcionais:

```bash
PROPERTY_RELAY_HOST=127.0.0.1 PROPERTY_RELAY_PORT=7447 ./property/relay/start.sh
```

Para bind público, não basta trocar o endereço: coloque TLS e proteção de rede à frente, defina URL canônica no config, limites de tráfego e política de armazenamento. O comando padrão não exige senha, não usa root e não abre firewall.

O runtime Java 21.0.12.1 e o Geode 1.20.0 para Linux x86_64 são incluídos em `dist-parts/` como 130 segmentos binários. `SHA256SUMS` fixa o hash de cada segmento e `manifest.txt` fixa o tamanho e o hash do tarball remontado (`9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7`). O tarball auditado contém somente a árvore `geode/` gerada pelo build `:geode:geodeImage`; seu conteúdo foi comparado arquivo a arquivo com `geode/build/geode-image/geode`, sem diferenças. As verificações e os limites da proveniência estão em [`dist-parts/PROVENANCE.md`](dist-parts/PROVENANCE.md). O launcher remonta o tarball no diretório privado do usuário, verifica o SHA-256 completo e só então extrai/executa. Não baixa código na execução. Em x86_64 o launcher não exige Java instalado nem root; se os segmentos estiverem ausentes, o build de contingência exige JDK 21 e Gradle.

Instalações existentes e variáveis antigas são preservadas por compatibilidade; veja [migração para Property](../docs/migracao-property.md). Incluímos também pacotes Windows x64 e macOS Apple Silicon, com matriz de testes própria. Mac Intel, outras arquiteturas Linux, relay Android e relay iOS continuam pendentes; nesses sistemas a interface é a PWA.

## Windows x64

Na raiz do checkout, abra PowerShell e execute:

```powershell
powershell -NoProfile -File .\property\relay\start.ps1
```

Dados em `%LOCALAPPDATA%\Property\relay`; configuração em `%LOCALAPPDATA%\Property\config`. Use `PROPERTY_RELAY_DATA_DIR`, `PROPERTY_RELAY_CONFIG_DIR`, `PROPERTY_RELAY_HOST`, `PROPERTY_RELAY_PORT` ou `PROPERTY_RELAY_CONFIG` para configurar. O runtime é incluído; não precisa Java, Python, compilação, root ou loja. Respeite a política de execução de scripts do seu computador; o launcher não altera essa política. `Ctrl+C` encerra o relay.

## macOS Apple Silicon (arm64)

```bash
./property/relay/start.sh
```

O launcher seleciona `start-macos.sh` e usa o pacote arm64 com Java incluído. Dados em `~/.local/share/property-relay`, configuração em `~/.config/property-relay`; variáveis `PROPERTY_RELAY_*` equivalentes. Não modifica Gatekeeper nem remove quarentena automaticamente. Mac Intel ainda precisa de pacote e driver SQLite compatíveis; não execute o pacote arm64 como se fosse x64.

## Proveniência dos novos pacotes

Cada diretório em `portable/` contém segmentos e `manifest.json` com hashes, tamanhos, origem Temurin 21.0.13+9 e hashes individuais de todos os JARs Geode. Os JARs são os mesmos do pacote Linux original; os runtimes nativos vieram das releases oficiais Adoptium verificadas por SHA-256. O pacote preserva os arquivos de licença do runtime. Veja [proveniência](portable/PROVENANCE.md). Não há download ou atualização automática no launcher. A PWA continua leve: esses runtimes não fazem parte do artefato de Pages nem do cache do navegador.

`node property/tests/native-relay-integration.mjs` inicia um relay isolado, testa mensagens e ofertas BTC/XMR/XNO e verifica persistência após reinício. O CI executa esse fluxo em Linux, Windows e macOS arm64. O gate G11-03 exercita três relays e duas pontes com 300 probes, três reinícios, nove eventos de partição e checkpoints de recursos por quantidade, conforme o plano central de testes.
