#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_ROOT = path.join(PROPERTY_ROOT, 'web');
const SCRIPT_FILE = fileURLToPath(import.meta.url);
const PLAN_FILE = path.join(PROPERTY_ROOT, 'docs/plano-agentes-human-first.md');
const OUTPUT = path.resolve(process.argv[2] || path.join(PROPERTY_ROOT, 'docs/evidence/agent-messaging/G7-browser/static-only'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sw = await readFile(path.join(WEB_ROOT, 'sw.js'));
const swText = sw.toString('utf8');
const cacheName = swText.match(/const CACHE = '([^']+)';/)?.[1];
const shellLiteral = swText.match(/const SHELL = (\[[^\n]+\]);/)?.[1];
assert.ok(cacheName && shellLiteral, 'service worker cache name and shell list must be statically declared');
const shell = [...shellLiteral.matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.equal(shell.length, 21);
assert.equal(new Set(shell).size, shell.length, 'shell manifest must not have duplicate paths');

const records = [];
for (let cycle = 1; cycle <= 10; cycle++) {
  const resources = [];
  for (const relative of shell) {
    assert.doesNotMatch(relative, /^(?:[a-z]+:)?\/\//i, `remote shell dependency: ${relative}`);
    const pathname = relative === './' ? 'index.html' : relative.replace(/^\.\//, '').split('?')[0];
    const absolute = path.resolve(WEB_ROOT, pathname);
    assert.ok(absolute.startsWith(`${WEB_ROOT}${path.sep}`), `shell path escapes web root: ${relative}`);
    const info = await lstat(absolute);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `shell resource must be a regular local file: ${relative}`);
    const bytes = await readFile(absolute);
    assert.ok(bytes.length > 0, `shell resource is empty: ${relative}`);
    resources.push({ resource: relative, bytes: bytes.length, sha256: sha(bytes) });
  }
  records.push({ cycle, status: 'PASS', checked_resources: resources.length, resources });
}
const treeDigest = sha(records[0].resources.map(item => `${item.resource}\0${item.sha256}\n`).join(''));
assert.ok(records.every(record => JSON.stringify(record.resources) === JSON.stringify(records[0].resources)), 'static resource inventory changed across fixed repetitions');

const report = {
  schema_version: 1,
  gate: 'G7',
  case: 'G7-STATIC-SHELL-SOURCE-INTEGRITY',
  status: 'PASS_SOURCE_FILES_ONLY',
  fixed_repetitions: 10,
  service_worker_cache: cacheName,
  local_shell_resource_count: shell.length,
  total_resource_hash_checks: shell.length * records.length,
  ordered_shell_manifest_sha256: treeDigest,
  service_worker_sha256: sha(sw),
  harness_sha256: sha(await readFile(SCRIPT_FILE)),
  plan_sha256: sha(await readFile(PLAN_FILE)),
  cycles: records,
  limitation: 'Checks files declared by the service worker against the local checkout. Does not prove a browser installed/controlled the worker, populated CacheStorage, or reloaded offline; those browser cases remain PENDING.',
  other_platforms: 'PENDING'
};
await mkdir(OUTPUT, { recursive: true, mode: 0o700 });
await writeFile(path.join(OUTPUT, 'g7-static-resource-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ status: report.status, repetitions: records.length, resources_per_cycle: shell.length, checks: report.total_resource_hash_checks, limitation: report.limitation }, null, 2)}\n`);
