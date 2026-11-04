# Migration to Property

**English** · [Português (Brasil)](migracao-property.pt-BR.md)

## Name and distribution

- Repository: `https://github.com/coercaodobem/property`, branch `modelo-mvp`.
- App: `https://coercaodobem.github.io/property/`.
- Product code: `property/`; workflows: `property-pages.yml` and `property-checks.yml`.
- Relay: `./property/relay/start.sh`; new settings use `PROPERTY_RELAY_*`.

After checking the URL, update an existing remote with `git remote set-url <remote-name> https://github.com/coercaodobem/property.git`. Remote names vary by checkout; the maintainer's local remote is `property`.

## Identities, sessions, and backups

IndexedDB retains the legacy internal identifier `liberdade-local-v1` to avoid erasing or duplicating identities, conversations, and preferences. The HTTPS origin remains `coercaodobem.github.io`; only the path changed. This lets the new app find the same database in the same browser profile, subject to browser isolation/partitioning. It does not transfer data between browsers or devices.

New backups use `property-encrypted-key-v1`; older backups remain accepted with the same password. The key is not regenerated and the identity is not changed because of the name. Download and keep an encrypted backup before uninstalling the old PWA or clearing site data. Open the new URL and install the shortcut again because the install scope changed. The app does not erase the legacy database.

The new cache prefix is `property-shell-`; activation removes only the old or Property app shell caches. It does not delete caches belonging to other apps on the same origin. Signed Nostr events are not renamed, and older campaign formats remain recognized.

## Relay

New installs use `~/.local/share/property-relay` and `~/.config/property-relay`. If only the old `liberdade-relay` directories exist, the launcher reuses them without moving or deleting the database. Existing configuration and names in `geode.toml` are preserved; if desired, edit only its informational fields while the relay is stopped.

`PROPERTY_RELAY_*` variables take precedence; `LIBERDADE_RELAY_*` remain compatibility aliases. Do not move databases while the relay is running. Set `PROPERTY_RELAY_DATA_DIR` and `PROPERTY_RELAY_CONFIG_DIR` to choose other directories.

## Origin and evidence

Amethyst/Geode namespaces and authorship are preserved. Historical reports keep their original URLs, dates, and hashes to avoid altering evidence. Some legacy identifiers therefore remain in code and records despite the public Property identity.

The external working directory `/home/guilherme/Liberdade` belongs to this workspace and keeps its current path; it is not the published repository name or package name. Inside the checkout, the product and commands use `property/`.

If a browser that opened the old version still shows the old brand, open [the Property update URL](https://coercaodobem.github.io/property/?v=property-v8) once. It updates only app files and lets you return to the main URL; do not clear site data to change the name.
