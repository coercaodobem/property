#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmptyConfig, loadNostr } from '../../agent/core.mjs';
import { createVault } from '../../agent/vault.mjs';
import { resolvePaths, writePrivateJson } from '../../agent/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEMP = await mkdtemp(path.join(os.tmpdir(), 'property-agent-lifecycle-g5-'));
await chmod(TEMP, 0o700);
const PREFIX = path.join(TEMP, 'prefix');
const DATA_HOME = path.join(TEMP, 'user-data');
const RUNTIME = path.join(TEMP, 'runtime');
const AGENT_DIR = path.join(PREFIX, 'share/property/agent');
const LAUNCHER = path.join(PREFIX, 'bin/property-agent');
const PASSWORD = 'fixed synthetic lifecycle password';
const CYCLES = 30;
const env = { ...process.env, XDG_DATA_HOME: DATA_HOME, XDG_RUNTIME_DIR: RUNTIME };
for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy']) delete env[key];
const cases = [];

function run(command, args, { input = '', expected = 0 } = {}) {
  return (async () => {
    const scratch = await mkdtemp(path.join(TEMP, 'stdio-'));
    await chmod(scratch, 0o700);
    const inputPath = path.join(scratch, 'stdin');
    const outputPath = path.join(scratch, 'stdout');
    const errorPath = path.join(scratch, 'stderr');
    await writeFile(inputPath, input, { mode: 0o600 });
    try {
      const result = spawnSync('bash', ['-c', 'exec "$@" < "$LIFECYCLE_STDIN" > "$LIFECYCLE_STDOUT" 2> "$LIFECYCLE_STDERR"', 'property-lifecycle', command, ...args], {
        cwd: ROOT,
        env: { ...env, LIFECYCLE_STDIN: inputPath, LIFECYCLE_STDOUT: outputPath, LIFECYCLE_STDERR: errorPath },
        stdio: 'inherit', timeout: 120000,
      });
      const stdout = await readFile(outputPath, 'utf8').catch(() => '');
      const stderr = await readFile(errorPath, 'utf8').catch(() => '');
      assert.equal(result.error, undefined, `${command} launch failed: ${result.error?.message}`);
      assert.equal(result.status, expected, `${command} ${args.join(' ')} exit: ${stderr.slice(-1000)}`);
      return { ...result, stdout, stderr };
    } finally { await rm(scratch, { recursive: true, force: true }); }
  })();
}
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function assertPackage() {
  const manifest = JSON.parse(await readFile(path.join(AGENT_DIR, 'manifest.json'), 'utf8'));
  const toolManifest = JSON.parse(await readFile(path.join(AGENT_DIR, manifest.mcpToolsManifest), 'utf8'));
  assert.equal(manifest.version, '0.8.0');
  assert.equal(manifest.mcpToolCount, 48);
  assert.equal(toolManifest.toolCount, 48);
  for (const file of manifest.files) await stat(path.join(AGENT_DIR, file));
  assert.equal((await stat(path.join(AGENT_DIR, 'manifest.json'))).mode & 0o777, 0o644);
  assert.equal((await stat(AGENT_DIR)).mode & 0o777, 0o755);
  assert.equal((await lstat(LAUNCHER)).isSymbolicLink(), true);
  assert.match((await run(LAUNCHER, ['--version'])).stdout, /property-agent 0\.8\.0; MCP 2026-07-28/);
}
async function assertData(vaultHash, configHash) {
  const paths = resolvePaths('default', env);
  const vault = await readFile(paths.vaultPath);
  const config = await readFile(paths.configPath);
  assert.equal(digest(vault), vaultHash, 'updates and uninstall preserve the encrypted identity vault byte-for-byte');
  assert.equal(digest(config), configHash, 'updates and uninstall preserve the local agent configuration byte-for-byte');
  assert.equal((await stat(paths.dataDir)).mode & 0o777, 0o700);
  assert.equal((await stat(paths.vaultPath)).mode & 0o777, 0o600);
  assert.equal((await stat(paths.configPath)).mode & 0o777, 0o600);
}
async function exerciseStdioMcp() {
  const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };
  const requests = [
    { jsonrpc: '2.0', id: 'discover', method: 'server/discover', params: { _meta: meta } },
    { jsonrpc: '2.0', id: 'list', method: 'tools/list', params: { _meta: meta } },
  ];
  const result = await run(process.execPath, [path.join(AGENT_DIR, 'mcp-server.mjs')], { input: `${requests.map(value => JSON.stringify(value)).join('\n')}\n` });
  const responses = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(responses.map(value => value.id), ['discover', 'list']);
  assert.deepEqual(responses[0].result.supportedVersions, ['2026-07-28']);
  assert.equal(responses[1].result.tools.length, 48);
  assert.doesNotMatch(result.stderr, new RegExp(PASSWORD));
}
async function exerciseDaemonRestart(expectedPubkey, secretHex) {
  const child = await run(process.execPath, [path.join(ROOT, 'tests/offline/agent-package-daemon-cycle-g5.mjs'), AGENT_DIR], {
    input: `${JSON.stringify({ password: PASSWORD, expectedPubkey, secretHex })}\n`,
  });
  const result = JSON.parse(child.stdout.trim());
  assert.deepEqual(result, { result: 'PASS', identity_matches: true, listener_count: 1, listener_transport: 'unix', secret_not_logged: true });
  assert.equal(child.stderr.includes(PASSWORD), false);
  assert.equal(child.stdout.includes(secretHex), false);
}

try {
  await Promise.all([mkdir(PREFIX, { recursive: true, mode: 0o700 }), mkdir(DATA_HOME, { recursive: true, mode: 0o700 }), mkdir(RUNTIME, { recursive: true, mode: 0o700 })]);
  const { nostr } = await loadNostr(ROOT);
  const secret = Buffer.alloc(32); secret[31] = 1;
  const secretHex = secret.toString('hex');
  const pubkey = nostr.getPublicKey(secret);
  const paths = resolvePaths('default', env);
  await writePrivateJson(paths.vaultPath, createVault(secret, pubkey, PASSWORD));
  await writePrivateJson(paths.configPath, createEmptyConfig(pubkey));
  secret.fill(0);
  const vaultHash = digest(await readFile(paths.vaultPath));
  const configHash = digest(await readFile(paths.configPath));

  await run('bash', [path.join(ROOT, 'agent/install.sh'), PREFIX]);
  await assertPackage();

  const beforeRollbackManifest = digest(await readFile(path.join(AGENT_DIR, 'manifest.json')));
  await rm(LAUNCHER, { force: true });
  await writeFile(LAUNCHER, 'foreign-launcher-protected\n', { mode: 0o700 });
  await run('bash', [path.join(ROOT, 'agent/install.sh'), PREFIX], { expected: 1 });
  assert.equal(await readFile(LAUNCHER, 'utf8'), 'foreign-launcher-protected\n');
  assert.equal(digest(await readFile(path.join(AGENT_DIR, 'manifest.json'))), beforeRollbackManifest, 'unsafe update leaves existing package untouched');
  await rm(LAUNCHER);
  await run('bash', [path.join(ROOT, 'agent/install.sh'), PREFIX]);
  cases.push({ id: 'foreign-launcher-update-rollback', result: 'PASS' });

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    await run('bash', [path.join(ROOT, 'agent/install.sh'), PREFIX]);
    await assertPackage();
    await exerciseStdioMcp();
    await exerciseDaemonRestart(pubkey, secretHex);
    await assertData(vaultHash, configHash);
    await run('bash', [path.join(ROOT, 'agent/uninstall.sh'), PREFIX]);
    await assert.rejects(stat(AGENT_DIR), /ENOENT/);
    await assert.rejects(stat(LAUNCHER), /ENOENT/);
    await assertData(vaultHash, configHash);
    cases.push({ id: `lifecycle-${String(cycle).padStart(2, '0')}`, result: 'PASS', install: true, update: true, restart: true, uninstall: true, vault_preserved: true, tcp_listener: false });
  }

  const final = {
    result: 'PASS', operating_system: `${os.platform()}/${os.arch()}`, package_version: '0.8.0',
    fixed_cycles: CYCLES, install_cycles: CYCLES, update_cycles: CYCLES, daemon_restarts: CYCLES,
    uninstall_cycles: CYCLES, preserved_vault_sha256: vaultHash, preserved_config_sha256: configHash,
    vault_mode: '0600', data_directory_mode: '0700', unix_socket_mode: '0600', tcp_listeners: 0,
    rollback_on_foreign_launcher: true, mcp_stdio_discover_and_list_per_cycle: CYCLES, cases,
  };
  assert.equal(final.operating_system, 'linux/x64');
  const evidenceDir = path.join(ROOT, 'docs/evidence/product-completion/G5');
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(evidenceDir, 'agent-package-lifecycle.json'), `${JSON.stringify(final, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(final)}\n`);
} finally {
  await rm(TEMP, { recursive: true, force: true });
}
