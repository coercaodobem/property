# Release offline para Ubuntu

O bundle contém a PWA estática do Property, a imagem do relay Geode para Ubuntu x86_64, o pacote local do agente MCP, avisos de licença, SBOM SPDX 2.3, checksums e assinatura Ed25519 destacada. A PWA é estática e não usa CDN nem carrega executáveis remotamente. O agente requer Node.js 22 ou mais recente e não possui pacotes Node externos. O runtime Java 21.0.13 e a imagem Geode 1.20.0 estão incluídos; a imagem Geode foi recompilada offline a partir das fontes registradas, com hash de saída fixado, sem alegar reprodutibilidade bit a bit.

## Verificar e instalar

Use um checkout limpo de Ubuntu/Linux x86_64 e mantenha a chave privada fora do repositório. A chave pública Ed25519 confiável está versionada em `property/release/trusted-signing-public.pem`; obtenha-a da tag de código-fonte confiável, não do bundle baixado. A impressão digital SHA-256 é `c41585023ba92d25c35c243ff091d5c499a32be88871ecef52cf40196bc92d65`.

```bash
node property/release/verify-offline-bundle.mjs \
  --bundle /caminho/para/release-bundle \
  --public-key /caminho/para/trusted-signing-public.pem

bash property/release/install-offline.sh \
  --bundle /caminho/para/release-bundle \
  --trusted-key /caminho/para/trusted-signing-public.pem \
  --prefix "$HOME/.local"
```

O instalador verifica assinatura, digest do arquivo, lista de arquivos e SBOM antes de alterar o prefixo. O builder falha se a chave privada de assinatura não corresponder à chave pública fixada no código-fonte. Mantenha a chave privada offline e em backup seguro; nunca a versione nem a inclua no bundle. O instalador não cria um serviço nem abre um listener de rede automaticamente. Não modifica os diretórios locais de dados do agente e do relay.

## Executar e remover

```bash
~/.local/bin/property-web 8080
~/.local/bin/property-relay
~/.local/bin/property-agent --version
bash property/release/uninstall-offline.sh "$HOME/.local"
```

O servidor web escuta apenas em `127.0.0.1`; abra `http://127.0.0.1:8080/` no navegador. O relay usa loopback por padrão e armazena o banco em `${XDG_DATA_HOME:-$HOME/.local/share}/property-relay`. O agente se comunica por MCP stdio. A remoção do pacote preserva dados locais do agente e relay.

## Rebuild e assinatura

A PWA é empacotada como arquivos estáticos; não há `npm install` nem resolução remota de dependências. O builder requer Node.js 22.22.1, GNU tar 1.35, gzip 1.14 e um worktree limpo. Ele reempacota a imagem do relay fixada no repositório. A imagem Geode/JRE foi recompilada offline separadamente com Gradle/JDK registrados; a proveniência não afirma reprodutibilidade bit a bit.

```bash
node property/release/build-offline-bundle.mjs \
  --source /caminho/para/checkout-limpo/property \
  --output /caminho/para/novo/diretorio-vazio/release-bundle \
  --signing-key /local-seguro/property-release-ed25519.pem
```

O comando cria o manifesto assinado, a chave pública, checksums destacados e o arquivo de release. Nunca coloque uma chave privada no checkout ou no bundle. A chave pública dentro do bundle confirma apenas a consistência interna da assinatura; compare sua impressão digital com a chave fixada na tag de código-fonte confiável antes de confiar nela.
