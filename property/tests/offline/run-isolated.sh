#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: run-isolated.sh COMMAND [ARG ...]" >&2
  exit 64
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"
SCRATCH_BASE="$REPO_ROOT/property/docs/evidence/offline/.scratch"
mkdir -p -- "$SCRATCH_BASE"
chmod 700 "$SCRATCH_BASE"
SCRATCH_DIR="$(mktemp -d "$SCRATCH_BASE/run.XXXXXX")"
chmod 700 "$SCRATCH_DIR"
export TMPDIR="$SCRATCH_DIR"
cleanup() { rm -rf -- "$SCRATCH_DIR"; }
trap cleanup EXIT INT TERM

export PROPERTY_PARENT_NETNS_ID="$(readlink /proc/self/ns/net)"
export PROPERTY_NETWORK_ISOLATION=unshared-netns

proxy_names=(
  HTTP_PROXY HTTPS_PROXY ALL_PROXY FTP_PROXY SOCKS_PROXY WS_PROXY
  http_proxy https_proxy all_proxy ftp_proxy socks_proxy ws_proxy
)
stripped=()
for name in "${proxy_names[@]}"; do
  if [[ -n "${!name-}" ]]; then
    stripped+=("$name")
  fi
  unset "$name"
done
export PROPERTY_LAB_STRIPPED_PROXY_VARIABLES="${stripped[*]}"

if unshare --user --map-root-user --net -- bash -c '
  set -euo pipefail
  current="$(readlink /proc/self/ns/net)"
  [[ "$current" != "$PROPERTY_PARENT_NETNS_ID" ]] || {
    echo "network namespace did not change" >&2
    exit 70
  }
  ip link set lo up
  exec "$@"
' property-offline-netns "$@"
then
  exit 0
else
  status=$?
  exit "$status"
fi
