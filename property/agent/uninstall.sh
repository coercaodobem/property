#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || "$1" != /* ]]; then
  printf 'Uso: bash property/agent/uninstall.sh <prefixo-absoluto>\nExemplo: bash property/agent/uninstall.sh "$HOME/.local"\n' >&2
  exit 2
fi
prefix="$(realpath -m -- "$1")"
if [[ "$prefix" == / || "$prefix" == "$HOME" ]]; then
  printf 'O prefixo precisa ser um diretório específico, como ~/.local ou um diretório temporário.\n' >&2
  exit 2
fi
package="$prefix/share/property/agent"
launcher="$prefix/bin/property-agent"
if [[ -e "$launcher" || -L "$launcher" ]]; then
  if [[ ! -L "$launcher" || "$(readlink -- "$launcher")" != "../share/property/agent/bin/property-agent" ]]; then
    printf 'O launcher em %s não pertence ao Property Agent; nada foi removido.\n' "$launcher" >&2
    exit 1
  fi
  rm -- "$launcher"
fi
if [[ -e "$package" ]]; then
  if [[ -L "$package" || ! -f "$package/manifest.json" || "$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).name || '')" "$package/manifest.json")" != property-agent-local ]]; then
    printf 'O diretório %s não pertence ao Property Agent; nada foi removido.\n' "$package" >&2
    exit 1
  fi
  rm -rf -- "$package"
fi
printf 'Executáveis Property Agent removidos de %s. Cofres em XDG_DATA_HOME/property/agents não foram alterados.\n' "$prefix"
