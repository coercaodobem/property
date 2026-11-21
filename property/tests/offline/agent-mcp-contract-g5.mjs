#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_TOOLS, MCP_TOOLS_VERSION } from '../../agent/mcp-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_DIR = path.join(ROOT, 'docs/evidence/product-completion/G5');
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_CLIENT = 'io.modelcontextprotocol/clientInfo';
const META_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'];
const NON_IDEMPOTENT_TRADE_TOOLS = new Set([
  'property_trade_offer', 'property_trade_accept', 'property_trade_request_payment',
  'property_trade_reconcile', 'property_trade_dispute', 'property_trade_cancel',
]);

function invalidArgs(tool) {
  const required = tool.inputSchema.required || [];
  if (required.length) return { [required[0]]: null };
  return { __undeclared_contract_probe__: true };
}
function checkSchemaShape(schema, label) {
  assert.equal(schema?.type, 'object', `${label} root must be an object schema`);
  assert.equal(schema.additionalProperties, false, `${label} must close undeclared arguments`);
  assert.ok(schema.properties && typeof schema.properties === 'object', `${label} must declare properties`);
  for (const key of schema.required || []) assert.ok(Object.hasOwn(schema.properties, key), `${label}.${key} is required and declared`);
  for (const [key, value] of Object.entries(schema.properties)) {
    assert.ok(['object', 'string', 'integer', 'number', 'boolean', 'array', undefined].includes(value.type), `${label}.${key} uses a supported type`);
    if (value.pattern !== undefined) assert.doesNotThrow(() => new RegExp(value.pattern), `${label}.${key} has a valid regex`);
    if (value.oneOf) assert.ok(Array.isArray(value.oneOf) && value.oneOf.length > 0, `${label}.${key}.oneOf is nonempty`);
    if (value.anyOf) assert.ok(Array.isArray(value.anyOf) && value.anyOf.length > 0, `${label}.${key}.anyOf is nonempty`);
    if (value.enum) assert.ok(Array.isArray(value.enum) && value.enum.length > 0, `${label}.${key}.enum is nonempty`);
    if (value.type === 'array') assert.ok(value.items && typeof value.items === 'object', `${label}.${key}.items is present`);
  }
}
function meta({ protocol = '2026-07-28', clientInfo = true, capabilities = true } = {}) {
  return {
    ...(protocol === null ? {} : { [META_VERSION]: protocol }),
    ...(clientInfo ? { [META_CLIENT]: { name: 'synthetic-mcp-contract', version: '1.0.0' } } : {}),
    ...(capabilities ? { [META_CAPABILITIES]: {} } : {}),
  };
}
function request(id, method, fields = {}, options = {}) {
  return { jsonrpc: '2.0', id, method, params: { ...fields, _meta: meta(options) } };
}
async function runClient(client, requests, env) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-mcp-contract-g5-'));
  await chmod(scratch, 0o700);
  const inputPath = path.join(scratch, 'requests.jsonl');
  const outputPath = path.join(scratch, 'responses.jsonl');
  const errorPath = path.join(scratch, 'stderr.txt');
  await writeFile(inputPath, `${requests.map(value => JSON.stringify(value)).join('\n')}\n`, { mode: 0o600 });
  const result = spawnSync('bash', ['-c', 'exec "$@" < "$MCP_INPUT" > "$MCP_OUTPUT" 2> "$MCP_ERROR"',
    'property-mcp-contract', process.execPath, path.join(ROOT, 'agent/mcp-server.mjs')], {
    cwd: ROOT, env: { ...env, MCP_INPUT: inputPath, MCP_OUTPUT: outputPath, MCP_ERROR: errorPath },
    stdio: 'inherit', timeout: 30000,
  });
  try {
    assert.equal(result.error, undefined, `${client} process launch: ${result.error?.message}`);
    assert.equal(result.status, 0, `${client} stdio process status`);
    const output = await readFile(outputPath, 'utf8').catch(() => '');
    const diagnostics = await readFile(errorPath, 'utf8').catch(() => '');
    assert.equal(diagnostics, '', `${client} wrote no diagnostics to stderr for protocol discovery/listing/invalid calls`);
    assert.ok(output.trim(), `${client} MCP stdio returned no responses (requests=${requests.length})`);
    return output.trim().split('\n').map(line => JSON.parse(line));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

const manifest = JSON.parse(await readFile(path.join(ROOT, 'agent/tools.manifest.json'), 'utf8'));
assert.equal(manifest.version, MCP_TOOLS_VERSION);
assert.equal(manifest.toolCount, MCP_TOOLS.length);
assert.deepEqual(manifest.tools, MCP_TOOLS);
assert.equal(MCP_TOOLS.length, 55);
assert.equal(new Set(manifest.tools.map(tool => tool.name)).size, MCP_TOOLS.length);
for (const tool of manifest.tools) {
  checkSchemaShape(tool.inputSchema, tool.name);
  assert.ok(tool.annotations && typeof tool.annotations.readOnlyHint === 'boolean' && typeof tool.annotations.destructiveHint === 'boolean' && typeof tool.annotations.openWorldHint === 'boolean', `${tool.name} declares permission/risk annotations`);
  if (tool.annotations.readOnlyHint) assert.equal(tool.annotations.destructiveHint, false, `${tool.name} read-only hint cannot be destructive`);
  if (NON_IDEMPOTENT_TRADE_TOOLS.has(tool.name)) assert.equal(tool.annotations.idempotentHint, false, `${tool.name} can emit another signed relay message when retried`);
}

const clients = [];
for (let index = 0; index < 3; index++) {
  const client = `synthetic-client-${String.fromCharCode(97 + index)}`;
  const requests = [
    request(`${client}-discover`, 'server/discover', {}, { clientInfo: index !== 0 }),
    request(`${client}-list`, 'tools/list', {}),
    ...manifest.tools.map(tool => request(`${client}-schema-${tool.name}`, 'tools/call', { name: tool.name, arguments: invalidArgs(tool) })),
    request(`${client}-unknown`, 'tools/call', { name: 'property_exec_shell', arguments: { command: 'id' } }),
    request(`${client}-old-version`, 'tools/list', {}, { protocol: '2025-11-25' }),
    request(`${client}-missing-capabilities`, 'server/discover', {}, { capabilities: false }),
    request(`${client}-legacy-initialize`, 'initialize', {}),
  ];
  const env = { ...process.env, XDG_RUNTIME_DIR: path.join(os.tmpdir(), `property-mcp-g5-${process.pid}-${index}`) };
  for (const key of PROXY_KEYS) delete env[key];
  const responses = await runClient(client, requests, env);
  assert.equal(responses.length, requests.length, `${client} answered every one-line stdio request`);
  assert.deepEqual(responses.map(value => value.id), requests.map(value => value.id), `${client} responses preserve JSON-RPC correlation`);
  assert.ok(responses.every(value => value.jsonrpc === '2.0'), `${client} output is JSON-RPC 2.0`);
  const discover = responses[0];
  assert.equal(discover.error, undefined, `${client} supports modern stateless server/discover`);
  assert.deepEqual(discover.result.supportedVersions, ['2026-07-28']);
  assert.deepEqual(discover.result.capabilities, { tools: { listChanged: false } });
  assert.equal(discover.result._meta['io.modelcontextprotocol/serverInfo'].name, 'property-agent');
  const listed = responses[1];
  assert.deepEqual(listed.result.tools, MCP_TOOLS, `${client} sees exactly the versioned manifest tools`);
  assert.equal(listed.result.tools.length, 55);
  for (let toolIndex = 0; toolIndex < manifest.tools.length; toolIndex++) {
    const response = responses[toolIndex + 2];
    assert.equal(response.error, undefined, `${client}/${manifest.tools[toolIndex].name} schema failure uses a structured tool result`);
    assert.equal(response.result.resultType, 'complete');
    assert.equal(response.result.isError, true, `${manifest.tools[toolIndex].name} fails before local IPC on invalid schema input`);
    assert.deepEqual(JSON.parse(response.result.content[0].text), { error: 'invalid-arguments' });
    assert.equal(response.result._meta['io.modelcontextprotocol/serverInfo'].name, 'property-agent');
  }
  const unknownIndex = 2 + manifest.tools.length;
  const unknown = responses[unknownIndex];
  assert.equal(unknown.result.isError, true);
  assert.deepEqual(JSON.parse(unknown.result.content[0].text), { error: 'tool-not-allowed' });
  assert.equal(responses[unknownIndex + 1].error.code, -32602, `${client} rejects an unsupported prior protocol version`);
  assert.equal(responses[unknownIndex + 2].error.code, -32602, `${client} rejects missing protocol capabilities`);
  assert.equal(responses[unknownIndex + 3].error.code, -32601, `${client} does not advertise the legacy initialize handshake`);
  clients.push({ client, requests: requests.length, schemas_rejected: manifest.tools.length, unknown_tool_rejected: true, unsupported_version_rejected: true });
}

const report = { result: 'PASS', operating_system: `${os.platform()}/${os.arch()}`, protocol: '2026-07-28',
  manifest_version: MCP_TOOLS_VERSION, clients, total_schema_rejections: clients.reduce((sum, item) => sum + item.schemas_rejected, 0), unknown_tool_rejections: 3,
  failures_are_structured: true, stateless_protocol: true, prohibited_tools_not_exposed: true };
await mkdir(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
await writeFile(path.join(EVIDENCE_DIR, 'agent-mcp-contract.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report)}\n`);
