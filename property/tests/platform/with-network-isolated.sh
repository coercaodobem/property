#!/usr/bin/env bash
set -euo pipefail

CASE_ID="${1:-}"
OUTPUT_DIR="${2:-}"
[[ "$CASE_ID" =~ ^G12-0[2345]$ ]] || { echo 'Expected G12-02 through G12-05.' >&2; exit 2; }
[[ -n "$OUTPUT_DIR" ]] || { echo 'Output directory is required.' >&2; exit 2; }

OS="$(uname -s)"
ROUTES4=()
ROUTES6=()
REMOVED_ROUTES4=()
REMOVED_ROUTES6=()
ROUTES_CHANGED=0
PROXY_NAMES=(HTTP_PROXY HTTPS_PROXY ALL_PROXY FTP_PROXY SOCKS_PROXY WS_PROXY WSS_PROXY
  http_proxy https_proxy all_proxy ftp_proxy socks_proxy ws_proxy wss_proxy)
STRIPPED_PROXY_NAMES=()
for name in "${PROXY_NAMES[@]}"; do
  if [[ -n "${!name-}" ]]; then STRIPPED_PROXY_NAMES+=("$name"); fi
  unset "$name"
done
export PROPERTY_LAB_STRIPPED_PROXY_VARIABLES="${STRIPPED_PROXY_NAMES[*]}"

if [[ "$OS" == 'Linux' ]]; then
  mapfile -t ROUTES4 < <(ip -4 -o route show table all | awk '$1 == "default" { print }')
  mapfile -t ROUTES6 < <(ip -6 -o route show table all | awk '$1 == "default" { print }')
elif [[ "$OS" == 'Darwin' ]]; then
  while IFS= read -r gateway; do ROUTES4+=("$gateway"); done < <(netstat -rn -f inet | awk '$1 == "default" && !seen[$2]++ { print $2 }')
  while IFS= read -r gateway; do ROUTES6+=("$gateway"); done < <(netstat -rn -f inet6 | awk '$1 == "default" && !seen[$2]++ { print $2 }')
else
  echo "Unsupported shell isolation host: $OS" >&2
  exit 2
fi

restore_routes() {
  local original_status=$?
  local restore_failed=0
  trap - EXIT INT TERM
  set +e
  if [[ "$ROUTES_CHANGED" == '1' ]]; then
    if [[ "$OS" == 'Linux' ]]; then
      local route
      for route in "${REMOVED_ROUTES4[@]}"; do
        [[ -n "$route" ]] || continue
        read -r -a parts <<< "$route"
        sudo -n ip -4 route replace "${parts[@]}" >/dev/null || restore_failed=1
      done
      for route in "${REMOVED_ROUTES6[@]}"; do
        [[ -n "$route" ]] || continue
        read -r -a parts <<< "$route"
        sudo -n ip -6 route replace "${parts[@]}" >/dev/null || restore_failed=1
      done
    else
      local gateway
      for gateway in "${REMOVED_ROUTES4[@]}"; do
        [[ -n "$gateway" ]] || continue
        sudo -n route -n add default "$gateway" >/dev/null || restore_failed=1
      done
      for gateway in "${REMOVED_ROUTES6[@]}"; do
        [[ -n "$gateway" ]] || continue
        sudo -n route -n add -inet6 default "$gateway" >/dev/null || restore_failed=1
      done
    fi
  fi
  if [[ "$restore_failed" == '1' && "$original_status" == '0' ]]; then original_status=1; fi
  if [[ "$restore_failed" == '1' ]]; then echo 'Failed to restore one or more runner default routes.' >&2; fi
  exit "$original_status"
}
trap restore_routes EXIT INT TERM

if [[ "$OS" == 'Linux' ]]; then
  for route in "${ROUTES4[@]}"; do
    [[ -n "$route" ]] || continue
    read -r -a parts <<< "$route"
    sudo -n ip -4 route del "${parts[@]}" >/dev/null
    REMOVED_ROUTES4+=("$route")
    ROUTES_CHANGED=1
  done
  for route in "${ROUTES6[@]}"; do
    [[ -n "$route" ]] || continue
    read -r -a parts <<< "$route"
    sudo -n ip -6 route del "${parts[@]}" >/dev/null
    REMOVED_ROUTES6+=("$route")
    ROUTES_CHANGED=1
  done
else
  for gateway in "${ROUTES4[@]}"; do
    [[ -n "$gateway" ]] || continue
    sudo -n route -n delete default "$gateway" >/dev/null
    REMOVED_ROUTES4+=("$gateway")
    ROUTES_CHANGED=1
  done
  for gateway in "${ROUTES6[@]}"; do
    [[ -n "$gateway" ]] || continue
    sudo -n route -n delete -inet6 default "$gateway" >/dev/null
    REMOVED_ROUTES6+=("$gateway")
    ROUTES_CHANGED=1
  done
fi

node property/tests/platform/platform-browser-smoke.mjs --preflight --case "$CASE_ID" --output "$OUTPUT_DIR"
node property/tests/platform/platform-browser-smoke.mjs --case "$CASE_ID" --output "$OUTPUT_DIR"
