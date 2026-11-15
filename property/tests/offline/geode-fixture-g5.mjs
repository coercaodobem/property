import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const PROPERTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_ROOT = path.resolve(PROPERTY_ROOT, '..');
const PARTS_ROOT = path.join(PROPERTY_ROOT, 'relay/dist-parts');
export const GEODE_SHA256 = '9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7';
const ARCHIVE_BYTES = 67_845_545;

export async function prepareGeodeRuntime(baseDir) {
  const parts = await Promise.all(Array.from({ length: 130 }, (_, index) =>
    readFile(path.join(PARTS_ROOT, `part-${String(index).padStart(3, '0')}`))));
  const archive = Buffer.concat(parts);
  assert.equal(archive.length, ARCHIVE_BYTES, 'the locally bundled Geode archive has the declared byte length');
  assert.equal(createHash('sha256').update(archive).digest('hex'), GEODE_SHA256, 'the locally bundled Geode archive matches its pinned hash');
  const archivePath = path.join(baseDir, 'geode-1.20.0-linux-x64.tar.gz');
  const runtimeDir = path.join(baseDir, 'geode-runtime');
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  await writeFile(archivePath, archive, { mode: 0o600 });
  archive.fill(0);
  const extracted = spawnSync('tar', ['--no-same-owner', '-xzf', archivePath, '-C', runtimeDir], { stdio: 'inherit' });
  assert.equal(extracted.error, undefined, `tar launch failed: ${extracted.error?.message}`);
  assert.equal(extracted.status, 0, 'the pinned Geode archive extracts without errors');
  await rm(archivePath, { force: true });
  const binary = path.join(runtimeDir, 'geode/bin/geode');
  await access(binary);
  return { binary, runtimeDir, geodeSha256: GEODE_SHA256 };
}

async function waitForRelay(port, child, logPath) {
  for (let probe = 0; probe < 160; probe++) {
    if (child.exitCode !== null) throw new Error(`Geode exited before readiness: ${await readFile(logPath, 'utf8').catch(() => '')}`);
    const ready = await new Promise(resolve => {
      const socket = net.connect(port, '127.0.0.1');
      socket.setTimeout(500);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Geode readiness watchdog expired: ${await readFile(logPath, 'utf8').catch(() => '')}`);
}

export async function startGeode({ baseDir, binary, port, index }) {
  const relayDir = path.join(baseDir, `relay-${index}`);
  const dataDir = path.join(relayDir, 'data');
  const configDir = path.join(relayDir, 'config');
  const javaTmp = path.join(relayDir, 'java-tmp');
  await Promise.all([dataDir, configDir, javaTmp].map(dir => mkdir(dir, { recursive: true, mode: 0o700 })));
  const configPath = path.join(configDir, 'geode.toml');
  await writeFile(configPath, `[info]\nname = "Property G5 local relay ${index}"\ndescription = "Isolated fixed-count G5 test relay"\n\n[network]\nhost = "127.0.0.1"\nport = ${port}\npath = "/"\n\n[database]\nin_memory = false\nfile = "${path.join(dataDir, 'events.db')}"\n\n[options]\nverify_signatures = true\nrequire_auth = false\n`, { mode: 0o600 });
  const stdoutPath = path.join(relayDir, 'stdout.log');
  const stderrPath = path.join(relayDir, 'stderr.log');
  const stdoutFd = openSync(stdoutPath, 'a', 0o600);
  const stderrFd = openSync(stderrPath, 'a', 0o600);
  let child;
  try {
    child = spawn(binary, ['--config', configPath, '--host', '127.0.0.1', '--port', String(port)], {
      cwd: REPO_ROOT, detached: true,
      env: { ...process.env, TMPDIR: javaTmp, TMP: javaTmp, TEMP: javaTmp,
        JAVA_TOOL_OPTIONS: `-Djava.io.tmpdir=${javaTmp} -Xms64m -Xmx384m -XX:MaxDirectMemorySize=96m -XX:ActiveProcessorCount=1 -XX:+UseSerialGC -Djava.util.concurrent.ForkJoinPool.common.parallelism=1` },
      stdio: ['ignore', stdoutFd, stderrFd],
    });
  } finally { closeSync(stdoutFd); closeSync(stderrFd); }
  await waitForRelay(port, child, stderrPath);
  return { child, url: `ws://127.0.0.1:${port}`, port, dataDir, configPath, logPath: stderrPath };
}

export async function stopGeode(relay) {
  if (!relay?.child || relay.child.exitCode !== null) return;
  try { process.kill(-relay.child.pid, 'SIGTERM'); } catch {}
  const exit = once(relay.child, 'exit').catch(() => []);
  let timer;
  const watchdog = new Promise(resolve => { timer = setTimeout(() => resolve(null), 8000); });
  const result = await Promise.race([exit, watchdog]);
  clearTimeout(timer);
  if (result === null && relay.child.exitCode === null) {
    try { process.kill(-relay.child.pid, 'SIGKILL'); } catch {}
    await Promise.race([once(relay.child, 'exit').catch(() => []), new Promise(resolve => setTimeout(resolve, 3000))]);
  }
  if (relay.child.exitCode === null) throw new Error(`Geode process ${relay.child.pid} survived local cleanup.`);
}

export async function freeLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
