#!/usr/bin/env bash
set -euo pipefail

bundle=""
trusted_key=""
prefix=""
while (($#)); do
  case "$1" in
    --bundle) (($# >= 2)) || { printf 'Falta o valor de --bundle.\n' >&2; exit 2; }; bundle="$2"; shift 2 ;;
    --trusted-key) (($# >= 2)) || { printf 'Falta o valor de --trusted-key.\n' >&2; exit 2; }; trusted_key="$2"; shift 2 ;;
    --prefix) (($# >= 2)) || { printf 'Falta o valor de --prefix.\n' >&2; exit 2; }; prefix="$2"; shift 2 ;;
    *) printf 'Opção desconhecida: %s\n' "$1" >&2; exit 2 ;;
  esac
done

[[ "$bundle" == /* && "$trusted_key" == /* && "$prefix" == /* ]] || {
  printf 'Use caminhos absolutos para --bundle, --trusted-key e --prefix.\n' >&2
  exit 2
}
bundle="$(realpath -- "$bundle")"
trusted_key="$(realpath -- "$trusted_key")"
prefix="$(realpath -m -- "$prefix")"
if [[ "$prefix" == / || "$prefix" == "$HOME" ]]; then
  printf 'O prefixo precisa ser específico, por exemplo /home/usuario/.local ou /tmp/property-prefix.\n' >&2
  exit 2
fi
if [[ -L "$prefix" || ( -e "$prefix" && ! -d "$prefix" ) ]]; then
  printf 'O prefixo existente precisa ser um diretório real, não um link ou arquivo.\n' >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
verifier="$script_dir/verify-offline-bundle.mjs"
[[ -f "$verifier" ]] || { printf 'Verificador do bundle não encontrado: %s\n' "$verifier" >&2; exit 1; }
node "$verifier" --bundle "$bundle" --public-key "$trusted_key"

scratch="$(mktemp -d "${TMPDIR:-/tmp}/property-install.XXXXXX")"
cleanup() { rm -rf -- "$scratch"; }
trap cleanup EXIT
tar --extract --gzip --file "$bundle/property-ubuntu-x86_64.tar.gz" --directory "$scratch" --no-same-owner --no-same-permissions
payload="$scratch/property"
[[ -d "$payload/web" && -d "$payload/relay/dist/geode" && -x "$payload/agent/install.sh" ]] || {
  printf 'O payload verificado está incompleto; nada foi instalado.\n' >&2
  exit 1
}

mkdir -p -- "$prefix/bin" "$prefix/share/property"
for launcher in property-relay property-web; do
  target="$prefix/bin/$launcher"
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -f "$target" ]] && grep -Fq '# property-offline-managed-launcher' "$target" || {
      printf 'Já existe um arquivo não gerenciado em %s; ele foi preservado.\n' "$target" >&2
      exit 1
    }
  fi
done

replace_tree() {
  local source="$1" destination="$2" next="${2}.new.$$" backup="${2}.old.$$"
  rm -rf -- "$next" "$backup"
  cp -a -- "$source" "$next"
  if [[ -e "$destination" || -L "$destination" ]]; then mv -- "$destination" "$backup"; fi
  if ! mv -- "$next" "$destination"; then
    [[ ! -e "$backup" ]] || mv -- "$backup" "$destination"
    return 1
  fi
  rm -rf -- "$backup"
}

bash "$payload/agent/install.sh" "$prefix"
replace_tree "$payload/web" "$prefix/share/property/web"
replace_tree "$payload/relay" "$prefix/share/property/relay"
replace_tree "$payload/release" "$prefix/share/property/release"
install -m 0644 "$payload/LICENSE" "$prefix/share/property/LICENSE"

cat > "$prefix/bin/property-relay.new.$$" <<'SH'
#!/usr/bin/env bash
# property-offline-managed-launcher
set -euo pipefail
bin_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
prefix_dir="$(cd -- "$bin_dir/.." && pwd -P)"
exec "$prefix_dir/share/property/relay/start.sh" "$@"
SH
chmod 0755 "$prefix/bin/property-relay.new.$$"
mv -f -- "$prefix/bin/property-relay.new.$$" "$prefix/bin/property-relay"

cat > "$prefix/bin/property-web.new.$$" <<'SH'
#!/usr/bin/env bash
# property-offline-managed-launcher
set -euo pipefail
bin_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
prefix_dir="$(cd -- "$bin_dir/.." && pwd -P)"
port="${1:-8080}"
exec python3 -m http.server "$port" --bind 127.0.0.1 --directory "$prefix_dir/share/property/web"
SH
chmod 0755 "$prefix/bin/property-web.new.$$"
mv -f -- "$prefix/bin/property-web.new.$$" "$prefix/bin/property-web"

printf 'Property instalado offline em %s\n' "$prefix"
printf 'PWA: %s/bin/property-web [porta]\nRelay local: %s/bin/property-relay\nAgente MCP stdio: %s/bin/property-agent\n' "$prefix" "$prefix" "$prefix"
