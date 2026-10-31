#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TEST_DIR/../.." && pwd)"
BASE_PORT="${1:-17460}"
COUNT=7
case "$BASE_PORT" in ''|*[!0-9]*) printf 'Porta inicial inválida.\n' >&2; exit 2 ;; esac
if (( BASE_PORT < 1024 || BASE_PORT + COUNT - 1 > 65535 )); then printf 'Faixa de portas inválida.\n' >&2; exit 2; fi

LAB_DIR="$(mktemp -d "${TMPDIR:-/tmp}/property-seven-relays.XXXXXX")"
PIDS=()
cleanup() {
  local pid
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done
  rm -rf -- "$LAB_DIR"
}
trap cleanup EXIT INT TERM

stop_relays() {
  local pid failed=0
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
    if kill -0 "$pid" 2>/dev/null; then failed=1; fi
  done
  PIDS=()
  return "$failed"
}

cd -- "$REPO_ROOT"
for ((index = 0; index < COUNT; index++)); do
  port=$((BASE_PORT + index))
  PROPERTY_RELAY_HOST=127.0.0.1 \
  PROPERTY_RELAY_PORT="$port" \
  PROPERTY_RELAY_DATA_DIR="$LAB_DIR/relay-$index-data" \
  PROPERTY_RELAY_CONFIG_DIR="$LAB_DIR/relay-$index-config" \
    ./property/relay/start.sh >"$LAB_DIR/relay-$index.log" 2>&1 &
  PIDS+=("$!")
done

for attempt in $(seq 1 60); do
  urls=()
  for ((index = 0; index < COUNT; index++)); do
    port=$((BASE_PORT + index))
    urls+=("ws://127.0.0.1:$port")
  done
  if node "$TEST_DIR/relay-readiness.mjs" "${urls[@]}" >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == 60 ]]; then
    for ((index = 0; index < COUNT; index++)); do tail -12 "$LAB_DIR/relay-$index.log" >&2; done
    printf 'Nem todos os relays ficaram prontos em 30 segundos.\n' >&2
    exit 1
  fi
  sleep 0.5
done

declare -A DATABASES=()
for ((index = 0; index < COUNT; index++)); do
  data_dir="$LAB_DIR/relay-$index-data"
  config_dir="$LAB_DIR/relay-$index-config"
  config="$config_dir/geode.toml"
  db="$data_dir/events.db"
  [[ -f "$config" && -f "$db" ]] || { printf 'Configuração ou banco ausente no relay %s.\n' "$index" >&2; exit 1; }
  [[ "$(stat -c '%a' "$data_dir")" == 700 && "$(stat -c '%a' "$config_dir")" == 700 && "$(stat -c '%a' "$config")" == 600 ]] || {
    printf 'Permissões inseguras no relay %s.\n' "$index" >&2; exit 1;
  }
  grep -Fq "host = \"127.0.0.1\"" "$config"
  grep -Fq "port = $((BASE_PORT + index))" "$config"
  grep -Fq "file = \"$db\"" "$config"
  [[ -z "${DATABASES[$db]+present}" ]] || { printf 'Banco compartilhado: %s\n' "$db" >&2; exit 1; }
  DATABASES[$db]=1
done

stop_relays || { printf 'Um ou mais processos Geode não encerraram após SIGTERM.\n' >&2; exit 1; }
trap - EXIT INT TERM
rm -rf -- "$LAB_DIR"
printf 'PASS: %s Geode reais prontos por WebSocket em 127.0.0.1, portas %s-%s; bancos/configurações distintos, permissões 700/600 e encerramento verificado.\n' \
  "$COUNT" "$BASE_PORT" "$((BASE_PORT + COUNT - 1))"
