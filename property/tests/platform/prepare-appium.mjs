#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASE_DRIVERS = {
  'G12-02': ['appium-chromium-driver'],
  'G12-03': ['appium-chromium-driver', 'appium-safari-driver'],
  'G12-04': ['appium-uiautomator2-driver'],
  'G12-05': ['appium-xcuitest-driver']
};

function parseArgs(argv) {
  const options = { caseId: process.env.PROPERTY_PLATFORM_CASE || '', output: '' };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!['--case', '--output'].includes(argument) || !argv[index + 1]) throw new Error(`Unknown or incomplete option: ${argument}`);
    const value = argv[++index];
    if (argument === '--case') options.caseId = value;
    else options.output = value;
  }
  assert.ok(CASE_DRIVERS[options.caseId], '--case must be G12-02 through G12-05');
  assert.ok(options.output, '--output is required');
  return options;
}

function command(commandName, args, env) {
  const isWindowsCommandScript = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(commandName);
  const result = spawnSync(commandName, args, { encoding: 'utf8', env, windowsHide: true, timeout: 600_000,
    maxBuffer: 8 * 1024 * 1024, shell: isWindowsCommandScript });
  if (result.error || result.status !== 0) {
    const details = `${result.stderr || ''}\n${result.stdout || ''}\n${result.error?.message || ''}`.replace(/\/(?:Users|home)\/[^/\s]+/g, '/<USER>')
      .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, '<USER>').slice(-1800);
    throw new Error(`${path.basename(commandName)} ${args.slice(0, 3).join(' ')} failed: ${details}`);
  }
  return result.stdout || '';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputFile = path.resolve(options.output);
  await mkdir(path.dirname(outputFile), { recursive: true, mode: 0o700 });
  const packageManifest = JSON.parse(await readFile(path.join(HERE, 'package.json'), 'utf8'));
  const lockBytes = await readFile(path.join(HERE, 'package-lock.json'));
  const configuredNpm = process.env.NPM || 'npm';
  const npmCommand = process.platform === 'win32' && !/\.(?:cmd|bat|exe|com)$/i.test(configuredNpm)
    ? `${configuredNpm}.cmd` : configuredNpm;
  const npmVersion = command(npmCommand, ['--version'], process.env).trim();
  assert.ok(Number.parseInt(npmVersion.split('.')[0], 10) >= 10, `npm 10 or newer is required; found ${npmVersion}`);
  const nodeVersion = process.versions.node;
  assert.ok(Number.parseInt(nodeVersion.split('.')[0], 10) === 22, `Node 22 is required; found ${nodeVersion}`);
  const appiumEntry = path.join(HERE, 'node_modules', 'appium', 'index.js');
  const appiumHome = path.resolve(process.env.APPIUM_HOME || path.join(os.tmpdir(), 'property-appium-home'));
  process.env.APPIUM_HOME = appiumHome;
  await mkdir(appiumHome, { recursive: true, mode: 0o700 });
  const installedDrivers = [];
  for (const packageName of CASE_DRIVERS[options.caseId]) {
    const localPackage = path.join(HERE, 'node_modules', packageName);
    const metadata = JSON.parse(await readFile(path.join(localPackage, 'package.json'), 'utf8'));
    const installOutput = command(process.execPath, [appiumEntry, 'driver', 'install', localPackage, '--source=local'], process.env);
    installedDrivers.push({ package: packageName, version: metadata.version,
      install_result: /success|installed|already/i.test(installOutput) ? 'PASS' : 'COMPLETED' });
  }
  const listOutput = command(process.execPath, [appiumEntry, 'driver', 'list', '--installed', '--json'], process.env);
  let parsed;
  try { parsed = JSON.parse(listOutput); } catch { throw new Error('Appium installed-driver list was not valid JSON.'); }
  const serialized = JSON.stringify(parsed);
  for (const packageName of CASE_DRIVERS[options.caseId]) {
    assert.ok(serialized.includes(packageName), `Appium did not register ${packageName} in APPIUM_HOME`);
  }
  const report = { schema_version: 1, kind: 'appium-toolchain-preparation', case: options.caseId, result: 'PASS',
    platform: `${process.platform}/${process.arch}`, node: nodeVersion, npm: npmVersion,
    appium: packageManifest.devDependencies.appium, package_lock_sha256: createHash('sha256').update(lockBytes).digest('hex'),
    drivers: installedDrivers.map(({ package: packageName, version }) => ({ package: packageName, version, registered: true })) };
  await writeFile(outputFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({ case: options.caseId, status: 'PASS', drivers: report.drivers.map(row => row.package) }) + '\n');
}

main().catch(error => { process.stderr.write(`${error?.stack || error?.message || error}\n`); process.exitCode = 1; });
