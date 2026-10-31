#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(uname -s)" == Darwin ]]; then exec bash "$SCRIPT_DIR/start-macos.sh" "$@"; fi
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
# Preserve legacy configuration and event history on existing installations.
DATA_BASE="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_BASE="${XDG_CONFIG_HOME:-$HOME/.config}"
DEFAULT_DATA="$DATA_BASE/property-relay"
DEFAULT_CONFIG="$CONFIG_BASE/property-relay"
[[ -d "$DATA_BASE/liberdade-relay" && ! -d "$DEFAULT_DATA" ]] && DEFAULT_DATA="$DATA_BASE/liberdade-relay"
[[ -d "$CONFIG_BASE/liberdade-relay" && ! -d "$DEFAULT_CONFIG" ]] && DEFAULT_CONFIG="$CONFIG_BASE/liberdade-relay"
DATA_DIR="${PROPERTY_RELAY_DATA_DIR:-${LIBERDADE_RELAY_DATA_DIR:-$DEFAULT_DATA}}"
CONFIG_DIR="${PROPERTY_RELAY_CONFIG_DIR:-${LIBERDADE_RELAY_CONFIG_DIR:-$DEFAULT_CONFIG}}"
HOST="${PROPERTY_RELAY_HOST:-${LIBERDADE_RELAY_HOST:-127.0.0.1}}"
PORT="${PROPERTY_RELAY_PORT:-${LIBERDADE_RELAY_PORT:-7447}}"
CONFIG="${PROPERTY_RELAY_CONFIG:-${LIBERDADE_RELAY_CONFIG:-$CONFIG_DIR/geode.toml}}"
PORTABLE_ARCHIVE="${PROPERTY_RELAY_PORTABLE_ARCHIVE:-${LIBERDADE_RELAY_PORTABLE_ARCHIVE:-$SCRIPT_DIR/dist/geode-1.20.0-linux-x64.tar.gz}}"
PACKAGE_PARTS_DIR="${PROPERTY_RELAY_PACKAGE_PARTS_DIR:-${LIBERDADE_RELAY_PACKAGE_PARTS_DIR:-$SCRIPT_DIR/dist-parts}}"
PORTABLE_SHA256="9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7"
BUNDLED="$SCRIPT_DIR/dist/geode/bin/geode"

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  printf 'O pacote portátil Property requer Linux x86_64. Outros alvos estão no roadmap.\n' >&2
  exit 2
fi

case "$PORT" in
  ''|*[!0-9]*) printf 'PROPERTY_RELAY_PORT precisa ser um número entre 1 e 65535.\n' >&2; exit 2 ;;
esac
if (( PORT < 1 || PORT > 65535 )); then printf 'Porta fora do intervalo válido.\n' >&2; exit 2; fi
case "$HOST" in
  *[!a-zA-Z0-9.:-]*) printf 'Endereço de escuta inválido.\n' >&2; exit 2 ;;
esac

mkdir -p -- "$DATA_DIR" "$CONFIG_DIR"
chmod 700 "$DATA_DIR" "$CONFIG_DIR"
DB_FILE="$DATA_DIR/events.db"
DB_ESCAPED=${DB_FILE//\\/\\\\}
DB_ESCAPED=${DB_ESCAPED//\"/\\\"}
HOST_ESCAPED=${HOST//\\/\\\\}
HOST_ESCAPED=${HOST_ESCAPED//\"/\\\"}

if [[ ! -f "$CONFIG" ]]; then
  cat > "$CONFIG" <<TOML
[info]
name = "Property Geode Relay"
description = "Relay Nostr pessoal operado pelo Property"

[network]
host = "$HOST_ESCAPED"
port = $PORT
path = "/"

[database]
in_memory = false
file = "$DB_ESCAPED"

[options]
verify_signatures = true
require_auth = false
TOML
  chmod 600 "$CONFIG"
fi

if [[ "$HOST" != "127.0.0.1" && "$HOST" != "localhost" && "$HOST" != "::1" ]]; then
  printf 'Aviso: relay exposto em %s:%s. Configure firewall e TLS antes de expor à internet.\n' "$HOST" "$PORT" >&2
fi

if [[ ! -f "$PORTABLE_ARCHIVE" && -f "$PACKAGE_PARTS_DIR/manifest.txt" ]]; then
  PART_COUNT=$(sed -n 's/^parts=//p' "$PACKAGE_PARTS_DIR/manifest.txt")
  PART_SIZE=$(sed -n 's/^chunk_size=//p' "$PACKAGE_PARTS_DIR/manifest.txt")
  PART_HASH=$(sed -n 's/^sha256=//p' "$PACKAGE_PARTS_DIR/manifest.txt")
  if [[ "$PART_COUNT" != "130" || "$PART_SIZE" != "524288" || "$PART_HASH" != "$PORTABLE_SHA256" ]]; then
    printf 'Manifesto dos segmentos do relay inválido; confira contagem, tamanho e hash.\n' >&2
    exit 1
  fi
  mkdir -p -- "$DATA_DIR/runtime"
  REBUILT_ARCHIVE="$DATA_DIR/runtime/geode-1.20.0-linux-x64.tar.gz"
  TEMP_ARCHIVE="$REBUILT_ARCHIVE.tmp.$$"
  : > "$TEMP_ARCHIVE"
  for ((INDEX = 0; INDEX < PART_COUNT; INDEX++)); do
    PART_NAME=$(printf '%03d' "$INDEX")
    PART_PATH="$PACKAGE_PARTS_DIR/part-$PART_NAME"
    if [[ ! -f "$PART_PATH" ]]; then
      rm -f -- "$TEMP_ARCHIVE"
      printf 'Falta o segmento local do relay: %s\n' "$PART_PATH" >&2
      exit 1
    fi
    cat -- "$PART_PATH" >> "$TEMP_ARCHIVE"
  done
  chmod 600 "$TEMP_ARCHIVE"
  if ! printf '%s  %s\n' "$PORTABLE_SHA256" "$TEMP_ARCHIVE" | sha256sum --check --status; then
    rm -f -- "$TEMP_ARCHIVE"
    printf 'Hash dos segmentos do relay não confere; o pacote não será executado.\n' >&2
    exit 1
  fi
  mv -- "$TEMP_ARCHIVE" "$REBUILT_ARCHIVE"
  PORTABLE_ARCHIVE="$REBUILT_ARCHIVE"
fi

if [[ ! -x "$BUNDLED" && -f "$PORTABLE_ARCHIVE" && "$(uname -m)" == "x86_64" ]]; then
  printf '%s  %s\n' "$PORTABLE_SHA256" "$PORTABLE_ARCHIVE" | sha256sum --check --status || {
    printf 'Hash do pacote portátil não confere; não será executado.\n' >&2
    exit 1
  }
  mkdir -p -- "$DATA_DIR/runtime"
  tar --no-same-owner -xzf "$PORTABLE_ARCHIVE" -C "$DATA_DIR/runtime"
  BUNDLED="$DATA_DIR/runtime/geode/bin/geode"
fi

if [[ -x "$BUNDLED" ]]; then
  printf 'Iniciando relay Property em %s:%s\nDados: %s\nCtrl+C encerra o processo.\n' "$HOST" "$PORT" "$DATA_DIR"
  exec "$BUNDLED" --config "$CONFIG" --host "$HOST" --port "$PORT"
fi

if [[ ! -x "$REPO_ROOT/gradlew" ]]; then
  printf 'Relay portátil ausente e wrapper Gradle não encontrado.\n' >&2
  exit 1
fi
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
if ! command -v "$JAVA_BIN" >/dev/null 2>&1; then
  printf 'Instale Java 21 para compilar o relay ou use o pacote portátil property/relay/dist.\n' >&2
  exit 1
fi
JAVA_VERSION=$("$JAVA_BIN" -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')
if [[ "$JAVA_VERSION" != "21" ]]; then
  printf 'O build do Geode requer JDK 21 (encontrado: %s). Instale openjdk-21-jdk-headless ou use o pacote portátil.\n' "${JAVA_VERSION:-desconhecido}" >&2
  exit 1
fi
printf 'Relay portátil ausente; compilando Geode com o Gradle do repositório...\n'
GRADLE_USER_HOME="${GRADLE_USER_HOME:-$DATA_DIR/gradle-cache}" "$REPO_ROOT/gradlew" :geode:run --args="--config \"$CONFIG\" --host \"$HOST\" --port \"$PORT\"" --console=plain
