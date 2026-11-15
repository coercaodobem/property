#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || "$1" != /* ]]; then
  printf 'Uso: bash property/release/uninstall-offline.sh <prefixo-absoluto>\n' >&2
  exit 2
fi
prefix="$(realpath -m -- "$1")"
if [[ "$prefix" == / || "$prefix" == "$HOME" || -L "$prefix" ]]; then
  printf 'O prefixo precisa ser um diretório específico e não pode ser um link.\n' >&2
  exit 2
fi
agent_uninstaller="$prefix/share/property/agent/uninstall.sh"
if [[ -f "$agent_uninstaller" ]]; then bash "$agent_uninstaller" "$prefix"; fi
for launcher in property-relay property-web; do
  target="$prefix/bin/$launcher"
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -f "$target" ]] && grep -Fq '# property-offline-managed-launcher' "$target" || {
      printf 'Arquivo não gerenciado em %s; preservado.\n' "$target" >&2
      exit 1
    }
    rm -f -- "$target"
  fi
done
rm -rf -- "$prefix/share/property/web" "$prefix/share/property/relay" "$prefix/share/property/release"
rm -f -- "$prefix/share/property/LICENSE"
rmdir --ignore-fail-on-non-empty "$prefix/share/property" "$prefix/share" "$prefix/bin" 2>/dev/null || true
printf 'Property removido de %s. Dados locais do agente e do relay foram preservados.\n' "$prefix"
