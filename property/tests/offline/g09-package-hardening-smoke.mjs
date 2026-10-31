#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUTPUT = path.resolve(process.argv[2] || '/tmp/property-g09-package');
const TEMP = await mkdtemp(path.join(os.tmpdir(), 'property-g09-package-'));
await mkdir(OUTPUT, { recursive: true, mode: 0o700 });
const launcher = path.join(ROOT, 'property/relay/start.sh');
const report = { schema_version: 1, case: 'G09-05', result: 'FAIL', tampered_manifest: null, missing_segment: null, network: 'unshared network namespace' };

async function attempt(label, manifestText, parts = []) {
  const base = path.join(TEMP, label);
  const partsDir = path.join(base, 'parts');
  const data = path.join(base, 'data'), config = path.join(base, 'config');
  await mkdir(partsDir, { recursive: true, mode: 0o700 });
  await mkdir(data, { recursive: true, mode: 0o700 });
  await mkdir(config, { recursive: true, mode: 0o700 });
  await writeFile(path.join(partsDir, 'manifest.txt'), manifestText, { mode: 0o600 });
  for (const [name, content] of parts) await writeFile(path.join(partsDir, name), content, { mode: 0o600 });
  const env = { ...process.env, PROPERTY_RELAY_HOST: '127.0.0.1', PROPERTY_RELAY_PORT: label === 'tampered' ? '28740' : '28741',
    PROPERTY_RELAY_DATA_DIR: data, PROPERTY_RELAY_CONFIG_DIR: config,
    PROPERTY_RELAY_CONFIG: path.join(config, 'relay.toml'),
    PROPERTY_RELAY_PORTABLE_ARCHIVE: path.join(base, 'missing-archive.tar.gz'),
    PROPERTY_RELAY_PACKAGE_PARTS_DIR: partsDir };
  for (const key of Object.keys(env)) if (/proxy/i.test(key)) delete env[key];
  const child = spawn('bash', [launcher], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-1000); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1000); });
  const exited = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(label + ' launcher did not fail closed')); }, 15000);
    child.once('error', reject); child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  return { exit_code: exited.code, signal: exited.signal, output: (stdout + '\n' + stderr).replace(/\/home\/[^/\s]+/g, '/home/<USER>'),
    archive_created: await import('node:fs/promises').then(fs => fs.access(path.join(base, 'missing-archive.tar.gz')).then(() => true, () => false)),
    temp_archive_created: (await import('node:fs/promises')).readdir(path.join(data, 'runtime')).catch(() => []) };
}

try {
  const sourceManifest = await readFile(path.join(ROOT, 'property/relay/dist-parts/manifest.txt'), 'utf8');
  const validLines = sourceManifest.trim().split(/\r?\n/).filter(line => !line.startsWith('sha256='));
  const wrongHash = validLines.concat('sha256=' + '0'.repeat(64)).join('\n') + '\n';
  const tampered = await attempt('tampered', wrongHash);
  assert.equal(tampered.exit_code, 1);
  assert.match(tampered.output, /Manifesto dos segmentos do relay inv[aá]lido/);
  assert.equal(tampered.archive_created, false);
  report.tampered_manifest = { exit_code: tampered.exit_code, rejected_before_rebuild: true, archive_created: false };

  const missing = await attempt('missing', sourceManifest);
  assert.equal(missing.exit_code, 1);
  assert.match(missing.output, /Falta o segmento local do relay/);
  assert.equal(missing.archive_created, false);
  report.missing_segment = { exit_code: missing.exit_code, rejected_before_start: true, archive_created: false };
  report.result = 'PASS';
  await writeFile(path.join(OUTPUT, 'g09-package-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  report.reason = String(error?.message || error).slice(0, 600);
  await writeFile(path.join(OUTPUT, 'g09-package-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stderr.write(JSON.stringify(report) + '\n'); process.exitCode = 1;
} finally { await rm(TEMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
