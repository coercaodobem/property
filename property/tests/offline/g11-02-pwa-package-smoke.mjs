#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = path.join(ROOT, 'property/web');
const OUTPUT = path.resolve(process.argv[2] || '');
assert.ok(process.argv[2], 'usage: node g11-02-pwa-package-smoke.mjs OUTPUT_DIR');

const sha256 = value => createHash('sha256').update(value).digest('hex');
function pathOrder(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

async function listFiles(root) {
  const rows = [];
  async function visit(directory, relative = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => pathOrder(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`PWA package cannot contain symlinks: ${name}`);
      if (entry.isDirectory()) await visit(absolute, name);
      else if (entry.isFile()) {
        const bytes = await readFile(absolute);
        rows.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new Error(`PWA package contains a non-regular entry: ${name}`);
    }
  }
  await visit(root);
  return rows;
}

async function stagePackage(destination, rows) {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const row of rows) {
    const source = path.join(SOURCE, ...row.path.split('/'));
    const target = path.join(destination, ...row.path.split('/'));
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, await readFile(source), { mode: 0o644 });
  }
  const packagedRows = await listFiles(destination);
  assert.deepEqual(packagedRows, rows, 'staged PWA package must match every source file byte-for-byte');
  return sha256(Buffer.from(JSON.stringify(packagedRows) + '\n'));
}

let scratch;
try {
  const sourceRows = await listFiles(SOURCE);
  assert.ok(sourceRows.length > 0, 'PWA source tree is empty');
  const packageHash = sha256(Buffer.from(JSON.stringify(sourceRows) + '\n'));
  const first = path.join(OUTPUT, 'pwa-package');
  const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'property-pwa-package-'));
  scratch = secondRoot;
  const second = path.join(secondRoot, 'package');
  await rm(first, { recursive: true, force: true });
  const firstHash = await stagePackage(first, sourceRows);
  const secondHash = await stagePackage(second, sourceRows);
  assert.equal(firstHash, packageHash);
  assert.equal(secondHash, packageHash, 'two offline package builds must have the same deterministic hash');

  const report = {
    schema_version: 1,
    case: 'G11-02-PWA',
    status: 'PASS',
    builder: `Node.js ${process.version}; built-in filesystem and SHA-256; no fetched dependencies`,
    source: 'property/web static PWA tree',
    asset_count: sourceRows.length,
    total_asset_bytes: sourceRows.reduce((total, row) => total + row.bytes, 0),
    source_package_sha256: packageHash,
    first_build_sha256: firstHash,
    second_build_sha256: secondHash,
    builds_match_source: firstHash === packageHash && secondHash === packageHash,
    assets: sourceRows
  };
  await mkdir(OUTPUT, { recursive: true, mode: 0o700 });
  await writeFile(path.join(OUTPUT, 'pwa-package-manifest.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({ result: 'PASS', asset_count: report.asset_count, total_asset_bytes: report.total_asset_bytes, sha256: packageHash }) + '\n');
} finally {
  if (scratch) await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
