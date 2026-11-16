#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmptyConfig } from '../../agent/core.mjs';
import { MCP_TOOLS, MCP_TOOL_METHODS } from '../../agent/mcp-server.mjs';
import { AgentService } from '../../agent/service.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = 'a'.repeat(64);
const READ_ONLY = new Set([
  'property_status', 'property_list_conversations', 'property_read_messages', 'property_xno_policy',
  'property_xno_trade_status', 'property_xno_threshold_status', 'property_xno_escrow_status',
  'property_trade_policy', 'property_trade_status', 'property_profile_lookup', 'property_list_relays',
  'property_hangout_read', 'property_marketplace_search',
]);
const READ_ONLY_EMPTY_ARGUMENTS = new Set(['property_status', 'property_list_conversations', 'property_xno_policy', 'property_trade_policy', 'property_list_relays']);
const EXPECTED_FAILURE = new Map([
  ['read', 'invalid-arguments'], ['send', 'invalid-arguments'], ['activity', 'invalid-arguments'],
  ['xno.offer', 'xno-wallet-not-configured'], ['xno.pay', 'xno-wallet-not-configured'],
  ['xno.trade.status', 'xno-wallet-not-configured'], ['xno.receipt.verify', 'xno-wallet-not-configured'],
  ['xno.dispute', 'xno-wallet-not-configured'],
  ['xno.threshold.create', 'xno-threshold-not-configured'], ['xno.threshold.accept', 'xno-threshold-not-configured'],
  ['xno.threshold.sync', 'xno-threshold-not-configured'], ['xno.threshold.status', 'xno-threshold-not-configured'],
  ['xno.threshold.propose', 'xno-threshold-not-configured'], ['xno.threshold.approve', 'xno-threshold-not-configured'],
  ['xno.threshold.begin_signing', 'xno-threshold-not-configured'], ['xno.threshold.prepare_signature', 'xno-threshold-not-configured'],
  ['xno.threshold.sign', 'xno-threshold-not-configured'], ['xno.threshold.publish', 'xno-threshold-not-configured'],
  ['trade.offer', 'trade-test-network-node-not-configured'], ['trade.accept', 'trade-test-network-node-not-configured'],
  ['trade.sync', 'trade-test-network-node-not-configured'], ['trade.request_payment', 'trade-test-network-node-not-configured'],
  ['trade.reconcile', 'trade-test-network-node-not-configured'], ['trade.status', 'trade-test-network-node-not-configured'],
  ['trade.dispute', 'trade-test-network-node-not-configured'], ['trade.cancel', 'trade-test-network-node-not-configured'],
  ['xno.escrow.offer', 'xno-escrow-not-configured'], ['xno.escrow.open', 'xno-escrow-not-configured'],
  ['xno.escrow.accept', 'xno-escrow-not-configured'], ['xno.escrow.fund', 'xno-escrow-not-configured'],
  ['xno.escrow.approve', 'xno-escrow-not-configured'], ['xno.escrow.dispute', 'xno-escrow-not-configured'],
  ['xno.escrow.sync', 'xno-escrow-not-configured'], ['xno.escrow.resolve', 'xno-escrow-not-configured'],
  ['xno.escrow.status', 'xno-escrow-not-configured'],
  ['profile.lookup', 'invalid-arguments'], ['relay.add', 'invalid-arguments'], ['relay.remove', 'invalid-arguments'],
  ['hangout.read', 'invalid-arguments'], ['hangout.publish', 'invalid-arguments'],
  ['marketplace.search', 'invalid-arguments'], ['marketplace.publish', 'invalid-arguments'], ['marketplace.withdraw', 'invalid-arguments'],
]);

assert.equal(MCP_TOOLS.length, 48);
assert.equal(MCP_TOOL_METHODS.length, MCP_TOOLS.length);
assert.deepEqual(new Set(MCP_TOOL_METHODS.map(item => item.name)), new Set(MCP_TOOLS.map(item => item.name)));
assert.equal(new Set(MCP_TOOL_METHODS.map(item => item.method)).size, MCP_TOOL_METHODS.length, 'every MCP tool maps to one unique local service method');

const config = createEmptyConfig(SELF);
let sideEffects = 0;
let reads = 0;
const transport = {
  inboxRelays: [],
  async listConversations() { reads++; return []; },
  async sendMessage() { sideEffects++; throw new Error('unexpected-write'); },
  async sendActivity() { sideEffects++; throw new Error('unexpected-write'); },
  async announceInboxRelays() { sideEffects++; throw new Error('unexpected-write'); },
  async publishHangout() { sideEffects++; throw new Error('unexpected-write'); },
  async publishMarketplaceProduct() { sideEffects++; throw new Error('unexpected-write'); },
  async withdrawMarketplaceProduct() { sideEffects++; throw new Error('unexpected-write'); },
  context: { PropertyMarketplace: { parsePrice() { throw new Error('invalid-arguments'); }, safeExternalImageUrl() { return ''; } } },
};
const service = new AgentService({ pubkey: SELF, loadConfig: async () => config, saveConfig: async () => { sideEffects++; }, transport });
const results = [];
for (const { name, method } of MCP_TOOL_METHODS) {
  const tool = MCP_TOOLS.find(item => item.name === name);
  const isReadOnly = READ_ONLY.has(name);
  assert.equal(tool.annotations.readOnlyHint, isReadOnly, `${name} read-only annotation matches its declared boundary`);
  let outcome;
  try {
    await service.dispatch(method, {});
    outcome = { result: 'READ_ONLY_EMPTY_REQUEST_ACCEPTED' };
  } catch (error) {
    outcome = { error: error.message };
  }
  if (READ_ONLY_EMPTY_ARGUMENTS.has(name)) {
    assert.equal(outcome.error, undefined, `${name} is usable without mutation inputs`);
    assert.equal(outcome.result, 'READ_ONLY_EMPTY_REQUEST_ACCEPTED');
  } else {
    const expected = EXPECTED_FAILURE.get(method) ?? (isReadOnly ? 'invalid-arguments' : undefined);
    assert.ok(expected, `${name} declares an expected failure boundary`);
    assert.equal(outcome.error, expected, `${name} fails closed before its side-effect boundary`);
    assert.equal(outcome.result, undefined);
  }
  results.push({ name, method, read_only: isReadOnly, outcome: outcome.error || 'read-only result', failure_case: outcome.error || null });
}
await service.close();
assert.equal(reads, 1, 'only the read-only conversation-list operation queried the fixture transport');
assert.equal(sideEffects, 0, 'no mutation, network write, wallet action, or configuration write was reached');

const evidenceDir = path.join(ROOT, 'docs/evidence/product-completion/G5');
await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
await chmod(evidenceDir, 0o700);
const report = {
  result: 'PASS', operating_system: `${os.platform()}/${os.arch()}`, tool_count: MCP_TOOLS.length,
  unique_service_dispatches: MCP_TOOL_METHODS.length, read_only_annotations_checked: MCP_TOOLS.length,
  fail_closed_cases: results.filter(item => item.failure_case).length,
  write_side_effects: sideEffects, read_queries: reads,
  cases: results,
};
await writeFile(path.join(evidenceDir, 'agent-mcp-tool-boundaries.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report)}\n`);
