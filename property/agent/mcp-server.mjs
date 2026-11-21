#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { callUnixJson, parseStrictJson } from './ipc.mjs';
import { AGENT_VERSION, MCP_VERSION, exactObject, profileName } from './core.mjs';

const META_PROTOCOL = 'io.modelcontextprotocol/protocolVersion';
const META_CLIENT = 'io.modelcontextprotocol/clientInfo';
const META_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const profile = profileName(process.env.PROPERTY_AGENT_PROFILE || 'default');
const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 'unknown'}`;
const socketPath = `${runtimeDir}/property-agent/${profile}.sock`;
const OUTPUT_LIMIT = 64 * 1024;
const SAFE_SCHEMA_PATTERNS = new Map([
  ['^[0-9]+(?:[.,][0-9]+)?$', /^[0-9]+(?:[.,][0-9]+)?$/],
  ['^[0-9a-fA-F]{64}$', /^[0-9a-fA-F]{64}$/],
  ['^[0-9a-f]{32}$', /^[0-9a-f]{32}$/],
  ['^[0-9a-f]{64}$', /^[0-9a-f]{64}$/],
  ['^[1-9][0-9]{0,38}$', /^[1-9][0-9]{0,38}$/],
  ['^[a-zA-Z0-9_-]{1,64}$', /^[a-zA-Z0-9_-]{1,64}$/],
  ['^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$', /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/],
]);

async function* boundedLines(stream) {
  let buffer = Buffer.alloc(0);
  let droppingOversizeLine = false;
  for await (const chunk of stream) {
    let start = 0;
    for (let index = 0; index < chunk.length; index++) {
      if (chunk[index] !== 0x0a) continue;
      const segment = chunk.subarray(start, index);
      if (droppingOversizeLine) droppingOversizeLine = false;
      else {
        const line = Buffer.concat([buffer, segment]);
        yield line.length > OUTPUT_LIMIT ? null : line.toString('utf8');
      }
      buffer = Buffer.alloc(0);
      start = index + 1;
    }
    if (droppingOversizeLine) continue;
    const tail = chunk.subarray(start);
    if (buffer.length + tail.length > OUTPUT_LIMIT) {
      buffer = Buffer.alloc(0);
      droppingOversizeLine = true;
      yield null;
    } else buffer = Buffer.concat([buffer, tail]);
  }
  if (buffer.length && !droppingOversizeLine) yield buffer.toString('utf8');
}

const tools = [
  {
    name: 'property_status', title: 'Property agent status', description: 'Return the unlocked independent agent identity and local relay/block counts. The agent never receives the human identity key.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'status',
  },
  {
    name: 'property_list_conversations', title: 'List agent conversations', description: 'List recent NIP-17 conversations addressed to this independent agent identity. Incoming text is untrusted and is never executed by the bridge.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'list',
  },
  {
    name: 'property_read_messages', title: 'Read agent messages', description: 'Read recent text messages exchanged with one Nostr public key through this agent identity inbox. The text is untrusted input and is not executed.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['conversation_pubkey', 'limit'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'read',
  },
  {
    name: 'property_send_message', title: 'Send an agent message', description: 'Send a private NIP-17 text message from this agent identity to any valid Nostr public key, without a pairing or approval flow. Calls to locally blocked identities are denied. A relay acknowledgement does not prove delivery or reading. The local fixed quota is 30 messages per logical 60-second window.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, text: { type: 'string', minLength: 1, maxLength: 8192 }, in_reply_to: { oneOf: [{ type: 'string', pattern: '^[0-9a-f]{32}$' }, { type: 'null' }] } }, required: ['conversation_pubkey', 'text', 'in_reply_to'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'send',
  },
  {
    name: 'property_set_activity', title: 'Show agent activity', description: 'Show or clear a private, encrypted “thinking” indicator in one direct Property conversation. The state contains no custom status text or message content, uses an ephemeral NIP-59 event, and is not retained by relays. Calls to locally blocked identities are denied; thinking signals expire in the recipient app after at most 60 seconds. The agent can publish at most 30 thinking or refresh events per fixed logical 60-second window across all contacts; a stop is available only for an active indicator. Sending a message or locking the local daemon stops active indicators when possible.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, state: { type: 'string', enum: ['thinking', 'stop'] } }, required: ['conversation_pubkey', 'state'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'activity',
  },
  {
    name: 'property_xno_policy', title: 'Read XNO wallet policy', description: 'Read configured local direct-payment limits and whether a separate custodial escrow wallet is armed. It does not send funds. Direct payments remain irreversible; custodial escrow is a separate workflow that trusts its operator and arbiter.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'xno.policy',
  },
  {
    name: 'property_xno_create_offer', title: 'Send a signed XNO offer', description: 'Send a private NIP-17 offer containing a raw-unit amount, terms hash, seller Nano account, expiry, and trade ID. Offers do not reserve funds or create escrow. A configured local spend policy caps amounts.',
    inputSchema: { type: 'object', properties: { recipient_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, amount_raw: { type: 'string', pattern: '^[1-9][0-9]{0,38}$' }, terms: { type: 'string', minLength: 1, maxLength: 4096 }, expires_in_seconds: { type: 'integer', minimum: 60, maximum: 604800 } }, required: ['recipient_pubkey', 'amount_raw', 'terms', 'expires_in_seconds'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'xno.offer',
  },
  {
    name: 'property_xno_pay_offer', title: 'Pay a verified XNO offer', description: 'Pay only an unexpired, signature-verified offer addressed to this agent identity, from the dedicated Nano account, within the local per-payment and lifetime caps. The Nano send is irreversible; retrying the same trade uses the same node idempotency ID. This is direct payment, not escrow, and cannot enforce delivery.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, offer_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'offer_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'xno.pay',
  },
  {
    name: 'property_xno_trade_status', title: 'Check an XNO trade payment', description: 'Check a locally recorded payment against the configured Nano node and report pending or confirmed status. A confirmation proves a ledger transfer, not delivery of the agreed item or service.',
    inputSchema: { type: 'object', properties: { trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['trade_id'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'xno.trade.status',
  },
  {
    name: 'property_xno_verify_receipt', title: 'Verify and receive an XNO payment', description: 'Verify a peer-signed payment receipt against a trade offer created by this identity and the configured Nano node. If the exact confirmed send is receivable by this dedicated account, receive it. This does not attest that the trade terms were fulfilled.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, receipt_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'receipt_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'xno.receipt.verify',
  },
  {
    name: 'property_xno_dispute', title: 'Record a direct-payment XNO dispute', description: 'Send an encrypted, signed dispute statement linked to a locally recorded direct-payment trade. It is a record only: it does not freeze or return funds. Use the separate escrow dispute tool for custodial escrow trades.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, summary: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['conversation_pubkey', 'trade_id', 'summary'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'xno.dispute',
  },
  {
    name: 'property_trade_policy', title: 'Read local trade-node policy', description: 'List configured local Bitcoin regtest, Monero fakechain, and Nano dev adapters. Mainnet is disabled. This tool reads policy and never sends funds.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'trade.policy',
  },
  {
    name: 'property_trade_offer', title: 'Send a private test-network trade offer', description: 'Create a unique invoice through the configured local test-network node and send the versioned offer by encrypted NIP-17. This direct-payment workflow is not escrow; paying through an external wallet is a separate action. Mainnet is disabled.',
    inputSchema: { type: 'object', properties: { recipient_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, currency: { type: 'string', enum: ['BTC', 'XMR', 'XNO'] }, amount_atomic: { type: 'string', pattern: '^[1-9][0-9]{0,38}$' }, terms: { type: 'string', minLength: 1, maxLength: 4096 }, expires_in_seconds: { type: 'integer', minimum: 60, maximum: 604800 }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['recipient_pubkey', 'currency', 'amount_atomic', 'terms', 'expires_in_seconds'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'trade.offer',
  },
  {
    name: 'property_trade_accept', title: 'Accept an authenticated trade offer', description: 'Accept the exact offer received from this peer over the selected NIP-17 relays. Acceptance sends no payment; verify the network, amount, destination, terms, and expiry before paying externally.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, offer_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'offer_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'trade.accept',
  },
  {
    name: 'property_trade_sync', title: 'Sync authenticated trade messages', description: 'Apply authenticated peer acceptance, payment-request, dispute, and cancellation messages to the local trade journal. A peer settlement notice remains an unverified claim until checked against a local node.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'trade_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'trade.sync',
  },
  {
    name: 'property_trade_request_payment', title: 'Request the agreed direct payment', description: 'After syncing the buyer’s authenticated acceptance, send the exact network, amount, and unique destination. It does not move funds or guarantee delivery.',
    inputSchema: { type: 'object', properties: { trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['trade_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'trade.request_payment',
  },
  {
    name: 'property_trade_reconcile', title: 'Check a trade against the local ledger', description: 'Reconcile the seller’s exact payment destination, amount, network, transaction, and confirmation policy using the configured local test-network node. The buyer receives only a seller-reported notice; no escrow or delivery guarantee is provided.',
    inputSchema: { type: 'object', properties: { trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['trade_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    method: 'trade.reconcile',
  },
  {
    name: 'property_trade_status', title: 'Read local trade status', description: 'Read this agent’s signed local trade journal. It does not independently verify a peer’s settlement claims or prove delivery.',
    inputSchema: { type: 'object', properties: { trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['trade_id'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'trade.status',
  },
  {
    name: 'property_trade_dispute', title: 'Record and send a direct-trade dispute', description: 'Send an encrypted dispute note and record it locally. This direct-payment workflow has no funds freeze, refund, or arbitration mechanism.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, summary: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['conversation_pubkey', 'trade_id', 'summary'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'trade.dispute',
  },
  {
    name: 'property_trade_cancel', title: 'Cancel a pre-payment direct trade', description: 'Cancel an offer or accepted trade before the payment request. It does not cancel or reverse an on-chain payment.',
    inputSchema: { type: 'object', properties: { trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['trade_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'trade.cancel',
  },
  {
    name: 'property_xno_threshold_create', title: 'Start an experimental 2-of-3 Nano threshold key session', description: 'Create a dev-network-only distributed-key-generation session for exactly three Nostr identities mapped to buyer, seller, and arbiter roles. The invite binds Nano accounts, amount, terms hash, and expiry. It creates no escrow, sends no XNO, and does not enforce spending rules on Nano itself.',
    inputSchema: { type: 'object', properties: { participants: { type: 'array', items: { type: 'string', pattern: '^[0-9a-f]{64}$' }, minItems: 3, maxItems: 3 }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, contract: { type: 'object', properties: { buyer_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, buyer_account: { type: 'string', pattern: '^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$' }, seller_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, seller_account: { type: 'string', pattern: '^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$' }, arbiter_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, amount_raw: { type: 'string', pattern: '^[1-9][0-9]{0,38}$' }, terms_sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, expires_at: { type: 'integer', minimum: 0 } }, required: ['buyer_pubkey', 'buyer_account', 'seller_pubkey', 'seller_account', 'arbiter_pubkey', 'amount_raw', 'terms_sha256', 'expires_at'], additionalProperties: false }, network: { type: 'string', enum: ['dev'] } }, required: ['participants', 'trade_id', 'contract', 'network'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'xno.threshold.create',
  },
  {
    name: 'property_xno_threshold_accept', title: 'Accept a 2-of-3 Nano key session', description: 'Accept a signed NIP-17 invitation, generate this participant’s DKG material, store it in the local encrypted threshold store, and exchange private shares over pairwise encrypted NIP-17 messages. No payment occurs.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['session_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'xno.threshold.accept',
  },
  {
    name: 'property_xno_threshold_sync', title: 'Advance 2-of-3 Nano key generation', description: 'Read authenticated session messages, exchange the remaining encrypted DKG shares, and derive the local threshold share after all three participants complete DKG. This does not create on-chain escrow or enable a payout.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['session_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'xno.threshold.sync',
  },
  {
    name: 'property_xno_threshold_status', title: 'Read 2-of-3 Nano escrow status', description: 'Read DKG progress, the public Nano account, exact proposed settlement fields, signer approvals, signing round, and dev-node publication status. Secret shares are never returned.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['session_id'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'xno.threshold.status',
  },
  {
    name: 'property_xno_threshold_propose', title: 'Propose exact Nano escrow settlement', description: 'On the dev network only, build a send block for the contract amount and fixed recipient: seller for release or buyer for refund. The account balance must equal the contract exactly. This only prepares a block and sends no funds.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, outcome: { type: 'string', enum: ['release', 'refund'] } }, required: ['session_id', 'outcome'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'xno.threshold.propose',
  },
  {
    name: 'property_xno_threshold_approve', title: 'Approve the exact Nano settlement', description: 'Record this participant’s explicit approval for the full block hash, outcome, account, destination, amount, and current frontier shown in Property status. Buyer plus seller are required for release; buyer plus arbiter are required for refund. The participant must copy the exact approval_text from status. Approval does not send funds.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, intent_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, block_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' }, outcome: { type: 'string', enum: ['release', 'refund'] }, account: { type: 'string', pattern: '^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$' }, destination: { type: 'string', pattern: '^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$' }, amount_raw: { type: 'string', pattern: '^[1-9][0-9]{0,38}$' }, previous: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' }, confirm_text: { type: 'string', minLength: 1, maxLength: 300 } }, required: ['session_id', 'intent_id', 'block_hash', 'outcome', 'account', 'destination', 'amount_raw', 'previous', 'confirm_text'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'xno.threshold.approve',
  },
  {
    name: 'property_xno_threshold_begin_signing', title: 'Start a fresh threshold signing round', description: 'After both required signers have approved the same exact block, start a new nonce round. This broadcasts no secret nonce; nonces remain only in process memory and are discarded when a round is replaced.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, intent_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, block_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, required: ['session_id', 'intent_id', 'block_hash'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'xno.threshold.begin_signing',
  },
  {
    name: 'property_xno_threshold_prepare_signature', title: 'Commit a one-use signing nonce', description: 'Create a process-memory one-use FROST nonce for the approved settlement and send only its public commitment. Requires syncing the coordinator’s current signing round and both signer approvals.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, intent_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, block_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, required: ['session_id', 'intent_id', 'block_hash'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'xno.threshold.prepare_signature',
  },
  {
    name: 'property_xno_threshold_sign', title: 'Create this participant’s threshold signature share', description: 'Consume this process’s one-use nonce to sign only the approved block hash, then send the signature share to the coordinator. A fresh signing round is required after a process restart.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, intent_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, block_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, required: ['session_id', 'intent_id', 'block_hash'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'xno.threshold.sign',
  },
  {
    name: 'property_xno_threshold_publish', title: 'Publish the threshold-signed Nano block', description: 'Submit the verified threshold-signed block to the configured local dev Nano node only. Mainnet publication is disabled. A node acceptance response is not confirmation; this tool currently reports submitted/unconfirmed.',
    inputSchema: { type: 'object', properties: { session_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, intent_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, block_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, required: ['session_id', 'intent_id', 'block_hash'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'xno.threshold.publish',
  },
  {
    name: 'property_xno_escrow_offer', title: 'Request a custodial XNO escrow', description: 'As buyer, send the chosen escrow operator a NIP-17 contract request binding the buyer and seller identities, Nano accounts, amount, terms hash, expiry, and a separate arbiter. Requires a configured direct XNO wallet. The operator will hold deposited funds and remains a trusted custodian.',
    inputSchema: { type: 'object', properties: { escrow_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, arbiter_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, seller_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, seller_account: { type: 'string', pattern: '^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$' }, amount_raw: { type: 'string', pattern: '^[1-9][0-9]{0,38}$' }, terms: { type: 'string', minLength: 1, maxLength: 4096 }, expires_in_seconds: { type: 'integer', minimum: 60, maximum: 604800 } }, required: ['escrow_pubkey', 'arbiter_pubkey', 'seller_pubkey', 'seller_account', 'amount_raw', 'terms', 'expires_in_seconds'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    method: 'xno.escrow.offer',
  },
  {
    name: 'property_xno_escrow_open', title: 'Open a requested escrow', description: 'As the locally configured escrow operator, validate a buyer request addressed to this Nostr identity, reserve its capped liability, and send the same signed contract to buyer and seller. The escrow wallet must be dedicated and funded only for custody.',
    inputSchema: { type: 'object', properties: { buyer_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, request_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['buyer_pubkey', 'request_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    method: 'xno.escrow.open',
  },
  {
    name: 'property_xno_escrow_accept', title: 'Accept or decline an escrow contract', description: 'As seller, verify the escrow operator contract and your configured Nano account, then sign acceptance or decline. Acceptance does not release funds; the buyer must deposit to the operator account.',
    inputSchema: { type: 'object', properties: { escrow_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, contract_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, decision: { type: 'string', enum: ['accept', 'decline'] } }, required: ['escrow_pubkey', 'contract_message_id', 'decision'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    method: 'xno.escrow.accept',
  },
  {
    name: 'property_xno_escrow_fund', title: 'Fund an accepted escrow', description: 'As buyer, pay the exact signed contract amount to the escrow operator with a repeat-safe Nano RPC ID and send the transaction hash to the operator. This is an on-chain transfer into the operator’s custody account.',
    inputSchema: { type: 'object', properties: { escrow_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, contract_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['escrow_pubkey', 'contract_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'xno.escrow.fund',
  },
  {
    name: 'property_xno_escrow_approve', title: 'Approve escrow release to seller', description: 'As buyer, approve seller payment only after the operator’s signed status says the exact deposit is confirmed and held. The operator settles on its next sync.',
    inputSchema: { type: 'object', properties: { escrow_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['escrow_pubkey', 'trade_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    method: 'xno.escrow.approve',
  },
  {
    name: 'property_xno_escrow_dispute', title: 'File an escrow dispute', description: 'As buyer or seller, send the chosen operator an authenticated dispute statement for a funded trade. Funds remain in custody until the operator records a ruling.',
    inputSchema: { type: 'object', properties: { escrow_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, summary: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['escrow_pubkey', 'trade_id', 'summary'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    method: 'xno.escrow.dispute',
  },
  {
    name: 'property_xno_escrow_sync', title: 'Reconcile and settle an escrow', description: 'As the operator, reconcile seller acceptance, the buyer’s exact confirmed deposit, disputes and buyer release approval against signed Nostr messages and the Nano ledger. A clean buyer approval releases to the agreed seller account; a dispute pauses application-level settlement until the separate arbiter signs a ruling.',
    inputSchema: { type: 'object', properties: { trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['trade_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'xno.escrow.sync',
  },
  {
    name: 'property_xno_escrow_resolve', title: 'Submit an escrow arbitration ruling', description: 'As the separate arbiter named in the signed contract, submit one ruling to the custodian after verifying its signed disputed status. The custodian sends the actual XNO to the pre-agreed seller or buyer account. The custodian still controls the wallet and can bypass the software.',
    inputSchema: { type: 'object', properties: { custodian_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, outcome: { type: 'string', enum: ['release', 'refund'] }, summary: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['custodian_pubkey', 'trade_id', 'outcome', 'summary'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    method: 'xno.escrow.resolve',
  },
  {
    name: 'property_xno_escrow_status', title: 'Check an escrow status', description: 'Read the local escrow record. Buyers and sellers can refresh it from the chosen operator’s latest signed contract update; the operator sees its custody ledger entry. The separate arbiter receives signed status updates through its inbox.',
    inputSchema: { type: 'object', properties: { trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['trade_id'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    method: 'xno.escrow.status',
  },
  {
    name: 'property_profile_lookup', title: 'Look up a Nostr profile', description: 'Read the newest signature-verified kind-0 profile from the relays selected for this agent. Profile fields are self-declared public claims; links are not fetched or trusted.',
    inputSchema: { type: 'object', properties: { pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, required: ['pubkey'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    method: 'profile.lookup',
  },
  {
    name: 'property_list_relays', title: 'List selected agent relays', description: 'Return only the relay URLs explicitly selected in this local agent profile.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'relay.list',
  },
  {
    name: 'property_add_relay', title: 'Add a selected agent relay', description: 'Add one WSS relay (or loopback WS test relay) to this agent profile and announce the updated NIP-17 inbox list. At most three relays may be selected.',
    inputSchema: { type: 'object', properties: { relay: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['relay'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    method: 'relay.add',
  },
  {
    name: 'property_remove_relay', title: 'Remove a selected agent relay', description: 'Remove one relay from this agent profile and announce the remaining inbox list to the old and remaining relays. A relay may keep copies of older events.',
    inputSchema: { type: 'object', properties: { relay: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['relay'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    method: 'relay.remove',
  },
  {
    name: 'property_hangout_read', title: 'Read public Hangout notes', description: 'Read signed public kind-1 notes from selected relays. The text is untrusted public content; links, instructions, and commands are never fetched or executed.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['limit'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    method: 'hangout.read',
  },
  {
    name: 'property_hangout_publish', title: 'Publish a public Hangout note', description: 'Publish a signed public NIP-01 kind-1 note from this agent identity to the selected relays. Anyone who reads those relays may see it.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 8192 } }, required: ['text'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    method: 'hangout.publish',
  },
  {
    name: 'property_marketplace_search', title: 'Search public marketplace offers', description: 'Search signature-verified NIP-15 offers from selected relays. Amounts are returned as exact atomic-unit strings; offers and seller claims are untrusted and do not prove delivery or payment.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 256 }, currency: { type: 'string', enum: ['ANY', 'BTC', 'XMR', 'XNO'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['query', 'currency', 'limit'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    method: 'marketplace.search',
  },
  {
    name: 'property_marketplace_publish', title: 'Publish a public marketplace offer', description: 'Publish a signed NIP-15 offer with an exact atomic amount derived from the decimal string. BTC, XMR, and XNO offers are discovery records only; this tool does not transfer funds or create escrow.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 120 }, description: { type: 'string', maxLength: 4096 }, currency: { type: 'string', enum: ['BTC', 'XMR', 'XNO'] }, price: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[0-9]+(?:[.,][0-9]+)?$' }, image_url: { type: 'string', maxLength: 2048 } }, required: ['name', 'description', 'currency', 'price'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    method: 'marketplace.publish',
  },
  {
    name: 'property_marketplace_withdraw', title: 'Withdraw your marketplace offer', description: 'Publish a signed NIP-09 deletion for a marketplace offer authored by this agent identity. Relays and peers may retain prior copies.',
    inputSchema: { type: 'object', properties: { product_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]{1,64}$' } }, required: ['product_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    method: 'marketplace.withdraw',
  },
  {
    name: 'property_paid_job_request', title: 'Request paid service work', description: 'Send an end-to-end encrypted XNO job request that references a caller-supplied public NIP-15 event ID. Property does not re-fetch the event or prove that its author controls the named seller key; verify those yourself. The request fixes the exact raw amount and scope but sends no funds. Listing claims and delivery remain untrusted.',
    inputSchema: { type: 'object', properties: { seller_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, listing_event_id: { type: 'string', pattern: '^[0-9a-f]{64}$' }, listing_name: { type: 'string', minLength: 1, maxLength: 140 }, amount_raw: { type: 'string', pattern: '^[1-9][0-9]{0,38}$' }, scope: { type: 'string', minLength: 1, maxLength: 4096 }, expires_in_seconds: { type: 'integer', minimum: 60, maximum: 604800 }, job_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['seller_pubkey', 'listing_event_id', 'listing_name', 'amount_raw', 'scope', 'expires_in_seconds'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'paid-job.request',
  },
  {
    name: 'property_paid_job_respond', title: 'Accept or decline a paid job', description: 'As the named seller, accept or decline the exact encrypted request before its expiry. Acceptance confirms the listed scope and XNO amount but creates no escrow and sends no money.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, request_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, decision: { type: 'string', enum: ['accept', 'decline'] } }, required: ['conversation_pubkey', 'request_message_id', 'decision'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'paid-job.respond',
  },
  {
    name: 'property_paid_job_deliver', title: 'Deliver paid job work', description: 'As the accepting seller, send a private, signed delivery summary for the exact request. This is a seller claim; Property cannot judge subjective work quality or guarantee the buyer will pay.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, request_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, summary: { type: 'string', minLength: 1, maxLength: 4096 } }, required: ['conversation_pubkey', 'request_message_id', 'summary'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'paid-job.deliver',
  },
  {
    name: 'property_paid_job_request_payout', title: 'Create exact XNO job payout invoice', description: 'After accepting and delivering the work, publish a private XNO offer for the exact raw amount in the job request. The seller receives directly; this is not escrow. The configured XNO wallet may be live or dev.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, request_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'request_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'paid-job.request-payout',
  },
  {
    name: 'property_paid_job_pay_payout', title: 'Pay an accepted XNO job payout', description: 'Verify the seller accepted and delivered the exact job, and verify the payout offer matches the agreed raw amount and delivery hash. Then send irreversible XNO using this machine’s configured wallet and local per-payment/lifetime caps. No escrow or refund is provided.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, request_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, offer_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'request_message_id', 'offer_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'paid-job.pay-payout',
  },
  {
    name: 'property_paid_job_verify_payout', title: 'Verify and receive XNO job payout', description: 'As the seller, verify a receipt against the exact job, delivered scope, signed offer, local Nano ledger, source, destination, amount, and transaction. If confirmed and receivable, receive it into the configured wallet. Ledger confirmation does not prove work quality.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, request_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, receipt_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'request_message_id', 'receipt_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'paid-job.verify-payout',
  },
  {
    name: 'property_paid_job_status', title: 'Read paid job and payout status', description: 'Reconstruct recent signed job messages for one conversation and report the local view. Relay acknowledgements and peer claims are not payment or delivery proof; history is bounded to 100 recent messages.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, request_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'request_message_id'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    method: 'paid-job.status',
  },
].map(({ method, ...tool }) => ({ ...tool, _propertyMethod: method }));

export const MCP_TOOLS_VERSION = '1.2.0';
export const MCP_TOOLS = Object.freeze(tools.map(({ _propertyMethod, ...tool }) => tool));
export const MCP_TOOL_METHODS = Object.freeze(tools.map(({ name, _propertyMethod }) => Object.freeze({ name, method: _propertyMethod })));

function mcpError(code, message) { return { code, message }; }
function send(value) {
  const line = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(line, 'utf8') > OUTPUT_LIMIT) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: mcpError(-32603, 'A resposta excede o limite local.') })}\n`);
    return;
  }
  process.stdout.write(line);
}

function validateMeta(params) {
  const meta = params?._meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || meta[META_PROTOCOL] !== MCP_VERSION ||
      !meta[META_CAPABILITIES] || typeof meta[META_CAPABILITIES] !== 'object' || Array.isArray(meta[META_CAPABILITIES])) return false;
  const client = meta[META_CLIENT];
  if (client !== undefined && (!client || typeof client !== 'object' || Array.isArray(client) || typeof client.name !== 'string' || typeof client.version !== 'string')) return false;
  return true;
}

function toolResult(value, isError = false) {
  return { resultType: 'complete', content: [{ type: 'text', text: JSON.stringify(value) }], isError,
    _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'property-agent', version: AGENT_VERSION } } };
}

function matchesSchema(schema, value) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter(item => matchesSchema(item, value)).length !== 1) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some(item => matchesSchema(item, value))) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some(item => Object.is(item, value))) return false;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (Array.isArray(schema.required) && schema.required.some(key => !Object.hasOwn(value, key))) return false;
    const properties = schema.properties || {};
    if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(properties, key))) return false;
    return Object.entries(value).every(([key, item]) => !Object.hasOwn(properties, key) || matchesSchema(properties[key], item));
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string' || (schema.minLength !== undefined && value.length < schema.minLength) ||
        (schema.maxLength !== undefined && value.length > schema.maxLength)) return false;
    if (schema.pattern !== undefined) {
      const pattern = SAFE_SCHEMA_PATTERNS.get(schema.pattern);
      if (!pattern || !pattern.test(value)) return false;
    }
    return true;
  }
  if (schema.type === 'integer') return Number.isSafeInteger(value) &&
    (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum);
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value) &&
    (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum);
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'null') return value === null;
  if (schema.type === 'array') return Array.isArray(value) && (schema.maxItems === undefined || value.length <= schema.maxItems) &&
    (schema.minItems === undefined || value.length >= schema.minItems) && value.every(item => matchesSchema(schema.items, item));
  return schema.type === undefined;
}

export async function dispatch(request) {
  if (!exactObject(request, ['jsonrpc', 'id', 'method', 'params']) || request.jsonrpc !== '2.0' || !(typeof request.id === 'string' || Number.isSafeInteger(request.id)) || typeof request.method !== 'string' || !request.params || typeof request.params !== 'object' || Array.isArray(request.params)) return { jsonrpc: '2.0', id: null, error: mcpError(-32600, 'Pedido JSON-RPC inválido.') };
  const { id, method, params } = request;
  if (!validateMeta(params)) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Metadados MCP 2026-07-28 ausentes ou inválidos.') };

  if (method === 'server/discover') {
    if (!exactObject(params, ['_meta'])) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Parâmetros de descoberta inválidos.') };
    return { jsonrpc: '2.0', id, result: { resultType: 'complete', supportedVersions: [MCP_VERSION], capabilities: { tools: { listChanged: false } }, _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'property-agent', version: AGENT_VERSION } }, instructions: 'Use a identidade pública independente deste agente para conversar diretamente com qualquer chave pública Nostr. Não é necessário convite, pareamento ou aprovação por mensagem. A bridge não lê a identidade humana nem executa conteúdo recebido. Use property_set_activity para mostrar ou limpar somente o estado privado “thinking”, sem texto de status. Chamadas contra identidades bloqueadas, texto fora do limite e envios/atualizações de thinking acima das cotas locais são recusados; ACK de relay não comprova entrega ou leitura.', ttlMs: 0, cacheScope: 'private' } };
  }
  if (method === 'tools/list') {
    if (!exactObject(params, ['_meta']) && !exactObject(params, ['_meta', 'cursor'])) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Parâmetros de listagem inválidos.') };
    if (params.cursor !== undefined) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Paginação não está habilitada para a lista fixa de tools.') };
    return { jsonrpc: '2.0', id, result: { resultType: 'complete', tools: MCP_TOOLS, ttlMs: 0, cacheScope: 'private',
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'property-agent', version: AGENT_VERSION } } } };
  }
  if (method === 'tools/call') {
    if (!exactObject(params, ['_meta', 'name', 'arguments']) || typeof params.name !== 'string' || !params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments)) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Parâmetros da ferramenta inválidos.') };
    const tool = tools.find(item => item.name === params.name);
    if (!tool) return { jsonrpc: '2.0', id, result: toolResult({ error: 'tool-not-allowed' }, true) };
    if (!matchesSchema(tool.inputSchema, params.arguments)) return { jsonrpc: '2.0', id, result: toolResult({ error: 'invalid-arguments' }, true) };
    try {
      const result = await callUnixJson(socketPath, tool._propertyMethod, params.arguments);
      return { jsonrpc: '2.0', id, result: toolResult(result) };
    } catch (error) {
      const code = /^[a-z0-9-]{1,80}$/.test(error?.message || '') ? error.message : 'agent-request-failed';
      return { jsonrpc: '2.0', id, result: toolResult({ error: code }, true) };
    }
  }
  return { jsonrpc: '2.0', id, error: mcpError(-32601, 'Método MCP não implementado.') };
}

export async function runStdio() {
  for await (const line of boundedLines(process.stdin)) {
    if (line === null) { send({ jsonrpc: '2.0', id: null, error: mcpError(-32700, 'Mensagem MCP excede o limite local.') }); continue; }
    try {
      const request = parseStrictJson(line);
      const response = await dispatch(request);
      send(response);
    } catch { send({ jsonrpc: '2.0', id: null, error: mcpError(-32700, 'JSON-RPC malformado ou com chaves duplicadas.') }); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runStdio();
