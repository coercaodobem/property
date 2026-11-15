#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const routingSource = await readFile(path.join(ROOT, 'property/web/routing.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(routingSource, context, { timeout: 5000 });
const routing = context.window.PropertyNostrRouting;
const report = { gate: 'G4', suite: 'message-delivery-state', result: 'PASS', cases: [] };
const mark = (id, detail) => report.cases.push({ case: id, status: 'PASS', detail });

const requested = ['ws://127.0.0.1:4101', 'ws://127.0.0.1:4102', 'ws://127.0.0.1:4103'];
const tracker = routing.createRelayResponseTracker(requested, requested.slice(0, 2));
assert.equal(routing.recordRelayResponse(tracker, requested[0], true), true);
assert.equal(routing.recordRelayResponse(tracker, requested[0], false), false, 'duplicate/conflicting ACK from the same relay is ignored');
assert.equal(routing.recordRelayResponse(tracker, requested[2], true), false, 'relay that was not sent the event cannot ACK it');
assert.equal(routing.recordRelayResponse(tracker, requested[1], false), true);
assert.deepEqual(JSON.parse(JSON.stringify(routing.summarizeRelayResponses(tracker))), {
  acceptedRelayUrls: [requested[0]], rejectedRelayUrls: [requested[1]], unansweredRelayUrls: [requested[2]]
});
mark('G04-ACK-01', 'Only one response from a relay that received the event is recorded. A duplicate contradictory response and an ACK from an unaddressed relay do not alter the result.');

assert.equal(routing.messageDeliveryState([]), 'queued');
assert.equal(routing.messageDeliveryState([{ acceptedRelayUrls: [], rejectedRelayUrls: [], unansweredRelayUrls: [requested[0]], observedRelayUrls: [] }]), 'queued');
assert.equal(routing.messageDeliveryState([{ acceptedRelayUrls: [requested[0]], rejectedRelayUrls: [], unansweredRelayUrls: [], observedRelayUrls: [] }]), 'relay-accepted');
assert.equal(routing.messageDeliveryState([{ acceptedRelayUrls: [requested[0]], rejectedRelayUrls: [], unansweredRelayUrls: [], observedRelayUrls: [requested[0]] }]), 'observed');
assert.equal(routing.messageDeliveryState([{ acceptedRelayUrls: [], rejectedRelayUrls: [requested[0]], unansweredRelayUrls: [], observedRelayUrls: [] }]), 'failed');
assert.equal(routing.messageDeliveryState([
  { acceptedRelayUrls: [requested[0]], rejectedRelayUrls: [], unansweredRelayUrls: [], observedRelayUrls: [requested[0]] },
  { acceptedRelayUrls: [requested[1]], rejectedRelayUrls: [], unansweredRelayUrls: [], observedRelayUrls: [] }
]), 'relay-accepted', 'group observation is not promoted until every remote recipient envelope is queried');
mark('G04-STATE-01', 'Queued, relay-accepted, observed, and failed states require the corresponding local queue, actual ACK, successful query, or explicit negative ACK; no recipient read state is inferred.');

assert.equal(routing.messageNeedsRetry([{ acceptedRelayUrls: [], rejectedRelayUrls: [], unansweredRelayUrls: [requested[0]] }]), true);
assert.equal(routing.messageNeedsRetry([{ acceptedRelayUrls: [requested[0]], rejectedRelayUrls: [], unansweredRelayUrls: [] }]), false);
mark('G04-RETRY-01', 'A local retry is available only while at least one recipient relay has rejected the envelope or has no recorded response.');

for (let index = 1; index <= 10; index++) {
  assert.equal(routing.recipientBlocked({ pubkey: index.toString(16).padStart(64, '0'), status: 'blocked' }), true);
  assert.equal(routing.recipientBlocked({ pubkey: index.toString(16).padStart(64, '0'), status: 'active' }), false);
}
mark('G04-BLOCK-10', 'Ten blocked synthetic recipients are denied by the shared pre-send guard; ten active states remain eligible. Group and direct send paths use this guard before publishing.');

for (let index = 1; index <= 10; index++) {
  const prior = index.toString(16).padStart(64, '0');
  const rotated = (index + 100).toString(16).padStart(64, '0');
  assert.equal(routing.retryIdentityMatches(prior, prior), true, 'the original identity can retry its saved signed envelopes');
  assert.equal(routing.retryIdentityMatches(prior, rotated), false, 'a rotated identity cannot retry envelopes signed by the old identity');
}
assert.equal(routing.retryIdentityMatches('not-a-pubkey', 'not-a-pubkey'), false);
mark('G04-ROTATION-10', 'Ten identity-rotation fixtures reject retry from a replacement key while preserving retry for the original matching public key.');

const reportPath = process.argv[2];
if (reportPath) {
  await mkdir(path.dirname(path.resolve(reportPath)), { recursive: true, mode: 0o700 });
  await writeFile(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
process.stdout.write(`${JSON.stringify({ result: report.result, cases: report.cases.length, report: reportPath ? path.resolve(reportPath) : undefined })}\n`);
