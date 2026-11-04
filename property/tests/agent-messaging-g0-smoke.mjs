import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const snapshots = [
  ['property/docs/protocol-snapshots/nostr/17.md', '23fde73a4cf28f120523cd278037f0b8e4d4f84a', '7aa9c3a9c0458a9552c4be2f3bf17f7ec60a4afe88bce7977f03500a7873a64c'],
  ['property/docs/protocol-snapshots/nostr/44.md', '47b89906fc1a9d1685028104cebf81b4cc7044e9', 'b5f89374e4e1dbdee7881e8573b4313b6a89430a9c8d518471599ae0660cf0e2'],
  ['property/docs/protocol-snapshots/nostr/59.md', 'c831e10ee47286b9af42d11c733b42b66a30461f', 'b46b078ff5b219fd4ab33a53b479b49d4cbd604b88be46d6b978d53d8f8b43a0'],
  ['property/docs/protocol-snapshots/nostr/89.md', '3feafc5fac929fb8ff86c84304641bfc8a2118cc', '700b1b3706e423f590eb381d21fc2be61b29304ddcbfe398dcd7525056913396'],
  ['property/docs/protocol-snapshots/nostr/90.md', 'a6ea3bcdfb912aa010f2c70815dec4a86fe435ca', 'a82714bac7563cecf7cdb17e83dc60ebea25d06159e826b3bde9c361c28414bb'],
  ['property/docs/protocol-snapshots/mcp/stdio.mdx', 'b03ac10081d7a7a92516b5b074e4c843bc75d473', '6fd49766c40dc093d1f5993ab584bad0a06cbb496c2d3019c50f8fe3c8171e57'],
  ['property/docs/protocol-snapshots/mcp/tools.mdx', '7813b8c37b83198289fd816063b1e6d3bc727315', '65ae4ba35373803023b5dedbe3b7b5726f84acc8391ad6ef64386b4fbec46abf'],
  ['property/docs/protocol-snapshots/mcp/discover.mdx', 'f6fc1acf974819d99338d2be25ad953fcb9e57a6', '3fe1f5b5f1528014216b1e49cc3363b3c689c36bcb80a6957ddca6a04cea409c'],
  ['property/docs/protocol-snapshots/mcp/security_best_practices.mdx', 'fd302d767c2eaefa49559d60af77282cbb22b5e5', 'af9bff2dab1b05f2f6df00156fe0a1154e5db874c08153f77cec569d07c0542e'],
  ['property/docs/protocol-snapshots/mcp/LICENSE.md', '4a93985763241755401a10678395303de4e720ba', '0382b0057770ca05e9c350a50aa3b1c1fea84da0bc81d723bf00b9aa841be58a']
];

let passed = 0;
for (const [relativePath, expectedBlob, expectedSha256] of snapshots) {
  const bytes = await readFile(resolve(ROOT, relativePath));
  const blob = createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes])).digest('hex');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(blob, expectedBlob, relativePath + ' must match its pinned upstream Git blob');
  assert.equal(sha256, expectedSha256, relativePath + ' must match its recorded SHA-256');
  passed += 1;
}

const nip17 = await readFile(resolve(ROOT, 'property/docs/protocol-snapshots/nostr/17.md'), 'utf8');
assert.match(nip17, /kind:1059/);
assert.ok(/10050/.test(nip17), 'NIP-17 snapshot must define the inbox relay list');
assert.match(nip17, /NIP-44/);
assert.match(nip17, /NIP-59/);
passed += 1;

const nip90 = await readFile(resolve(ROOT, 'property/docs/protocol-snapshots/nostr/90.md'), 'utf8');
assert.ok(/unrecommended/.test(nip90), 'NIP-90 snapshot status must be checked');
passed += 1;

const mcpTools = await readFile(resolve(ROOT, 'property/docs/protocol-snapshots/mcp/tools.mdx'), 'utf8');
assert.ok(/human in the loop/.test(mcpTools), 'MCP tools must retain human-in-the-loop guidance');
assert.ok(/tools\/call/.test(mcpTools), 'MCP tools snapshot must include calls');
passed += 1;

const mcpStdio = await readFile(resolve(ROOT, 'property/docs/protocol-snapshots/mcp/stdio.mdx'), 'utf8');
assert.ok(/reads JSON-RPC messages from/.test(mcpStdio), 'MCP stdio must read protocol messages');
assert.ok(/MUST NOT\*\* write anything to its/.test(mcpStdio) && /stdout/.test(mcpStdio), 'MCP stdio stdout must remain protocol-only');
passed += 1;

const adr = await readFile(resolve(ROOT, 'property/docs/agent-messaging-g0.md'), 'utf8');
for (const required of ['NIP-17', 'NIP-44 v2', 'NIP-59', '2026-07-28', 'without invitations', 'block or unblock an agent identity', 'G1 still requires sessions with real people']) assert.ok(adr.includes(required), 'G0 ADR must retain decision: ' + required);
passed += 1;

const html = await readFile(resolve(ROOT, 'property/web/index.html'), 'utf8');
const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
assert.ok(scriptTags.length > 0, 'PWA shell must declare its local scripts');
assert.ok(scriptTags.every(src => src.startsWith('./') && !/^https?:/i.test(src)), 'PWA must not load executable scripts from remote URLs');
passed += 1;

const vendor = await readFile(resolve(ROOT, 'property/web/vendor/nostr-tools-2.25.2.bundle.js'));
assert.equal(createHash('sha256').update(vendor).digest('hex'), 'a7c4846fde84a0d6ce7596f3fcfc88435d29fdcd616887205ab97f9a16bc6407');
passed += 1;

console.log('PASS: G0 protocol snapshots, exact hashes, required protocol semantics, local script sources, and vendored Nostr runtime (' + passed + ' fixed cases; 38 exact assertions).');
