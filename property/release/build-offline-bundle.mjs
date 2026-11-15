#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompleteProvenance, assertKnownLicense, KNOWN_LICENSES } from './metadata-policy.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '../..');

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    const value = argv[++index];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected --source, --output, and --signing-key values.');
    const name = key.slice(2);
    if (!['source', 'output', 'signing-key'].includes(name) || Object.hasOwn(result, name)) throw new Error(`Unsupported or duplicate option: ${key}`);
    result[name] = value;
  }
  const source = path.resolve(result.source || DEFAULT_ROOT);
  const output = path.resolve(result.output || '');
  const signingKey = path.resolve(result['signing-key'] || '');
  if (!result.output || !result['signing-key']) throw new Error('Usage: node property/release/build-offline-bundle.mjs --source ROOT --output DIR --signing-key PRIVATE_PEM');
  if (!path.isAbsolute(output) || !path.isAbsolute(signingKey)) throw new Error('Output and signing-key paths must be absolute.');
  return { source, output, signingKey };
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function stableOrder(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function parseKeyValues(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(Boolean).map(line => {
    const split = line.indexOf('=');
    if (split < 1) throw new Error('Malformed relay archive manifest.');
    return [line.slice(0, split), line.slice(split + 1)];
  }));
}

function run(command, args, options = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:https?|all|ftp|socks|ws)_proxy$/i.test(name) && !['TAR_OPTIONS', 'GZIP', 'NODE_OPTIONS'].includes(name)));
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    env: { ...env, LC_ALL: 'C', LANG: 'C', TZ: 'UTC', ...options.env }, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.error?.message || result.status || 'unknown').trim().slice(0, 700)}`);
  return result.stdout || '';
}

async function treeFiles(root) {
  const rows = [];
  async function visit(directory, relative = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => stableOrder(left.name, right.name));
    for (const entry of entries) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Release input contains a symlink: ${name}`);
      if (info.isDirectory()) await visit(absolute, name);
      else if (info.isFile()) rows.push({ path: name, absolute, mode: info.mode & 0o777, bytes: info.size });
      else throw new Error(`Release input contains a non-regular file: ${name}`);
    }
  }
  await visit(root);
  return rows;
}

async function assertTrackedTree(source, relativeRoot) {
  const tracked = run('git', ['-C', source, 'ls-files', '--', relativeRoot]).split(/\r?\n/).filter(Boolean).sort(stableOrder);
  const actual = (await treeFiles(path.join(source, relativeRoot)))
    .map(row => `${relativeRoot}/${row.path}`).sort(stableOrder);
  assert.deepEqual(actual, tracked, `${relativeRoot} contains an untracked, ignored, or undeclared build input`);
}

async function copyTree(source, destination) {
  const rows = await treeFiles(source);
  for (const row of rows) {
    const target = path.join(destination, ...row.path.split('/'));
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await copyFile(row.absolute, target);
    await chmod(target, row.mode);
  }
}

async function copyOne(sourceRoot, relative, destinationRoot, destination = relative) {
  const source = path.join(sourceRoot, ...relative.split('/'));
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Required release file is missing or not regular: ${relative}`);
  const target = path.join(destinationRoot, ...destination.split('/'));
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  await copyFile(source, target);
  await chmod(target, info.mode & 0o777);
}

async function verifyArchiveSource(root, scratch, lock) {
  const partsDirectory = path.join(root, 'property/relay/dist-parts');
  const archiveInfo = parseKeyValues(await readFile(path.join(partsDirectory, 'manifest.txt'), 'utf8'));
  assert.equal(Number(archiveInfo.parts), 130, 'the runtime bundle must have all 130 fixed segments');
  assert.equal(Number(archiveInfo.chunk_size), 524288);
  assert.equal(archiveInfo.sha256, lock.runtime_archive.sha256);
  const declared = new Map();
  for (const line of (await readFile(path.join(partsDirectory, 'SHA256SUMS'), 'utf8')).split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{64})\s+\*?(part-\d{3})$/i);
    if (!match || declared.has(match[2])) throw new Error('The Geode segment checksum list is malformed.');
    declared.set(match[2], match[1].toLowerCase());
  }
  assert.equal(declared.size, 130, 'one checksum is required for every runtime segment');

  const archivePath = path.join(scratch, 'geode-1.20.0-linux-x64.tar.gz');
  const archiveHandle = await open(archivePath, 'wx', 0o600);
  const aggregateHash = createHash('sha256');
  let totalBytes = 0;
  try {
    for (let index = 0; index < 130; index++) {
      const partName = `part-${String(index).padStart(3, '0')}`;
      const partPath = path.join(partsDirectory, partName);
      const info = await lstat(partPath);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Missing or invalid Geode segment: ${partName}`);
      const part = await readFile(partPath);
      assert.equal(sha256(part), declared.get(partName), `checksum mismatch in ${partName}`);
      if (index < 129) assert.equal(part.length, 524288, `unexpected segment length: ${partName}`);
      else assert.ok(part.length > 0 && part.length <= 524288, 'last runtime segment has invalid size');
      aggregateHash.update(part);
      totalBytes += part.length;
      await archiveHandle.write(part);
    }
  } finally {
    await archiveHandle.close();
  }
  assert.equal(aggregateHash.digest('hex'), archiveInfo.sha256, 'reconstructed runtime hash does not match its pinned archive');
  assert.equal(totalBytes, lock.runtime_archive.size_bytes, 'reconstructed runtime size differs from the lock');
  const names = run('tar', ['-tzf', archivePath]).split(/\r?\n/).filter(Boolean);
  assert.ok(names.length > 0, 'Geode runtime archive is empty');
  for (const entry of names) {
    const normalized = entry.replace(/^\.\//, '').replace(/\/$/, '');
    if (!normalized || normalized === '.' || normalized === 'geode') continue;
    if (normalized.startsWith('/') || normalized.split('/').includes('..') || !normalized.startsWith('geode/')) {
      throw new Error(`Unsafe entry in pinned Geode archive: ${entry}`);
    }
  }
  const verbose = run('tar', ['-tvzf', archivePath]).split(/\r?\n/).filter(Boolean);
  if (verbose.some(line => !['-', 'd'].includes(line[0]))) throw new Error('Pinned Geode archive contains a link or non-regular entry.');
  const extractedRoot = path.join(scratch, 'relay-extracted');
  await mkdir(extractedRoot, { mode: 0o700 });
  run('tar', ['--extract', '--gzip', '--file', archivePath, '--directory', extractedRoot, '--no-same-owner', '--no-same-permissions']);
  const geodeRoot = path.join(extractedRoot, 'geode');
  const extractedFiles = await treeFiles(geodeRoot);
  const jarFiles = extractedFiles.filter(file => file.path.startsWith('lib/') && file.path.endsWith('.jar'));
  assert.equal(jarFiles.length, lock.artifacts.length, 'runtime dependency lock must cover every Geode JAR');
  const locked = new Map(lock.artifacts.map(component => [component.path, component]));
  for (const jar of jarFiles) {
    const component = locked.get(path.posix.basename(jar.path));
    assert.ok(component, `runtime JAR has no component/license provenance: ${jar.path}`);
    assert.equal(sha256(await readFile(jar.absolute)), component.sha256, `runtime JAR hash differs from the license lock: ${jar.path}`);
    assertKnownLicense(component.license, jar.path);
  }
  assert.ok((await lstat(path.join(geodeRoot, 'bin/geode'))).isFile(), 'the relay CLI is missing from the pinned image');
  return { archivePath, archiveBytes: totalBytes, extractedRoot, geodeRoot, fileCount: extractedFiles.length, jarCount: jarFiles.length };
}

function licenseFor(relative, runtimeLock) {
  const p = relative.replaceAll('\\', '/');
  const firstParty = component => ({ component, license: 'MIT', source: p });
  if (p === 'property/release/licenses/Apache-2.0.txt') return { component: 'Apache-2.0-license-text', license: 'Apache-2.0', source: p };
  if (p === 'property/release/licenses/GPL-2.0.txt') return { component: 'OpenJDK-runtime-license', license: 'GPL-2.0-only', source: p };
  if (p === 'property/release/licenses/OpenJDK-Classpath-exception.txt') return { component: 'OpenJDK-runtime-license', license: 'GPL-2.0-only WITH Classpath-exception-2.0', source: p };
  if (/property\/release\/licenses\/dependencies\/(4koma|konbini)-MIT\.txt$/.test(p)) return { component: 'MIT-third-party-license-text', license: 'MIT', source: p };
  if (p === 'property/web/vendor/nostr-tools-2.25.2.bundle.js' || p === 'property/web/vendor/nostr-tools-LICENSE.txt' || p === 'property/web/vendor/nostr-tools-LICENSE') return { component: 'nostr-tools-web-2.25.2', license: 'Unlicense', source: p };
  if (p === 'property/agent/vendor/nostr-tools-2.25.2.bundle.js' || p === 'property/agent/vendor/nostr-tools-LICENSE.txt' || p === 'property/agent/vendor/nostr-tools-LICENSE') return { component: 'nostr-tools-agent-2.25.2', license: 'Unlicense', source: p };
  if (p === 'property/web/vendor/qr-code-generator.js' || p === 'property/web/vendor/QR-CODE-GENERATOR-LICENSE.txt') return { component: 'qr-code-generator', license: 'MIT', source: p };
  if (p === 'property/web/vendor/emoji-data-15.json') return { component: 'emoji-mart-data-1.2.1', license: 'MIT', source: p };
  if (p === 'property/web/vendor/licenses/emoji-mart-data-MIT.txt') return { component: 'emoji-mart-data-1.2.1', license: 'MIT', source: p };
  if (p === 'property/web/secret-guard.js') return { component: 'secret-guard-web-bundle', license: 'MIT AND BSD-3-Clause', source: 'property/web/vendor/licenses/secret-guard/README.md' };
  if (p === 'property/web/vendor/licenses/secret-guard/README.md') return firstParty('property-first-party');
  if (p === 'property/web/vendor/licenses/secret-guard/NOBLE-HASHES-MIT.txt') return { component: 'noble-hashes-web-2.4.0', license: 'MIT', source: p };
  if (p === 'property/web/vendor/licenses/secret-guard/SCURE-BASE-MIT.txt') return { component: 'scure-base-web', license: 'MIT', source: p };
  if (p === 'property/web/vendor/licenses/secret-guard/SCURE-BIP39-MIT.txt') return { component: 'scure-bip39-web', license: 'MIT', source: p };
  if (p === 'property/web/vendor/licenses/secret-guard/MONERO-ENGLISH-BSD-3-CLAUSE.txt') return { component: 'monero-english-seed-words', license: 'BSD-3-Clause', source: p };
  if (p === 'property/web/vendor/licenses/secret-guard/MONERO-PORTUGUESE-MIT-NOTICE.txt') return { component: 'monero-portuguese-seed-words', license: 'MIT', source: p };
  if (p === 'property/web/GHOSTLY-MIT-LICENSE.txt') return { component: 'ghostly-adapted-web', license: 'MIT', source: p };
  if (p === 'property/web/chess/vendor/chess.js' || p === 'property/web/chess/vendor/chess.d.ts' || p === 'property/web/chess/vendor/CHESSJS-BSD-2-CLAUSE.txt') return { component: 'chess-js-1.4.0', license: 'BSD-2-Clause', source: p };
  if (p.startsWith('property/web/chess/vendor/noble-hashes/')) return { component: 'noble-hashes-web-2.4.0', license: 'MIT', source: p };
  if (p.startsWith('property/agent/vendor/node_modules/@noble/curves/') || p.startsWith('property/agent/vendor/node_modules/@noble/hashes/')) return { component: 'noble-agent-2.4.0', license: 'MIT', source: p };
  if (p.startsWith('property/relay/dist/geode/runtime/')) return {
    component: 'openjdk-runtime-21.0.12.1', license: 'GPL-2.0-only WITH Classpath-exception-2.0',
    source: `${runtimeLock.runtime_archive.source_provenance}#${runtimeLock.runtime_archive.sha256}`
  };
  if (p.startsWith('property/relay/dist/geode/lib/')) {
    const component = runtimeLock.artifacts.find(item => item.path === path.posix.basename(p));
    if (!component) throw new Error(`Unknown runtime library cannot enter release: ${p}`);
    return { component: component.coordinate, license: component.license,
      source: `${component.source}; artifact_sha256=${component.sha256}` };
  }
  if (p.startsWith('property/relay/dist/geode/bin/') || p.startsWith('property/relay/dist/geode/share/geode/')) return firstParty('geode-launcher-and-operator-config');
  if ((p.startsWith('property/web/vendor/') && p !== 'property/web/vendor/README.md') ||
      (p.startsWith('property/agent/vendor/') && p !== 'property/agent/vendor/NOTICE.md' &&
        !p.startsWith('property/agent/vendor/node_modules/@noble/') &&
        !p.includes('/nostr-tools-2.25.2.bundle.js') && !p.endsWith('/nostr-tools-LICENSE'))) {
    throw new Error(`Vendored release file lacks a specific component/license mapping: ${p}`);
  }
  if (p.startsWith('property/web/chess/vendor/') &&
      !p.startsWith('property/web/chess/vendor/noble-hashes/') &&
      !['property/web/chess/vendor/chess.js', 'property/web/chess/vendor/chess.d.ts', 'property/web/chess/vendor/CHESSJS-BSD-2-CLAUSE.txt'].includes(p)) {
    throw new Error(`Chess vendored release file lacks a specific component/license mapping: ${p}`);
  }
  if (p.startsWith('property/agent/') || p.startsWith('property/web/') || p.startsWith('property/relay/') ||
      p.startsWith('property/release/') || p === 'LICENSE') return firstParty('property-first-party');
  throw new Error(`Release file has no component or license mapping: ${p}`);
}

function thirdPartyNotices(runtimeLock) {
  const lines = [
    '# Third-party notices',
    '',
    'This release contains the first-party Property code under the repository MIT license and the components listed below. Exact artifact hashes, coordinates, and license evidence are in `property/relay/runtime-dependencies.json` and `property/release/SBOM.spdx.json`.',
    '',
    '## Browser and agent bundles',
    '',
    '| Component | Version | License | Evidence |',
    '|---|---|---|---|',
    '| nostr-tools browser and agent bundles | 2.25.2 | Unlicense | Vendored license files in `property/web/vendor/` and `property/agent/vendor/` |',
    '| QR code generator | As recorded in `property/web/vendor/README.md` | MIT | Vendored notice |',
    '| Emoji Mart data | 1.2.1 / Unicode 15 | MIT | Vendored notice |',
    '| chess.js | 1.4.0 | BSD-2-Clause | `property/web/chess/vendor/CHESSJS-BSD-2-CLAUSE.txt` |',
    '| @noble/hashes | 2.4.0 | MIT | Vendored license and notice files |',
    '| Local secret guard bundle | Property browser bundle | MIT AND BSD-3-Clause | `property/web/vendor/licenses/secret-guard/README.md` |',
    '| @scure/base | Vendored local bundle; upstream version not recorded in the source notice | MIT | `property/web/vendor/licenses/secret-guard/SCURE-BASE-MIT.txt` |',
    '| @scure/bip39 | 2.4.0 per the local source notice | MIT | `property/web/vendor/licenses/secret-guard/SCURE-BIP39-MIT.txt` |',
    '| Monero English seed-word list | Source copyright 2014–2024 | BSD-3-Clause | `property/web/vendor/licenses/secret-guard/MONERO-ENGLISH-BSD-3-CLAUSE.txt` |',
    '| Monero Portuguese seed-word list | Adapted from Monero v0.18.4.3 | MIT | `property/web/vendor/licenses/secret-guard/MONERO-PORTUGUESE-MIT-NOTICE.txt` |',
    '',
    '## Ubuntu relay runtime',
    '',
    `The included Geode ${runtimeLock.runtime_archive.name} is a prebuilt repository artifact. Its archive SHA-256 is \`${runtimeLock.runtime_archive.sha256}\`; the source relationship and rebuild limit are documented in \`property/relay/PROVENANCE.md\`. The bundled OpenJDK runtime is ${runtimeLock.jre_component.version}, under ${runtimeLock.jre_component.license}. License texts are under \`property/release/licenses/\`.`,
    '',
    '| Runtime artifact | Coordinate | SPDX license | SHA-256 |',
    '|---|---|---|---|'
  ];
  for (const row of runtimeLock.artifacts) lines.push(`| ${row.path} | ${row.coordinate} | ${row.license} | \`${row.sha256}\` |`);
  lines.push('', 'The license inventory is fail-closed: every packaged file must map to a component with an explicit SPDX license and source reference. No runtime source or executable code is fetched from the network.', '');
  return lines.join('\n');
}

async function makeSbom(root, rows, commit, commitTime, runtimeLock) {
  const allRows = [...rows];
  allRows.push({ path: 'property/release/SBOM.spdx.json', license: 'MIT', component: 'property-first-party',
    source: 'self-reference omitted to avoid recursive hash; signed release manifest records this file SHA-256' });
  allRows.sort((a, b) => stableOrder(a.path, b.path));
  const componentInfo = new Map([
    ['property-first-party', { name: 'Property release payload', version: commit, license: 'MIT', source: `https://github.com/coercaodobem/property/tree/${commit}` }],
    ['nostr-tools-web-2.25.2', { name: 'nostr-tools browser bundle', version: '2.25.2', license: 'Unlicense', source: 'property/web/vendor/README.md' }],
    ['nostr-tools-agent-2.25.2', { name: 'nostr-tools agent bundle', version: '2.25.2', license: 'Unlicense', source: 'property/agent/manifest.json' }],
    ['qr-code-generator', { name: 'QR code generator', version: 'see property/web/vendor/README.md', license: 'MIT', source: 'property/web/vendor/README.md' }],
    ['emoji-mart-data-1.2.1', { name: 'Emoji Mart data', version: '1.2.1 / Unicode 15', license: 'MIT', source: 'property/web/vendor/README.md' }],
    ['secret-guard-web-bundle', { name: 'Property local secret guard bundle', version: 'Property browser artifact', license: 'MIT AND BSD-3-Clause', source: 'property/web/vendor/licenses/secret-guard/README.md' }],
    ['scure-base-web', { name: '@scure/base web bundle', version: 'vendored source; version not recorded', license: 'MIT', source: 'property/web/vendor/licenses/secret-guard/SCURE-BASE-MIT.txt' }],
    ['scure-bip39-web', { name: '@scure/bip39 web bundle', version: '2.4.0 per local source notice', license: 'MIT', source: 'property/web/vendor/licenses/secret-guard/SCURE-BIP39-MIT.txt' }],
    ['monero-english-seed-words', { name: 'Monero English seed-word list', version: 'source copyright 2014-2024', license: 'BSD-3-Clause', source: 'property/web/vendor/licenses/secret-guard/MONERO-ENGLISH-BSD-3-CLAUSE.txt' }],
    ['monero-portuguese-seed-words', { name: 'Monero Portuguese seed-word list', version: 'adapted from v0.18.4.3', license: 'MIT', source: 'property/web/vendor/licenses/secret-guard/MONERO-PORTUGUESE-MIT-NOTICE.txt' }],
    ['ghostly-adapted-web', { name: 'Ghostly-adapted web interactions', version: 'repository snapshot', license: 'MIT', source: 'property/web/GHOSTLY-MIT-LICENSE.txt' }],
    ['chess-js-1.4.0', { name: 'chess.js', version: '1.4.0', license: 'BSD-2-Clause', source: 'property/web/chess/NOTICE.md' }],
    ['noble-hashes-web-2.4.0', { name: '@noble/hashes web component', version: '2.4.0', license: 'MIT', source: 'property/web/chess/NOTICE.md' }],
    ['noble-agent-2.4.0', { name: '@noble/curves and @noble/hashes', version: '2.4.0', license: 'MIT', source: 'property/agent/vendor/NOTICE.md' }],
    ['openjdk-runtime-21.0.12.1', { name: 'OpenJDK runtime image', version: '21.0.12.1', license: 'GPL-2.0-only WITH Classpath-exception-2.0', source: `bundled:${runtimeLock.runtime_archive.sha256}` }],
    ['geode-launcher-and-operator-config', { name: 'Geode launcher and operator configuration', version: '1.20.0', license: 'MIT', source: runtimeLock.runtime_archive.source_provenance }],
    ['Apache-2.0-license-text', { name: 'Apache License 2.0 text', version: '2.0', license: 'Apache-2.0', source: 'property/release/licenses/Apache-2.0.txt' }],
    ['OpenJDK-runtime-license', { name: 'OpenJDK GPL and Classpath exception texts', version: '2.0', license: 'GPL-2.0-only WITH Classpath-exception-2.0', source: 'property/release/licenses/' }],
    ['MIT-third-party-license-text', { name: 'Third-party MIT license texts', version: 'multiple', license: 'MIT', source: 'property/release/licenses/dependencies/' }]
  ]);
  for (const dependency of runtimeLock.artifacts) componentInfo.set(dependency.coordinate, {
    name: dependency.coordinate.split(':')[1], version: dependency.version, license: dependency.license,
    source: `${dependency.source}; sha256=${dependency.sha256}`
  });

  const packageId = component => `SPDXRef-Package-${sha256(Buffer.from(component)).slice(0, 16)}`;
  const fileRows = [];
  const relationships = [];
  const packageIds = new Map();
  for (const row of allRows) {
    const info = componentInfo.get(row.component);
    if (!info) throw new Error(`No SBOM component metadata for ${row.component}`);
    assertKnownLicense(row.license, row.path);
    const id = packageId(row.component);
    packageIds.set(row.component, id);
    const extension = path.extname(row.path).toLowerCase();
    const fileType = ['.png', '.jpg', '.jpeg', '.webp', '.jar', '.so', '.bin', '.tar', '.gz'].includes(extension) ? 'BINARY' :
      ['.md', '.txt', '.json', '.toml', '.webmanifest'].includes(extension) ? 'TEXT' : 'SOURCE';
    const file = { fileName: `./${row.path}`, SPDXID: `SPDXRef-File-${sha256(Buffer.from(row.path)).slice(0, 16)}`,
      fileTypes: [fileType], licenseConcluded: row.license, licenseInfoInFiles: [row.license],
      copyrightText: 'NOASSERTION', comment: `component=${row.component}; source=${row.source}` };
    if (row.sha256) file.checksums = [{ algorithm: 'SHA256', checksumValue: row.sha256 }];
    fileRows.push(file);
  }
  for (const [component] of componentInfo) {
    if (!packageIds.has(component)) continue;
    for (const row of allRows.filter(item => item.component === component)) {
      relationships.push({ spdxElementId: packageIds.get(component), relationshipType: 'CONTAINS', relatedSpdxElement: `SPDXRef-File-${sha256(Buffer.from(row.path)).slice(0, 16)}` });
    }
  }
  const packages = [...packageIds.keys()].sort(stableOrder).map(component => {
    const info = componentInfo.get(component);
    return { name: info.name, SPDXID: packageIds.get(component), versionInfo: info.version,
      downloadLocation: info.source, filesAnalyzed: false, licenseConcluded: info.license,
      licenseDeclared: info.license, copyrightText: 'NOASSERTION', primaryPackagePurpose: 'APPLICATION' };
  });
  const document = {
    spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT',
    name: `Property Ubuntu x86_64 offline release ${commit}`,
    documentNamespace: `https://spdx.org/spdxdocs/property-ubuntu-x86_64-${commit}`,
    creationInfo: { created: new Date(commitTime * 1000).toISOString().replace('.000Z', 'Z'), creators: ['Tool: property-offline-release-builder'] },
    packages, files: fileRows,
    relationships: [...packages.map(item => ({ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: item.SPDXID })), ...relationships]
  };
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  await writeFile(path.join(root, 'property/release/SBOM.spdx.json'), bytes, { mode: 0o644 });
  return { path: 'property/release/SBOM.spdx.json', bytes: bytes.length, sha256: sha256(bytes) };
}

async function scanSecrets(rows) {
  const rules = [
    ['private-key-pem', /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i],
    ['nostr-private-key', /\bnsec1[023456789acdefghjklmnpqrstuvwxyz]{20,}\b/i],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
    ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
    ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
    ['live-payment-secret', /\b(?:sk_live_|rk_live_)[A-Za-z0-9]{16,}\b/]
  ];
  const hits = [];
  for (const row of rows) {
    const bytes = await readFile(row.absolute);
    for (const [rule, pattern] of rules) if (pattern.test(bytes.toString('latin1'))) hits.push({ path: row.path, rule });
  }
  if (hits.length) throw new Error(`Release secret scan failed: ${JSON.stringify(hits)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This release builder runs only on Ubuntu/Linux x86_64.');
  const osRelease = await readFile('/etc/os-release', 'utf8');
  if (!/^ID=ubuntu$/m.test(osRelease)) throw new Error('This release builder requires Ubuntu x86_64.');
  if (process.version !== 'v22.22.1') throw new Error(`Pinned Node.js 22.22.1 required; found ${process.version}.`);
  const source = await realpath(options.source);
  const outputParent = path.dirname(options.output);
  await mkdir(outputParent, { recursive: true });
  const sourcePrefix = `${source}${path.sep}`;
  if (options.output === source || options.output.startsWith(sourcePrefix) || options.signingKey === source || options.signingKey.startsWith(sourcePrefix)) {
    throw new Error('Release output and signing key must remain outside the source checkout.');
  }
  try { if ((await readdir(options.output)).length) throw new Error('Release output directory must be empty.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lock = JSON.parse(await readFile(path.join(source, 'property/release/toolchain-lock.json'), 'utf8'));
  const runtimeLock = JSON.parse(await readFile(path.join(source, 'property/relay/runtime-dependencies.json'), 'utf8'));
  assert.equal(lock.build.node, '22.22.1');
  assert.equal(lock.relay_runtime.archive_sha256, runtimeLock.runtime_archive.sha256);
  assertKnownLicense(runtimeLock.jre_component.license, 'bundled OpenJDK runtime');
  const tarVersion = run('tar', ['--version']).split(/\r?\n/)[0];
  const gzipVersion = run('gzip', ['--version']).split(/\r?\n/)[0];
  assert.equal(tarVersion, lock.build.tar, 'tar toolchain does not match the repository lock');
  assert.equal(gzipVersion, lock.build.gzip, 'gzip toolchain does not match the repository lock');
  const status = run('git', ['-C', source, 'status', '--porcelain', '--untracked-files=all']);
  if (status.trim()) throw new Error('Source checkout must be clean; build in a clean worktree so ignored or untracked files cannot enter the release.');
  await assertTrackedTree(source, 'property/web');
  await assertTrackedTree(source, 'property/agent');
  await assertTrackedTree(source, 'property/release/licenses');
  const commit = run('git', ['-C', source, 'rev-parse', 'HEAD']).trim();
  const commitTime = Number(run('git', ['-C', source, 'show', '-s', '--format=%ct', 'HEAD']).trim());
  if (!/^[a-f0-9]{40}$/.test(commit) || !Number.isSafeInteger(commitTime)) throw new Error('Source commit identity is invalid.');
  const privateKeyBytes = await readFile(options.signingKey);
  const privateKey = createPrivateKey(privateKeyBytes);
  privateKeyBytes.fill(0);
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const publicKeyFingerprint = sha256(publicKey.export({ type: 'spki', format: 'der' }));

  const scratch = await mkdtemp(path.join(os.tmpdir(), 'property-offline-release-'));
  const stage = path.join(scratch, 'payload');
  await mkdir(stage, { mode: 0o700 });
  try {
    const runtime = await verifyArchiveSource(source, scratch, runtimeLock);
    await copyTree(path.join(source, 'property/web'), path.join(stage, 'property/web'));
    await copyTree(path.join(source, 'property/agent'), path.join(stage, 'property/agent'));
    await copyOne(source, 'property/relay/start.sh', stage);
    await copyOne(source, 'property/relay/README.md', stage);
    await copyOne(source, 'property/relay/README.pt-BR.md', stage);
    await copyOne(source, 'property/relay/dist-parts/PROVENANCE.md', stage, 'property/relay/PROVENANCE.md');
    await copyOne(source, 'property/relay/dist-parts/PROVENANCE.pt-BR.md', stage, 'property/relay/PROVENANCE.pt-BR.md');
    await copyOne(source, 'property/relay/runtime-dependencies.json', stage);
    await copyTree(runtime.geodeRoot, path.join(stage, 'property/relay/dist/geode'));
    await copyOne(source, 'LICENSE', stage);
    await copyTree(path.join(source, 'property/release/licenses'), path.join(stage, 'property/release/licenses'));
    for (const relative of [
      'property/release/toolchain-lock.json', 'property/release/build-offline-bundle.mjs',
      'property/release/verify-offline-bundle.mjs', 'property/release/metadata-policy.mjs', 'property/release/install-offline.sh',
      'property/release/uninstall-offline.sh',
      'property/release/INSTALL.md', 'property/release/INSTALL.pt-BR.md'
    ]) await copyOne(source, relative, stage);
    await mkdir(path.join(stage, 'property/release'), { recursive: true, mode: 0o755 });
    await writeFile(path.join(stage, 'property/release/THIRD-PARTY-NOTICES.md'), thirdPartyNotices(runtimeLock), { mode: 0o644 });
    await chmod(path.join(stage, 'property/relay/start.sh'), 0o755);
    await chmod(path.join(stage, 'property/release/install-offline.sh'), 0o755);
    await chmod(path.join(stage, 'property/release/uninstall-offline.sh'), 0o755);

    let staged = await treeFiles(stage);
    const contentRows = [];
    for (const row of staged) {
      const bytes = await readFile(row.absolute);
      contentRows.push({ path: row.path, bytes: bytes.length, sha256: sha256(bytes), ...licenseFor(row.path, runtimeLock) });
    }
    await scanSecrets(staged);
    assert.equal(contentRows.length, staged.length, 'every payload file must have a license/provenance row');
    for (const row of contentRows) {
      assertCompleteProvenance(row);
      if (/^(?:\.git|node_modules\/\.cache|coverage|__pycache__)(?:\/|$)/.test(row.path)) throw new Error(`Unapproved generated file: ${row.path}`);
    }
    const sbomInfo = await makeSbom(stage, contentRows, commit, commitTime, runtimeLock);
    staged = await treeFiles(stage);
    const releaseFiles = [];
    for (const row of staged) {
      const bytes = await readFile(row.absolute);
      const mapping = licenseFor(row.path, runtimeLock);
      assertCompleteProvenance(mapping, row.path);
      releaseFiles.push({ path: row.path, bytes: bytes.length, sha256: sha256(bytes), license: mapping.license,
        component: mapping.component, source: mapping.source });
    }
    await scanSecrets(staged);
    const archiveName = 'property-ubuntu-x86_64.tar.gz';
    const rawTar = path.join(scratch, 'payload.tar');
    run('tar', ['--create', '--file', rawTar, '--format=posix', '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--directory', stage, '.']);
    await mkdir(options.output, { recursive: true, mode: 0o700 });
    const archivePath = path.join(options.output, archiveName);
    const fd = await open(archivePath, 'wx', 0o600);
    try {
      const gzipFd = Number(fd.fd);
      const gz = spawnSync('gzip', ['--no-name', '--best', '--stdout', rawTar], { stdio: ['ignore', gzipFd, 'pipe'], windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      if (gz.error || gz.status !== 0) throw new Error(`gzip failed: ${(gz.stderr || gz.error?.message || gz.status || 'unknown').toString().slice(0, 500)}`);
    } finally { await fd.close(); }
    const archiveBytes = await readFile(archivePath);
    const manifest = {
      schema_version: 1,
      product: 'Property',
      profile: 'ubuntu-linux-x86_64',
      source_commit: commit,
      source_commit_time_utc: new Date(commitTime * 1000).toISOString(),
      build_tools: { node: process.version, tar: tarVersion, gzip: gzipVersion, network_access: 'none' },
      runtime_provenance: { geode_version: '1.20.0', java_version: '21.0.12.1', archive_sha256: runtimeLock.runtime_archive.sha256,
        archive_bytes: runtime.archiveBytes, source_rebuild: 'not asserted; pinned repository image unpacked and re-packaged' },
      signer: { algorithm: 'Ed25519', public_key_sha256: publicKeyFingerprint },
      artifacts: [
        { name: archiveName, bytes: archiveBytes.length, sha256: sha256(archiveBytes), media_type: 'application/gzip' },
        { name: 'SBOM.spdx.json', bytes: sbomInfo.bytes, sha256: sbomInfo.sha256, media_type: 'application/spdx+json' }
      ],
      file_count: releaseFiles.length,
      files: releaseFiles
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const signature = sign(null, manifestBytes, privateKey);
    assert.equal(verify(null, manifestBytes, publicKey, signature), true, 'release signature must verify before delivery');
    await writeFile(path.join(options.output, 'release-manifest.json'), manifestBytes, { mode: 0o644, flag: 'wx' });
    await writeFile(path.join(options.output, 'release-manifest.sig'), `${signature.toString('base64')}\n`, { mode: 0o644, flag: 'wx' });
    await writeFile(path.join(options.output, 'release-signing-public.pem'), publicKeyPem, { mode: 0o644, flag: 'wx' });
    await writeFile(path.join(options.output, 'release-manifest.sha256'), `${sha256(manifestBytes)}  release-manifest.json\n`, { mode: 0o644, flag: 'wx' });
    await writeFile(path.join(options.output, 'release-archive.sha256'), `${sha256(archiveBytes)}  ${archiveName}\n`, { mode: 0o644, flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ result: 'PASS', source_commit: commit, profile: manifest.profile, file_count: manifest.file_count,
      jar_count: runtime.jarCount, runtime_file_count: runtime.fileCount, archive_bytes: archiveBytes.length,
      archive_sha256: manifest.artifacts[0].sha256, sbom_sha256: sbomInfo.sha256, manifest_sha256: sha256(manifestBytes), signer_public_key_sha256: publicKeyFingerprint })}\n`);
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function realpath(target) {
  return (await import('node:fs/promises')).realpath(target);
}

main().catch(error => {
  process.stderr.write(`FAIL: ${String(error?.message || error).replaceAll(/[\r\n]+/g, ' ').slice(0, 900)}\n`);
  process.exitCode = 1;
});
