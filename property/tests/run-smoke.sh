#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TEST_DIR/../.." && pwd)"
cd -- "$REPO_ROOT"

for test_file in \
  money-smoke.mjs \
  payment-card-smoke.mjs \
  payment-uris-smoke.mjs \
  nano-units-smoke.mjs \
  marketplace-smoke.mjs \
  offline/marketplace-g6-fixed-count.mjs \
  campaigns-smoke.mjs \
  campaign-engine-smoke.mjs \
  offline/campaign-g8-fixed-count.mjs \
  ledger-rpc-smoke.mjs \
  protocol-contract-g1.mjs \
  protocol-smoke.mjs \
  message-edits-smoke.mjs \
  message-deletions-smoke.mjs \
  message-pins-smoke.mjs \
  typing-signals-smoke.mjs \
  call-controller-smoke.mjs \
  ice-servers-smoke.mjs \
  call-window-smoke.mjs \
  chess-controller-smoke.mjs \
  app-directory-smoke.mjs \
  identity-marks-smoke.mjs \
  direct-file-envelope-smoke.mjs \
  direct-file-chunks-smoke.mjs \
  direct-file-storage-smoke.mjs \
  direct-transfer-controller-smoke.mjs \
  direct-file-resume-smoke.mjs \
  image-viewer-smoke.mjs \
  chat-search-smoke.mjs \
  conversation-folders-smoke.mjs \
  chat-drafts-smoke.mjs \
  group-mentions-smoke.mjs \
  group-invites-smoke.mjs \
  community-groups-smoke.mjs \
  notification-preferences-smoke.mjs \
  local-moderation-smoke.mjs \
  app-badge-smoke.mjs \
  message-days-smoke.mjs \
  message-scroll-smoke.mjs \
  rich-text-smoke.mjs \
  location-cards-smoke.mjs \
  message-forwards-smoke.mjs \
  link-preview-smoke.mjs \
  voice-messages-smoke.mjs \
  audio-playback-smoke.mjs \
  file-transfers-smoke.mjs \
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
  relay-resource-limits-smoke.sh \
  offline/g09-rate-boundary-smoke.mjs \
  share-target-smoke.mjs \
  pwa-smoke.mjs \
  explore-feed-smoke.mjs \
  app-contract-smoke.mjs \
  relay-migration-smoke.mjs \
  portable-packages-smoke.mjs \
  release-sbom-purl-smoke.mjs \
  relay-package-smoke.mjs \
  agent-messaging-g0-smoke.mjs \
  agent-service-smoke.mjs \
  agent-messaging-smoke.mjs \
  agent-xno-trades-smoke.mjs \
  agent-trade-state-smoke.mjs \
  agent-trade-conversation-smoke.mjs \
  agent-trade-config-store-smoke.mjs \
  agent-vault-gcm-tag-smoke.mjs \
  agent-xno-escrow-smoke.mjs \
  agent-xno-threshold-smoke.mjs \
  agent-xno-threshold-store-smoke.mjs \
  agent-xno-threshold-protocol-smoke.mjs \
  agent-nano-wallet-smoke.mjs \
  agent-package-smoke.mjs \
  offline/agent-security-g5.mjs \
  offline/agent-mcp-contract-g5.mjs \
  offline/agent-mcp-tool-boundaries-g5.mjs \
  offline/runner-contract-smoke.mjs
do
  printf '\n== %s ==\n' "$test_file"
  if [[ "$test_file" == *.sh ]]; then
    bash "$TEST_DIR/$test_file"
  else
    node "$TEST_DIR/$test_file"
  fi
done

printf '\n== agent-package-smoke.sh ==\n'
bash "$TEST_DIR/agent-package-smoke.sh"

printf '\nPASS: suíte smoke local concluída.\n'
