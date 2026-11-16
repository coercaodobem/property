import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'relay', 'dist-parts');
const manifestText = await readFile(join(root, 'manifest.txt'), 'utf8');
const manifest = Object.fromEntries(manifestText.trim().split(/\r?\n/).map(line => line.split('=')));
const runtimeLock = JSON.parse(await readFile(join(root, '..', 'runtime-dependencies.json'), 'utf8'));
assert.equal(manifest.format, '1');
assert.equal(manifest.parts, String(runtimeLock.runtime_archive.part_count));
assert.equal(manifest.chunk_size, '524288');
assert.equal(manifest.sha256, runtimeLock.runtime_archive.sha256);

const checksumsText = await readFile(join(root, 'SHA256SUMS'), 'utf8');
const checksums = new Map(checksumsText.trim().split(/\r?\n/).map(line => {
  const match = /^([a-f0-9]{64})  (part-\d{3})$/.exec(line);
  assert.ok(match, `invalid checksum line: ${line}`);
  return [match[2], match[1]];
}));
assert.equal(checksums.size, Number(manifest.parts));

const hash = createHash('sha256');
let totalBytes = 0;
for (let index = 0; index < Number(manifest.parts); index++) {
  const filename = `part-${String(index).padStart(3, '0')}`;
  const part = await readFile(join(root, filename));
  assert.ok(part.length > 0 && part.length <= Number(manifest.chunk_size));
  if (index < Number(manifest.parts) - 1) assert.equal(part.length, Number(manifest.chunk_size));
  assert.equal(createHash('sha256').update(part).digest('hex'), checksums.get(filename), `${filename} checksum`);
  totalBytes += part.length;
  hash.update(part);
}
assert.equal(totalBytes, runtimeLock.runtime_archive.size_bytes);
assert.equal(hash.digest('hex'), manifest.sha256, 'ordered parts reconstruct the pinned Geode runtime');
console.log(`PASS: ${manifest.parts} relay segments reconstruct ${totalBytes} bytes with the pinned SHA-256`);
