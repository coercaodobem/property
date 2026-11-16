#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPER="$REPO_ROOT/property/relay/resource-limits.sh"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/property-relay-limits.XXXXXX")"
trap 'rm -rf -- "$TEMP_DIR"' EXIT
source "$HELPER"

# A legacy config receives only a missing rate section; its existing bytes stay unchanged.
printf '[network]\nhost = "127.0.0.1"\n' > "$TEMP_DIR/legacy.toml"
legacy_prefix=$(cat "$TEMP_DIR/legacy.toml")
property_relay_add_default_rate_limits "$TEMP_DIR/legacy.toml"
grep -Fqx '[rate_limits]' "$TEMP_DIR/legacy.toml"
grep -Fqx 'events_per_minute = 120' "$TEMP_DIR/legacy.toml"
grep -Fqx 'event_burst = 60' "$TEMP_DIR/legacy.toml"
grep -Fqx 'reqs_per_minute = 600' "$TEMP_DIR/legacy.toml"
grep -Fqx 'req_burst = 120' "$TEMP_DIR/legacy.toml"
[[ "$(head -n 2 "$TEMP_DIR/legacy.toml")" == "$legacy_prefix" ]]
property_relay_add_default_rate_limits "$TEMP_DIR/legacy.toml"
[[ "$(grep -c '^\[rate_limits\]$' "$TEMP_DIR/legacy.toml")" == 1 ]]
property_relay_add_default_retention "$TEMP_DIR/legacy.toml"
grep -Fqx '[database]' "$TEMP_DIR/legacy.toml"
grep -Fqx 'retention_sweep_interval_seconds = 3600' "$TEMP_DIR/legacy.toml"
grep -Fqx 'max_event_age_seconds = 31536000' "$TEMP_DIR/legacy.toml"
property_relay_add_default_retention "$TEMP_DIR/legacy.toml"
[[ "$(grep -c '^retention_sweep_interval_seconds = ' "$TEMP_DIR/legacy.toml")" == 1 ]]

# An operator-defined section, including a deliberate zero/unlimited choice, is untouched.
printf '[rate_limits]\nevents_per_minute = 0\n' > "$TEMP_DIR/custom.toml"
custom_hash=$(sha256sum "$TEMP_DIR/custom.toml" | cut -d' ' -f1)
property_relay_add_default_rate_limits "$TEMP_DIR/custom.toml"
[[ "$(sha256sum "$TEMP_DIR/custom.toml" | cut -d' ' -f1)" == "$custom_hash" ]]

cat > "$TEMP_DIR/custom-retention.toml" <<'TOML'
[database]
max_event_age_seconds = 0
TOML
property_relay_add_default_retention "$TEMP_DIR/custom-retention.toml"
grep -Fqx 'max_event_age_seconds = 0' "$TEMP_DIR/custom-retention.toml"
grep -Fqx 'retention_sweep_interval_seconds = 3600' "$TEMP_DIR/custom-retention.toml"
[[ "$(grep -c '^max_event_age_seconds = ' "$TEMP_DIR/custom-retention.toml")" == 1 ]]

# Ten independent configured storage caps, each tested at limit-1, limit,
# and limit+1. RLIMIT_FSIZE is inherited by child processes and cannot be raised.
storage_caps=()
for kib in {1..10}; do
  cap=$((kib * 1024))
  storage_caps+=("$cap")
  for size in $((cap - 1)) "$cap" $((cap + 1)); do
    file="$TEMP_DIR/cap-$cap-size-$size"
    set +e
    PROPERTY_RELAY_MAX_FILE_BYTES="$cap" bash -c '
      set -euo pipefail
      source "$1"
      property_relay_apply_file_limit
      python3 - "$2" "$3" <<'PY'
import os, sys
path, size = sys.argv[1], int(sys.argv[2])
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
try:
    os.write(fd, b"x" * size)
finally:
    os.close(fd)
PY
    ' _ "$HELPER" "$file" "$size" >/dev/null 2>&1
    status=$?
    set -e
    actual=$(stat -c '%s' "$file")
    if (( size <= cap )); then
      [[ "$status" == 0 && "$actual" == "$size" ]]
    else
      [[ "$status" != 0 || "$actual" -lt "$size" ]]
      [[ "$actual" -le "$cap" ]]
    fi
  done
done

for invalid in 0 1023 1025 1099511628288 99999999999999 not-a-number; do
  set +e
  PROPERTY_RELAY_MAX_FILE_BYTES="$invalid" bash -c 'source "$1"; property_relay_apply_file_limit' _ "$HELPER" >/dev/null 2>&1
  status=$?
  set -e
  [[ "$status" == 2 ]]
done

printf '{"status":"PASS","rate_config_cases":3,"storage_limit_configurations":%s,"boundary_cases_per_storage_limit":3,"storage_caps_bytes":[%s],"invalid_values_rejected":6}\n' "${#storage_caps[@]}" "$(IFS=,; echo "${storage_caps[*]}")"
