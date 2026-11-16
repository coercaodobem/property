#!/usr/bin/env bash

# Bash expresses RLIMIT_FSIZE in 1024-byte blocks. Require an exact multiple
# so the effective per-file cap never rounds above the configured value.
property_relay_apply_file_limit() {
  local max_bytes="${PROPERTY_RELAY_MAX_FILE_BYTES:-1073741824}"
  case "$max_bytes" in
    ''|*[!0-9]*) printf 'PROPERTY_RELAY_MAX_FILE_BYTES precisa ser múltiplo de 1024 entre 1024 e 1099511627776.\n' >&2; return 2 ;;
  esac
  while [[ ${#max_bytes} -gt 1 && "${max_bytes:0:1}" == 0 ]]; do max_bytes="${max_bytes:1}"; done
  if [[ ${#max_bytes} -gt 13 ]]; then
    printf 'PROPERTY_RELAY_MAX_FILE_BYTES precisa ser múltiplo de 1024 entre 1024 e 1099511627776.\n' >&2
    return 2
  fi
  if (( max_bytes < 1024 || max_bytes > 1099511627776 || max_bytes % 1024 != 0 )); then
    printf 'PROPERTY_RELAY_MAX_FILE_BYTES precisa ser múltiplo de 1024 entre 1024 e 1099511627776.\n' >&2
    return 2
  fi

  local blocks=$((max_bytes / 1024))
  local hard_limit
  hard_limit=$(ulimit -Hf)
  # A stricter inherited hard limit already bounds the process. Otherwise
  # lower both limits so the Geode child cannot raise RLIMIT_FSIZE again.
  if [[ "$hard_limit" == unlimited ]] || (( hard_limit > blocks )); then
    ulimit -Sf "$blocks"
    ulimit -Hf "$blocks"
  fi
}

property_relay_add_default_rate_limits() {
  local config_file="$1"
  if ! grep -Eq '^[[:space:]]*\[rate_limits\][[:space:]]*(#.*)?$' "$config_file"; then
    cat >> "$config_file" <<'TOML'

# Property defaults: per-client limits; edit this section for local capacity.
[rate_limits]
events_per_minute = 120
event_burst = 60
reqs_per_minute = 600
req_burst = 120
TOML
  fi
}

property_relay_add_default_retention() {
  local config_file="$1"
  local has_interval=0
  local has_max_age=0
  if awk '/^\[database\][[:space:]]*$/ { db=1; next } /^\[/ { db=0 } db && /^[[:space:]]*retention_sweep_interval_seconds[[:space:]]*=/ { found=1 } END { exit !found }' "$config_file"; then has_interval=1; fi
  if awk '/^\[database\][[:space:]]*$/ { db=1; next } /^\[/ { db=0 } db && /^[[:space:]]*max_event_age_seconds[[:space:]]*=/ { found=1 } END { exit !found }' "$config_file"; then has_max_age=1; fi
  if (( has_interval == 1 && has_max_age == 1 )); then
    return 0
  fi

  local temp_file
  temp_file="$(mktemp "${config_file}.retention.XXXXXX")"
  if grep -Eq '^[[:space:]]*\[database\][[:space:]]*$' "$config_file"; then
    awk -v add_interval="$((1 - has_interval))" -v add_max_age="$((1 - has_max_age))" '
      /^\[database\][[:space:]]*$/ {
        print
        print "# Property defaults: local retention runs hourly; max age 0 keeps non-expiring events indefinitely."
        if (add_interval) print "retention_sweep_interval_seconds = 3600"
        if (add_max_age) print "max_event_age_seconds = 31536000"
        inserted=1
        next
      }
      { print }
      END { if (!inserted) exit 1 }
    ' "$config_file" > "$temp_file"
  else
    cat "$config_file" > "$temp_file"
    cat >> "$temp_file" <<'TOML'

# Property defaults: local retention runs hourly; max age 0 keeps non-expiring events indefinitely.
[database]
retention_sweep_interval_seconds = 3600
max_event_age_seconds = 31536000
TOML
  fi
  chmod --reference="$config_file" "$temp_file"
  mv -- "$temp_file" "$config_file"
}
