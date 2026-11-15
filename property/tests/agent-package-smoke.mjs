import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_TOOLS, MCP_TOOLS_VERSION } from '../agent/mcp-server.mjs';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(PROPERTY_ROOT, 'agent/manifest.json'), 'utf8'));
const packageFiles = ['property-agent.mjs', 'bin/property-agent', 'mcp-server.mjs', 'daemon.mjs', 'core.mjs', 'service.mjs', 'relay.mjs', 'ipc.mjs', 'protocol-contract.mjs', 'store.mjs', 'vault.mjs', 'nano-wallet.mjs', 'xno-trades.mjs', 'xno-journal.mjs', 'xno-escrow.mjs', 'xno-threshold.mjs', 'xno-threshold-store.mjs', 'xno-threshold-protocol.mjs', 'agent-messaging.js', 'typing-signals.js', 'vendor/nostr-tools-2.25.2.bundle.js', 'vendor/nostr-tools-LICENSE', 'vendor/node_modules/@noble/curves', 'vendor/node_modules/@noble/hashes', 'vendor/NOTICE.md', 'tools.manifest.json', 'vendor/protocol-contract.js', 'vendor/money.js', 'vendor/marketplace.js'];
assert.equal(manifest.name, 'property-agent-local');
assert.equal(manifest.version, '0.8.0');
assert.equal(manifest.mcpProtocol, '2026-07-28');
assert.equal(manifest.mcpToolsManifest, 'tools.manifest.json');
assert.equal(manifest.mcpToolsVersion, MCP_TOOLS_VERSION);
assert.equal(manifest.mcpToolCount, MCP_TOOLS.length);
assert.deepEqual(manifest.externalNodeDependencies, []);
assert.equal(manifest.runtimeCodeDownloads, false);
assert.deepEqual(manifest.files, packageFiles);
const toolManifest = JSON.parse(await readFile(path.join(PROPERTY_ROOT, 'agent/tools.manifest.json'), 'utf8'));
assert.equal(toolManifest.name, 'property-agent-mcp-tools');
assert.equal(toolManifest.version, manifest.mcpToolsVersion);
assert.equal(toolManifest.protocol, manifest.mcpProtocol);
assert.equal(toolManifest.toolCount, MCP_TOOLS.length);
assert.deepEqual(toolManifest.tools, MCP_TOOLS, 'the package manifest and stdio implementation expose the same fixed MCP contract');
assert.equal(new Set(toolManifest.tools.map(tool => tool.name)).size, MCP_TOOLS.length);
for (const tool of toolManifest.tools) {
  assert.ok(tool.inputSchema && tool.inputSchema.type === 'object');
  assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} rejects undeclared arguments`);
  assert.equal(typeof tool.description, 'string');
}
assert.equal(manifest.nanoThresholdCrypto.status, 'experimental');
assert.equal(manifest.nanoThresholdCrypto.nobleCurvesVersion, '2.4.0');
assert.equal(manifest.nanoThresholdCrypto.nobleHashesVersion, '2.4.0');
assert.deepEqual(manifest.platformsImplemented, ['linux-x64']);
assert.deepEqual(manifest.platformsPending, ['windows', 'macos', 'android', 'ios']);
const bundle = await readFile(path.join(PROPERTY_ROOT, 'web/vendor/nostr-tools-2.25.2.bundle.js'));
assert.equal(createHash('sha256').update(bundle).digest('hex'), manifest.nostrTools.sha256);
const installer = await readFile(path.join(PROPERTY_ROOT, 'agent/install.sh'), 'utf8');
const uninstaller = await readFile(path.join(PROPERTY_ROOT, 'agent/uninstall.sh'), 'utf8');
const cli = await readFile(path.join(PROPERTY_ROOT, 'agent/property-agent.mjs'), 'utf8');
for (const file of ['protocol-contract.js', 'money.js', 'marketplace.js']) {
  const vendored = await readFile(path.join(PROPERTY_ROOT, 'agent/vendor', file));
  const web = await readFile(path.join(PROPERTY_ROOT, 'web', file));
  assert.deepEqual(vendored, web, `${file} is vendored byte-for-byte from first-party source`);
}
assert.match(installer, /sha256sum --check/);
assert.match(uninstaller, /XDG_DATA_HOME\/property\/agents/);
assert.doesNotMatch(cli, /PROPERTY_AGENT_TEST_PASSWORD|--password/);
process.stdout.write(`PASS: manifesto, ${MCP_TOOLS.length} schemas MCP versionados, hashes, pacote fixado, escopo de plataforma e contratos de instalação conferidos.\n`);
