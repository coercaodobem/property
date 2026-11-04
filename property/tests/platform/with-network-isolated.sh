#!/usr/bin/env bash
set -euo pipefail

CASE_ID="${1:-}"
OUTPUT_DIR="${2:-}"
[[ "$CASE_ID" =~ ^G12-0[2345]$ ]] || { echo 'Expected G12-02 through G12-05.' >&2; exit 2; }
[[ -n "$OUTPUT_DIR" ]] || { echo 'Output directory is required.' >&2; exit 2; }

OS="$(uname -s)"
ROUTES4=()
ROUTES6=()
GATEWAY4=''
GATEWAY6=''
ROUTES_CHANGED=0

if [[ "$OS" == 'Linux' ]]; then
  mapfile -t ROUTES4 < <(ip -4 -o route show table all | awk '$1 == "default" { print }')
  mapfile -t ROUTES6 < <(ip -6 -o route show table all | awk '$1 == "default" { print }')
elif [[ "$OS" == 'Darwin' ]]; then
  GATEWAY4="$(route -n get default 2>/dev/null | awk '$1 == "gateway:" { print $2; exit }' || true)"
  GATEWAY6="$(route -n get -inet6 default 2>/dev/null | awk '$1 == "gateway:" { print $2; exit }' || true)"
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
      for route in "${ROUTES4[@]}"; do
        [[ -n "$route" ]] || continue
        read -r -a parts <<< "$route"
        sudo -n ip -4 route replace "${parts[@]}" >/dev/null || restore_failed=1
      done
      for route in "${ROUTES6[@]}"; do
        [[ -n "$route" ]] || continue
        read -r -a parts <<< "$route"
        sudo -n ip -6 route replace "${parts[@]}" >/dev/null || restore_failed=1
      done
    else
      [[ -z "$GATEWAY4" ]] || sudo -n route -n add default "$GATEWAY4" >/dev/null || restore_failed=1
      [[ -z "$GATEWAY6" ]] || sudo -n route -n add -inet6 default "$GATEWAY6" >/dev/null || restore_failed=1
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
    ROUTES_CHANGED=1
  done
  for route in "${ROUTES6[@]}"; do
    [[ -n "$route" ]] || continue
    read -r -a parts <<< "$route"
    sudo -n ip -6 route del "${parts[@]}" >/dev/null
    ROUTES_CHANGED=1
  done
else
  if [[ -n "$GATEWAY4" ]]; then sudo -n route -n delete default >/dev/null; ROUTES_CHANGED=1; fi
  if [[ -n "$GATEWAY6" ]]; then sudo -n route -n delete -inet6 default >/dev/null; ROUTES_CHANGED=1; fi
fi

node property/tests/platform/platform-browser-smoke.mjs --preflight --case "$CASE_ID" --output "$OUTPUT_DIR"
node property/tests/platform/platform-browser-smoke.mjs --case "$CASE_ID" --output "$OUTPUT_DIR"
