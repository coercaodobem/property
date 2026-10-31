import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { accessSync } from 'node:fs';
import { access, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const upstreamCommit = '948135f7dbbae81d79a0b985282ce673397a7618';
const geodeSha256 = '9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7';
const hash = value => createHash('sha256').update(value).digest('hex');
const args = process.argv.slice(2);
let runOfflineBuild = false;
let buildTimeoutMs = 0;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--offline-build') runOfflineBuild = true;
  else if (args[index] === '--build-timeout-ms') {
    buildTimeoutMs = Number(args[++index]);
    if (!Number.isSafeInteger(buildTimeoutMs) || buildTimeoutMs < 1000 || buildTimeoutMs > 86_400_000) {
      throw new Error('--build-timeout-ms must be between 1000 and 86400000.');
    }
  } else throw new Error('Unknown g02-origin-smoke option.');
}
if (runOfflineBuild && !buildTimeoutMs) throw new Error('--offline-build requires --build-timeout-ms.');
const files = [
  'property/README.md',
  'property/docs/identidade-do-projeto.md',
  'property/docs/plano-central.md',
  'property/relay/dist-parts/PROVENANCE.md',
  'property/relay/portable/PROVENANCE.md',
  'property/web/vendor/nostr-tools-LICENSE',
  'property/web/vendor/nostr-tools-2.25.2.bundle.js',
  'property/relay/dist-parts/manifest.txt',
  'property/relay/portable/windows-x64/manifest.json',
  'property/relay/portable/macos-arm64/manifest.json'
];
const source = Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(path.join(root, file))])));
const text = file => source[file].toString('utf8');

async function offlineBuild() {
  if (!runOfflineBuild) return { status: 'NOT_RUN_DIAGNOSTIC', reason: 'Diagnostic invocation does not start the source build.' };
  const wrapper = path.join(root, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const java = spawnSync('java', ['-version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  try { accessSync(wrapper); }
  catch { return { status: 'SKIPPED_TOOLCHAIN_INCOMPLETE', reason: 'Gradle wrapper is absent.' }; }
  if (java.error || java.status !== 0) return { status: 'SKIPPED_TOOLCHAIN_INCOMPLETE', reason: 'Java is unavailable.' };
  const wrapperProperties = path.join(root, 'gradle/wrapper/gradle-wrapper.properties');
  let distributionUrl = '';
  try {
    const properties = await readFile(wrapperProperties, 'utf8');
    distributionUrl = properties.match(/^distributionUrl=(.+)$/m)?.[1]?.replace(/\\([:=!# ])/g, '$1') || '';
  } catch {}
  const distribution = distributionUrl.match(/gradle-(\d+(?:\.\d+)+)-(bin|all)\.zip(?:[?#].*)?$/i);
  if (!distribution) return { status: 'SKIPPED_TOOLCHAIN_INCOMPLETE', reason: 'The pinned Gradle wrapper distribution could not be identified locally.' };
  const [, gradleVersion, flavor] = distribution;
  const javaSettings = spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  const javaHome = `${javaSettings.stdout || ''}\n${javaSettings.stderr || ''}`.match(/^\s*user\.home\s*=\s*(.+)$/m)?.[1]?.trim();
  const homes = process.env.GRADLE_USER_HOME ? [process.env.GRADLE_USER_HOME] : javaHome ? [path.join(javaHome, '.gradle')] : [];
  let cachedDistribution = null;
  for (const home of homes) {
    const cacheRoot = path.join(home, 'wrapper', 'dists', `gradle-${gradleVersion}-${flavor}`);
    let keys = [];
    try { keys = await readdir(cacheRoot); } catch {}
    for (const key of keys) {
      const executable = path.join(cacheRoot, key, `gradle-${gradleVersion}`, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle');
      try { accessSync(executable); cachedDistribution = { home, executable }; break; } catch {}
    }
    if (cachedDistribution) break;
  }
  if (!cachedDistribution) {
    return { status: 'SKIPPED_TOOLCHAIN_INCOMPLETE', reason: `Gradle ${gradleVersion} is not present in the local wrapper cache; the offline build was not started and no distribution download was attempted.` };
  }
  const result = spawnSync(process.platform === 'win32' ? wrapper : './gradlew', ['--offline', ':geode:geodeImage'], {
    cwd: root,
    encoding: 'utf8',
    timeout: buildTimeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:https?|all|ftp|socks|ws)_proxy$/i.test(key))), GRADLE_USER_HOME: cachedDistribution.home }
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status === 0) return { status: 'PASS', exit_code: 0, command: './gradlew --offline :geode:geodeImage' };
  if (result.error?.code === 'ETIMEDOUT') return { status: 'BLOCKED', reason: 'Offline source build exceeded its declared timeout.' };
  if (/no cached version|offline mode|could not resolve|not cached for offline mode|unknown host/i.test(output)) {
    return { status: 'BLOCKED', reason: 'Required Gradle dependencies are not available in the offline cache.' };
  }
  return { status: 'FAIL', exit_code: result.status, reason: (output.trim() || result.error?.message || 'Gradle source build failed.').slice(0, 1000) };
}

for (const file of ['property/README.md', 'property/docs/identidade-do-projeto.md', 'property/docs/plano-central.md', 'property/relay/dist-parts/PROVENANCE.md']) {
  assert.ok(text(file).includes(upstreamCommit), `${file} must pin the Amethyst source commit`);
}
const webLicense = text('property/web/vendor/nostr-tools-LICENSE');
assert.match(webLicense, /free and unencumbered software released into the public domain/i);
assert.match(text('property/README.md'), /nostr-tools[^\n]*2\.25\.2[^\n]*Unlicense/i);
assert.match(text('property/relay/portable/PROVENANCE.md'), /GPLv2 com Classpath Exception/);
assert.match(text('property/relay/portable/PROVENANCE.md'), /arquivos de licença e diretórios `legal`/i);

const linuxManifest = Object.fromEntries(text('property/relay/dist-parts/manifest.txt').split(/\r?\n/).filter(Boolean).map(line => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
assert.equal(linuxManifest.sha256, geodeSha256, 'Linux Geode package digest matches the documented origin');
assert.equal(linuxManifest.parts, '130');
const windows = JSON.parse(text('property/relay/portable/windows-x64/manifest.json'));
const macos = JSON.parse(text('property/relay/portable/macos-arm64/manifest.json'));
for (const [platform, manifest] of [['windows-x64', windows], ['macos-arm64', macos]]) {
  assert.equal(manifest.platform, platform);
  assert.equal(manifest.geode_source_sha256, geodeSha256);
  assert.match(manifest.runtime_source, /^https:\/\/github\.com\/adoptium\/temurin21-binaries\/releases\//);
  assert.match(manifest.runtime_source_sha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.archive_sha256, /^[0-9a-f]{64}$/);
}
assert.deepEqual(windows.libraries, macos.libraries, 'portable platforms use the same pinned Geode libraries');

const html = await readFile(path.join(root, 'property/web/index.html'), 'utf8');
const about = await readFile(path.join(root, 'property/web/about.html'), 'utf8');
const css = await readFile(path.join(root, 'property/web/styles.css'), 'utf8');
for (const page of [html, about]) {
  assert.doesNotMatch(page, /<script\b[^>]*\bsrc=["']https?:/i, 'runtime JavaScript cannot load from a remote host');
  assert.doesNotMatch(page, /<link\b[^>]*\bhref=["']https?:[^"']+\.css/i, 'runtime CSS cannot load from a remote host');
}
assert.doesNotMatch(css, /@import\s+(?:url\()?\s*["']https?:/i, 'runtime CSS cannot import a remote stylesheet');
const scriptPaths = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => match[1]);
assert.ok(scriptPaths.length > 0, 'the web client has local executable assets');
for (const script of scriptPaths) {
  assert.ok(script.startsWith('./'), `script path must be repository-local: ${script}`);
  const localScript = path.resolve(root, 'property/web', script.slice(2).split(/[?#]/, 1)[0]);
  assert.ok(localScript.startsWith(path.join(root, 'property/web') + path.sep), `script path cannot escape the web bundle: ${script}`);
  await access(localScript);
}
assert.doesNotMatch(`${html}\n${about}\n${css}`, /(?:unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com)/i,
  'the PWA bundle cannot depend on common runtime CDNs');

const report = {
  result: 'PASS',
  upstream_commit: upstreamCommit,
  linux_geode_sha256: linuxManifest.sha256,
  vendor_bundle_sha256: hash(source['property/web/vendor/nostr-tools-2.25.2.bundle.js']),
  vendor_license_sha256: hash(source['property/web/vendor/nostr-tools-LICENSE']),
  portable_manifests: {
    'windows-x64': { archive_sha256: windows.archive_sha256, libraries: windows.libraries.length },
    'macos-arm64': { archive_sha256: macos.archive_sha256, libraries: macos.libraries.length }
  },
  checks: ['fixed upstream source', 'local third-party license', 'pinned Geode packages', 'matching portable library sets', 'no remote executable/style/CDN assets'],
  offline_rebuild: await offlineBuild()
};
if (report.offline_rebuild.status === 'FAIL') report.result = 'FAIL';
else if (report.offline_rebuild.status === 'BLOCKED') report.result = 'BLOCKED';
process.stdout.write(JSON.stringify(report) + '\n');
if (report.result === 'FAIL') process.exitCode = 1;
else if (report.result === 'BLOCKED') process.exitCode = 2;
