#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || "$1" != /* ]]; then
  printf 'Uso: bash property/agent/install.sh <prefixo-absoluto>\nExemplo: bash property/agent/install.sh "$HOME/.local"\n' >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
property_root="$(cd -- "$script_dir/.." && pwd -P)"
prefix="$(realpath -m -- "$1")"
if [[ "$prefix" == / || "$prefix" == "$HOME" ]]; then
  printf 'O prefixo precisa ser um diretório específico, como ~/.local ou um diretório temporário.\n' >&2
  exit 2
fi

package_parent="$prefix/share/property"
package="$package_parent/agent"
launcher="$prefix/bin/property-agent"
if [[ -f "$property_root/web/vendor/nostr-tools-2.25.2.bundle.js" ]]; then
  nostr_bundle="$property_root/web/vendor/nostr-tools-2.25.2.bundle.js"
  nostr_license="$property_root/web/vendor/nostr-tools-LICENSE"
  agent_messages="$property_root/web/agent-messaging.js"
  activity_signals="$property_root/web/typing-signals.js"
else
  nostr_bundle="$script_dir/vendor/nostr-tools-2.25.2.bundle.js"
  nostr_license="$script_dir/vendor/nostr-tools-LICENSE"
  agent_messages="$script_dir/agent-messaging.js"
  activity_signals="$script_dir/typing-signals.js"
fi
if [[ ! -f "$nostr_bundle" || ! -f "$nostr_license" || ! -f "$agent_messages" || ! -f "$activity_signals" ]]; then
  printf 'Arquivos locais do pacote Agent não estão completos.\n' >&2
  exit 1
fi
mkdir -p -- "$package_parent" "$prefix/bin"
stage="$(mktemp -d "$package_parent/.agent-stage.XXXXXX")"
next="$package_parent/.agent-next.$$"
backup="$package_parent/.agent-old.$$"
cleanup() { rm -rf -- "$stage" "$next"; }
trap cleanup EXIT
cp -a -- "$script_dir/." "$stage/"
mkdir -p -- "$stage/vendor"
cp -- "$nostr_bundle" "$stage/vendor/nostr-tools-2.25.2.bundle.js"
cp -- "$nostr_license" "$stage/vendor/nostr-tools-LICENSE"
cp -- "$agent_messages" "$stage/agent-messaging.js"
cp -- "$activity_signals" "$stage/typing-signals.js"
printf '%s  %s\n' 'a7c4846fde84a0d6ce7596f3fcfc88435d29fdcd616887205ab97f9a16bc6407' "$stage/vendor/nostr-tools-2.25.2.bundle.js" | sha256sum --check --status
chmod 0755 "$stage/bin/property-agent"
chmod 0644 "$stage"/*.mjs "$stage"/*.js "$stage"/*.json "$stage"/*.md "$stage/vendor"/*
mv -- "$stage" "$next"

if [[ -e "$launcher" || -L "$launcher" ]]; then
  if [[ ! -L "$launcher" || "$(readlink -- "$launcher")" != "../share/property/agent/bin/property-agent" ]]; then
    printf 'Já existe outro arquivo em %s; não foi alterado.\n' "$launcher" >&2
    exit 1
  fi
fi
if [[ -e "$package" ]]; then
  if [[ -L "$package" || ! -f "$package/manifest.json" ]]; then
    printf 'O diretório %s não parece uma instalação Property Agent; não foi alterado.\n' "$package" >&2
    exit 1
  fi
  mv -- "$package" "$backup"
  if ! mv -- "$next" "$package"; then mv -- "$backup" "$package"; exit 1; fi
  rm -rf -- "$backup"
else
  mv -- "$next" "$package"
fi
ln -sfn -- ../share/property/agent/bin/property-agent "$launcher"
printf 'Property Agent instalado/atualizado em %s\n' "$package"
printf 'Execute: %s status\n' "$launcher"
