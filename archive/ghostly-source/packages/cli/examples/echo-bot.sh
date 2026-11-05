#!/usr/bin/env bash
# An echo bot: every message it receives comes back as "echo: <text>".
# Needs jq. Run `property daemon --detach` first (or let `listen` run the profile itself).
# Another Property Direct folder or profile: set PROPERTY_HOME or PROPERTY_PROFILE (not --home or --profile), so the
# `property send` in the hook uses the same one. The cursor (the last event handled) is ECHO_CURSOR, else
# echo.cursor in that folder (PROPERTY_HOME, else ~/.property); give each bot or profile its own.
set -euo pipefail
cursor="${ECHO_CURSOR:-${PROPERTY_HOME:-$HOME/.property}/echo.cursor}"
exec property listen --type message.received --cursor "$cursor" --exec '
  event="$(cat)"
  chat="$(printf "%s" "$event" | jq -r .chat)"
  text="$(printf "%s" "$event" | jq -r .message.text)"
  # The text goes on stdin: a message that starts with "-" is text, not an option.
  printf "echo: %s" "$text" | property send "$chat" --stdin >/dev/null
'
