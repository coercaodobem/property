#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { access, chmod, copyFile, lstat, mkdir, readFile, readlink, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNativePlatformReport } from './native-platform-report.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), '../../..');
const PLAN = path.join(ROOT, 'property/docs/plano-de-testes-central.md');
const GATES = Array.from({ length: 13 }, (_, index) => 'G' + String(index).padStart(2, '0'));
const PROXY_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'FTP_PROXY', 'SOCKS_PROXY', 'WS_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy', 'socks_proxy', 'ws_proxy'
];
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
let currentChild = null;
let interruptionSignal = null;
let checkpointPath = null;
let checkpointCases = null;
let deferG00Checkpoint = true;

export function validateManifest(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'manifest must be a JSON object');
  assert.equal(value.schema_version, 1, 'schema_version must be 1');
  assert.match(value.run_id || '', /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/, 'run_id must be a safe identifier');
  for (const field of ['requested_executor', 'actual_executor', 'actual_executor_source', 'candidate_commit', 'test_seed']) {
    assert.equal(typeof value[field], 'string', field + ' is required');
    assert.ok(value[field].trim(), field + ' must not be empty');
  }
  assert.match(value.candidate_commit, /^[0-9a-f]{40}$/i, 'candidate_commit must be a full commit SHA');
  assert.ok(Number.isSafeInteger(value.case_timeout_ms) && value.case_timeout_ms >= 1000 && value.case_timeout_ms <= 86400000,
    'case_timeout_ms must be between 1000 and 86400000');
  assert.ok(value.resource_budget && typeof value.resource_budget === 'object', 'resource_budget is required');
  for (const field of ['min_cpus', 'min_ram_bytes', 'min_tmp_bytes']) {
    assert.ok(Number.isFinite(value.resource_budget[field]) && value.resource_budget[field] > 0,
      'resource_budget.' + field + ' must be positive');
  }
  assert.ok(value.ports && typeof value.ports === 'object', 'ports are required');
  const requiredPorts = ['bridge_source', 'bridge_target', 'seven_relay_base', 'native_relay'];
  const values = [];
  for (const field of requiredPorts) {
    const port = value.ports[field];
    assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'ports.' + field + ' is invalid');
  }
  values.push(value.ports.bridge_source, value.ports.bridge_target, value.ports.native_relay);
  assert.notEqual(value.ports.bridge_source, value.ports.bridge_target, 'bridge ports must differ');
  for (let offset = 0; offset < 7; offset++) values.push(value.ports.seven_relay_base + offset);
  assert.equal(new Set(values).size, values.length, 'all relay ports must be distinct');
  if (value.browser_automation !== undefined) {
    const browser = value.browser_automation;
    assert.ok(browser && typeof browser === 'object' && !Array.isArray(browser), 'browser_automation must be an object');
    for (const field of ['playwright_module', 'engine', 'executable', 'playwright_version', 'browser_version',
      'playwright_package_sha256', 'browser_executable_sha256']) {
      assert.equal(typeof browser[field], 'string', 'browser_automation.' + field + ' is required');
      assert.ok(browser[field].trim(), 'browser_automation.' + field + ' must not be empty');
    }
    assert.ok(path.isAbsolute(browser.playwright_module), 'browser_automation.playwright_module must be an absolute file path');
    assert.ok(path.isAbsolute(browser.executable), 'browser_automation.executable must be an absolute file path');
    assert.ok(['chromium', 'firefox', 'webkit'].includes(browser.engine), 'browser_automation.engine is invalid');
    assert.match(browser.playwright_package_sha256, /^[0-9a-f]{64}$/i, 'browser_automation.playwright_package_sha256 must be SHA-256');
    assert.match(browser.browser_executable_sha256, /^[0-9a-f]{64}$/i, 'browser_automation.browser_executable_sha256 must be SHA-256');
  }
  if (value.ledger_tools !== undefined) {
    const required = {
      bitcoin: ['bitcoind', 'bitcoin_cli'],
      monero: ['monerod', 'monero_wallet_rpc'],
      nano: ['nano_node']
    };
    assert.ok(value.ledger_tools && typeof value.ledger_tools === 'object' && !Array.isArray(value.ledger_tools), 'ledger_tools must be an object');
    for (const [group, tools] of Object.entries(required)) {
      const config = value.ledger_tools[group];
      assert.ok(config && typeof config === 'object' && !Array.isArray(config), `ledger_tools.${group} is required for G08`);
      for (const name of tools) {
        assert.equal(typeof config[name], 'string', `ledger_tools.${group}.${name} is required`);
        assert.ok(path.isAbsolute(config[name]), `ledger_tools.${group}.${name} must be an absolute path`);
        assert.match(config[`${name}_sha256`] || '', /^[0-9a-f]{64}$/i, `ledger_tools.${group}.${name}_sha256 must be SHA-256`);
      }
    }
  }
  const forbiddenKeys = /(password|token|secret|private.?key|mnemonic|wallet.?seed|rpc.?credential)/i;
  const visit = object => {
    for (const [key, child] of Object.entries(object)) {
      if (forbiddenKeys.test(key)) throw new Error('manifest contains a forbidden credential field');
      if (child && typeof child === 'object') visit(child);
    }
  };
  visit(value);
  return value;
}

function parseArgs(argv) {
  const options = { profile: null, manifest: null, output: null, coreReport: null, platformReports: [], resume: false, interruptionSelfTest: false, interruptionFixture: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--self-test-interruption') options.interruptionSelfTest = true;
    else if (arg === '--interruptible-fixture') options.interruptionFixture = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--platform-report') {
      const next = argv[++index];
      const match = next?.match(/^(G12-0[2-5])=(.+)$/);
      if (!match) throw new Error('--platform-report must be CASE=PATH, for example G12-02=artifacts/G12-02/g12-platform-report.json');
      options.platformReports.push({ caseId: match[1], path: match[2] });
    }
    else if (['--profile', '--manifest', '--output', '--core-report'].includes(arg)) {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for ' + arg);
      if (arg === '--profile') options.profile = next;
      if (arg === '--manifest') options.manifest = next;
      if (arg === '--output') options.output = next;
      if (arg === '--core-report') options.coreReport = next;
    } else throw new Error('Unknown option: ' + arg);
  }
  if (options.interruptionFixture) {
    if (!options.output || options.manifest || options.profile || options.resume) throw new Error('Invalid interruption-fixture options');
    return options;
  }
  if (options.interruptionSelfTest) {
    if (!options.output || options.manifest || options.profile || options.resume) throw new Error('--self-test-interruption requires --output only');
    return options;
  }
  if (!['core', 'platforms', 'full'].includes(options.profile)) throw new Error('--profile must be core, platforms or full');
  if (!options.manifest) throw new Error('--manifest is required');
  if (options.resume && !options.output) throw new Error('--resume requires the existing --output directory');
  if (options.profile === 'platforms' && !options.coreReport) throw new Error('platforms profile requires --core-report');
  if (options.platformReports.length && options.profile !== 'platforms') throw new Error('--platform-report is valid only for --profile platforms');
  return options;
}

function commandResult(command, args, timeout = 5000) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024, windowsHide: true });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error?.message || null };
}

async function readCgroupLimits() {
  const values = {};
  for (const [name, file] of Object.entries({
    cpu: '/sys/fs/cgroup/cpu.max',
    cpuset: '/sys/fs/cgroup/cpuset.cpus.effective',
    memory: '/sys/fs/cgroup/memory.max',
    processes: '/sys/fs/cgroup/pids.max'
  })) {
    try { values[name] = (await readFile(file, 'utf8')).trim(); }
    catch { values[name] = null; }
  }
  let cpuQuota = null;
  if (values.cpu) {
    const [quota, period] = values.cpu.split(/\s+/);
    if (quota !== 'max' && Number(period) > 0) cpuQuota = Number(quota) / Number(period);
  }
  let cpusetCpuCount = null;
  if (values.cpuset) {
    const ids = new Set();
    let valid = true;
    for (const part of values.cpuset.split(',')) {
      const match = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!match) { valid = false; break; }
      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);
      if (end < start || end - start > 4096) { valid = false; break; }
      for (let cpu = start; cpu <= end; cpu++) ids.add(cpu);
    }
    if (valid && ids.size > 0) cpusetCpuCount = ids.size;
  }
  const parallelism = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const cpuCandidates = [parallelism, cpusetCpuCount, cpuQuota].filter(value => Number.isFinite(value) && value > 0);
  const effectiveCpuCount = cpuCandidates.length ? Math.min(...cpuCandidates) : null;
  let memoryQuota = null;
  if (values.memory && values.memory !== 'max' && /^\d+$/.test(values.memory)) memoryQuota = Number(values.memory);
  let processQuota = null;
  if (values.processes && values.processes !== 'max' && /^\d+$/.test(values.processes)) processQuota = Number(values.processes);
  return { raw: values, cpu_quota: cpuQuota, cpuset_cpu_count: cpusetCpuCount, runtime_parallelism: parallelism,
    effective_cpu_count: effectiveCpuCount, memory_quota_bytes: memoryQuota, process_quota: processQuota };
}

async function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function hashFile(filePath) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest('hex');
}

async function collectInventory(manifest, excludedOutput = null) {
  const excludedAbsolute = excludedOutput ? path.resolve(ROOT, excludedOutput) : null;
  const excludedRelativeRaw = excludedAbsolute && excludedAbsolute.startsWith(ROOT + path.sep)
    ? path.relative(ROOT, excludedAbsolute).split(path.sep).join('/') : null;
  const isExcluded = relativePath => Boolean(excludedRelativeRaw &&
    (relativePath === excludedRelativeRaw || relativePath.startsWith(excludedRelativeRaw + '/')));
  const git = commandResult('git', ['rev-parse', 'HEAD']);
  const diff = commandResult('git', ['diff', '--binary', 'HEAD']);
  const status = commandResult('git', ['status', '--porcelain=v1', '-z']);
  const changed = commandResult('git', ['diff', '--name-only', '-z', 'HEAD']);
  const untracked = commandResult('git', ['ls-files', '--others', '--exclude-standard', '-z']);
  const changedPaths = new Set([
    ...(changed.status === 0 ? changed.stdout.split('\0').filter(Boolean) : []),
    ...(untracked.status === 0 ? untracked.stdout.split('\0').filter(Boolean) : [])
  ].filter(relativePath => !isExcluded(relativePath)));
  const changedFiles = [];
  let changedFilesComplete = changed.status === 0 && untracked.status === 0;
  for (const relativePath of [...changedPaths].sort()) {
    const absolutePath = path.resolve(ROOT, relativePath);
    if (!absolutePath.startsWith(ROOT + path.sep)) { changedFilesComplete = false; continue; }
    try {
      const info = await stat(absolutePath);
      if (info.isFile()) changedFiles.push({ path: relativePath, bytes: info.size, sha256: await hashFile(absolutePath) });
      else changedFilesComplete = false;
    } catch { changedFilesComplete = false; }
  }
  const sourcePaths = [
    'AGENTS.md', 'property/docs/identidade-do-projeto.md', 'property/docs/plano-central.md',
    'property/docs/pagamentos.md', 'property/docs/migracao-property.md', PLAN.slice(ROOT.length + 1)
  ];
  const sources = [];
  for (const relativePath of [...new Set(sourcePaths)]) {
    try {
      const contents = await readFile(path.join(ROOT, relativePath));
      sources.push({ path: relativePath, present: true, bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') });
    } catch { sources.push({ path: relativePath, present: false, bytes: null, sha256: null }); }
  }
  const memory = await readFile('/proc/meminfo', 'utf8').catch(() => '');
  const memMatch = memory.match(/^MemAvailable:\s+(\d+)\s+kB/m);
  let tmpAvailable = null;
  try {
    const disk = await import('node:fs/promises').then(module => module.statfs(os.tmpdir()));
    tmpAvailable = Number(disk.bavail) * Number(disk.bsize);
  } catch {}
  const cgroup = await readCgroupLimits();
  const tools = {};
  for (const name of ['bash', 'node', 'java', 'gradle', 'openssl', 'ip', 'nft', 'iptables-save', 'ip6tables-save', 'firefox', 'bitcoin-cli', 'bitcoind', 'monerod', 'monero-wallet-rpc', 'nano_node', 'adb', 'xcrun', 'docker', 'podman', 'firejail']) {
    const found = commandResult(process.platform === 'win32' ? 'where' : 'which', [name]);
    const executable = found.status === 0 ? found.stdout.trim().split(/\r?\n/)[0] : null;
    let sha256 = null;
    if (executable) {
      try { sha256 = await hashFile(executable); } catch {}
    }
    tools[name] = { path: executable, sha256 };
  }
  const ledgerTools = {};
  for (const [group, config] of Object.entries(manifest.ledger_tools || {})) {
    ledgerTools[group] = {};
    for (const [key, executable] of Object.entries(config)) {
      if (!key.endsWith('_sha256') && typeof executable === 'string') {
        ledgerTools[group][key] = { path: executable, expected_sha256: config[`${key}_sha256`] || null,
          observed_sha256: await hashFile(executable).catch(() => null) };
      }
    }
  }
  const diffHash = diff.status === 0 ? await hashText(diff.stdout) : null;
  const filteredStatus = status.status === 0
    ? status.stdout.split('\0').filter(Boolean).filter(entry => !isExcluded(entry.slice(3))).join('\0')
    : null;
  const observedHead = git.status === 0 ? git.stdout.trim() : null;
  const candidateState = await hashText(JSON.stringify({
    observed_head: observedHead,
    diff_sha256: diffHash,
    changed_files: changedFiles
  }));
  const workingTreeState = await hashText(JSON.stringify({
    status: filteredStatus,
    diff_sha256: diffHash,
    changed_files: changedFiles
  }));
  const missingSources = sources.filter(source => !source.present).map(source => source.path);
  return {
    run_id: manifest.run_id,
    requested_executor: manifest.requested_executor,
    actual_executor: manifest.actual_executor,
    actual_executor_source: manifest.actual_executor_source,
    candidate_commit: manifest.candidate_commit,
    observed_head: observedHead,
    candidate_commit_matches_head: observedHead === manifest.candidate_commit,
    working_tree_diff_sha256: diffHash,
    working_tree_diff_bytes: diff.status === 0 ? Buffer.byteLength(diff.stdout) : null,
    working_tree_status: status.status === 0 ? filteredStatus.replace(/[^\x20-\x7E\n]/g, '') : null,
    changed_files: changedFiles,
    working_tree_state_sha256: workingTreeState,
    candidate_state_sha256: candidateState,
    inventory_excluded_output: excludedRelativeRaw,
    source_documents: sources,
    integrity: {
      git_state_complete: git.status === 0 && diff.status === 0 && status.status === 0 && changedFilesComplete,
      sources_complete: missingSources.length === 0,
      missing_sources: missingSources,
      manifest_sha256: await hashText(JSON.stringify(manifest)),
      ready_for_g00_01: git.status === 0 && diff.status === 0 && status.status === 0 && changedFilesComplete && missingSources.length === 0 && observedHead === manifest.candidate_commit
    },
    host: {
      platform: process.platform,
      architecture: process.arch,
      release: os.release(),
      logical_cpus: os.cpus().length,
      ram_total_bytes: os.totalmem(),
      ram_available_bytes: memMatch ? Number(memMatch[1]) * 1024 : os.freemem(),
      tmp_available_bytes: tmpAvailable
    },
    cgroup_limits: cgroup,
    tools,
    ledger_tools: ledgerTools,
    ports: manifest.ports,
    test_seed: manifest.test_seed
  };
}

function safeEnv() {
  const env = { ...process.env };
  for (const key of PROXY_KEYS) delete env[key];
  delete env.NODE_OPTIONS;
  const javaOptions = env.PROPERTY_OFFLINE_TEST_JAVA_TOOL_OPTIONS || env.JAVA_TOOL_OPTIONS || '';
  // JVM native libraries ignore TMPDIR unless java.io.tmpdir is set explicitly.
  // Keep extraction inside the run-scoped scratch filesystem instead of /tmp, where
  // per-user quotas can fail despite statfs reporting free space.
  env.JAVA_TOOL_OPTIONS = [javaOptions, `-Djava.io.tmpdir=${os.tmpdir()}`].filter(Boolean).join(' ');
  delete env.PROPERTY_OFFLINE_TEST_JAVA_TOOL_OPTIONS;
  return env;
}

function configureRuntimeMemoryBudget(inventory, manifest) {
  const available = inventory.host.ram_available_bytes;
  const fraction = Math.min(0.70, Number(manifest.resource_budget.max_child_ram_fraction ?? 0.70));
  const concurrentRelays = 7;
  const aggregateChildBudget = Math.floor(available * fraction);
  const perRelayBudget = Math.floor(aggregateChildBudget / concurrentRelays);
  const mb = 1024 * 1024;
  const heap = Math.floor(Math.min(384 * mb, perRelayBudget * 0.52) / mb) * mb;
  const metaspace = Math.floor(Math.min(128 * mb, perRelayBudget * 0.18) / mb) * mb;
  const codeCache = Math.floor(Math.min(64 * mb, perRelayBudget * 0.09) / mb) * mb;
  const directMemory = Math.floor(Math.min(64 * mb, perRelayBudget * 0.09) / mb) * mb;
  const passes = Number.isFinite(available) && available > 0 && heap >= 128 * mb && metaspace >= 64 * mb &&
    inventory.host.ram_total_bytes >= manifest.resource_budget.min_ram_bytes;
  const asMb = value => Math.floor(value / mb) + 'm';
  const javaOptions = passes ? [
    '-XX:ActiveProcessorCount=1', '-Xss512k', '-Xms32m', `-Xmx${asMb(heap)}`,
    `-XX:MaxMetaspaceSize=${asMb(metaspace)}`, `-XX:ReservedCodeCacheSize=${asMb(codeCache)}`,
    `-XX:MaxDirectMemorySize=${asMb(directMemory)}`
  ].join(' ') : null;
  inventory.runtime_memory_budget = {
    status: passes ? 'PASS' : 'BLOCKED',
    minimum_physical_ram_bytes: manifest.resource_budget.min_ram_bytes,
    physical_ram_bytes: inventory.host.ram_total_bytes,
    available_ram_at_start_bytes: available,
    max_child_ram_fraction: fraction,
    aggregate_child_budget_bytes: aggregateChildBudget,
    maximum_concurrent_geode_relays: concurrentRelays,
    per_geode_jvm_budget_bytes: perRelayBudget,
    jvm_heap_bytes: heap,
    jvm_metaspace_bytes: metaspace,
    jvm_code_cache_bytes: codeCache,
    jvm_direct_memory_bytes: directMemory,
    java_tool_options_applied_to_test_children: passes
  };
  if (passes) process.env.PROPERTY_OFFLINE_TEST_JAVA_TOOL_OPTIONS = javaOptions;
  return inventory.runtime_memory_budget;
}

export function sanitizeText(value) {
  return String(value)
    .replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED_TOKEN]')
    .replace(/^([^\n]*(?:password|token|secret|private.?key|mnemonic)\s*[:=])[^\n]*$/gim, '$1[REDACTED]')
    .replace(/\/home\/[^/\s]+/g, '/home/<USER>')
    .slice(0, MAX_OUTPUT_BYTES);
}

async function probeLoopback(host) {
  return new Promise(resolve => {
    const server = net.createServer();
    const timeout = setTimeout(() => {
      try { server.close(); } catch {}
      resolve({ ok: false, reason: 'timeout' });
    }, 1500);
    server.once('error', error => {
      clearTimeout(timeout);
      resolve({ ok: false, reason: error.code || 'socket-error' });
    });
    server.listen(0, host, () => {
      const port = server.address().port;
      const socket = net.createConnection({ host, port });
      socket.setTimeout(1000);
      socket.once('connect', () => {
        socket.destroy();
        clearTimeout(timeout);
        server.close(() => resolve({ ok: true, reason: null }));
      });
      socket.once('error', error => {
        socket.destroy();
        clearTimeout(timeout);
        server.close(() => resolve({ ok: false, reason: error.code || 'connect-error' }));
      });
      socket.once('timeout', () => {
        socket.destroy();
        clearTimeout(timeout);
        server.close(() => resolve({ ok: false, reason: 'connect-timeout' }));
      });
    });
  });
}

export function routesAreLoopbackOnly(result) {
  if (result.status !== 0) return { ok: false, reason: 'route inspection unavailable' };
  let routes;
  try { routes = JSON.parse(result.stdout); }
  catch { return { ok: false, reason: 'route output was not JSON' }; }
  if (!Array.isArray(routes) || routes.length === 0) return { ok: false, reason: 'route output was not a nonempty array' };
  for (const route of routes) {
    if (route.dst === 'default' || route.gateway) return { ok: false, reason: 'default/gateway route exists' };
    if (!route.dev || route.dev !== 'lo') return { ok: false, reason: 'route is missing loopback device or uses a non-loopback device' };
    const destination = route.dst || '';
    if (!isLoopbackDestination(destination)) {
      return { ok: false, reason: 'route outside loopback exists' };
    }
  }
  return { ok: true, reason: null };
}

function isLoopbackDestination(destination) {
  const [address, prefixText] = destination.split('/', 2);
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const prefix = prefixText === undefined ? 32 : Number(prefixText);
    return octets[0] === 127 && Number.isInteger(prefix) && prefix >= 8 && prefix <= 32;
  }
  if (version === 6) return address.toLowerCase() === '::1' && (prefixText === undefined || prefixText === '128');
  return false;
}

export function evaluateNetworkNamespace(input) {
  const currentNamespaceId = input.current_namespace_id || null;
  const parentNamespaceId = input.parent_namespace_id || null;
  const interfaces = input.interfaces?.status === 0
    ? (() => { try { return JSON.parse(input.interfaces.stdout); } catch { return null; } })()
    : null;
  const names = Array.isArray(interfaces) ? interfaces.map(row => ({
    name: row.ifname || null,
    loopback: Array.isArray(row.flags) && row.flags.includes('LOOPBACK'),
    up: Array.isArray(row.flags) && row.flags.includes('UP')
  })) : null;
  const onlyLoopbackInterface = Array.isArray(names) && names.length === 1 && names[0].name === 'lo' &&
    names[0].loopback && names[0].up;
  const ipv4 = routesAreLoopbackOnly(input.ipv4_routes);
  const ipv6 = routesAreLoopbackOnly(input.ipv6_routes);
  const rulesInspected = input.ipv4_rules?.status === 0 && input.ipv6_rules?.status === 0;
  const distinctFromParent = Boolean(parentNamespaceId && currentNamespaceId && parentNamespaceId !== currentNamespaceId);
  const requested = input.requested === true;
  return {
    requested,
    parent_namespace_id: parentNamespaceId,
    namespace_id: currentNamespaceId,
    distinct_from_parent: distinctFromParent,
    interfaces: names,
    only_loopback_interface: onlyLoopbackInterface,
    ipv4_loopback_routes_only: ipv4.ok,
    ipv4_route_reason: ipv4.reason,
    ipv6_loopback_routes_only: ipv6.ok,
    ipv6_route_reason: ipv6.reason,
    policy_rules_inspected: rulesInspected,
    verified: requested && distinctFromParent && onlyLoopbackInterface && ipv4.ok && ipv6.ok && rulesInspected
  };
}

async function inspectNetworkNamespace(env, ipv4Routes, ipv6Routes, ipv4Rules, ipv6Rules) {
  const currentNamespaceId = await readlink('/proc/self/ns/net').catch(() => null);
  const interfaces = commandResult('ip', ['-json', 'link', 'show']);
  return evaluateNetworkNamespace({
    requested: env.PROPERTY_NETWORK_ISOLATION === 'unshared-netns',
    parent_namespace_id: env.PROPERTY_PARENT_NETNS_ID || null,
    current_namespace_id: currentNamespaceId,
    interfaces,
    ipv4_routes: ipv4Routes,
    ipv6_routes: ipv6Routes,
    ipv4_rules: ipv4Rules,
    ipv6_rules: ipv6Rules
  });
}

export function nftBlocksEgress(text) {
  const outputChains = [...text.matchAll(/chain\s+[^\s{]+\s*\{([^}]*)\}/gs)].map(match => match[1])
    .filter(body => /hook\s+output\b/.test(body));
  if (!outputChains.length) return false;
  let loopbackAccepts = 0;
  const strictChains = outputChains.every(body => {
    if (!/policy\s+drop\s*;/.test(body)) return false;
    const rules = body.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^(type|hook|priority|policy)\b/.test(line));
    if (rules.some(line => /\b(?:jump|goto)\b/.test(line))) return false;
    const acceptRules = rules.filter(line => /\baccept\b/.test(line));
    if (acceptRules.some(line => !/\boifname\s+"lo"(?:\s|$).*\baccept\b|\boif\s+"lo"(?:\s|$).*\baccept\b/.test(line))) return false;
    loopbackAccepts += acceptRules.length;
    return true;
  });
  return strictChains && loopbackAccepts > 0;
}

export function iptablesBlocksEgress(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.includes('-P OUTPUT DROP') && !lines.some(line => /^:OUTPUT DROP(?:\s|$)/.test(line))) return false;
  const outputRules = lines.filter(line => /^-A OUTPUT\b/.test(line));
  if (!outputRules.length) return false;
  let loopbackAccepts = 0;
  for (const line of outputRules) {
    if (/\s-[jg]\s+(?!ACCEPT\b|DROP\b|REJECT\b)/.test(line)) return false;
    if (/\s-j\s+ACCEPT\b/.test(line)) {
      if (!/\s-o\s+lo\b/.test(line)) return false;
      loopbackAccepts++;
    }
  }
  return loopbackAccepts > 0;
}

export function nftOutputCounters(text) {
  const rows = [];
  const chains = [...text.matchAll(/chain\s+([^\s{]+)\s*\{([^}]*)\}/gs)].filter(match => /hook\s+output\b/.test(match[2]));
  for (const [chainIndex, chain] of chains.entries()) {
    for (const [ruleIndex, line] of chain[2].split(/\r?\n/).map(value => value.trim()).entries()) {
      const match = line.match(/\bcounter\s+packets\s+(\d+)\s+bytes\s+(\d+)/);
      if (match) rows.push({ chain_index: chainIndex, rule_index: ruleIndex, packets: Number(match[1]), bytes: Number(match[2]), rule_sha256: createHash('sha256').update(line).digest('hex') });
    }
  }
  return rows;
}

export function iptablesOutputCounters(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\[(\d+):(\d+)\]\s+-A OUTPUT\b/);
    if (match) rows.push({ packets: Number(match[1]), bytes: Number(match[2]), rule_sha256: createHash('sha256').update(line.replace(/^\[\d+:\d+\]\s+/, '')).digest('hex') });
  }
  return rows;
}

function inspectFirewall() {
  const nft = commandResult('nft', ['list', 'ruleset']);
  if (nft.status === 0) {
    const counters = nftOutputCounters(nft.stdout);
    return {
      inspected: true,
      backend: 'nft',
      output_policy_drop: nftBlocksEgress(nft.stdout),
      inspection: { nft_status: nft.status, nft_error: nft.error },
      rules_sha256: createHash('sha256').update(nft.stdout).digest('hex'),
      counters_available: counters.length > 0,
      output_rule_counters: counters
    };
  }
  const ipv4 = commandResult('iptables-save', ['-c']);
  const ipv6 = commandResult('ip6tables-save', ['-c']);
  if (ipv4.status === 0 && ipv6.status === 0) {
    const counters = [...iptablesOutputCounters(ipv4.stdout), ...iptablesOutputCounters(ipv6.stdout)];
    return {
      inspected: true,
      backend: 'iptables+ip6tables',
      output_policy_drop: iptablesBlocksEgress(ipv4.stdout) && iptablesBlocksEgress(ipv6.stdout),
      inspection: { ipv4_status: ipv4.status, ipv4_error: ipv4.error, ipv6_status: ipv6.status, ipv6_error: ipv6.error },
      rules_sha256: createHash('sha256').update(ipv4.stdout + '\n' + ipv6.stdout).digest('hex'),
      counters_available: counters.length > 0,
      output_rule_counters: counters
    };
  }
  return {
    inspected: false, backend: null, output_policy_drop: false, rules_sha256: null, counters_available: false,
    output_rule_counters: null,
    inspection: { nft_status: nft.status, nft_error: nft.error, ipv4_status: ipv4.status, ipv4_error: ipv4.error, ipv6_status: ipv6.status, ipv6_error: ipv6.error }
  };
}

export async function inspectIsolation(env = process.env) {
  const ipv4 = commandResult('ip', ['-4', '-json', 'route', 'show', 'table', 'all']);
  const ipv6 = commandResult('ip', ['-6', '-json', 'route', 'show', 'table', 'all']);
  const ipv4Rules = commandResult('ip', ['-4', '-json', 'rule', 'show']);
  const ipv6Rules = commandResult('ip', ['-6', '-json', 'rule', 'show']);
  const v4 = routesAreLoopbackOnly(ipv4);
  const v6 = routesAreLoopbackOnly(ipv6);
  const networkNamespace = await inspectNetworkNamespace(env, ipv4, ipv6, ipv4Rules, ipv6Rules);
  const firewall = inspectFirewall();
  const configuredProxies = PROXY_KEYS.filter(key => Boolean(env[key]));
  const strippedProxyVariables = String(env.PROPERTY_LAB_STRIPPED_PROXY_VARIABLES || '').split(/\s+/).filter(name => PROXY_KEYS.includes(name));
  const v4Loopback = await probeLoopback('127.0.0.1');
  const v6Loopback = await probeLoopback('::1');
  const resolv = await readFile('/etc/resolv.conf', 'utf8').catch(() => null);
  const nameservers = resolv === null ? null : [...resolv.matchAll(/^\s*nameserver\s+(\S+)/gm)].map(match => match[1]);
  const dnsLoopbackOnly = Array.isArray(nameservers) && nameservers.length > 0 && nameservers.every(server => server === '127.0.0.1' || server === '127.0.0.53' || server === '::1');
  const seccomp = await readFile('/proc/self/status', 'utf8').catch(() => '');
  const seccompMode = Number(seccomp.match(/^Seccomp:\s+(\d+)/m)?.[1] || 0);
  const reasons = [];
  if (!v4.ok) reasons.push('IPv4: ' + v4.reason);
  if (!v6.ok) reasons.push('IPv6: ' + v6.reason);
  if (ipv4Rules.status !== 0) reasons.push('IPv4 policy-routing rules could not be inspected');
  if (ipv6Rules.status !== 0) reasons.push('IPv6 policy-routing rules could not be inspected');
  const firewallBlocksEgress = firewall.inspected && firewall.output_policy_drop;
  if (!firewallBlocksEgress && !networkNamespace.verified) reasons.push('effective IPv4/IPv6 egress firewall or isolated network namespace not proven');
  if (configuredProxies.length) reasons.push('proxy variables are configured');
  if (!dnsLoopbackOnly) reasons.push('DNS configuration is unavailable, empty, or includes a non-loopback resolver');
  if (!v4Loopback.ok) reasons.push('IPv4 loopback unavailable: ' + v4Loopback.reason);
  if (!v6Loopback.ok) reasons.push('IPv6 loopback unavailable: ' + v6Loopback.reason);
  const pass = reasons.length === 0;
  return {
    verdict: pass ? 'PASS' : 'BLOCKED',
    inspected_utc: new Date().toISOString(),
    process_policy: { seccomp_mode: seccompMode, no_new_privs: /^NoNewPrivs:\s+1/m.test(seccomp) },
    routes: {
      ipv4_loopback_only: v4.ok, ipv6_loopback_only: v6.ok,
      ipv4_inspection: { status: ipv4.status, error: ipv4.error },
      ipv6_inspection: { status: ipv6.status, error: ipv6.error },
      ipv4_policy_rules_inspected: ipv4Rules.status === 0,
      ipv6_policy_rules_inspected: ipv6Rules.status === 0,
      policy_rules_errors: [ipv4Rules.error, ipv6Rules.error].filter(Boolean),
      raw_routes_saved: false
    },
    network_namespace: networkNamespace,
    egress_boundary: firewallBlocksEgress ? 'firewall' : networkNamespace.verified ? 'isolated-network-namespace' : null,
    dns: { inspected: resolv !== null, nameservers, loopback_only: dnsLoopbackOnly },
    firewall,
    proxies: { configured: configuredProxies.length > 0, variable_names: configuredProxies, parent_variables_stripped: strippedProxyVariables },
    loopback: { ipv4: v4Loopback, ipv6: v6Loopback },
    public_tcp_probe_sent: false,
    public_dns_query_sent: false,
    reasons
  };
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

async function killTree(child, signal = 'SIGTERM') {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, timeout: 5000 });
    return;
  }
  try { process.kill(-child.pid, signal); }
  catch {
    try { child.kill(signal); } catch {}
  }
}

async function writeSelfTestSums(outputDir) {
  const names = (await readdir(outputDir)).filter(name => name !== 'SHA256SUMS').sort();
  const lines = [];
  for (const name of names) {
    const target = path.join(outputDir, name);
    if ((await stat(target)).isFile()) lines.push(createHash('sha256').update(await readFile(target)).digest('hex') + '  ' + name);
  }
  await writeFile(path.join(outputDir, 'SHA256SUMS'), lines.join('\n') + '\n', { mode: 0o600 });
}

function verifySelfTestSums(outputDir) {
  const sums = spawnSync(process.execPath, ['-e', [
    'const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path");',
    'const dir=process.argv[1],rows=fs.readFileSync(path.join(dir,"SHA256SUMS"),"utf8").trim().split(/\\n/);',
    'for(const row of rows){const m=row.match(/^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/);if(!m)process.exit(2);',
    'const got=crypto.createHash("sha256").update(fs.readFileSync(path.join(dir,m[2]))).digest("hex");if(got!==m[1])process.exit(1)}'
  ].join(''), outputDir], { encoding: 'utf8', timeout: 5000 });
  return sums.status === 0;
}

async function runInterruptibleFixture(outputDir) {
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const worker = spawn(process.execPath, ['-e', 'process.send({ pid: process.pid });setInterval(()=>{},1000)'], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    detached: process.platform !== 'win32',
    windowsHide: true,
    env: safeEnv()
  });
  let workerPid = null;
  let log = '';
  worker.stderr.setEncoding('utf8');
  worker.stderr.on('data', chunk => { log += chunk; });
  const ready = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), 2500);
    worker.once('error', error => { log += 'spawn_error=' + error.message; clearTimeout(timer); resolve(false); });
    worker.once('message', message => {
      if (!Number.isInteger(message?.pid) || message.pid <= 0) { clearTimeout(timer); resolve(false); return; }
      workerPid = message.pid;
      log += 'WORKER_PID=' + workerPid + '\n';
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (!ready) {
    await killTree(worker);
    await Promise.race([new Promise(resolve => worker.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 1500))]);
    if (workerPid && processExists(workerPid)) await killTree(worker, 'SIGKILL');
    const cleaned = !workerPid || !processExists(workerPid);
    await writeFile(path.join(outputDir, 'worker.log'), sanitizeText(log), { mode: 0o600 });
    await writeFile(path.join(outputDir, 'cases.jsonl'), JSON.stringify({
      case: 'G00-04', status: 'FAIL', gate_eligible: false, exit_code: 1,
      reason: 'Interruption worker did not become ready; cleanup ' + (cleaned ? 'verified.' : 'not verified.')
    }) + '\n', { mode: 0o600 });
    await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify({
      status: 'FAIL', exit_code: 1, child_pid: workerPid, child_cleanup_verified: cleaned, evidence_preserved: true
    }, null, 2) + '\n', { mode: 0o600 });
    await writeSelfTestSums(outputDir);
    return 1;
  }
  const signal = await new Promise(resolve => {
    const timer = setTimeout(() => resolve('TIMEOUT'), 5000);
    const onInt = () => { clearTimeout(timer); process.removeListener('SIGTERM', onTerm); resolve('SIGINT'); };
    const onTerm = () => { clearTimeout(timer); process.removeListener('SIGINT', onInt); resolve('SIGTERM'); };
    process.once('SIGINT', onInt);
    process.once('SIGTERM', onTerm);
    writeFileSync(path.join(outputDir, 'ready.json'), JSON.stringify({ pid: process.pid, child_pid: workerPid }) + '\n', { mode: 0o600 });
    process.stdout.write('READY WORKER_PID=' + workerPid + '\n');
  });
  if (signal === 'TIMEOUT') {
    await killTree(worker);
    await Promise.race([new Promise(resolve => worker.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 1500))]);
    if (processExists(workerPid)) await killTree(worker, 'SIGKILL');
    const cleaned = !processExists(workerPid);
    await writeFile(path.join(outputDir, 'worker.log'), sanitizeText(log), { mode: 0o600 });
    await writeFile(path.join(outputDir, 'cases.jsonl'), JSON.stringify({
      case: 'G00-04', status: 'FAIL', gate_eligible: false, exit_code: 1,
      reason: 'Interruption signal was not received by the harness; child cleanup ' + (cleaned ? 'verified.' : 'not verified.')
    }) + '\n', { mode: 0o600 });
    await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify({
      status: 'FAIL', exit_code: 1, child_pid: workerPid, child_cleanup_verified: cleaned, evidence_preserved: true
    }, null, 2) + '\n', { mode: 0o600 });
    await writeSelfTestSums(outputDir);
    return 1;
  }
  await killTree(worker, 'SIGTERM');
  const closed = await Promise.race([
    new Promise(resolve => worker.once('close', () => resolve(true))),
    new Promise(resolve => setTimeout(() => resolve(false), 1500))
  ]);
  if (!closed) {
    await killTree(worker, 'SIGKILL');
    await Promise.race([new Promise(resolve => worker.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 1000))]);
  }
  if (processExists(workerPid)) await killTree(worker, 'SIGKILL');
  const cleaned = !processExists(workerPid);
  await writeFile(path.join(outputDir, 'worker.log'), sanitizeText(log), { mode: 0o600 });
  await writeFile(path.join(outputDir, 'cases.jsonl'), JSON.stringify({
    case: 'G00-04', status: 'BLOCKED', gate_eligible: false, exit_code: 130,
    reason: 'Test interrupted by ' + signal + '; child process tree was terminated.'
  }) + '\n', { mode: 0o600 });
  await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify({
    status: 'BLOCKED', exit_code: 130, interruption_signal: signal,
    child_pid: workerPid, child_cleanup_verified: cleaned, evidence_preserved: true
  }, null, 2) + '\n', { mode: 0o600 });
  await writeSelfTestSums(outputDir);
  process.exitCode = cleaned ? 130 : 1;
  return process.exitCode;
}

export async function verifyInterruptionHarness(outputRoot) {
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const temp = await import('node:fs/promises').then(module => module.mkdtemp(path.join(os.tmpdir(), 'property-g00-04-')));
  const inner = path.join(temp, 'interrupted-run');
  const child = spawn(process.execPath, [SCRIPT, '--interruptible-fixture', '--output', inner], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true,
    env: safeEnv()
  });
  let output = '';
  let childResult = null;
  const childClosed = new Promise(resolve => {
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => resolve({ code: 1, signal: null, error: error.message }));
    child.once('close', (code, signal) => resolve({ code, signal, error: null }));
  });
  let readyRecord = null;
  for (let attempt = 0; attempt < 120 && !readyRecord; attempt++) {
    try { readyRecord = JSON.parse(await readFile(path.join(inner, 'ready.json'), 'utf8')); } catch {}
    if (!readyRecord) await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (readyRecord) {
    try { child.kill('SIGINT'); } catch {}
  } else {
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
  childResult = await Promise.race([
    childClosed,
    new Promise(resolve => setTimeout(() => resolve(null), 2500))
  ]);
  if (!childResult) {
    try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL'); } catch {}
    childResult = await Promise.race([childClosed, new Promise(resolve => setTimeout(() => resolve({ code: null, signal: 'SIGKILL', error: 'runner failed to exit after kill' }), 1000))]);
  }
  const result = childResult;
  const summaryPath = path.join(inner, 'summary.json');
  const casePath = path.join(inner, 'cases.jsonl');
  let summary = null;
  let caseRecord = null;
  try {
    summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    caseRecord = JSON.parse((await readFile(casePath, 'utf8')).trim());
  } catch {}
  const sumsValid = await access(path.join(inner, 'SHA256SUMS')).then(() => verifySelfTestSums(inner)).catch(() => false);
  const childPid = Number(summary?.child_pid || output.match(/WORKER_PID=(\d+)/)?.[1] || 0);
  const cleanupObserved = childPid > 0 && !processExists(childPid);
  const target = path.join(outputRoot, 'g00-04');
  await mkdir(target, { recursive: true, mode: 0o700 });
  const groupCleanupPath = path.join(target, 'process-group-interruption.json');
  const groupCleanupRun = spawnSync(process.execPath, [path.join(ROOT, 'property/tests/offline/process-group-interruption-smoke.mjs'), '--output', groupCleanupPath], {
    cwd: ROOT, env: safeEnv(), encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true
  });
  let groupCleanup = null;
  try { groupCleanup = JSON.parse(await readFile(groupCleanupPath, 'utf8')); } catch {}
  const relayGroupCleanupVerified = groupCleanupRun.status === 0 && groupCleanup?.result === 'PASS' && groupCleanup?.detached_worker_group_stopped === true;
  const passes = result.code !== 0 && result.code !== null && summary?.status === 'BLOCKED' &&
    summary?.exit_code !== 0 && summary?.child_cleanup_verified === true &&
    cleanupObserved && summary?.evidence_preserved === true && caseRecord?.case === 'G00-04' &&
    caseRecord?.status === 'BLOCKED' && sumsValid && relayGroupCleanupVerified;
  if (summary && caseRecord) {
    await copyFile(summaryPath, path.join(target, 'interrupted-summary.json'));
    await copyFile(casePath, path.join(target, 'interrupted-cases.jsonl'));
    await copyFile(path.join(inner, 'worker.log'), path.join(target, 'interrupted-worker.log'));
  }
  await writeFile(path.join(target, 'harness-verification.json'), JSON.stringify({
    status: passes ? 'PASS' : 'FAIL',
    child_exit_code: result.code,
    observed_ready: Boolean(readyRecord),
    captured_output: sanitizeText(output),
    interrupted_run_status: summary?.status || null,
    interrupted_run_exit_code: summary?.exit_code ?? null,
    child_cleanup_verified: cleanupObserved,
    evidence_preserved: summary?.evidence_preserved ?? false,
    checksums_verified: sumsValid,
    child_pid: childPid,
    detached_relay_group_cleanup_verified: relayGroupCleanupVerified,
    detached_relay_group_report: path.relative(outputRoot, groupCleanupPath),
    detached_relay_group_exit_code: groupCleanupRun.status,
    detached_relay_group_diagnostic: sanitizeText(groupCleanupRun.stderr || groupCleanupRun.stdout || groupCleanupRun.error?.message || ''),
    error: result.error
  }, null, 2) + '\n', { mode: 0o600 });
  await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  return { status: passes ? 'PASS' : 'FAIL', evidence: ['g00-04/harness-verification.json', 'g00-04/process-group-interruption.json'] };
}

async function writeChecksums(outputDir) {
  const files = [];
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'SHA256SUMS') continue;
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) files.push([relative, await readFile(absolute)]);
      else throw new Error('Evidence tree contains a symlink or non-regular file: ' + relative);
    }
  }
  await walk(outputDir);
  const lines = files.sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, contents]) => createHash('sha256').update(contents).digest('hex') + '  ' + name);
  await writeFile(path.join(outputDir, 'SHA256SUMS'), lines.join('\n') + '\n', { mode: 0o600 });
}

function initialCase(id, requirement) {
  return {
    case: id, gate: id.slice(0, 3), requirement, expected: requirement, observed: null,
    status: 'NOT_RUN', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
    exit_code: null, reason: 'Prerequisite gate has not passed.', evidence: []
  };
}

function setCase(cases, id, fields) {
  const row = cases.get(id);
  if (!row) throw new Error('Plan case missing from report: ' + id);
  Object.assign(row, fields);
  checkpointCases = cases;
  if (checkpointPath) {
    const snapshot = [...cases.values()].sort((a, b) => a.case.localeCompare(b.case));
    const timestamp = new Date().toISOString();
    appendFileSync(path.join(checkpointPath, 'case-events.jsonl'), JSON.stringify({
      checkpoint_utc: timestamp, ...row
    }) + '\n', { mode: 0o600 });
    writeFileSync(path.join(checkpointPath, 'cases.latest.jsonl'), snapshot.map(item => JSON.stringify(item)).join('\n') + '\n', { mode: 0o600 });
    const gate = id.slice(0, 3);
    const gateRows = snapshot.filter(item => item.case.startsWith(gate + '-'));
    if (gateRows.length && gateRows.every(item => item.status !== 'NOT_RUN') && !(gate === 'G00' && deferG00Checkpoint)) {
      appendFileSync(path.join(checkpointPath, 'gate-checkpoints.jsonl'), JSON.stringify({
        checkpoint_utc: timestamp, gate, status: deriveGateStatus(gateRows),
        cases: gateRows.map(item => item.case)
      }) + '\n', { mode: 0o600 });
    }
  }
}

export function deriveGateStatus(rows) {
  if (rows.some(row => row.status === 'FAIL')) return 'FAIL';
  if (rows.some(row => row.status === 'BLOCKED')) return 'BLOCKED';
  if (rows.some(row => row.status === 'NOT_RUN')) return 'NOT_RUN';
  if (rows.some(row => row.status === 'PENDING')) return 'PENDING';
  if (rows.some(row => row.gate_eligible !== true)) return 'BLOCKED';
  return rows.length > 0 && rows.every(row => row.status === 'PASS') ? 'PASS' : 'NOT_RUN';
}

export function deriveLaterGateEligibility(parentRows, laterRows) {
  const passes = (rows, gate) => deriveGateStatus(rows.filter(row => row.case.startsWith(gate + '-'))) === 'PASS';
  const priorG08 = passes(parentRows, 'G08');
  const childG09 = passes(laterRows, 'G09');
  const childG10 = passes(laterRows, 'G10');
  const childG11 = passes(laterRows, 'G11');
  return {
    G09: priorG08,
    G10: priorG08 && childG09,
    G11: priorG08 && childG09 && childG10,
    G12: priorG08 && childG09 && childG10 && childG11
  };
}

export function buildSummary(cases, profile, manifest, inventory, isolation) {
  const rows = [...cases.values()];
  const gates = Object.fromEntries(GATES.map(gate => [
    gate,
    deriveGateStatus(rows.filter(row => row.case.startsWith(gate + '-')))
  ]));
  const allPass = rows.length > 0 && rows.every(row => row.status === 'PASS' && row.gate_eligible === true);
  const executorMatches = manifest.actual_executor.trim().toLowerCase() === manifest.requested_executor.trim().toLowerCase();
  // Executor identity is provenance only. The maintainer chooses the active model;
  // a model-name mismatch must never change whether the test cases passed.
  const scopePass = allPass && Object.values(gates).every(status => status === 'PASS');
  const hasFailure = rows.some(row => row.status === 'FAIL');
  const deferredPlatforms = new Set(['G12-02', 'G12-03', 'G12-04', 'G12-05']);
  const deferredPlatformsPending = [...deferredPlatforms].every(caseId => {
    const row = cases.get(caseId);
    return row?.status === 'PENDING' && row.gate_eligible === false;
  });
  const ubuntuRequiredRows = rows.filter(row => !deferredPlatforms.has(row.case));
  const ubuntuRequiredPass = ubuntuRequiredRows.length > 0 && ubuntuRequiredRows.every(row => row.status === 'PASS' && row.gate_eligible === true);
  const ubuntuGatePass = [...Array.from({ length: 12 }, (_, index) => `G${String(index).padStart(2, '0')}`), 'G12']
    .every(gate => gates[gate] === 'PASS' || (gate === 'G12' && gates.G12 === 'PENDING' &&
      cases.get('G12-01')?.status === 'PASS' && cases.get('G12-06')?.status === 'PASS'));
  const ubuntuScopePass = profile === 'full' && ubuntuRequiredPass && deferredPlatformsPending && ubuntuGatePass && isolation.verdict === 'PASS';
  const result = scopePass ? 'PROPERTY_SCOPE_OFFLINE_PASS' : hasFailure ? 'FAIL' :
    ubuntuScopePass ? 'PROPERTY_UBUNTU_OFFLINE_PASS' : 'BLOCKED';
  return {
    schema_version: 1,
    run_id: manifest.run_id,
    profile,
    candidate_commit: manifest.candidate_commit,
    observed_head: inventory.observed_head,
    requested_executor: manifest.requested_executor,
    actual_executor: manifest.actual_executor,
    actual_executor_source: manifest.actual_executor_source,
    executor_matches_request: executorMatches,
    executor_identity_is_gating: false,
    started_utc: manifest.started_utc,
    ended_utc: new Date().toISOString(),
    gate_status: gates,
    case_totals: rows.reduce((totals, row) => {
      totals[row.status] = (totals[row.status] || 0) + 1;
      return totals;
    }, {}),
    isolation: isolation.verdict,
    ubuntu_scope_pass: ubuntuScopePass,
    deferred_platform_cases: [...deferredPlatforms],
    scope_result: result,
    exit_code: result === 'PROPERTY_SCOPE_OFFLINE_PASS' || result === 'PROPERTY_UBUNTU_OFFLINE_PASS' ? 0 : hasFailure ? 1 : 2
  };
}

async function runCommand(command, args, timeoutMs, logPath) {
  const started = new Date().toISOString();
  const child = spawn(command, args, {
    cwd: ROOT,
    env: safeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true
  });
  currentChild = child;
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let wasInterrupted = false;
  const capture = (current, chunk) => {
    const next = current + chunk.toString();
    return next.length > MAX_OUTPUT_BYTES ? next.slice(-MAX_OUTPUT_BYTES) : next;
  };
  child.stdout.on('data', chunk => { stdout = capture(stdout, chunk); });
  child.stderr.on('data', chunk => { stderr = capture(stderr, chunk); });
  const timer = setTimeout(async () => {
    timedOut = true;
    await killTree(child, 'SIGTERM');
    setTimeout(() => killTree(child, 'SIGKILL'), 1500).unref();
  }, timeoutMs);
  const closed = await new Promise(resolve => {
    child.once('error', error => resolve({ code: 127, signal: null, error: error.message }));
    child.once('close', (code, signal) => resolve({ code, signal, error: null }));
  });
  clearTimeout(timer);
  if (currentChild === child) currentChild = null;
  await mkdir(path.dirname(logPath), { recursive: true, mode: 0o700 });
  await writeFile(logPath, sanitizeText('command: ' + command + ' ' + args.join(' ') + '\nstarted: ' + started +
    '\nended: ' + new Date().toISOString() + '\nexit_code: ' + closed.code + '\nsignal: ' +
    (closed.signal || '') + '\ntimeout: ' + timedOut + '\nerror: ' + (closed.error || '') +
    '\n--- stdout ---\n' + stdout + '\n--- stderr ---\n' + stderr), { mode: 0o600 });
  return {
    started_utc: started,
    ended_utc: new Date().toISOString(),
    exit_code: closed.code,
    signal: closed.signal,
    error: closed.error,
    timed_out: timedOut,
    interrupted: wasInterrupted || Boolean(interruptionSignal),
    stdout: sanitizeText(stdout),
    stderr: sanitizeText(stderr),
    log: path.relative(path.dirname(path.dirname(logPath)), logPath).split(path.sep).join('/')
  };
}

function commandOutcome(result) {
  if (result.interrupted || result.timed_out) return 'BLOCKED';
  if (result.exit_code === 0) return 'PASS';
  const detail = [result.error, result.stderr, result.stdout].filter(Boolean).join('\n');
  if (result.exit_code === 127 || /\b(?:EPERM|EACCES|ENOSYS|ENOENT)\b|Operation not permitted|command not found|No such file or directory/i.test(detail)) return 'BLOCKED';
  return 'FAIL';
}

export function parsePlanCaseDetails(planText) {
  const section = planText.match(/^## 6\. Casos obrigat[oó]rios por gate[ \t]*\n([\s\S]*?)(?=^## 7\.)/m);
  if (!section) throw new Error('Could not locate the plan case registry in section 6.');
  const rows = [...section[1].matchAll(/^\|\s*(G[0-9]{2}-[0-9]{2})\s*\|\s*(.*?)\s*\|/gm)];
  const ids = rows.map(match => match[1]);
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Plan case registry is empty or contains duplicate IDs.');
  const missingGates = GATES.filter(gate => !ids.some(id => id.startsWith(gate + '-')));
  if (missingGates.length) throw new Error('Plan case registry is missing gates: ' + missingGates.join(', '));
  return new Map(rows.map(match => [match[1], match[2].trim()]));
}

export function parsePlanCases(planText) {
  return [...parsePlanCaseDetails(planText).keys()].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

async function prepareOutput(output, resume = false) {
  const absolute = path.resolve(ROOT, output);
  if (resume) {
    const info = await lstat(absolute).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('--resume requires an existing, real output directory');
    for (const name of ['manifest.json', 'resume-state.json', 'cases.latest.jsonl']) {
      await access(path.join(absolute, name)).catch(() => { throw new Error('--resume requires prior ' + name); });
    }
  } else {
    await mkdir(absolute, { recursive: false, mode: 0o700 });
  }
  await chmod(absolute, 0o700).catch(() => {});
  return absolute;
}

function stableManifestConfig(manifest) {
  const generated = new Set(['started_utc', 'ended_utc', 'attempt_number', 'resumed_from_attempt']);
  return Object.fromEntries(Object.entries(manifest).filter(([key]) => !generated.has(key)).sort(([a], [b]) => a.localeCompare(b)));
}

export function buildResumeFingerprint(manifest, inventory, planText, profile, externalInputs = {}) {
  return {
    schema_version: 1,
    run_id: manifest.run_id,
    profile,
    candidate_commit: manifest.candidate_commit,
    manifest_config_sha256: createHash('sha256').update(JSON.stringify(stableManifestConfig(manifest))).digest('hex'),
    candidate_state_sha256: inventory.candidate_state_sha256,
    plan_sha256: createHash('sha256').update(planText).digest('hex'),
    external_inputs: externalInputs
  };
}

export function compareResumeFingerprints(previous, current) {
  const fields = ['schema_version', 'run_id', 'profile', 'candidate_commit', 'manifest_config_sha256', 'candidate_state_sha256', 'plan_sha256'];
  return fields.filter(field => previous?.[field] !== current?.[field])
    .concat(JSON.stringify(previous?.external_inputs ?? null) !== JSON.stringify(current?.external_inputs ?? null) ? ['external_inputs'] : []);
}

async function verifyArtifactChecksums(outputDir) {
  let checksumText;
  try { checksumText = await readFile(path.join(outputDir, 'SHA256SUMS'), 'utf8'); }
  catch { return { present: false, valid: null, reason: 'No final SHA256SUMS exists; prior attempt may have been interrupted.' }; }
  const expected = new Map();
  for (const line of checksumText.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || expected.has(match[2]) || path.posix.isAbsolute(match[2]) || path.win32.isAbsolute(match[2]) ||
        match[2].includes('\\') || match[2].split('/').some(part => part === '..' || part === '')) {
      return { present: true, valid: false, reason: 'SHA256SUMS contains an invalid or duplicate path.' };
    }
    expected.set(match[2], match[1]);
  }
  const actual = new Set();
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!prefix && entry.name === 'SHA256SUMS') continue;
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error('symlink found in prior evidence: ' + relative);
      if (info.isDirectory()) await walk(absolute, relative);
      else if (info.isFile()) actual.add(relative);
      else throw new Error('non-regular artifact found in prior evidence: ' + relative);
    }
  }
  try { await walk(outputDir); }
  catch (error) { return { present: true, valid: false, reason: sanitizeText(error.message) }; }
  if (actual.size !== expected.size || [...actual].some(name => !expected.has(name))) {
    return { present: true, valid: false, reason: 'SHA256SUMS does not cover the prior evidence tree exactly.' };
  }
  for (const [relative, digest] of expected) {
    const contents = await readFile(path.join(outputDir, ...relative.split('/')));
    if (createHash('sha256').update(contents).digest('hex') !== digest) {
      return { present: true, valid: false, reason: 'Prior evidence hash mismatch: ' + relative };
    }
  }
  return { present: true, valid: true, reason: null };
}

async function archiveCurrentAttempt(outputDir) {
  const historyDir = path.join(outputDir, 'history');
  const existingHistory = await lstat(historyDir).catch(() => null);
  if (existingHistory && (!existingHistory.isDirectory() || existingHistory.isSymbolicLink())) {
    throw new Error('prior history path is not a real directory');
  }
  await mkdir(historyDir, { recursive: true, mode: 0o700 });
  const existingAttempts = await readdir(historyDir, { withFileTypes: true });
  const attemptNumber = existingAttempts.reduce((maximum, entry) => {
    const match = /^attempt-(\d+)$/.exec(entry.name);
    return match && entry.isDirectory() ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
  const name = 'attempt-' + String(attemptNumber).padStart(3, '0');
  const archiveDir = path.join(historyDir, name);
  await mkdir(archiveDir, { mode: 0o700 });
  const entries = (await readdir(outputDir, { withFileTypes: true })).filter(entry => entry.name !== 'history');
  if (!entries.length) throw new Error('prior attempt has no artifacts to preserve');
  for (const entry of entries) await rename(path.join(outputDir, entry.name), path.join(archiveDir, entry.name));
  return { attempt_number: attemptNumber, relative_path: path.posix.join('history', name) };
}

export async function beginAttempt(outputDir, manifest, inventory, planText, profile, externalInputs, cases, resume) {
  const fingerprint = buildResumeFingerprint(manifest, inventory, planText, profile, externalInputs);
  let resumeReview = null;
  if (resume) {
    const previous = JSON.parse(await readFile(path.join(outputDir, 'resume-state.json'), 'utf8'));
    const priorManifest = JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
    const priorInventory = JSON.parse(await readFile(path.join(outputDir, 'inventory.json'), 'utf8'));
    const priorFingerprint = buildResumeFingerprint(priorManifest, priorInventory, planText, previous.profile, previous.external_inputs || {});
    const priorArtifactMismatches = compareResumeFingerprints(previous, priorFingerprint);
    if (priorArtifactMismatches.length) {
      throw new Error('resume refused because prior manifest/inventory do not match resume-state: ' + priorArtifactMismatches.join(', '));
    }
    const mismatches = compareResumeFingerprints(previous, fingerprint);
    if (mismatches.length) throw new Error('resume refused because these inputs changed: ' + mismatches.join(', ') + '; preserve this directory and start a new run_id');
    const previousRows = (await readFile(path.join(outputDir, 'cases.latest.jsonl'), 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const expectedRows = [...cases.values()].sort((a, b) => a.case.localeCompare(b.case));
    if (previousRows.length !== expectedRows.length || previousRows.some((row, index) =>
      row.case !== expectedRows[index].case || row.requirement !== expectedRows[index].requirement)) {
      throw new Error('resume refused because the prior case registry differs from the current plan');
    }
    const integrity = await verifyArtifactChecksums(outputDir);
    if (integrity.present && integrity.valid !== true) throw new Error('resume refused because prior evidence failed hash verification: ' + integrity.reason);
    const oldSummary = await readFile(path.join(outputDir, 'summary.json'), 'utf8').then(JSON.parse).catch(() => null);
    const archived = await archiveCurrentAttempt(outputDir);
    manifest.attempt_number = archived.attempt_number + 1;
    manifest.resumed_from_attempt = archived.relative_path;
    resumeReview = {
      schema_version: 1,
      run_id: manifest.run_id,
      prior_attempt: archived.relative_path,
      prior_summary_result: oldSummary?.scope_result || 'INCOMPLETE_OR_INTERRUPTED',
      prior_gate_status: oldSummary?.gate_status || null,
      prior_evidence_checksums: integrity,
      pending_case_ids: previousRows.filter(row => row.status !== 'PASS' || row.gate_eligible !== true).map(row => row.case),
      restart_policy: 'Rerun from G00; no previous PASS is carried into the resumed attempt.'
    };
    await writeFile(path.join(outputDir, 'resume-review.json'), JSON.stringify(resumeReview, null, 2) + '\n', { mode: 0o600 });
  } else {
    manifest.attempt_number = 1;
  }
  const state = { ...fingerprint, attempt_number: manifest.attempt_number, resumed_from_attempt: manifest.resumed_from_attempt || null };
  await writeFile(path.join(outputDir, 'resume-state.json'), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  return { resume_review: resumeReview, attempt_number: manifest.attempt_number };
}

function initializeCheckpoints(outputDir, cases) {
  writeFileSync(path.join(outputDir, 'case-events.jsonl'), '', { mode: 0o600 });
  writeFileSync(path.join(outputDir, 'gate-checkpoints.jsonl'), '', { mode: 0o600 });
  writeFileSync(path.join(outputDir, 'cases.latest.jsonl'), [...cases.values()].map(row => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 });
}

async function runCoreProfile(profile, manifest, outputDir, cases, inventory, isolation) {
  // The executor identity is retained in the manifest and final report. It does not change
  // whether locally isolated deterministic cases can safely execute.
  const eligible = isolation.verdict === 'PASS';
  const addSimple = (id, status, reason, command = null) => setCase(cases, id, {
    status, gate_eligible: id === 'G00-01' ? true : eligible,
    command, started_utc: new Date().toISOString(), ended_utc: new Date().toISOString(), reason, observed: reason
  });
  const inventoryStatus = inventory.integrity.ready_for_g00_01 ? 'PASS' : 'BLOCKED';
  addSimple('G00-01', inventoryStatus, inventory.integrity.ready_for_g00_01
    ? 'Requirement sources, candidate commit, working tree and tool/host inventory were captured with hashes.'
    : 'Inventory is incomplete or candidate commit/source registry does not match; see inventory.json.');
  setCase(cases, 'G00-01', {
    observed: inventory.integrity.ready_for_g00_01 ? 'All required sources and the dirty worktree are hashed; candidate HEAD matches.' : JSON.stringify(inventory.integrity),
    evidence: ['inventory.json', 'manifest.json', 'topology.json']
  });
  const isolationReasons = [...isolation.reasons];
  addSimple('G00-02', isolation.verdict, isolationReasons.join('; ') || 'Routes, firewall, proxy policy and loopback were checked without public probes.');
  setCase(cases, 'G00-02', { observed: isolationReasons.join('; ') || 'All recorded isolation checks passed.' });

  const budget = manifest.resource_budget;
  const cpuAvailable = inventory.cgroup_limits.effective_cpu_count;
  const cpuAdequate = cpuAvailable !== null && cpuAvailable >= budget.min_cpus;
  const ramAdequate = inventory.host.ram_total_bytes >= budget.min_ram_bytes && inventory.runtime_memory_budget?.status === 'PASS';
  const diskAdequate = inventory.host.tmp_available_bytes !== null && inventory.host.tmp_available_bytes >= budget.min_tmp_bytes;
  if (!eligible) {
    addSimple('G00-03', 'BLOCKED', 'Relay startup was not attempted because isolation and executor preconditions are not eligible.');
  } else if (!cpuAdequate || !ramAdequate || !diskAdequate) {
    const missing = [];
    if (!cpuAdequate) missing.push('effective CPU availability unknown or below manifest budget');
    if (!ramAdequate) missing.push('physical RAM or capped child-process memory budget below manifest minimum');
    if (!diskAdequate) missing.push('temporary disk unknown or below manifest budget');
    addSimple('G00-03', 'BLOCKED', missing.join('; '));
  } else {
    const p = manifest.ports;
    const first = await runCommand('bash', ['property/tests/run-bridge-integration.sh', String(p.bridge_source), String(p.bridge_target)],
      manifest.case_timeout_ms, path.join(outputDir, 'logs/G00-03-two-relays.log'));
    const second = commandOutcome(first) === 'PASS'
      ? await runCommand('bash', ['property/tests/seven-relays-smoke.sh', String(p.seven_relay_base)],
        manifest.case_timeout_ms, path.join(outputDir, 'logs/G00-03-seven-relays.log'))
      : { exit_code: 127, started_utc: null, ended_utc: null, timed_out: false, interrupted: false, error: 'prerequisite did not pass' };
    const pass = first.exit_code === 0 && second.exit_code === 0;
    setCase(cases, 'G00-03', {
      status: pass ? 'PASS' : ([first, second].some(result => commandOutcome(result) === 'FAIL') ? 'FAIL' : 'BLOCKED'),
      gate_eligible: eligible,
      command: 'run-bridge-integration.sh and seven-relays-smoke.sh',
      started_utc: first.started_utc, ended_utc: second.ended_utc || first.ended_utc,
      exit_code: pass ? 0 : (first.exit_code ?? second.exit_code),
      reason: pass ? 'Two and seven real Geode relays completed with isolated loopback endpoints.' :
        (second.started_utc ? 'One or more real relay startup tests failed or timed out.' : 'Two-relay prerequisite did not pass; seven-relay startup was not attempted.'),
      observed: JSON.stringify({ two_relays: { exit_code: first.exit_code, error: first.error }, seven_relays: { exit_code: second.exit_code, error: second.error } }),
      evidence: ['logs/G00-03-two-relays.log', ...(second.started_utc ? ['logs/G00-03-seven-relays.log'] : [])]
    });
  }

  const interrupt = await verifyInterruptionHarness(outputDir);
  setCase(cases, 'G00-04', {
    status: interrupt.status,
    gate_eligible: eligible,
    command: 'runner interruption self-test',
    started_utc: new Date().toISOString(), ended_utc: new Date().toISOString(),
    exit_code: interrupt.status === 'PASS' ? 0 : 1,
    reason: interrupt.status === 'PASS' ? 'Interrupted child returned BLOCKED/nonzero; cleanup and evidence hashes verified.' : 'Interruption harness did not prove cleanup and durable evidence.',
    observed: JSON.stringify(interrupt),
    evidence: interrupt.evidence
  });

  const g00Rows = [...cases.values()].filter(row => row.case.startsWith('G00-'));
  const g00Status = deriveGateStatus(g00Rows);
  if (g00Status !== 'PASS') {
    for (const row of cases.values()) {
      if (!row.case.startsWith('G00-')) {
        row.status = 'NOT_RUN';
        row.gate_eligible = false;
        row.reason = 'G00 did not pass; dependent gate was not started.';
      }
    }
    return;
  }

  const smoke = await runCommand('bash', ['property/tests/run-smoke.sh'], manifest.case_timeout_ms,
    path.join(outputDir, 'logs/G01-01-smoke.log'));
  const smokeStatus = commandOutcome(smoke);
  setCase(cases, 'G01-01', {
    status: smokeStatus,
    gate_eligible: true, command: 'bash property/tests/run-smoke.sh',
    started_utc: smoke.started_utc, ended_utc: smoke.ended_utc, exit_code: smoke.exit_code,
    reason: smokeStatus === 'PASS' ? 'The local smoke runner completed.' : 'Smoke runner failed, was interrupted, or its execution prerequisite was unavailable.',
    observed: smoke.stdout.trim(),
    evidence: [smoke.log]
  });
  if (smoke.interrupted || interruptionSignal) {
    for (const row of cases.values()) {
      if (!row.case.startsWith('G01-') && row.status === 'NOT_RUN') {
        row.status = 'BLOCKED'; row.gate_eligible = false; row.reason = 'Runner interruption prevented this dependent case from starting.';
      }
    }
    return;
  }
  const ports = manifest.ports;
  const bridge = await runCommand('bash', ['property/tests/run-bridge-integration.sh', String(ports.bridge_source), String(ports.bridge_target)],
    manifest.case_timeout_ms, path.join(outputDir, 'logs/G01-02-bridge.log'));
  const native = bridge.interrupted || interruptionSignal
    ? { exit_code: 127, started_utc: null, ended_utc: null, timed_out: false, interrupted: true, error: 'runner interrupted before native integration started' }
    : await runCommand(process.execPath, ['property/tests/native-relay-integration.mjs'],
      manifest.case_timeout_ms, path.join(outputDir, 'logs/G01-02-native.log'));
  const integrationStatus = bridge.exit_code === 0 && native.exit_code === 0 ? 'PASS' :
    ([bridge, native].some(result => commandOutcome(result) === 'FAIL') ? 'FAIL' : 'BLOCKED');
  setCase(cases, 'G01-02', {
    status: integrationStatus, gate_eligible: true,
    command: 'two-relay bridge and native launcher integration',
    started_utc: bridge.started_utc, ended_utc: native.ended_utc,
    exit_code: integrationStatus === 'PASS' ? 0 : (bridge.exit_code ?? native.exit_code),
    reason: integrationStatus === 'PASS' ? 'Bridge and native launcher integration both completed.' : 'Bridge or native launcher integration failed or timed out.',
    observed: JSON.stringify({ bridge: { exit_code: bridge.exit_code, error: bridge.error }, native: { exit_code: native.exit_code, error: native.error } }),
    evidence: ['logs/G01-02-bridge.log', ...(native.started_utc ? ['logs/G01-02-native.log'] : [])]
  });
  if (bridge.interrupted || native.interrupted || interruptionSignal) {
    setCase(cases, 'G01-03', {
      status: 'BLOCKED', gate_eligible: false,
      command: 'node property/tests/offline/mutation-sensitivity-smoke.mjs',
      started_utc: null, ended_utc: null, exit_code: 130,
      reason: 'Runner interruption stopped the gate before the mutation-sensitivity case started.',
      observed: 'NOT_STARTED_AFTER_INTERRUPT'
    });
    return;
  }
  const mutation = await runCommand(process.execPath, ['property/tests/offline/mutation-sensitivity-smoke.mjs'],
    manifest.case_timeout_ms, path.join(outputDir, 'logs/G01-03-mutation-sensitivity.log'));
  const mutationStatus = commandOutcome(mutation);
  setCase(cases, 'G01-03', {
    status: mutationStatus,
    gate_eligible: true,
    command: 'node property/tests/offline/mutation-sensitivity-smoke.mjs',
    started_utc: mutation.started_utc, ended_utc: mutation.ended_utc, exit_code: mutation.exit_code,
    reason: mutationStatus === 'PASS' ? 'Isolated mutations of signature, bundle hash, atomic price and encrypted backup failed for the expected reasons.' :
      'Mutation-sensitivity fixture failed, was interrupted, or lacked an execution prerequisite.',
    observed: mutation.stdout.trim(),
    evidence: [mutation.log]
  });
  const g01Status = deriveGateStatus([...cases.values()].filter(row => row.case.startsWith('G01-')));
  const markLaterGates = (firstGate, reason) => {
    for (const row of cases.values()) {
      const gateNumber = Number(row.case.slice(1, 3));
      if (gateNumber >= firstGate && row.status === 'NOT_RUN') {
        row.gate_eligible = false;
        row.reason = reason;
      }
    }
  };
  if (g01Status !== 'PASS') {
    markLaterGates(2, 'G01 did not pass; dependent gate was not started.');
    return;
  }

  const originTimeout = Math.max(manifest.case_timeout_ms, 1_800_000);
  const origin = await runCommand(process.execPath, ['property/tests/offline/g02-origin-smoke.mjs', '--offline-build', '--build-timeout-ms', String(originTimeout)],
    originTimeout, path.join(outputDir, 'logs/G02-01-origin.log'));
  const originStatus = origin.exit_code === 2 && /"result":"BLOCKED"/.test(origin.stdout)
    ? 'BLOCKED' : commandOutcome(origin);
  setCase(cases, 'G02-01', {
    status: originStatus, gate_eligible: true,
    command: 'node property/tests/offline/g02-origin-smoke.mjs',
    started_utc: origin.started_utc, ended_utc: origin.ended_utc, exit_code: origin.exit_code,
    reason: originStatus === 'PASS' ? (/"status":"SKIPPED_TOOLCHAIN_INCOMPLETE"/.test(origin.stdout)
      ? 'Pinned origins, local licenses, package hashes and asset locality passed; the missing cached Gradle distribution was recorded and no rebuild/download was attempted.'
      : 'Pinned Amethyst/Geode origins, local license notices, package manifests and runtime asset locality passed, including the offline source rebuild.') :
      'Origin or license verification failed, was interrupted, or lacked a local prerequisite.',
    observed: origin.stdout.trim(), evidence: [origin.log, 'logs/G01-01-smoke.log']
  });
  if (origin.interrupted || interruptionSignal) {
    for (const id of ['G02-02', 'G02-03']) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: 130, reason: 'Runner interruption stopped G02 before the browser cases started.', observed: 'NOT_STARTED_AFTER_INTERRUPT'
    });
    for (const id of ['G02-04', 'G02-05', 'G02-06']) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'No executor is registered for this required case.', observed: 'NO_EXECUTOR_REGISTERED'
    });
    markLaterGates(3, 'G02 did not pass; dependent gate was not started.');
    return;
  }

  const browserConfig = manifest.browser_automation;
  if (originStatus !== 'PASS') {
    for (const id of ['G02-02', 'G02-03']) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'G02-01 origin and license prerequisites did not pass.', observed: 'BLOCKED_BY_G02-01'
    });
  } else if (!browserConfig) {
    for (const id of ['G02-02', 'G02-03']) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'The lab manifest has no pinned Playwright module and browser executable.', observed: 'BROWSER_AUTOMATION_NOT_CONFIGURED'
    });
  } else {
    const browserOutput = path.join(outputDir, 'browser');
    const browserArgs = [
      'property/tests/offline/browser-pwa-smoke.mjs',
      '--playwright-module', browserConfig.playwright_module,
      '--engine', browserConfig.engine,
      '--executable', browserConfig.executable,
      '--playwright-version', browserConfig.playwright_version,
      '--browser-version', browserConfig.browser_version,
      '--playwright-package-sha256', browserConfig.playwright_package_sha256,
      '--browser-executable-sha256', browserConfig.browser_executable_sha256,
      '--output', browserOutput
    ];
    const browserRun = await runCommand(process.execPath, browserArgs, manifest.case_timeout_ms,
      path.join(outputDir, 'logs/G02-02-03-browser.log'));
    let browserReport = null;
    try { browserReport = JSON.parse(await readFile(path.join(browserOutput, 'browser-pwa-report.json'), 'utf8')); } catch {}
    for (const id of ['G02-02', 'G02-03']) {
      const reported = browserReport?.cases?.find(row => row.case === id);
      const outcome = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(reported?.status)
        ? reported.status
        : browserRun.interrupted || commandOutcome(browserRun) === 'BLOCKED' ? 'BLOCKED' :
          commandOutcome(browserRun) === 'FAIL' ? 'FAIL' : 'BLOCKED';
      setCase(cases, id, {
        status: outcome, gate_eligible: outcome !== 'NOT_RUN',
        command: 'node property/tests/offline/browser-pwa-smoke.mjs with manifest-pinned browser tools',
        started_utc: browserRun.started_utc, ended_utc: browserRun.ended_utc, exit_code: browserRun.exit_code,
        reason: reported?.reason || (outcome === 'PASS' ? 'Offline browser case completed.' :
          'Browser run did not provide a passing case record.'),
        observed: JSON.stringify(reported || { runner: browserRun.stderr || browserRun.stdout }),
        evidence: [browserRun.log, ...(browserReport ? ['browser/browser-pwa-report.json'] : [])]
      });
    }
  }
  const deepPrerequisitesPass = originStatus === 'PASS' && Boolean(browserConfig) &&
    ['G02-02', 'G02-03'].every(id => cases.get(id)?.status === 'PASS');
  if (!deepPrerequisitesPass) {
    const reason = originStatus !== 'PASS' ? 'G02-01 origin and license prerequisites did not pass.' :
      !browserConfig ? 'The lab manifest has no pinned Playwright module and browser executable.' :
        'G02-02/03 browser prerequisites did not pass.';
    for (const id of ['G02-04', 'G02-05', 'G02-06']) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason, observed: 'BLOCKED_BY_G02_BROWSER_PREREQUISITES'
    });
  } else {
    const deepOutput = path.join(outputDir, 'browser-deep-g02');
    const deepArgs = [
      'property/tests/offline/browser-deep-g02-smoke.mjs',
      '--playwright-module', browserConfig.playwright_module,
      '--engine', browserConfig.engine,
      '--executable', browserConfig.executable,
      '--playwright-version', browserConfig.playwright_version,
      '--browser-version', browserConfig.browser_version,
      '--playwright-package-sha256', browserConfig.playwright_package_sha256,
      '--browser-executable-sha256', browserConfig.browser_executable_sha256,
      '--output', deepOutput
    ];
    const deepRun = await runCommand(process.execPath, deepArgs, manifest.case_timeout_ms,
      path.join(outputDir, 'logs/G02-04-06-browser.log'));
    let deepReport = null;
    try { deepReport = JSON.parse(await readFile(path.join(deepOutput, 'browser-deep-g02-report.json'), 'utf8')); } catch {}
    for (const id of ['G02-04', 'G02-05', 'G02-06']) {
      const reported = deepReport?.cases?.find(row => row.case === id);
      const outcome = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(reported?.status)
        ? reported.status : deepRun.interrupted || commandOutcome(deepRun) === 'BLOCKED' ? 'BLOCKED' :
          commandOutcome(deepRun) === 'FAIL' ? 'FAIL' : 'BLOCKED';
      setCase(cases, id, {
        status: outcome, gate_eligible: outcome !== 'NOT_RUN',
        command: 'node property/tests/offline/browser-deep-g02-smoke.mjs with manifest-pinned browser tools',
        started_utc: deepRun.started_utc, ended_utc: deepRun.ended_utc, exit_code: deepRun.exit_code,
        reason: reported?.reason || (outcome === 'PASS' ? 'Offline browser migration/security case completed.' :
          'Deep browser runner did not provide a passing case record.'),
        observed: JSON.stringify(reported || { runner: deepRun.stderr || deepRun.stdout }),
        evidence: [deepRun.log, ...(deepReport ? ['browser-deep-g02/browser-deep-g02-report.json'] : [])]
      });
    }
  }
  const g02Status = deriveGateStatus([...cases.values()].filter(row => row.case.startsWith('G02-')));
  if (g02Status !== 'PASS') {
    markLaterGates(3, 'G02 did not pass; dependent gate was not started.');
    return;
  }

  const g03Ids = ['G03-01', 'G03-02', 'G03-03', 'G03-04', 'G03-05', 'G03-06'];
  if (!browserConfig) {
    for (const id of g03Ids) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'The lab manifest has no pinned Playwright module and browser executable.', observed: 'BROWSER_AUTOMATION_NOT_CONFIGURED'
    });
  } else {
    const g03Output = path.join(outputDir, 'browser-g03');
    const g03Args = [
      'property/tests/offline/browser-g03-smoke.mjs',
      '--playwright-module', browserConfig.playwright_module,
      '--engine', browserConfig.engine,
      '--executable', browserConfig.executable,
      '--playwright-version', browserConfig.playwright_version,
      '--browser-version', browserConfig.browser_version,
      '--playwright-package-sha256', browserConfig.playwright_package_sha256,
      '--browser-executable-sha256', browserConfig.browser_executable_sha256,
      '--output', g03Output
    ];
    const g03Run = await runCommand(process.execPath, g03Args, manifest.case_timeout_ms,
      path.join(outputDir, 'logs/G03-01-06-browser.log'));
    let g03Report = null;
    try { g03Report = JSON.parse(await readFile(path.join(g03Output, 'browser-g03-report.json'), 'utf8')); } catch {}
    for (const id of g03Ids) {
      const reported = g03Report?.cases?.find(row => row.case === id);
      const outcome = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(reported?.status)
        ? reported.status : g03Run.interrupted || commandOutcome(g03Run) === 'BLOCKED' ? 'BLOCKED' :
          commandOutcome(g03Run) === 'FAIL' ? 'FAIL' : 'BLOCKED';
      setCase(cases, id, {
        status: outcome, gate_eligible: outcome !== 'NOT_RUN',
        command: 'node property/tests/offline/browser-g03-smoke.mjs with manifest-pinned browser tools',
        started_utc: g03Run.started_utc, ended_utc: g03Run.ended_utc, exit_code: g03Run.exit_code,
        reason: reported?.reason || (outcome === 'PASS' ? 'Offline browser identity case completed.' :
          'G03 browser runner did not provide a passing case record.'),
        observed: JSON.stringify(reported || { runner: g03Run.stderr || g03Run.stdout }),
        evidence: [g03Run.log, ...(g03Report ? ['browser-g03/browser-g03-report.json'] : [])]
      });
    }
  }
  const g03Status = deriveGateStatus([...cases.values()].filter(row => row.case.startsWith('G03-')));
  if (g03Status !== 'PASS') {
    markLaterGates(4, 'G03 did not pass; dependent gate was not started.');
    return;
  }

  const g04Ids = ['G04-01', 'G04-02', 'G04-03', 'G04-04', 'G04-05', 'G04-06'];
  if (!browserConfig) {
    for (const id of g04Ids) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'The lab manifest has no pinned Playwright module and browser executable.', observed: 'BROWSER_AUTOMATION_NOT_CONFIGURED'
    });
  } else {
    const g04Output = path.join(outputDir, 'browser-g04');
    const g04Args = [
      'property/tests/offline/browser-g04-smoke.mjs',
      '--playwright-module', browserConfig.playwright_module,
      '--engine', browserConfig.engine,
      '--executable', browserConfig.executable,
      '--playwright-version', browserConfig.playwright_version,
      '--browser-version', browserConfig.browser_version,
      '--playwright-package-sha256', browserConfig.playwright_package_sha256,
      '--browser-executable-sha256', browserConfig.browser_executable_sha256,
      '--output', g04Output
    ];
    const g04Run = await runCommand(process.execPath, g04Args, manifest.case_timeout_ms,
      path.join(outputDir, 'logs/G04-01-06-browser.log'));
    let g04Report = null;
    try { g04Report = JSON.parse(await readFile(path.join(g04Output, 'browser-g04-report.json'), 'utf8')); } catch {}
    for (const id of g04Ids) {
      const reported = g04Report?.cases?.find(row => row.case === id);
      const outcome = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(reported?.status)
        ? reported.status : g04Run.interrupted || commandOutcome(g04Run) === 'BLOCKED' ? 'BLOCKED' :
          commandOutcome(g04Run) === 'FAIL' ? 'FAIL' : 'BLOCKED';
      setCase(cases, id, {
        status: outcome, gate_eligible: outcome !== 'NOT_RUN',
        command: 'node property/tests/offline/browser-g04-smoke.mjs with two real Geode relays and manifest-pinned browser tools',
        started_utc: g04Run.started_utc, ended_utc: g04Run.ended_utc, exit_code: g04Run.exit_code,
        reason: reported?.reason || (outcome === 'PASS' ? 'Offline NIP-17 and real-relay case completed.' :
          'G04 browser/relay runner did not provide a passing case record.'),
        observed: JSON.stringify(reported || { runner: g04Run.stderr || g04Run.stdout }),
        evidence: [g04Run.log, ...(g04Report ? ['browser-g04/browser-g04-report.json'] : [])]
      });
    }
  }
  const g04Status = deriveGateStatus([...cases.values()].filter(row => row.case.startsWith('G04-')));
  if (g04Status !== 'PASS') {
    markLaterGates(5, 'G04 did not pass; dependent gate was not started.');
    return;
  }

  const g05Ids = ['G05-01', 'G05-02', 'G05-03', 'G05-04', 'G05-05', 'G05-06', 'G05-07'];
  if (!browserConfig) {
    for (const id of g05Ids) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'The lab manifest has no pinned Playwright module and browser executable.', observed: 'BROWSER_AUTOMATION_NOT_CONFIGURED'
    });
  } else {
    const g05Output = path.join(outputDir, 'browser-g05');
    const g05Args = [
      'property/tests/offline/browser-g05-smoke.mjs',
      '--playwright-module', browserConfig.playwright_module,
      '--engine', browserConfig.engine,
      '--executable', browserConfig.executable,
      '--playwright-version', browserConfig.playwright_version,
      '--browser-version', browserConfig.browser_version,
      '--playwright-package-sha256', browserConfig.playwright_package_sha256,
      '--browser-executable-sha256', browserConfig.browser_executable_sha256,
      '--output', g05Output
    ];
    const g05Run = await runCommand(process.execPath, g05Args, manifest.case_timeout_ms,
      path.join(outputDir, 'logs/G05-01-07-browser.log'));
    let g05Report = null;
    try { g05Report = JSON.parse(await readFile(path.join(g05Output, 'browser-g05-report.json'), 'utf8')); } catch {}
    for (const id of g05Ids) {
      const reported = g05Report?.cases?.find(row => row.case === id);
      const outcome = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(reported?.status)
        ? reported.status : g05Run.interrupted || commandOutcome(g05Run) === 'BLOCKED' ? 'BLOCKED' :
          commandOutcome(g05Run) === 'FAIL' ? 'FAIL' : 'BLOCKED';
      setCase(cases, id, {
        status: outcome, gate_eligible: outcome !== 'NOT_RUN',
        command: 'node property/tests/offline/browser-g05-smoke.mjs with four real Geode relays and actual PWA bridge contexts',
        started_utc: g05Run.started_utc, ended_utc: g05Run.ended_utc, exit_code: g05Run.exit_code,
        reason: reported?.reason || (outcome === 'PASS' ? 'Offline multi-relay bridge case completed.' :
          'G05 browser/relay runner did not provide a passing case record.'),
        observed: JSON.stringify(reported || { runner: g05Run.stderr || g05Run.stdout }),
        evidence: [g05Run.log, ...(g05Report ? ['browser-g05/browser-g05-report.json'] : [])]
      });
    }
  }
  const g05Status = deriveGateStatus([...cases.values()].filter(row => row.case.startsWith('G05-')));
  if (g05Status !== 'PASS') {
    markLaterGates(6, 'G05 did not pass; dependent gate was not started.');
    return;
  }

  const g06Ids = ['G06-01', 'G06-02', 'G06-03', 'G06-04', 'G06-05'];
  if (!browserConfig) {
    for (const id of g06Ids) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'The lab manifest has no pinned Playwright module and browser executable.', observed: 'BROWSER_AUTOMATION_NOT_CONFIGURED'
    });
  } else {
    const g06Output = path.join(outputDir, 'browser-g06');
    const g06Args = [
      'property/tests/offline/browser-g06-smoke.mjs',
      '--playwright-module', browserConfig.playwright_module,
      '--engine', browserConfig.engine,
      '--executable', browserConfig.executable,
      '--playwright-version', browserConfig.playwright_version,
      '--browser-version', browserConfig.browser_version,
      '--playwright-package-sha256', browserConfig.playwright_package_sha256,
      '--browser-executable-sha256', browserConfig.browser_executable_sha256,
      '--output', g06Output
    ];
    const g06Run = await runCommand(process.execPath, g06Args, manifest.case_timeout_ms,
      path.join(outputDir, 'logs/G06-01-05-browser.log'));
    let g06Report = null;
    try { g06Report = JSON.parse(await readFile(path.join(g06Output, 'browser-g06-report.json'), 'utf8')); } catch {}
    for (const id of g06Ids) {
      const reported = g06Report?.cases?.find(row => row.case === id);
      const outcome = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(reported?.status)
        ? reported.status : g06Run.interrupted || commandOutcome(g06Run) === 'BLOCKED' ? 'BLOCKED' :
          commandOutcome(g06Run) === 'FAIL' ? 'FAIL' : 'BLOCKED';
      setCase(cases, id, {
        status: outcome, gate_eligible: outcome !== 'NOT_RUN',
        command: 'node property/tests/offline/browser-g06-smoke.mjs with two real Geode relays, actual PWA clients, and a public-event bridge',
        started_utc: g06Run.started_utc, ended_utc: g06Run.ended_utc, exit_code: g06Run.exit_code,
        reason: reported?.reason || (outcome === 'PASS' ? 'Offline Hangout and marketplace browser/relay case completed.' :
          'G06 browser/relay runner did not provide a passing case record.'),
        observed: JSON.stringify(reported || { runner: g06Run.stderr || g06Run.stdout }),
        evidence: [g06Run.log, ...(g06Report ? ['browser-g06/browser-g06-report.json'] : [])]
      });
    }
  }
  const g06Status = deriveGateStatus([...cases.values()].filter(row => row.case.startsWith('G06-')));
  if (g06Status !== 'PASS') {
    markLaterGates(7, 'G06 did not pass; dependent gate was not started.');
    return;
  }

  const g07Ids = ['G07-01', 'G07-02', 'G07-03', 'G07-04', 'G07-05', 'G07-06', 'G07-07'];
  if (!browserConfig) {
    for (const id of g07Ids) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'The lab manifest has no pinned Playwright module and browser executable.', observed: 'BROWSER_AUTOMATION_NOT_CONFIGURED'
    });
  } else {
    const g07Output = path.join(outputDir, 'browser-g07');
    const g07Args = [
      'property/tests/offline/browser-g07-smoke.mjs',
      '--playwright-module', browserConfig.playwright_module,
      '--engine', browserConfig.engine,
      '--executable', browserConfig.executable,
      '--playwright-version', browserConfig.playwright_version,
      '--browser-version', browserConfig.browser_version,
      '--playwright-package-sha256', browserConfig.playwright_package_sha256,
      '--browser-executable-sha256', browserConfig.browser_executable_sha256,
      '--output', g07Output
    ];
    const g07Run = await runCommand(process.execPath, g07Args, manifest.case_timeout_ms,
      path.join(outputDir, 'logs/G07-01-07-browser.log'));
    let g07Report = null;
    try { g07Report = JSON.parse(await readFile(path.join(g07Output, 'browser-g07-report.json'), 'utf8')); } catch {}
    for (const id of g07Ids) {
      const reported = g07Report?.cases?.find(row => row.case === id);
      const outcome = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(reported?.status)
        ? reported.status : g07Run.interrupted || commandOutcome(g07Run) === 'BLOCKED' ? 'BLOCKED' :
          commandOutcome(g07Run) === 'FAIL' ? 'FAIL' : 'BLOCKED';
      setCase(cases, id, {
        status: outcome, gate_eligible: outcome !== 'NOT_RUN',
        command: 'node property/tests/offline/browser-g07-smoke.mjs with two real Geode relays, two PWA nodes, signed campaign engine and offline deterministic ledger',
        started_utc: g07Run.started_utc, ended_utc: g07Run.ended_utc, exit_code: g07Run.exit_code,
        reason: reported?.reason || (outcome === 'PASS' ? 'Offline campaign engine, payment-state and privacy journey completed.' :
          'G07 browser/relay runner did not provide a passing case record.'),
        observed: JSON.stringify(reported || { runner: g07Run.stderr || g07Run.stdout }),
        evidence: [g07Run.log, ...(g07Report ? ['browser-g07/browser-g07-report.json'] : [])]
      });
    }
  }
  const g07Status = deriveGateStatus([...cases.values()].filter(row => row.case.startsWith('G07-')));
  if (g07Status !== 'PASS') {
    markLaterGates(8, 'G07 did not pass; dependent gate was not started.');
    return;
  }

  const g08Ids = ['G08-01', 'G08-02', 'G08-03', 'G08-04', 'G08-05', 'G08-06', 'G08-07'];
  if (profile !== 'full') {
    markLaterGates(8, 'The core profile ends after G07; financial and later gates require --profile full.');
    return;
  }
  const ledgerTools = manifest.ledger_tools;
  if (!ledgerTools) {
    for (const id of g08Ids) setCase(cases, id, {
      status: 'BLOCKED', gate_eligible: false, command: null, started_utc: null, ended_utc: null,
      exit_code: null, reason: 'The full profile requires pinned Bitcoin, Monero, and Nano offline binaries in manifest.ledger_tools.',
      observed: 'LEDGER_TOOLCHAIN_NOT_CONFIGURED'
    });
  } else {
    const g08Output = path.join(outputDir, 'ledger-g08');
    const g08Args = [
      'property/tests/offline/g08-ledger-smoke.mjs',
      '--bitcoind', ledgerTools.bitcoin.bitcoind,
      '--bitcoind-sha256', ledgerTools.bitcoin.bitcoind_sha256,
      '--bitcoin-cli', ledgerTools.bitcoin.bitcoin_cli,
      '--bitcoin-cli-sha256', ledgerTools.bitcoin.bitcoin_cli_sha256,
      '--monerod', ledgerTools.monero.monerod,
      '--monerod-sha256', ledgerTools.monero.monerod_sha256,
      '--monero-wallet-rpc', ledgerTools.monero.monero_wallet_rpc,
      '--monero-wallet-rpc-sha256', ledgerTools.monero.monero_wallet_rpc_sha256,
      '--nano-node', ledgerTools.nano.nano_node,
      '--nano-node-sha256', ledgerTools.nano.nano_node_sha256,
      '--output', g08Output
    ];
    const g08Run = await runCommand(process.execPath, g08Args, manifest.case_timeout_ms,
      path.join(outputDir, 'logs/G08-01-07-ledger.log'));
    let g08Report = null;
    try { g08Report = JSON.parse(await readFile(path.join(g08Output, 'ledger-g08-report.json'), 'utf8')); } catch {}
    for (const id of g08Ids) {
      const reported = g08Report?.cases?.find(row => row.case === id);
      const outcome = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(reported?.status)
        ? reported.status : g08Run.interrupted || commandOutcome(g08Run) === 'BLOCKED' ? 'BLOCKED' :
          commandOutcome(g08Run) === 'FAIL' ? 'FAIL' : 'BLOCKED';
      setCase(cases, id, {
        status: outcome, gate_eligible: outcome !== 'NOT_RUN',
        command: 'node property/tests/offline/g08-ledger-smoke.mjs with hash-pinned BTC/XMR/XNO binaries, private chains, authenticated loopback RPC, signed campaign engine, and local relay',
        started_utc: g08Run.started_utc, ended_utc: g08Run.ended_utc, exit_code: g08Run.exit_code,
        reason: reported?.reason || (outcome === 'PASS' ? 'Real local BTC, XMR, and XNO settlement case completed.' :
          'G08 harness did not provide a passing case record.'),
        observed: JSON.stringify(reported || { runner: g08Run.stderr || g08Run.stdout }),
        evidence: [g08Run.log, ...(g08Report ? ['ledger-g08/ledger-g08-report.json'] : [])]
      });
    }
  }
  const g08Status = deriveGateStatus([...cases.values()].filter(row => row.case.startsWith('G08-')));
  if (g08Status !== 'PASS') markLaterGates(9, `G08 status ${g08Status}; dependent gate was not started.`);
}

async function runLaterGates(manifest, outputDir, cases) {
  const priorGates = ['G00','G01','G02','G03','G04','G05','G06','G07','G08'].map(gate =>
    deriveGateStatus([...cases.values()].filter(row => row.case.startsWith(gate + '-'))));
  if (priorGates.some(status => status !== 'PASS')) {
    for (const row of cases.values()) if (/^G(?:09|10|11|12)-/.test(row.case)) setCase(cases,row.case,{
      status:'NOT_RUN',gate_eligible:false,reason:'G00–G08 não passaram por completo; os gates dependentes não foram iniciados.'
    });
    return;
  }
  const reportRelative='later-gates/later-gates-report.json';
  const helper=await runCommand(process.execPath,['property/tests/offline/later-gates.mjs',
    '--manifest',path.join(outputDir,'manifest.json'),'--output',outputDir],
    Math.max(manifest.case_timeout_ms,90_000_000),path.join(outputDir,'logs/G09-12-later-gates.log'));
  let later=null;
  try{later=JSON.parse(await readFile(path.join(outputDir,reportRelative),'utf8'));}catch{}
  const reported=new Map((later?.cases||[]).map(row=>[row.case,row]));
  const eligibility=deriveLaterGateEligibility([...cases.values()],later?.cases||[]);
  const expected=[...cases.keys()].filter(id=>/^G(?:09|10|11|12)-/.test(id));
  for(const id of expected){
    const row=reported.get(id);
    if(!row){
      setCase(cases,id,{status:helper.interrupted||helper.timed_out?'BLOCKED':'NOT_RUN',gate_eligible:false,
        command:'node property/tests/offline/later-gates.mjs',started_utc:helper.started_utc,ended_utc:helper.ended_utc,
        exit_code:helper.exit_code,reason:later?.reason||'Executor não registrou o caso antes de terminar/interromper.',
        observed:JSON.stringify({helper_exit_code:helper.exit_code,helper_timed_out:helper.timed_out}),evidence:[helper.log,reportRelative]});
      continue;
    }
    const allowed=eligibility[id.slice(0,3)];
    const reason=row.status==='NOT_RUN'?row.reason:allowed?row.reason:
      `Diagnóstico executado; certificação dependente permanece bloqueada por gate anterior (${id.slice(0,3)}). ${row.reason}`;
    setCase(cases,id,{...row,gate:id.slice(0,3),requirement:cases.get(id).requirement,expected:cases.get(id).expected,
      gate_eligible:allowed&&row.status==='PASS',reason,started_utc:row.started_utc||helper.started_utc,
      ended_utc:row.ended_utc||helper.ended_utc,exit_code:row.exit_code??helper.exit_code,
      evidence:[...new Set([reportRelative,...(row.evidence||[])])],observed:JSON.stringify(row.observed||{})});
  }
}

async function copyVerifiedNativeEvidence(caseId, reportPath, platformReport, outputDir) {
  const sourceRoot = path.dirname(path.resolve(reportPath));
  const expectedEvidence = ['g12-platform-toolchain-preparation.json', 'g12-platform-network-isolation.json', 'g12-platform-preflight.json',
    'g12-platform-relay.log', 'appium-server.log', 'g12-platform-evidence.json'];
  const listed = platformReport.evidence;
  if (!Array.isArray(listed) || expectedEvidence.some(filename => !listed.includes(filename)) ||
      new Set(listed).size !== listed.length) throw new Error(`${caseId} report does not list its required evidence files exactly once.`);
  const manifestPath = path.join(sourceRoot, 'g12-platform-evidence.json');
  const evidenceManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (evidenceManifest.schema_version !== 1 || evidenceManifest.case !== caseId ||
      evidenceManifest.candidate_commit !== platformReport.candidate_commit || !Array.isArray(evidenceManifest.files)) {
    throw new Error(`${caseId} evidence hash manifest does not match its report.`);
  }
  const preflight = JSON.parse(await readFile(path.join(sourceRoot, 'g12-platform-preflight.json'), 'utf8'));
  const hostIsolation = JSON.parse(await readFile(path.join(sourceRoot, 'g12-platform-network-isolation.json'), 'utf8'));
  const toolchain = JSON.parse(await readFile(path.join(sourceRoot, 'g12-platform-toolchain-preparation.json'), 'utf8'));
  const expectedBrowserNames = [...(platformReport.browsers || []).map(browser => browser.browser)].sort();
  if (toolchain.schema_version !== 1 || toolchain.kind !== 'appium-toolchain-preparation' || toolchain.result !== 'PASS' ||
      toolchain.case !== caseId || toolchain.platform !== `${platformReport.platform?.os}/${platformReport.platform?.arch}` ||
      toolchain.appium !== platformReport.toolchain?.appium ||
      toolchain.package_lock_sha256 !== platformReport.toolchain?.package_lock_sha256 ||
      JSON.stringify(toolchain.drivers) !== JSON.stringify(platformReport.toolchain?.drivers)) {
    throw new Error(`${caseId} pinned Appium toolchain evidence does not match the native report.`);
  }
  if (preflight.schema_version !== 1 || preflight.kind !== 'toolchain-preflight' || preflight.result !== 'PASS' ||
      preflight.platform !== `${platformReport.platform?.os}/${platformReport.platform?.arch}` ||
      preflight.host_network_isolation?.result !== 'PASS' ||
      JSON.stringify(preflight.host_network_isolation) !== JSON.stringify(platformReport.network_isolation?.host_egress?.start) ||
      JSON.stringify([...(preflight.browsers || []).map(browser => browser.name)].sort()) !== JSON.stringify(expectedBrowserNames) ||
      preflight.browsers.some(browser => browser.status !== 'PASS')) {
    throw new Error(`${caseId} preflight evidence does not match the candidate report and browser matrix.`);
  }
  if (hostIsolation.schema_version !== 1 || hostIsolation.kind !== 'native-egress-isolation-checkpoints' || hostIsolation.result !== 'PASS' ||
      hostIsolation.platform !== `${platformReport.platform?.os}/${platformReport.platform?.arch}` ||
      hostIsolation.start?.result !== 'PASS' || hostIsolation.end?.result !== 'PASS' ||
      JSON.stringify(hostIsolation.start) !== JSON.stringify(preflight.host_network_isolation) ||
      JSON.stringify(hostIsolation) !== JSON.stringify(platformReport.network_isolation?.host_egress)) {
    throw new Error(`${caseId} native host egress-isolation evidence does not match the candidate report.`);
  }
  const expectedFiles = new Set(['g12-platform-report.json', ...listed.filter(filename => filename !== 'g12-platform-evidence.json')]);
  const manifestFiles = new Map(evidenceManifest.files.map(row => [row.path, row]));
  if (manifestFiles.size !== evidenceManifest.files.length || expectedFiles.size !== manifestFiles.size ||
      [...expectedFiles].some(filename => !manifestFiles.has(filename))) {
    throw new Error(`${caseId} evidence hash manifest has missing or unexpected files.`);
  }
  const destination = path.join(outputDir, 'external-platforms', caseId);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const copied = [];
  for (const [filename, expected] of manifestFiles) {
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) throw new Error(`${caseId} evidence path is not a flat safe filename.`);
    const source = path.join(sourceRoot, filename);
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`${caseId} evidence is not a regular file: ${filename}`);
    const bytes = await readFile(source);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== expected.bytes || sha256 !== expected.sha256) throw new Error(`${caseId} evidence hash mismatch: ${filename}`);
    await copyFile(source, path.join(destination, filename));
    copied.push(path.relative(outputDir, path.join(destination, filename)));
  }
  const manifestName = 'g12-platform-evidence.json';
  const sourceManifestStat = await lstat(manifestPath);
  if (!sourceManifestStat.isFile() || sourceManifestStat.isSymbolicLink()) throw new Error(`${caseId} evidence hash manifest is not a regular file.`);
  await copyFile(manifestPath, path.join(destination, manifestName));
  copied.push(path.relative(outputDir, path.join(destination, manifestName)));
  return copied;
}

async function runPlatformsProfile(options, manifest, cases, inventory, isolation, outputDir) {
  let core = null;
  try { core = JSON.parse(await readFile(options.coreReport, 'utf8')); } catch {}
  const sameCandidate = core && core.candidate_commit === manifest.candidate_commit &&
    core.requested_executor === manifest.requested_executor &&
    core.actual_executor === manifest.actual_executor;
  const priorGates = Array.from({ length: 12 }, (_, index) => `G${String(index).padStart(2, '0')}`);
  const priorGatesPass = priorGates.every(gate => core?.gate_status?.[gate] === 'PASS');
  const eligible = Boolean(sameCandidate && priorGatesPass && isolation.verdict === 'PASS');
  const sourceCases = core?.case_statuses || {};
  const nativeReports = new Map();
  for (const input of options.platformReports || []) {
    if (nativeReports.has(input.caseId)) {
      nativeReports.set(input.caseId, { verdict: { status: 'FAIL', reason: 'Duplicate native platform reports were supplied.' } });
      continue;
    }
    let platformReport = null;
    let readError = null;
    try { platformReport = JSON.parse(await readFile(input.path, 'utf8')); }
    catch (error) { readError = error?.message || String(error); }
    const verdict = platformReport ? validateNativePlatformReport(platformReport, {
      caseId: input.caseId, candidateCommit: manifest.candidate_commit
    }) : { status: 'FAIL', reason: `Could not read native platform report: ${readError}` };
    let evidence = [];
    if (verdict.status === 'PASS') {
      try { evidence = await copyVerifiedNativeEvidence(input.caseId, input.path, platformReport, outputDir); }
      catch (error) { verdict.status = 'FAIL'; verdict.reason = error?.message || String(error); }
    }
    nativeReports.set(input.caseId, { platformReport, verdict, evidence, path: input.path });
  }
  const prerequisiteDir = path.join(outputDir, 'prerequisites');
  await mkdir(prerequisiteDir, { recursive: true, mode: 0o700 });
  const sourceCopy = path.join(prerequisiteDir, 'consolidated-core-summary.json');
  try { await copyFile(path.resolve(options.coreReport), sourceCopy); } catch {}
  const sourcePath = path.relative(outputDir, sourceCopy);
  for (const row of cases.values()) {
    const source = sourceCases[row.case];
    if (/^G0[0-9]-/.test(row.case) || /^G1[01]-/.test(row.case)) {
      row.status = eligible && source?.status === 'PASS' ? 'PASS' : source?.status || 'NOT_RUN';
      row.gate_eligible = eligible && source?.status === 'PASS' && source?.gate_eligible === true;
      row.reason = row.gate_eligible ? 'Inherited from the matching candidate consolidated report.' :
        `Matching same-candidate G00–G11 PASS report required; core=${Boolean(core)}, identity=${Boolean(sameCandidate)}, gates=${priorGatesPass}, isolation=${isolation.verdict}.`;
      row.observed = JSON.stringify({ source_case_status: source?.status || 'MISSING', source_case_gate_eligible: source?.gate_eligible === true, core_report: sourcePath });
      row.evidence = source ? [sourcePath] : [];
      continue;
    }
    if (!row.case.startsWith('G12-')) continue;
    const inheritedPass = eligible && source?.status === 'PASS' && source?.gate_eligible === true;
    if (inheritedPass) {
      row.status = 'PASS';
      row.gate_eligible = true;
      row.reason = 'Same-candidate platform case passed in the consolidated retake evidence.';
      row.observed = JSON.stringify({ source_case_status: source.status, core_report: sourcePath });
      row.evidence = [sourcePath];
      continue;
    }
    const native = nativeReports.get(row.case);
    if (native && native.verdict.status === 'PASS' && eligible) {
      row.status = 'PASS';
      row.gate_eligible = true;
      row.reason = native.verdict.reason;
      row.observed = JSON.stringify({ native_platform: native.platformReport.platform,
        browser_results: native.platformReport.browsers.map(browser => ({ browser: browser.browser,
          capabilities: browser.capabilities, cycles: browser.cycles.length })), external_report: native.path });
      row.evidence = native.evidence;
      continue;
    }
    if (native && native.verdict.status !== 'PASS') {
      row.status = native.verdict.status;
      row.gate_eligible = false;
      row.reason = native.verdict.reason;
      row.observed = JSON.stringify({ external_report: native.path,
        report_candidate: native.platformReport?.candidate_commit || null,
        expected_candidate: manifest.candidate_commit });
      row.evidence = [];
      continue;
    }
    row.status = source?.status === 'PENDING' ? 'PENDING' : 'BLOCKED';
    row.gate_eligible = false;
    row.reason = !sameCandidate ? 'A same-candidate core report is required before platform evidence can be inherited.' :
      !priorGatesPass ? 'G00–G11 must all pass before the native platform matrix is eligible.' :
      isolation.verdict !== 'PASS' ? 'Network isolation was not proven for the platform profile.' :
      source?.status === 'PENDING' ? source.reason : source?.status === 'BLOCKED' ? source.reason : 'No passing native platform evidence exists for this case.';
    row.observed = JSON.stringify({ source_case_status: source?.status || 'MISSING', core_report: sourcePath,
      host_platform: process.platform, host_arch: process.arch });
    row.evidence = source ? [sourcePath] : [];
  }
}

async function finalizeEvidence(outputDir, cases, manifest, profile, inventory, isolation) {
  const summary = buildSummary(cases, profile, manifest, inventory, isolation);
  const rows = [...cases.values()].sort((a, b) => a.case.localeCompare(b.case));
  await writeFile(path.join(outputDir, 'cases.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 });
  await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
  const report = [
    '# Property offline test run',
    '',
    'Run: ' + manifest.run_id,
    'Profile: ' + profile,
    'Candidate: ' + manifest.candidate_commit,
    'Observed HEAD matches candidate: ' + inventory.candidate_commit_matches_head,
    'Working-tree state SHA-256: ' + inventory.working_tree_state_sha256,
    'Requested executor: ' + manifest.requested_executor,
    'Actual executor: ' + manifest.actual_executor,
    'Actual executor source: ' + manifest.actual_executor_source,
    'Executor matches request: ' + summary.executor_matches_request,
    'Isolation: ' + isolation.verdict,
    'Result: ' + summary.scope_result,
    '',
    '## Gates',
    ...Object.entries(summary.gate_status).map(([gate, status]) => '- ' + gate + ': ' + status),
    '',
    '## Case totals',
    ...Object.entries(summary.case_totals).map(([status, count]) => '- ' + status + ': ' + count),
    '',
    '## Case results',
    ...rows.map(row => '- ' + row.case + ' — ' + row.status + (row.gate_eligible ? '' : ' (not gate eligible)') + ': ' + row.reason),
    '',
    '## Isolation findings',
    ...(isolation.reasons || []).map(reason => '- ' + reason),
    ...((isolation.reasons || []).length ? [] : ['- No isolation blocker was recorded.'])
  ].join('\n') + '\n';
  await writeFile(path.join(outputDir, 'report.md'), report, { mode: 0o600 });
  await writeChecksums(outputDir);
  return summary;
}

async function verifyFirewallStability(isolation) {
  const before = isolation.firewall;
  const after = inspectFirewall();
  const ipv4Routes = commandResult('ip', ['-4', '-json', 'route', 'show', 'table', 'all']);
  const ipv6Routes = commandResult('ip', ['-6', '-json', 'route', 'show', 'table', 'all']);
  const ipv4Rules = commandResult('ip', ['-4', '-json', 'rule', 'show']);
  const ipv6Rules = commandResult('ip', ['-6', '-json', 'rule', 'show']);
  const namespaceAfter = await inspectNetworkNamespace(process.env, ipv4Routes, ipv6Routes, ipv4Rules, ipv6Rules);
  isolation.network_namespace_after = namespaceAfter;
  isolation.firewall_after = after;
  const comparable = Boolean(before?.inspected && after.inspected);
  const firewallStable = Boolean(comparable && before?.output_policy_drop && after.output_policy_drop &&
    before.rules_sha256 && before.rules_sha256 === after.rules_sha256);
  const namespaceBefore = isolation.network_namespace;
  const namespaceStable = Boolean(namespaceBefore?.verified && namespaceAfter.verified &&
    namespaceBefore.parent_namespace_id === namespaceAfter.parent_namespace_id &&
    namespaceBefore.namespace_id === namespaceAfter.namespace_id &&
    namespaceBefore.only_loopback_interface === namespaceAfter.only_loopback_interface &&
    namespaceBefore.ipv4_loopback_routes_only === namespaceAfter.ipv4_loopback_routes_only &&
    namespaceBefore.ipv6_loopback_routes_only === namespaceAfter.ipv6_loopback_routes_only &&
    namespaceBefore.policy_rules_inspected === namespaceAfter.policy_rules_inspected);
  const stable = isolation.egress_boundary === 'firewall' ? firewallStable :
    isolation.egress_boundary === 'isolated-network-namespace' ? namespaceStable : false;
  isolation.firewall_policy_unchanged = comparable ? firewallStable : null;
  isolation.network_namespace_unchanged = namespaceBefore?.verified && namespaceAfter.verified ? namespaceStable : null;
  isolation.egress_boundary_unchanged = stable;
  const beforeCounters = before?.output_rule_counters || [];
  const afterCounters = after.output_rule_counters || [];
  const total = rows => rows.reduce((sum, row) => ({ packets: sum.packets + row.packets, bytes: sum.bytes + row.bytes }), { packets: 0, bytes: 0 });
  const oldTotal = total(beforeCounters);
  const newTotal = total(afterCounters);
  isolation.firewall_counter_delta = before?.counters_available && after.counters_available &&
    beforeCounters.length === afterCounters.length
    ? { packets: newTotal.packets - oldTotal.packets, bytes: newTotal.bytes - oldTotal.bytes }
    : null;
  if (isolation.egress_boundary === 'firewall' && comparable && !firewallStable && !isolation.reasons.includes('egress firewall inspection/policy changed during the run')) {
    isolation.reasons.push('egress firewall inspection/policy changed during the run');
  }
  if (isolation.verdict === 'PASS' && !stable) {
    isolation.reasons.push('the selected egress boundary did not remain provable through the run');
    isolation.verdict = 'BLOCKED';
  }
  return stable;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.interruptionFixture) {
    const output = path.resolve(options.output);
    const code = await runInterruptibleFixture(output);
    return code;
  }
  if (options.interruptionSelfTest) {
    const output = path.resolve(options.output);
    const result = await verifyInterruptionHarness(output);
    process.stdout.write(JSON.stringify(result) + '\n');
    return result.status === 'PASS' ? 0 : 1;
  }
  const manifest = validateManifest(JSON.parse(await readFile(path.resolve(options.manifest), 'utf8')));
  const outputDir = await prepareOutput(options.output || path.join('property/docs/evidence/offline', manifest.run_id), options.resume);
  manifest.started_utc = new Date().toISOString();
  const planText = await readFile(PLAN, 'utf8');
  const details = parsePlanCaseDetails(planText);
  const cases = new Map([...details].map(([id, requirement]) => [id, initialCase(id, requirement)]));
  const inventory = await collectInventory(manifest, outputDir);
  configureRuntimeMemoryBudget(inventory, manifest);
  const coreReportSha256 = options.coreReport
    ? await hashFile(path.resolve(options.coreReport)).catch(() => null)
    : null;
  const attempt = await beginAttempt(outputDir, manifest, inventory, planText, options.profile,
    { core_report_sha256: coreReportSha256 }, cases, options.resume);
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  await writeFile(path.join(outputDir, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n', { mode: 0o600 });
  initializeCheckpoints(outputDir, cases);
  checkpointPath = outputDir;
  checkpointCases = cases;
  const topology = {
    test_host: 'loopback only',
    ports: manifest.ports,
    allowed_addresses: ['127.0.0.1', '::1'],
    public_endpoints_configured: false,
    seed: manifest.test_seed,
    resource_budget: manifest.resource_budget,
    profile: options.profile,
    attempt_number: attempt.attempt_number
  };
  await writeFile(path.join(outputDir, 'topology.json'), JSON.stringify(topology, null, 2) + '\n', { mode: 0o600 });
  const isolation = await inspectIsolation();
  await writeFile(path.join(outputDir, 'isolation.json'), JSON.stringify(isolation, null, 2) + '\n', { mode: 0o600 });
  if (options.profile === 'platforms') {
    const summary = await writePlatformsReport(options, manifest, cases, inventory, isolation, outputDir);
    process.stdout.write(JSON.stringify({ run_id: manifest.run_id, result: summary.scope_result, exit_code: summary.exit_code, output: outputDir }) + '\n');
    return summary.exit_code;
  }
  if (interruptionSignal) {
    for (const row of cases.values()) { row.status = 'BLOCKED'; row.reason = 'Runner interrupted before this case started.'; }
  } else if (options.profile === 'core' || options.profile === 'full') {
    process.once('SIGINT', () => {
      interruptionSignal = 'SIGINT';
      if (currentChild) killTree(currentChild, 'SIGTERM');
    });
    process.once('SIGTERM', () => {
      interruptionSignal = 'SIGTERM';
      if (currentChild) killTree(currentChild, 'SIGTERM');
    });
    await runCoreProfile(options.profile, manifest, outputDir, cases, inventory, isolation);
    if(options.profile==='full') await runLaterGates(manifest,outputDir,cases);
  }
  if (options.profile === 'core' || options.profile === 'full') {
    await verifyFirewallStability(isolation);
    deferG00Checkpoint = false;
    const g00Isolation = cases.get('G00-02');
    if (g00Isolation) {
      setCase(cases, 'G00-02', {
        status: isolation.verdict === 'PASS' ? g00Isolation.status : 'BLOCKED',
        gate_eligible: isolation.verdict === 'PASS' && cases.get('G00-01')?.status === 'PASS',
        reason: isolation.reasons.join('; ') || g00Isolation.reason,
        observed: JSON.stringify({ egress_boundary: isolation.egress_boundary, network_namespace: isolation.network_namespace, network_namespace_after: isolation.network_namespace_after, network_namespace_unchanged: isolation.network_namespace_unchanged, firewall_initial: isolation.firewall, firewall_after: isolation.firewall_after, firewall_policy_unchanged: isolation.firewall_policy_unchanged, egress_boundary_unchanged: isolation.egress_boundary_unchanged, counter_delta: isolation.firewall_counter_delta })
      });
    }
    await writeFile(path.join(outputDir, 'isolation.json'), JSON.stringify(isolation, null, 2) + '\n', { mode: 0o600 });
  }
  const summary = await finalizeEvidence(outputDir, cases, manifest, options.profile, inventory, isolation);
  process.stdout.write(JSON.stringify({ run_id: manifest.run_id, result: summary.scope_result, exit_code: summary.exit_code, output: outputDir }) + '\n');
  return summary.exit_code;
}

async function writePlatformsReport(options, manifest, cases, inventory, isolation, outputDir) {
  await runPlatformsProfile(options, manifest, cases, inventory, isolation, outputDir);
  for (const row of [...cases.values()]) setCase(cases, row.case, { ...row });
  await writeFile(path.join(outputDir, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n', { mode: 0o600 });
  await writeFile(path.join(outputDir, 'isolation.json'), JSON.stringify(isolation, null, 2) + '\n', { mode: 0o600 });
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  return finalizeEvidence(outputDir, cases, manifest, 'platforms', inventory, isolation);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  main().then(code => { process.exitCode = code || 0; }).catch(error => {
    process.stderr.write('BLOCKED: ' + sanitizeText(error.stack || error.message || error) + '\n');
    process.exitCode = 2;
  });
}
