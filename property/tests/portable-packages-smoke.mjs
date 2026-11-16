import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

let libraries;
for (const [platform, launcher] of [['windows-x64', 'start.ps1'], ['macos-arm64', 'start-macos.sh']]) {
  const base = new URL(`../relay/portable/${platform}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  const hash = createHash('sha256');
  let bytes = 0;
  assert.equal(manifest.platform, platform);
  for (const [index, part] of manifest.parts.entries()) {
    assert.equal(part.file, `part-${String(index).padStart(3, '0')}`);
    const content = await readFile(new URL(part.file, base));
    assert.equal(content.length, part.bytes);
    assert.equal(createHash('sha256').update(content).digest('hex'), part.sha256);
    hash.update(content); bytes += content.length;
  }
  assert.equal(bytes, manifest.archive_bytes);
  assert.equal(hash.digest('hex'), manifest.archive_sha256);
  assert.ok((await readFile(new URL(`../relay/${launcher}`, import.meta.url), 'utf8')).includes(manifest.archive_sha256));
  assert.match(manifest.runtime_source, /^https:\/\/github\.com\/adoptium\/temurin21-binaries\/releases\/download\//);
  assert.equal(manifest.geode_source_sha256, '9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7',
    'cross-platform package provenance is unchanged because those packages were not rebuilt');
  if (libraries) assert.deepEqual(manifest.libraries, libraries, 'both platforms use exactly the same pinned Geode libraries');
  libraries = manifest.libraries;
  console.log(`PASS: ${platform}, ${manifest.parts.length} parts, ${bytes} bytes, SHA-256 and launcher pin match`);
}
