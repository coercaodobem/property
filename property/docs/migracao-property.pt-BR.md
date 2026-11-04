# Migração para Property

**Português (Brasil)** · [English](migracao-property.pt-BR.md)


## Nome e distribuição

- Repositório: `https://github.com/coercaodobem/property`, branch `modelo-mvp`.
- App: `https://coercaodobem.github.io/property/`.
- Código do produto: `property/`; workflows `property-pages.yml` e `property-checks.yml`.
- Relay: `./property/relay/start.sh`; novas configurações usam `PROPERTY_RELAY_*`.

Atualize o remoto existente com `git remote set-url <nome-do-remoto> https://github.com/coercaodobem/property.git`, após conferir sua URL. O nome do remoto depende do clone; no checkout do mantenedor, passou a ser `property`.

## Identidades, sessões e backups

O IndexedDB mantém o identificador interno legado `liberdade-local-v1` para não apagar ou duplicar identidades, conversas e preferências. A origem HTTPS do GitHub Pages permanece `coercaodobem.github.io`; o caminho mudou. Isso permite que o novo app encontre o mesmo banco no mesmo perfil de navegador, sujeito ao isolamento/particionamento do navegador. Não transfere dados entre navegadores ou aparelhos.

Backups novos usam `property-encrypted-key-v1`; backups anteriores continuam aceitos com a mesma senha. Não há regeneração de chave ou alteração de identidade por causa do nome. Baixe e guarde um backup cifrado antes de desinstalar a PWA antiga ou apagar dados do site. Abra a URL nova e instale novamente o atalho, pois o escopo da instalação mudou. O app não apaga o banco legado.

O cache novo tem prefixo `property-shell-`; a ativação remove somente caches do shell antigo ou do Property. Não apaga caches de outros apps da mesma origem. Eventos Nostr assinados não são renomeados; campanhas antigas continuam reconhecidas pelo formato legado.

## Relay

Instalações novas usam `~/.local/share/property-relay` e `~/.config/property-relay`. Se só os diretórios antigos `liberdade-relay` existirem, o launcher os reutiliza, sem mover ou apagar o banco. Configurações e nomes já gravados no `geode.toml` são preservados; quem desejar pode editar somente os campos informativos do arquivo com o relay parado.

Variáveis `PROPERTY_RELAY_*` têm precedência; `LIBERDADE_RELAY_*` continuam como aliases de compatibilidade. Não mova manualmente bancos com o relay em execução. Para escolher outros diretórios, use `PROPERTY_RELAY_DATA_DIR` e `PROPERTY_RELAY_CONFIG_DIR` explicitamente.

## Origem e evidências

Namespaces e autoria Amethyst/Geode são preservados. Relatórios históricos mantêm URL, data e hashes originais para não adulterar evidências. Por isso alguns identificadores legados permanecem no código e nos registros, mesmo com a identidade pública Property.

O diretório de trabalho externo `/home/guilherme/Liberdade` pertence ao workspace desta tarefa e permanece no caminho atual; ele não é o nome do repositório publicado nem do pacote. Renomeá-lo durante a sessão invalidaria as raízes de acesso configuradas. Dentro do checkout, o produto e os comandos usam `property/`.

Se um navegador que já abriu a versão antiga ainda mostrar a marca anterior, abra [a atualização Property](https://coercaodobem.github.io/property/?v=property-v8) uma vez. Ela atualiza somente os arquivos do app e permite voltar à URL principal; não apague os dados do site para mudar o nome.
