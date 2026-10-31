#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TEST_DIR/../.." && pwd)"
SOURCE_PORT="${1:-17447}"
TARGET_PORT="${2:-17448}"

for port_value in "$SOURCE_PORT" "$TARGET_PORT"; do
  case "$port_value" in
    ''|*[!0-9]*) printf 'Porta inválida: %s\n' "$port_value" >&2; exit 2 ;;
  esac
  if (( port_value < 1024 || port_value > 65535 )); then printf 'Use portas entre 1024 e 65535.\n' >&2; exit 2; fi
done
if [[ "$SOURCE_PORT" == "$TARGET_PORT" ]]; then printf 'As portas precisam ser diferentes.\n' >&2; exit 2; fi

test_root="$(mktemp -d "${TMPDIR:-/tmp}/property-bridge-it.XXXXXX")"
source_pid=""
target_pid=""
cleanup() {
  local failed=0
  trap - EXIT INT TERM
  if [[ -n "$source_pid" ]]; then kill "$source_pid" 2>/dev/null || true; wait "$source_pid" 2>/dev/null || true; kill -0 "$source_pid" 2>/dev/null && failed=1; fi
  if [[ -n "$target_pid" ]]; then kill "$target_pid" 2>/dev/null || true; wait "$target_pid" 2>/dev/null || true; kill -0 "$target_pid" 2>/dev/null && failed=1; fi
  rm -rf -- "$test_root"
  if [[ "$failed" == 1 ]]; then printf 'Um relay de teste não encerrou corretamente.\n' >&2; exit 1; fi
}
trap cleanup EXIT

cd -- "$REPO_ROOT"
PROPERTY_RELAY_HOST=127.0.0.1 PROPERTY_RELAY_PORT="$SOURCE_PORT" PROPERTY_RELAY_DATA_DIR="$test_root/source-data" PROPERTY_RELAY_CONFIG_DIR="$test_root/source-config" ./property/relay/start.sh >"$test_root/source.log" 2>&1 &
source_pid=$!
PROPERTY_RELAY_HOST=127.0.0.1 PROPERTY_RELAY_PORT="$TARGET_PORT" PROPERTY_RELAY_DATA_DIR="$test_root/target-data" PROPERTY_RELAY_CONFIG_DIR="$test_root/target-config" ./property/relay/start.sh >"$test_root/target.log" 2>&1 &
target_pid=$!

for attempt in $(seq 1 60); do
  if node -e 'const net=require("node:net");const ports=process.argv.slice(1);Promise.all(ports.map(p=>new Promise((resolve,reject)=>{const s=net.connect(Number(p),"127.0.0.1",()=>{s.destroy();resolve();});s.on("error",reject);}))).then(()=>{},()=>process.exit(1));' "$SOURCE_PORT" "$TARGET_PORT"; then
    break
  fi
  if [[ "$attempt" == "60" ]]; then
    tail -40 "$test_root/source.log"
    tail -40 "$test_root/target.log"
    exit 1
  fi
  sleep 0.5
done

source_url="ws://127.0.0.1:$SOURCE_PORT"
target_url="ws://127.0.0.1:$TARGET_PORT"
node "$TEST_DIR/bridge-integration.mjs" "$source_url" "$target_url"
node "$TEST_DIR/relay-integration.mjs" "$target_url"

source_db="$test_root/source-data/events.db"
target_db="$test_root/target-data/events.db"
[[ -f "$source_db" && -f "$target_db" && ! "$source_db" -ef "$target_db" ]] || {
  printf 'Os dois relays precisam manter bancos SQLite independentes.\n' >&2; exit 1;
}
[[ "$(stat -c '%a' "$test_root/source-data")" == 700 && "$(stat -c '%a' "$test_root/target-data")" == 700 ]] || {
  printf 'Diretório de dados de relay precisa de permissão 700.\n' >&2; exit 1;
}
[[ "$(stat -c '%a' "$test_root/source-config/geode.toml")" == 600 && "$(stat -c '%a' "$test_root/target-config/geode.toml")" == 600 ]] || {
  printf 'Configuração de relay precisa de permissão 600.\n' >&2; exit 1;
}
printf 'PASS: bancos distintos, dados 700, configurações 600; processos serão encerrados e o laboratório temporário removido.\n'
