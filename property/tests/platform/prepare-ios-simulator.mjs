#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function run(args, timeout = 30_000) {
  const result = spawnSync('xcrun', args, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`xcrun ${args.join(' ')} failed: ${(result.stderr || result.stdout || result.error?.message || '').slice(-1600)}`);
  return result.stdout || '';
}

function versionFromRuntime(identifier) {
  const match = identifier.match(/iOS-(\d+)-(\d+)/i);
  return match ? `${match[1]}.${match[2]}` : 'unknown';
}

async function main() {
  assert.equal(process.platform, 'darwin', 'iOS simulator preparation requires macOS');
  assert.equal(process.arch, 'arm64', 'G12-05 requires a native Apple Silicon runner');
  const output = path.resolve(process.argv[2] || 'g12-ios-simulator.json');
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const state = JSON.parse(run(['simctl', 'list', '--json', 'devices', 'available']));
  const candidates = Object.entries(state.devices || {}).flatMap(([runtime, devices]) =>
    /iOS/i.test(runtime) ? devices.filter(device => device.isAvailable && /iPhone/i.test(device.name))
      .map(device => ({ ...device, runtime, runtimeVersion: versionFromRuntime(runtime) })) : []);
  candidates.sort((a, b) => {
    const av = a.runtimeVersion.split('.').map(Number), bv = b.runtimeVersion.split('.').map(Number);
    return bv[0] - av[0] || bv[1] - av[1] || a.name.localeCompare(b.name);
  });
  const device = candidates[0];
  assert.ok(device?.udid, 'no available iPhone simulator runtime was found in this runner image');
  if (device.state !== 'Booted') run(['simctl', 'boot', device.udid]);
  run(['simctl', 'bootstatus', device.udid, '-b'], 300_000);
  const report = { schema_version: 1, kind: 'ios-simulator-preparation', result: 'PASS',
    host: `${process.platform}/${process.arch}`, device_name: device.name, runtime: device.runtime,
    runtime_version: device.runtimeVersion, device_type: device.deviceTypeIdentifier || null,
    udid_sha256: (await import('node:crypto')).createHash('sha256').update(device.udid).digest('hex') };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `PROPERTY_DEVICE_UDID=${device.udid}\nPROPERTY_DEVICE_NAME=${device.name}\nPROPERTY_PLATFORM_VERSION=${device.runtimeVersion}\nPROPERTY_DEVICE_KIND=simulator\n`);
  }
  process.stdout.write(JSON.stringify({ result: 'PASS', device: device.name, runtime: device.runtimeVersion }) + '\n');
}

main().catch(error => { process.stderr.write(`${error?.stack || error?.message || error}\n`); process.exitCode = 1; });
