# Relay Property no computador

**Português (Brasil)** · [English](README.md)

O relay é o Geode do Amethyst reutilizado sob licença MIT. O comando é executado sem root e, por padrão, escuta apenas no loopback para evitar expor um serviço sem TLS à internet.

```bash
./property/relay/start.sh
```

- Endereço padrão: `127.0.0.1:7447`.
- Banco persistente: `~/.local/share/property-relay/events.db`.
- Configuração: `~/.config/property-relay/geode.toml`.
- No Linux, configurações novas limitam cada cliente a 120 EVENTs/minuto (rajada de 60) e 600 REQs/minuto (rajada de 120). Arquivos existentes preservam suas configurações; se não tiverem uma seção `[rate_limits]`, o launcher Linux adiciona estes padrões uma vez.
- O launcher Linux limita cada arquivo do processo do relay a 1 GiB por padrão. Use `PROPERTY_RELAY_MAX_FILE_BYTES` para definir outro valor em bytes, múltiplo de 1024, entre 1024 bytes e 1 TiB. O limite vale por arquivo, não como cota agregada do diretório. Se um arquivo do banco chegar ao limite, o sistema operacional rejeita novas gravações e pode encerrar o processo do relay; confira o estado, libere ou migre o armazenamento deliberadamente e reinicie.
- No Linux, o launcher do Property aplica retenção local na inicialização e a cada hora: remove eventos expirados por NIP-40 e, por padrão, eventos com mais de 365 dias. Na seção `[database]`, altere `max_event_age_seconds` para outra idade não negativa ou use `0` para manter indefinidamente eventos sem expiração; defina `retention_sweep_interval_seconds = 0` para desativar a limpeza agendada. A poda local não publica exclusão NIP-09 e não apaga cópias em outros relays.
- O limite de arquivo restringe cada arquivo do banco/WAL, não o uso agregado do diretório. Mantenha backups e monitore espaço livre; exclusões NIP-09 e a política local deste relay não apagam cópias em outros relays.
- Encerrar: `Ctrl+C`.

## API opcional do operador de campanhas

`campaign-engine.mjs` e `campaign-operator.mjs` fornecem uma interface local para um processo que injeta o assinador do node, um adapter de carteira/livro-razão e um publicador de eventos. O operador expõe nove métodos JSON-RPC por entrada/saída padrão: inspecionar, aceitar, rejeitar, listar, reconciliar, reembolsar, definir escopo de publicação, exportar a contabilização e podar dados de campanhas encerradas. O adapter stdio não abre listener TCP.

Esta API ainda não é iniciada pelo launcher Geode padrão. Um host precisa conectá-la ao assinador local, aos adapters que verificam o valor exato e ao publicador de relays. Aceitar cria um destino de pagamento dedicado; a campanha assinada só é publicada depois que o livro-razão local confirma o valor exato e a política de confirmações. Rejeitar não cria destino de pagamento, então devolução automática não é suportada nem anunciada. Cada node decide se aceita campanhas. Escopo de publicação, contabilização local e retenção são controles por node.

Variáveis opcionais:

```bash
PROPERTY_RELAY_HOST=127.0.0.1 PROPERTY_RELAY_PORT=7447 ./property/relay/start.sh
```

Para bind público, não basta trocar o endereço: coloque TLS e proteção de rede à frente, defina URL canônica no config, revise os limites por cliente para sua capacidade e planeje backups e monitoramento de disco. Limites de taxa e por arquivo reduzem abuso de recursos, mas não impedem clientes Sybil nem garantem disponibilidade. O comando padrão não exige senha, não usa root e não abre firewall.

O runtime Java 21.0.13 e o Geode 1.20.0 para Linux x86_64 são incluídos em `dist-parts/` como 129 segmentos binários. `SHA256SUMS` fixa o hash de cada segmento e `manifest.txt` fixa o tamanho e o hash do tarball remontado (`b149a14cc4d87c56086f32c96542d6ae8120690f0004aa91f73044d4a03a445a`). Esta imagem foi recompilada offline a partir das fontes Geode registradas, incluindo a limpeza local de retenção do Property; o hash do build está fixado, mas não se afirma reprodutibilidade bit a bit. O tarball contém somente a árvore `geode/` gerada por `:geode:geodeImage`; seu conteúdo foi comparado arquivo a arquivo com `geode/build/geode-image/geode`, sem diferenças. As verificações e os limites da proveniência estão em [`dist-parts/PROVENANCE.md`](dist-parts/PROVENANCE.md). O launcher remonta o tarball no diretório privado do usuário, verifica o SHA-256 completo e só então o extrai e executa. Não baixa código na execução. Em x86_64 o launcher não exige Java instalado nem root; se os segmentos estiverem ausentes, o build de contingência exige JDK 21 e Gradle.

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
