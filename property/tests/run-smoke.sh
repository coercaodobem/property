#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TEST_DIR/../.." && pwd)"
cd -- "$REPO_ROOT"

for test_file in \
  money-smoke.mjs \
  nano-units-smoke.mjs \
  marketplace-smoke.mjs \
  campaigns-smoke.mjs \
  campaign-engine-smoke.mjs \
  ledger-rpc-smoke.mjs \
  protocol-smoke.mjs \
  message-edits-smoke.mjs \
  chat-search-smoke.mjs \
  conversation-folders-smoke.mjs \
  chat-drafts-smoke.mjs \
  group-mentions-smoke.mjs \
  notification-preferences-smoke.mjs \
  app-badge-smoke.mjs \
  message-days-smoke.mjs \
  message-scroll-smoke.mjs \
  rich-text-smoke.mjs \
  link-preview-smoke.mjs \
  nostr-entities-smoke.mjs \
  secret-guard-smoke.mjs \
  nip05-smoke.mjs \
  nip39-smoke.mjs \
  vault-smoke.mjs \
  forwarding-smoke.mjs \
  sw-update-smoke.mjs \
  contact-smoke.mjs \
  contact-share-smoke.mjs \
  qr-code-smoke.mjs \
  emoji-picker-smoke.mjs \
  chat-gestures-smoke.mjs \
  relay-defaults-smoke.mjs \
  share-target-smoke.mjs \
  pwa-smoke.mjs \
  app-contract-smoke.mjs \
  relay-migration-smoke.mjs \
  portable-packages-smoke.mjs \
  relay-package-smoke.mjs \
  agent-messaging-g0-smoke.mjs \
  agent-service-smoke.mjs \
  agent-messaging-smoke.mjs \
  agent-package-smoke.mjs \
  offline/agent-security-g5.mjs \
  offline/runner-contract-smoke.mjs
do
  printf '\n== %s ==\n' "$test_file"
  node "$TEST_DIR/$test_file"
done

printf '\n== agent-package-smoke.sh ==\n'
bash "$TEST_DIR/agent-package-smoke.sh"

printf '\nPASS: suíte smoke local concluída.\n'
