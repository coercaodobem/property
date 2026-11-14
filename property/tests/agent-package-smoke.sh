#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROPERTY_ROOT="$(cd -- "$TEST_DIR/.." && pwd -P)"
TEMP="$(mktemp -d "$TEST_DIR/.agent-package-smoke.XXXXXX")"
trap 'rm -rf -- "$TEMP"' EXIT
PREFIX="$TEMP/prefix"
DATA_HOME="$TEMP/user-data"
LAUNCHER="$PREFIX/bin/property-agent"

XDG_DATA_HOME="$DATA_HOME" bash "$PROPERTY_ROOT/agent/install.sh" "$PREFIX"
VERSION="$(XDG_DATA_HOME="$DATA_HOME" "$LAUNCHER" --version)"
[[ "$VERSION" == *"property-agent 0.7.0"* ]]
[[ "$VERSION" == *"MCP 2026-07-28"* ]]
for file in property-agent.mjs bin/property-agent mcp-server.mjs daemon.mjs core.mjs service.mjs relay.mjs ipc.mjs store.mjs vault.mjs nano-wallet.mjs xno-trades.mjs xno-journal.mjs xno-threshold.mjs xno-threshold-store.mjs xno-threshold-protocol.mjs agent-messaging.js typing-signals.js vendor/nostr-tools-2.25.2.bundle.js vendor/nostr-tools-LICENSE vendor/node_modules/@noble/curves/ed25519.js vendor/node_modules/@noble/curves/abstract/frost.js vendor/node_modules/@noble/hashes/blake2.js vendor/NOTICE.md; do
  [[ -f "$PREFIX/share/property/agent/$file" ]]
done
[[ -x "$PREFIX/share/property/agent/bin/property-agent" ]]
node --input-type=module - "$PREFIX/share/property/agent/xno-threshold.mjs" <<'NODE'
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const crypto = await import(pathToFileURL(process.argv[2]));
assert.equal(typeof crypto.nanoThresholdFrost.DKG.round1, 'function');
assert.equal(typeof crypto.verifyNanoThresholdSignature, 'function');
NODE

XDG_DATA_HOME="$DATA_HOME" bash "$PREFIX/share/property/agent/install.sh" "$PREFIX"
VERSION="$(XDG_DATA_HOME="$DATA_HOME" "$LAUNCHER" --version)"
[[ "$VERSION" == *"property-agent 0.7.0"* ]]
if XDG_DATA_HOME="$DATA_HOME" "$LAUNCHER" unlock --password fixture >"$TEMP/stdout" 2>"$TEMP/stderr"; then
  printf 'unlock aceitou uma senha por argumento\n' >&2
  exit 1
fi
grep -Fq -- 'não aceita senha por argumento' "$TEMP/stderr"

mkdir -p -- "$DATA_HOME/property/agents/default"
printf 'preserve-local-data\n' > "$DATA_HOME/property/agents/default/marker"
chmod 0600 "$DATA_HOME/property/agents/default/marker"
XDG_DATA_HOME="$DATA_HOME" bash "$PROPERTY_ROOT/agent/uninstall.sh" "$PREFIX"
[[ ! -e "$LAUNCHER" && ! -L "$LAUNCHER" ]]
[[ ! -e "$PREFIX/share/property/agent" ]]
[[ "$(cat "$DATA_HOME/property/agents/default/marker")" == preserve-local-data ]]
printf 'PASS: instalação, atualização, remoção, wrapper CLI e preservação do cofre/dados locais.\n'
